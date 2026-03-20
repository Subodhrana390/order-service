import crypto from "crypto";
import {
  IMainOrder,
  IOrderItem,
  MainOrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShippingAddress,
  VendorOrderStatus,
} from "../infrastructure/interfaces/order.interface.js";
import { MainOrder } from "../models/order.model.js";
import { VendorOrder } from "../models/vendor.model.js";
import { ClientSession } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { kafkaClient } from "../infrastructure/kafka/client.js";
import { config } from "../config/index.js";

interface createOrderDTO {
  userId: string;
  orderItems: IOrderItem[];
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  pricing: {
    totalAmount: number;
    discountAmount: number;
    payableAmount: number;
    deliveryFee: number;
    platformFee: number;
  };
}

interface VendorOrderDraft {
  shopId: string;
  items: IOrderItem[];
  subtotal: number;
}

export class MainOrderService {
  async createOrder(
    orderData: createOrderDTO & { idempotencyKey?: string },
    productPrices: any[],
    session?: ClientSession,
  ) {
    const validatedPricing = await this.validateAndCalculatePricing(
      orderData.orderItems,
      orderData.pricing,
      productPrices,
    );

    const isCOD = orderData.paymentMethod === PaymentMethod.COD;

    const mainOrder = await MainOrder.create(
      [
        {
          idempotencyKey: orderData.idempotencyKey,
          userId: orderData.userId,
          orderNumber: this.generateOrderNumber(),
          totalAmount: validatedPricing.totalAmount,
          deliveryFee: validatedPricing.deliveryFee,
          discountAmount: validatedPricing.discountAmount,
          payableAmount: validatedPricing.payableAmount,
          currency: "INR",
          overAllStatus: isCOD
            ? MainOrderStatus.PLACED
            : MainOrderStatus.PENDING,
          paymentInfo: {
            method: orderData.paymentMethod,
            status: isCOD ? PaymentStatus.PAID : PaymentStatus.PENDING,
          },
          shippingAddress: orderData.shippingAddress,
          items: orderData.orderItems,
        },
      ],
      { session },
    );

    const createdOrder = mainOrder[0];

    if (isCOD) {
      await this.createVendorOrders(createdOrder);
      // Emit order.created for COD orders to reserve stock immediately
      await this.emitOrderEvent("order.created", {
        orderId: createdOrder.id,
        userId: createdOrder.userId,
        items: createdOrder.items,
      });
    }

    return createdOrder;
  }

  async handlePaymentSuccess(data: { orderId: string; transactionId: string }) {
    const order = await MainOrder.findOne({ id: data.orderId });
    if (!order) throw new ApiError(404, "Order not found");

    if (order.paymentInfo?.status === PaymentStatus.PAID) {
      return;
    }

    order.paymentInfo!.status = PaymentStatus.PAID;
    order.paymentInfo!.transactionId = data.transactionId;
    order.paymentInfo!.paidAt = new Date();
    order.overAllStatus = MainOrderStatus.PLACED;

    await order.save();

    const existingVendorOrders = await VendorOrder.find({
      mainOrderId: order.id,
    });

    if (!existingVendorOrders.length) {
      await this.createVendorOrders(order);
    }

    await this.emitOrderEvent("order.created", {
      orderId: order.id,
      userId: order.userId,
      items: order.items,
    });
  }

  async handlePaymentFailed(data: { orderId: string; transactionId?: string }) {
    const order = await MainOrder.findOne({ id: data.orderId });
    if (!order) throw new ApiError(404, "Order not found");

    if (order.paymentInfo?.status === PaymentStatus.FAILED) return;

    order.paymentInfo!.status = PaymentStatus.FAILED;
    order.paymentInfo!.transactionId = data.transactionId;
    order.paymentInfo!.failAt = new Date();
    order.overAllStatus = MainOrderStatus.CANCELLED;

    await order.save();
  }

  async handlePaymentRefunded(data: {
    orderId: string;
    transactionId: string;
  }) {
    const order = await MainOrder.findOne({ id: data.orderId });
    if (!order) throw new ApiError(404, "Order not found");

    order.paymentInfo!.status = PaymentStatus.REFUNDED;
    order.paymentInfo!.refundTransactionId = data.transactionId;
    order.paymentInfo!.refundedAt = new Date();

    order.overAllStatus = MainOrderStatus.CANCELLED;

    await order.save();
  }

  private async createVendorOrders(order: IMainOrder) {
    if (!order.items?.length) {
      throw new ApiError(400, "Order items missing for vendor split");
    }

    const drafts = this.OrderSplitByVendor(order.items);

    for (const draft of drafts) {
      await VendorOrder.create({
        mainOrderId: order.id,
        shopId: draft.shopId,
        userId: order.userId,
        items: draft.items,
        subtotal: draft.subtotal,
        status: VendorOrderStatus.NEW,
      });
    }
  }

  async updatePaymentInfo(orderId: string, transactionId: string) {
    const order = await MainOrder.findOne({ id: orderId });
    if (!order) throw new ApiError(404, "Order not found");

    order.paymentInfo!.transactionId = transactionId;
    order.paymentInfo!.status = PaymentStatus.PAID;
    order.paymentInfo!.paidAt = new Date();
    order.overAllStatus = MainOrderStatus.PLACED;

    await order.save();

    await this.createVendorOrders(order);

    return order;
  }

  async cancelOrder(params: {
    orderId: string;
    reason: string;
    bankDetails?: { accountName: string; bankName: string; ifscCode: string };
  }) {
    const { orderId, reason, bankDetails } = params;

    const mainOrder = await MainOrder.findOne({ id: orderId });
    if (!mainOrder) throw new ApiError(404, "Main order not found");

    if (bankDetails && mainOrder.paymentInfo) {
      mainOrder.paymentInfo.refundBankDetails = bankDetails;
    }

    mainOrder.overAllStatus = MainOrderStatus.CANCELLED;
    mainOrder.cancelReason = reason;

    await mainOrder.save();

    const vendorOrders = await VendorOrder.find({ mainOrderId: orderId });
    for (const vOrder of vendorOrders) {
      await vOrder.updateOne({
        status: VendorOrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      });
    }

    await this.emitOrderEvent("order.cancelled", {
      orderId: mainOrder.id,
      userId: mainOrder.userId,
      items: mainOrder.items,
    });

    return mainOrder;
  }

  async updateOrderStatus(orderId: string) {
    const mainOrder = await MainOrder.findOne({ id: orderId });
    if (!mainOrder) throw new ApiError(404, "Main order not found");

    if (mainOrder.overAllStatus === MainOrderStatus.DELIVERED) return;

    const vendorOrders = await VendorOrder.find({ mainOrderId: orderId });
    if (!vendorOrders.length) return;

    const statuses = vendorOrders.map((v) => v.status);

    const all = (s: VendorOrderStatus) => statuses.every((x) => x === s);
    const some = (s: VendorOrderStatus) => statuses.some((x) => x === s);

    let newStatus: MainOrderStatus = mainOrder.overAllStatus;

    if (all(VendorOrderStatus.CANCELLED)) {
      newStatus = MainOrderStatus.CANCELLED;
    } else if (some(VendorOrderStatus.CANCELLED)) {
      newStatus = MainOrderStatus.PARTIALLY_CANCELLED;
    } else if (all(VendorOrderStatus.DELIVERED)) {
      newStatus = MainOrderStatus.DELIVERED;
    } else if (some(VendorOrderStatus.OUT_FOR_DELIVERY)) {
      newStatus = MainOrderStatus.OUT_FOR_DELIVERY;
    } else if (some(VendorOrderStatus.PACKING)) {
      newStatus = MainOrderStatus.PACKING;
    } else if (some(VendorOrderStatus.ACCEPTED)) {
      newStatus = MainOrderStatus.CONFIRMED;
    } else if (all(VendorOrderStatus.NEW)) {
      newStatus = MainOrderStatus.PLACED;
    }

    if (newStatus !== mainOrder.overAllStatus) {
      const oldStatus: MainOrderStatus = mainOrder.overAllStatus;
      mainOrder.overAllStatus = newStatus;
      await mainOrder.save();

      if (newStatus === MainOrderStatus.DELIVERED && oldStatus !== MainOrderStatus.DELIVERED.toString()) {
        await this.emitOrderEvent("order.delivered", {
          orderId: mainOrder.id,
          userId: mainOrder.userId,
          items: mainOrder.items,
          deliveredAt: new Date()
        });
      }
    }
  }

  async getOrderDetails(orderId: string) {
    const mainOrder = await MainOrder.findOne({ id: orderId });
    if (!mainOrder) throw new ApiError(404, "Main order not found");

    const vendorOrders = await VendorOrder.find({ mainOrderId: orderId });

    return {
      mainOrder,
      vendorOrders,
    };
  }

  public OrderSplitByVendor(orderItems: IOrderItem[]): VendorOrderDraft[] {
    const shopMap = new Map<string, VendorOrderDraft>();

    for (const item of orderItems) {
      if (!shopMap.has(item.shopId)) {
        shopMap.set(item.shopId, {
          shopId: item.shopId,
          items: [],
          subtotal: 0,
        });
      }

      const vendorOrder = shopMap.get(item.shopId)!;

      vendorOrder.items.push(item);
      vendorOrder.subtotal += item.subtotal;
    }

    return Array.from(shopMap.values());
  }

  private async validateAndCalculatePricing(
    orderItems: IOrderItem[],
    clientPricing: createOrderDTO["pricing"],
    productPrices: any[],
  ) {
    let calculatedTotal = 0;

    for (const item of orderItems) {
      const priceInfo = productPrices.find(
        (p) => p.productId === item.productId,
      );
      if (!priceInfo) {
        throw new ApiError(400, `Product price missing ${item.productId}`);
      }

      item.unitPrice = priceInfo.price;
      item.subtotal = item.unitPrice * item.quantity;
      calculatedTotal += item.subtotal;
    }

    const payableAmount =
      calculatedTotal +
      clientPricing.deliveryFee -
      clientPricing.discountAmount;

    if (payableAmount < 0) {
      throw new ApiError(400, "Invalid pricing calculation");
    }

    return {
      totalAmount: calculatedTotal,
      deliveryFee: clientPricing.deliveryFee,
      discountAmount: clientPricing.discountAmount,
      payableAmount,
    };
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `OD-${y}${m}${d}-${random}`;
  }

  private async emitOrderEvent(type: string, payload: any) {
    try {
      const producer = kafkaClient.getProducer();
      await producer.send({
        topic: config.kafka.topics.orderEvents,
        messages: [
          {
            key: payload.orderId,
            value: JSON.stringify({ type, payload }),
          },
        ],
      });
      console.log(`📡 Emitted ${type} event for order: ${payload.orderId}`);
    } catch (error) {
      console.error(`❌ Failed to emit order event ${type}:`, error);
    }
  }
}

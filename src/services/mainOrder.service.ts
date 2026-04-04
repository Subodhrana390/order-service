import crypto from "crypto";
import {
  IMainOrder,
  IOrderItem,
  MainOrderStatus,
  PaymentMethod,
  PaymentStatus,
  IShippingAddress,
  VendorOrderStatus,
} from "../infrastructure/interfaces/order.interface.js";
import { MainOrder } from "../models/order.model.js";
import { VendorOrder } from "../models/vendor.model.js";
import { ClientSession } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { kafkaClient } from "../infrastructure/kafka/client.js";
import { config } from "../config/index.js";
import { ShopService } from "./shop.service.js";

interface createOrderDTO {
  userId: string;
  orderItems: IOrderItem[];
  shippingAddress: IShippingAddress;
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
  constructor(private readonly shopService: ShopService) { }

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
            status: PaymentStatus.PENDING,
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
      const { id: subOrderId } = await VendorOrder.create({
        mainOrderId: order.id,
        shopId: draft.shopId,
        userId: order.userId,
        items: draft.items,
        subtotal: draft.subtotal,
        status: VendorOrderStatus.NEW,
      });
      order.subOrderIds?.push(subOrderId);
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

    if (mainOrder.overAllStatus === MainOrderStatus.CANCELLED) {
      throw new ApiError(400, "Order is already cancelled");
    }

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

    if (!mainOrder) {
      throw new ApiError(404, "Main order not found");
    }

    if (mainOrder.overAllStatus === MainOrderStatus.DELIVERED) {
      return;
    }

    const vendorOrders = await VendorOrder.find({ mainOrderId: orderId });

    if (!vendorOrders.length) return;

    const statuses = vendorOrders.map(v => v.status);

    const all = (s: VendorOrderStatus) =>
      statuses.every(x => x === s);

    const some = (s: VendorOrderStatus) =>
      statuses.some(x => x === s);

    let newStatus: MainOrderStatus = mainOrder.overAllStatus;

    if (all(VendorOrderStatus.CANCELLED)) {
      newStatus = MainOrderStatus.CANCELLED;

    } else if (some(VendorOrderStatus.CANCELLED)) {
      newStatus = MainOrderStatus.PARTIALLY_CANCELLED;

    } else if (all(VendorOrderStatus.DELIVERED)) {
      newStatus = MainOrderStatus.DELIVERED;

    } else if (some(VendorOrderStatus.OUT_FOR_DELIVERY)) {
      newStatus = MainOrderStatus.OUT_FOR_DELIVERY;
    }

    else if (some(VendorOrderStatus.READY_FOR_PICKUP)) {
      newStatus = MainOrderStatus.READY_FOR_PICKUP;
    }

    else if (all(VendorOrderStatus.READY_FOR_PICKUP)) {
      newStatus = MainOrderStatus.READY_FOR_PICKUP;

    } else if (some(VendorOrderStatus.PACKING)) {
      newStatus = MainOrderStatus.PACKING;

    } else if (some(VendorOrderStatus.ACCEPTED)) {
      newStatus = MainOrderStatus.CONFIRMED;

    } else if (all(VendorOrderStatus.NEW)) {
      newStatus = MainOrderStatus.PLACED;
    }

    if (newStatus !== mainOrder.overAllStatus) {

      mainOrder.overAllStatus = newStatus;

      await mainOrder.save();


      /**
       * READY_FOR_PICKUP EVENT
       */
      if (
        newStatus === MainOrderStatus.READY_FOR_PICKUP &&
        mainOrder.overAllStatus !== MainOrderStatus.READY_FOR_PICKUP
      ) {

        /**
         * Build vendor maps in ONE pass
         */
        const shopIdSet = new Set<string>();
        const vendorOrderMap: Record<string, string> = {};
        const vendorItems: Record<string, IOrderItem[]> = {};

        for (const v of vendorOrders) {
          shopIdSet.add(v.shopId);

          vendorOrderMap[v.shopId] = v.id;

          if (!vendorItems[v.shopId]) {
            vendorItems[v.shopId] = [];
          }

          vendorItems[v.shopId].push(...v.items);
        }

        const uniqueShopIds = [...shopIdSet];

        /**
         * Fetch shop details
         */
        const shops = await this.shopService.getShopsByIds(uniqueShopIds);


        /**
         * Build pickup addresses
         */
        const pickupAddresses = shops.map(shop => {
          const [lng, lat] = shop.address.location.coordinates;

          return {
            shopId: shop.id,
            vendorOrderId: vendorOrderMap[shop.id],
            name: shop.name,
            phone: shop.contact.phone,
            street: shop.address.street,
            city: shop.address.city,
            state: shop.address.state,
            pincode: shop.address.pincode,
            lat,
            lng,
            items: vendorItems[shop.id] ?? []
          };
        });


        /**
         * Build drop address
         */
        const [dropLng, dropLat] =
          mainOrder.shippingAddress.location.coordinates;

        const dropAddress = {
          name: mainOrder.shippingAddress.name,
          phone: mainOrder.shippingAddress.phone,
          street: mainOrder.shippingAddress.street,
          city: mainOrder.shippingAddress.city,
          state: mainOrder.shippingAddress.state,
          pincode: mainOrder.shippingAddress.pincode,
          lat: dropLat,
          lng: dropLng
        };


        /**
         * Emit READY_FOR_PICKUP event
         */
        await this.emitOrderEvent("order.ready_for_pickup", {
          orderId: mainOrder.id,
          subOrderIds: vendorOrders.map(v => v.id),
          userId: mainOrder.userId,
          pickupAddresses,
          dropAddress,
          orderStatus: newStatus,
          createdAt: mainOrder.createdAt
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

  public async getMainOrders(
    userId: string,
    limit: number = 10,
    before?: string,
    after?: string
  ) {
    const query: any = { userId };
    let sortDirection: 1 | -1 = -1;

    const activeCursor = after || before;

    if (activeCursor) {
      const [timeStr, idValue] = activeCursor.split('|');
      const date = new Date(timeStr);


      const operator = after ? '$lt' : '$gt';
      sortDirection = after ? -1 : 1;
      query.$or = [
        { createdAt: { [operator]: date } },
        {
          createdAt: date,
          id: { [after ? '$lt' : '$gt']: idValue }
        }
      ];
    }

    let orders = await MainOrder.find(query)
      .sort({ createdAt: sortDirection, id: sortDirection })
      .limit(limit + 1);
    if (before) {
      orders.reverse();
    }

    const hasMore = orders.length > limit;
    if (hasMore) {
      if (before) orders.shift();
      else orders.pop();
    }
    const firstItem = orders[0];
    const lastItem = orders[orders.length - 1];

    const createCursor = (item: any) =>
      item ? `${item.createdAt.toISOString()}|${item.id}` : null;

    const hasPrevious = !!before ? hasMore : !!after;
    const hasNext = !!after ? hasMore : (!before && hasMore);

    return {
      data: orders,
      prevCursor: hasPrevious && orders.length > 0 ? createCursor(firstItem) : null,
      nextCursor: hasNext && orders.length > 0 ? createCursor(lastItem) : null,
      hasPrevious,
      hasNext,
    };
  }

  public async getAllAdminOrders(
    limit: number = 10,
    before?: string,
    after?: string
  ) {
    const query: any = {};
    let sortDirection: 1 | -1 = -1;

    const activeCursor = after || before;

    if (activeCursor) {
      const [timeStr, idValue] = activeCursor.split('|');
      const date = new Date(timeStr);

      const operator = after ? '$lt' : '$gt';
      sortDirection = after ? -1 : 1;
      query.$or = [
        { createdAt: { [operator]: date } },
        {
          createdAt: date,
          id: { [after ? '$lt' : '$gt']: idValue }
        }
      ];
    }

    let orders = await MainOrder.find(query)
      .sort({ createdAt: sortDirection, id: sortDirection })
      .limit(limit + 1);
    if (before) {
      orders.reverse();
    }

    const hasMore = orders.length > limit;
    if (hasMore) {
      if (before) orders.shift();
      else orders.pop();
    }
    const firstItem = orders[0];
    const lastItem = orders[orders.length - 1];

    const createCursor = (item: any) =>
      item ? `${item.createdAt.toISOString()}|${item.id}` : null;

    const hasPrevious = !!before ? hasMore : !!after;
    const hasNext = !!after ? hasMore : (!before && hasMore);

    return {
      data: orders,
      prevCursor: hasPrevious && orders.length > 0 ? createCursor(firstItem) : null,
      nextCursor: hasNext && orders.length > 0 ? createCursor(lastItem) : null,
      hasPrevious,
      hasNext,
    };
  }
}

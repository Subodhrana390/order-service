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
        totalAmount: createdOrder.totalAmount
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
      totalAmount: order.totalAmount
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

    await this.emitOrderEvent("order.cancelled", {
      orderId: order.id,
      userId: order.userId,
      items: order.items
    });
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

    await this.emitOrderEvent("order.cancelled", {
      orderId: order.id,
      userId: order.userId,
      items: order.items
    });
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

    await order.save();
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

    const previousStatus = mainOrder.overAllStatus;
    let newStatus: MainOrderStatus = previousStatus;

    if (all(VendorOrderStatus.CANCELLED)) {
      newStatus = MainOrderStatus.CANCELLED;
    } else if (some(VendorOrderStatus.CANCELLED)) {
      newStatus = MainOrderStatus.PARTIALLY_CANCELLED;
    } else if (all(VendorOrderStatus.DELIVERED)) {
      newStatus = MainOrderStatus.DELIVERED;
    } else if (some(VendorOrderStatus.OUT_FOR_DELIVERY)) {
      newStatus = MainOrderStatus.OUT_FOR_DELIVERY;
    } else if (some(VendorOrderStatus.RIDER_ASSIGNED)) {
      newStatus = MainOrderStatus.RIDER_ASSIGNED;
    } else if (all(VendorOrderStatus.READY_FOR_PICKUP) || some(VendorOrderStatus.READY_FOR_PICKUP)) {
      newStatus = MainOrderStatus.READY_FOR_PICKUP;
    } else if (some(VendorOrderStatus.PACKING)) {
      newStatus = MainOrderStatus.PACKING;
    } else if (some(VendorOrderStatus.ACCEPTED)) {
      newStatus = MainOrderStatus.CONFIRMED;
    } else if (all(VendorOrderStatus.NEW)) {
      newStatus = MainOrderStatus.PLACED;
    }

    if (newStatus !== previousStatus) {
      mainOrder.overAllStatus = newStatus;
      await mainOrder.save();

      // Emit status update event for notification-service
      await this.emitOrderEvent("vendor-order.status_updated", {
        orderId: mainOrder.id,
        userId: mainOrder.userId,
        status: newStatus,
        previousStatus
      });

      console.log(`📡 Status updated for order ${orderId}: ${previousStatus} -> ${newStatus}`);

      if (
        newStatus === MainOrderStatus.READY_FOR_PICKUP &&
        previousStatus !== MainOrderStatus.READY_FOR_PICKUP
      ) {
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
        const shops = await this.shopService.getShopsByIds(uniqueShopIds);

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

        const [dropLng, dropLat] = mainOrder.shippingAddress.location.coordinates;
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
    return { mainOrder, vendorOrders };
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
      const priceInfo = productPrices.find((p) => p.productId === item.productId);
      if (!priceInfo) {
        throw new ApiError(400, `Product price missing ${item.productId}`);
      }
      item.unitPrice = priceInfo.price;
      item.subtotal = item.unitPrice * item.quantity;
      calculatedTotal += item.subtotal;
    }
    const payableAmount = calculatedTotal + clientPricing.deliveryFee - clientPricing.discountAmount;
    if (payableAmount < 0) throw new ApiError(400, "Invalid pricing calculation");
    return {
      totalAmount: calculatedTotal,
      deliveryFee: clientPricing.deliveryFee,
      discountAmount: clientPricing.discountAmount,
      payableAmount,
    };
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const random = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `OD-${date.toISOString().slice(0, 10).replace(/-/g, "")}-${random}`;
  }

  private async emitOrderEvent(type: string, payload: any) {
    try {
      const producer = kafkaClient.getProducer();
      await producer.send({
        topic: config.kafka.topics.orderEvents,
        messages: [{ key: payload.orderId, value: JSON.stringify({ type, payload }) }],
      });
      console.log(`📡 Emitted ${type} event for order: ${payload.orderId}`);
    } catch (error) {
      console.error(`❌ Failed to emit order event ${type}:`, error);
    }
  }

  public async getMainOrders(userId: string, limit: number = 10, before?: string, after?: string) {
    const query: any = { userId };
    let sortDirection: 1 | -1 = -1;
    const activeCursor = after || before;
    if (activeCursor) {
      const [timeStr, idValue] = activeCursor.split('|');
      const date = new Date(timeStr);
      const operator = after ? '$lt' : '$gt';
      sortDirection = after ? -1 : 1;
      query.$or = [{ createdAt: { [operator]: date } }, { createdAt: date, id: { [after ? '$lt' : '$gt']: idValue } }];
    }
    let orders = await MainOrder.find(query).sort({ createdAt: sortDirection, id: sortDirection }).limit(limit + 1);
    if (before) orders.reverse();
    const hasMore = orders.length > limit;
    if (hasMore) {
      if (before) orders.shift();
      else orders.pop();
    }
    const firstItem = orders[0];
    const lastItem = orders[orders.length - 1];
    const createCursor = (item: any) => item ? `${item.createdAt.toISOString()}|${item.id}` : null;
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

  public async getAllAdminOrders(limit: number = 10, before?: string, after?: string) {
    const query: any = {};
    let sortDirection: 1 | -1 = -1;
    const activeCursor = after || before;
    if (activeCursor) {
      const [timeStr, idValue] = activeCursor.split('|');
      const date = new Date(timeStr);
      const operator = after ? '$lt' : '$gt';
      sortDirection = after ? -1 : 1;
      query.$or = [{ createdAt: { [operator]: date } }, { createdAt: date, id: { [after ? '$lt' : '$gt']: idValue } }];
    }
    let orders = await MainOrder.find(query).sort({ createdAt: sortDirection, id: sortDirection }).limit(limit + 1);
    if (before) orders.reverse();
    const hasMore = orders.length > limit;
    if (hasMore) {
      if (before) orders.shift();
      else orders.pop();
    }
    const firstItem = orders[0];
    const lastItem = orders[orders.length - 1];
    const createCursor = (item: any) => item ? `${item.createdAt.toISOString()}|${item.id}` : null;
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

  public async getAdminAnalytics(days = 7) {
    const rangeDays = Math.min(Math.max(Number(days || 7), 3), 30);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (rangeDays - 1));
    const orders = await MainOrder.find({ createdAt: { $gte: since } }).sort({ createdAt: 1 });
    const buckets = new Map<string, { date: string; orders: number; revenue: number }>();
    for (let i = 0; i < rangeDays; i += 1) {
      const date = new Date(since);
      date.setDate(since.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      buckets.set(key, { date: key, orders: 0, revenue: 0 });
    }
    orders.forEach((order) => {
      const key = new Date(order.createdAt).toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.orders += 1;
      bucket.revenue += order.payableAmount || 0;
    });
    const statusBreakdown = orders.reduce((acc, order) => {
      acc[order.overAllStatus] = (acc[order.overAllStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + (order.payableAmount || 0), 0);
    return {
      summary: {
        totalOrders,
        totalRevenue,
        averageOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
        deliveredOrders: statusBreakdown.DELIVERED || 0,
        cancelledOrders: statusBreakdown.CANCELLED || 0,
      },
      charts: {
        ordersByDay: Array.from(buckets.values()),
        statusBreakdown,
      },
    };
  }
}

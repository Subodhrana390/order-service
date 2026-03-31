import {
  IVendorOrder,
  VendorOrderStatus,
} from "../infrastructure/interfaces/order.interface.js";
import { VendorOrder } from "../models/vendor.model.js";
import { ApiError } from "../utils/ApiError.js";
import { KafkaProducer } from "../infrastructure/kafka/producer.js";


interface RiderInfo {
  riderId: string;
  name: string;
  phone: string;
  assignedAt: Date;
}

export class VendorOrderService {
  constructor() { }


  async createVendorOrder(data: {
    mainOrderId: string;
    shopId: string;
    userId: string;
    items: IVendorOrder["items"];
    subtotal: number;
  }): Promise<string> {
    const vendorOrder = new VendorOrder({
      ...data,
      vendorOrderNumber: VendorOrder.schema.methods.generateVendorOrderNumber(),
      status: "NEW",
    });

    await vendorOrder.save();
    return vendorOrder.id;
  }

  async acceptOrder(vendorOrderId: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    if (order.status === VendorOrderStatus.CANCELLED || order.status !== VendorOrderStatus.NEW) {
      throw new ApiError(400, `Cannot accept a ${order.status} order`);
    }

    if (order.status !== VendorOrderStatus.NEW) {
      throw new ApiError(
        400,
        `Only orders in NEW status can be accepted. Current status: ${order.status}`,
      );
    }

    order.status = VendorOrderStatus.ACCEPTED;
    order.acceptedAt = new Date();
    await order.save();

    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async verifyPrescription(vendorOrderId: string, verifiedBy: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    order.items.forEach((item) => {
      if (item.requiresPrescription && item.prescription) {
        item.prescription.verified = true;
        item.prescription.verifiedAt = new Date();
        item.prescription.verifiedBy = verifiedBy;
      }
    });

    order.status = VendorOrderStatus.PRESCRIPTION_VERIFIED;

    await order.save();
    await KafkaProducer.sendOrderEvent("vendor-order.prescription_verified", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async startPacking(vendorOrderId: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    order.status = VendorOrderStatus.PACKING;
    order.packingStartedAt = new Date();
    await order.save();

    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async markReadyForPickup(vendorOrderId: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    order.status = VendorOrderStatus.READY_FOR_PICKUP;
    order.readyForPickupAt = new Date();
    await order.save();
    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async markOrdersDelivered(mainOrderId: string) {
    await VendorOrder.updateMany(
      { mainOrderId },
      { status: VendorOrderStatus.DELIVERED, deliveredAt: new Date() }
    );
  }

  async getShopOrders(
    shopId: string,
    limit: number = 10,
    before?: string,
    after?: string,
  ) {
    const query: any = { shopId };
    let sortDirection: 1 | -1 = -1;

    const cursorValue = after || before;
    if (cursorValue) {
      const [timeStr, idValue] = cursorValue.split('_');
      const date = new Date(timeStr);
      sortDirection = after ? -1 : 1;

      const operator = after ? '$lt' : '$gt';
      query.$or = [
        { createdAt: { [operator]: date } },
        { createdAt: date, id: { [operator]: idValue } }
      ];
    }

    let orders = await VendorOrder.find(query)
      .sort({ createdAt: sortDirection, id: sortDirection })
      .limit(limit + 1);

    if (before) orders.reverse();

    const hasMore = orders.length > limit;
    if (hasMore) {
      if (before) orders.shift();
      else orders.pop();
    }

    const createCursor = (item: any) =>
      item ? `${item.createdAt.toISOString()}_${item.id}` : null;

    const hasPrevious = !!before ? hasMore : !!after;
    const hasNext = !!after ? hasMore : (!before && hasMore);

    return {
      orders,
      prevCursor: hasPrevious && orders.length > 0 ? createCursor(orders[0]) : null,
      nextCursor: hasNext && orders.length > 0 ? createCursor(orders[orders.length - 1]) : null,
      hasPrevious,
      hasNext,
    };
  }

  async getById(vendorOrderId: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");
    return order;
  }

  async updateStatus(vendorOrderId: string, status: VendorOrderStatus) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    if (order.status === status) {
      throw new ApiError(400, `Order is already in ${status} status`);
    }

    order.status = status;
    await order.save();
    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async updateVendorOrderRiderAssignment(
    mainOrderId: string,
    shopId: string,
    riderInfo: RiderInfo
  ) {
    const order = await VendorOrder.findOne({
      mainOrderId,
      shopId,
    });

    if (!order) {
      throw new ApiError(404, "Vendor order not found");
    }

    order.status = VendorOrderStatus.RIDER_ASSIGNED;
    order.riderInfo = riderInfo;

    await order.save();
  }

}

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

    await order.save();
    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async startProcessing(vendorOrderId: string) {
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

  async assignRider(vendorOrderId: string, riderInfo: RiderInfo) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    order.riderInfo = riderInfo;
    await order.save();
    return order;
  }

  async markOutForDelivery(vendorOrderId: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    order.status = VendorOrderStatus.OUT_FOR_DELIVERY;
    await order.save();
    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }

  async getShopOrders(shopId: string) {
    return await VendorOrder.find({ shopId }).sort({ createdAt: -1 });
  }

  async getById(vendorOrderId: string) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");
    return order;
  }

  async updateStatus(vendorOrderId: string, status: VendorOrderStatus) {
    const order = await VendorOrder.findOne({ id: vendorOrderId });
    if (!order) throw new ApiError(404, "Vendor order not found");

    order.status = status;
    await order.save();
    await KafkaProducer.sendOrderEvent("vendor-order.status_updated", {
      mainOrderId: order.mainOrderId,
    });

    return order;
  }
}

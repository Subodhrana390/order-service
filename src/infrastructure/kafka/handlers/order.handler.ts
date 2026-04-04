import {
  mainOrderService,
  paymentService,
  vendorOrderService
} from "../../../services/index.js";
import { PaymentMethod } from "../../../infrastructure/interfaces/order.interface.js";

export class OrderEventHandler {
  private mainOrderService = mainOrderService;
  private paymentService = paymentService;
  private vendorOrderService = vendorOrderService;


  async handle(event: any) {
    const { type, payload } = event;

    if (!payload) return;

    switch (type) {
      case "vendor-order.status_updated":
        if (payload.mainOrderId) {
          await this.mainOrderService.updateOrderStatus(payload.mainOrderId);
        }
        break;

      case "vendor-order.prescription_verified":
        if (payload.mainOrderId) {
          await this.mainOrderService.updateOrderStatus(payload.mainOrderId);
        }
        break;

      case "delivery.rider_assigned":
        if (payload.mainOrderId) {
          const orderDetails =
            await this.mainOrderService.getOrderDetails(
              payload.mainOrderId
            );

          const shopIds = orderDetails.vendorOrders.map(
            (v: { shopId: string }) => v.shopId
          );

          for (const shopId of shopIds) {
            await this.vendorOrderService.updateVendorOrderRiderAssignment(
              payload.mainOrderId,
              shopId,
              payload.riderInfo
            );
          }

          await this.mainOrderService.updateOrderStatus(
            payload.mainOrderId
          );

        }
        break;

      case "delivery.order_delivered":
        if (payload.mainOrderId) {

          await this.vendorOrderService.markOrdersDelivered(
            payload.mainOrderId
          );

          await this.mainOrderService.updateOrderStatus(
            payload.mainOrderId
          );
        }
        break;

      case "order.cancelled":
        if (payload.orderId) {
          if (payload.paymentMethod === PaymentMethod.RAZORPAY) {
            await this.paymentService.refundPayment(
              payload.orderId,
              payload.reason || "Order cancelled",
            );
          } else if (
            payload.paymentMethod === PaymentMethod.COD &&
            payload.refundBankDetails
          ) {
            await this.paymentService.recordManualRefund(
              payload.orderId,
              payload.refundBankDetails,
              payload.reason || "Order cancelled",
            );
          }

          await this.mainOrderService.handlePaymentFailed({
            orderId: payload.orderId,
          });
        }
        break;

      case "inventory.reservation_failed":
        if (payload.orderId) {
          console.log(
            `⚠️ Inventory reservation failed for order ${payload.orderId}. Cancelling order...`,
          );
          await this.mainOrderService.handlePaymentFailed({
            orderId: payload.orderId,
          });
        }
        break;

      default:
        break;
    }
  }
}

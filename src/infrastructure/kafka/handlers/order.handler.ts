import { PaymentMethod } from "../../../infrastructure/interfaces/order.interface.js";
import { MainOrderService } from "../../../services/mainOrder.service.js";
import { PaymentService } from "../../../services/payment.service.js";

interface CancelOrderPayload {
  orderId: string;
  reason?: string;
  paymentMethod?: PaymentMethod;
  refundBankDetails?: {
    accountName: string;
    bankName: string;
    ifscCode: string;
  };
}

export class OrderEventHandler {
  private mainOrderService = new MainOrderService();
  private paymentService = new PaymentService();

  async handle(event: any) {
    const { type, payload } = event;

    if (!payload) return;

    switch (type) {
      case "vendor-order.status_updated":
        if (payload.mainOrderId) {
          await this.mainOrderService.updateOrderStatus(payload.mainOrderId);
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

import { MainOrderService } from "../../../services/mainOrder.service.js";

export class PaymentEventHandler {
  private mainOrderService = new MainOrderService();

  async handle(event: any) {
    const { type, payload } = event;
    if (!payload?.orderId) return;

    switch (type) {
      case "payment.success":
        await this.mainOrderService.handlePaymentSuccess({
          orderId: payload.orderId,
          transactionId: payload.transactionId,
        });
        break;

      case "payment.failed":
        await this.mainOrderService.handlePaymentFailed({
          orderId: payload.orderId,
          transactionId: payload.transactionId,
        });
        break;
      case "payment.refunded":
        await this.mainOrderService.handlePaymentRefunded({
          orderId: payload.orderId,
          transactionId: payload.transactionId,
        });

      default:
        break;
    }
  }
}

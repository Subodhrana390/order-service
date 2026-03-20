import axios, { AxiosInstance } from "axios";
import {
  BankDetails,
  PaymentMethod,
  TransactionType,
} from "../infrastructure/interfaces/order.interface.js";
import { config } from "../config/index.js";

export interface ProcessPaymentResponse {
  gatewayOrderId: string;
  transactionId: string;
  amount: string;
  currency: string;
  key: string;
}

export class PaymentService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.services.payment;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async processPayment(
    amount: number,
    method: PaymentMethod,
    type: TransactionType,
    userId: string,
    orderId: string,
    description?: string,
  ): Promise<ProcessPaymentResponse> {
    const response = await this.client.post("/api/v1/payments/process", {
      amount,
      method,
      type,
      userId,
      orderId,
      description,
    });
    return response.data.data;
  }

  async refundPayment(orderId: string, reason: string) {
    await this.client.post("/api/payments/refund", {
      orderId,
      reason,
    });
  }

  async recordManualRefund(
    orderId: string,
    bankDetails: BankDetails,
    reason: string,
  ) {
    await this.client.post("/api/payments/manual-refund", {
      orderId,
      bankDetails,
      reason,
    });
  }
}

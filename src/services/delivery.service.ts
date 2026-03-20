import axios, { AxiosInstance } from "axios";
import { config } from "../config/index.js";

export interface RiderInfo {
  riderId: string;
  name: string;
  phone: string;
}

export class DeliveryService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.services.delivery;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async assignRider(
    orderId: string,
    shopId: string,
    deliveryAddress: any,
  ): Promise<RiderInfo> {
    const response = await this.client.post("/api/v1/internal/deliveries/rider/assign", {
      orderId,
      shopId,
      deliveryAddress,
    });
    return response.data.data;
  }
}

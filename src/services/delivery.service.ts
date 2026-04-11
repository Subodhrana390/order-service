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
    rider: {
      riderId: string;
      name: string;
      phone: string;
      vehicleType?: string;
    },
  ): Promise<RiderInfo> {
    const response = await this.client.post(
      `/api/v1/internal/deliveries/orders/${orderId}/rider/assign`,
      rider,
    );
    return response.data.data;
  }

  async getOrderDeliverySummary(orderId: string): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/api/v1/internal/deliveries/orders/${orderId}/summary`,
      );
      return response.data.data;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
}

import axios, { AxiosInstance } from "axios";
import { config } from "../config/index.js";
import { ILocation } from "infrastructure/interfaces/order.interface.js";

interface ShopDetails {
    id: string;
    name: string;
    address: {
        street: string;
        city: string;
        state: string;
        pincode: string;
        location: ILocation;
    };
    contact: {
        phone: string;
    };
}

export class ShopService {
    private client: AxiosInstance;
    private baseUrl: string;

    constructor() {
        this.baseUrl = config.services.shop;

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    async getShopsByIds(shopIds: string[]): Promise<ShopDetails[]> {
        return this.client.post("/api/v1/internal/shops/batch", { shopIds }).then(res => res.data.data);
    }

}

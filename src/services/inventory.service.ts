import { config } from "../config/index.js";
import axios, { AxiosInstance } from "axios";

export interface InventoryPriceInfo {
    productId: string;
    shopId: string;
    price: number;
}

export class InventoryService {
    private client: AxiosInstance;
    private baseUrl: string;
    constructor() {
        this.baseUrl = config.services.inventory;
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }


    async getProductPrices(
        items: { productId: string; shopId: string }[],
    ): Promise<InventoryPriceInfo[]> {
        const response = await this.client.post("/api/v1/internal/inventory/get-prices", {
            items,
        });
        return response.data.data;
    }
}

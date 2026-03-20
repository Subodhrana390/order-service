import axios, { AxiosInstance } from "axios";
import { config } from "../config/index.js";

export class CartService {
    private client: AxiosInstance;
    private baseUrl: string;

    constructor() {
        this.baseUrl = config.services.cart;

        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    async clearCart(userId: string): Promise<void> {
        await this.client.delete(`/api/v1/internal/cart/${userId}/clear`);
    }
}

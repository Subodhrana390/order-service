import { ShopService } from "./shop.service.js";
import { PaymentService } from "./payment.service.js";
import { VendorOrderService } from "./VendorOrder.service.js";
import { MainOrderService } from "./mainOrder.service.js";
import { InventoryService } from "./inventory.service.js";
import { DeliveryService } from "./delivery.service.js";

export const shopService = new ShopService();
export const paymentService = new PaymentService();
export const vendorOrderService = new VendorOrderService();
export const inventoryService = new InventoryService();
export const deliveryService = new DeliveryService();
export const mainOrderService = new MainOrderService(shopService);

import { Router } from "express";
import { MainOrderController } from "../controllers/mainOrder.controller.js";
import { VendorOrderController } from "../controllers/vendorOrder.controller.js";
import {
    paymentService,
    vendorOrderService,
    mainOrderService,
    inventoryService,
    deliveryService,
} from "../services/index.js";

const mainOrderController = new MainOrderController(
    mainOrderService,
    paymentService,
    vendorOrderService,
    inventoryService,
    deliveryService,
);
const vendorOrderController = new VendorOrderController(
    vendorOrderService,
);

const router = Router();

router.get("/shop/:shopId", vendorOrderController.getShopOrders);
router.get("/shop/:shopId/analytics", vendorOrderController.getShopAnalytics);
router.get("/admin/analytics", mainOrderController.getAdminAnalytics);
router.get("/vendor/:id", vendorOrderController.getById);
router.get("/:id", mainOrderController.getById);
router.get("/:id/details", mainOrderController.getOrderDetails);
router.patch("/vendor/:id/status", vendorOrderController.updateStatus);

export default router;

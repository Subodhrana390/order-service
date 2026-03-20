import { Router } from "express";
import { MainOrderController } from "../controllers/mainOrder.controller.js";
import { VendorOrderController } from "../controllers/vendorOrder.controller.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.js";
import { InventoryService } from "../services/inventory.service.js";
import { MainOrderService } from "../services/mainOrder.service.js";
import { PaymentService } from "../services/payment.service.js";
import { VendorOrderService } from "../services/VendorOrder.service.js";
import {
  cancelOrderSchema,
  createOrderSchema,
  updateOrderStatusSchema,
} from "../validators/order.validation.js";

const router = Router();
router.use(authenticateJWT);

const paymentService = new PaymentService();
const vendorOrderService = new VendorOrderService();
const mainOrderService = new MainOrderService();
const inventoryService = new InventoryService();

const mainOrderController = new MainOrderController(
  mainOrderService,
  paymentService,
  vendorOrderService,
  inventoryService,
);
const vendorOrderController = new VendorOrderController(vendorOrderService);

// Main Order Routes
router.post("/", validate(createOrderSchema), mainOrderController.create);
router.get("/user", mainOrderController.getUserOrders);
router.get("/:id", mainOrderController.getById);
router.patch(
  "/:id/cancel",
  validate(cancelOrderSchema),
  mainOrderController.cancel,
);

// Vendor Order Routes
router.get("/shop/:shopId", vendorOrderController.getShopOrders);
router.get("/vendor/:id", vendorOrderController.getById);
router.patch(
  "/vendor/:id/status",
  validate(updateOrderStatusSchema),
  vendorOrderController.updateStatus,
);

// Vendor processing routes
router.post(
  "/vendor/:vendorOrderId/accept",
  vendorOrderController.acceptVendorOrder,
);
router.post(
  "/vendor/:vendorOrderId/verify-prescription",
  vendorOrderController.verifyPrescription,
);
router.post(
  "/vendor/:vendorOrderId/process",
  vendorOrderController.startProcessing,
);
router.post(
  "/vendor/:vendorOrderId/assign-rider",
  vendorOrderController.assignRider,
);
router.post(
  "/vendor/:vendorOrderId/out-for-delivery",
  vendorOrderController.markOutForDelivery,
);

export default router;

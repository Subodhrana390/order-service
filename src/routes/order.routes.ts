import { Router } from "express";
import { MainOrderController } from "../controllers/mainOrder.controller.js";
import { VendorOrderController } from "../controllers/vendorOrder.controller.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.js";
import {
  paymentService,
  vendorOrderService,
  inventoryService,
  mainOrderService
} from "../services/index.js";
import {
  cancelOrderSchema,
  createOrderSchema,
  updateOrderStatusSchema,
} from "../validators/order.validation.js";

const router = Router();
router.use(authenticateJWT);

const mainOrderController = new MainOrderController(
  mainOrderService,
  paymentService,
  vendorOrderService,
  inventoryService
);

const vendorOrderController = new VendorOrderController(
  vendorOrderService,
);

router.post("/", validate(createOrderSchema), mainOrderController.create);

router.get("/user", mainOrderController.getUserOrders);

router.get(
  "/vendor/:vendorId/orders",
  vendorOrderController.getShopOrders,
);

router.get(
  "/vendor/orders/:orderId",
  vendorOrderController.getById,
);

router.patch(
  "/vendor/orders/:orderId/status",
  validate(updateOrderStatusSchema),
  vendorOrderController.updateStatus,
);

router.patch(
  "/vendor/:vendorOrderId/accept",
  vendorOrderController.acceptVendorOrder,
);

router.patch(
  "/vendor/:vendorOrderId/verify-prescription",
  vendorOrderController.verifyPrescription,
);

router.patch(
  "/vendor/:vendorOrderId/process",
  vendorOrderController.startPacking,
);

router.patch(
  "/vendor/:vendorOrderId/ready-for-pickup",
  vendorOrderController.markReadyForPickup,
);

router.get("/:id", mainOrderController.getById);

router.patch(
  "/:id/cancel",
  validate(cancelOrderSchema),
  mainOrderController.cancel,
);

export default router;
import { Request, Response } from "express";
import {
  PaymentMethod,
  TransactionType,
} from "../infrastructure/interfaces/order.interface.js";
import { KafkaProducer } from "../infrastructure/kafka/producer.js";
import { MainOrder } from "../models/order.model.js";
import { InventoryService } from "../services/inventory.service.js";
import { MainOrderService } from "../services/mainOrder.service.js";

import { PaymentService } from "../services/payment.service.js";
import { VendorOrderService } from "../services/VendorOrder.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export class MainOrderController {
  constructor(
    private readonly mainOrderService: MainOrderService,
    private readonly paymentService: PaymentService,
    private readonly vendorOrderService: VendorOrderService,
    private readonly inventoryService: InventoryService
  ) { }

  create = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id as string;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const {
      orderItems,
      shippingAddress,
      paymentMethod,
      totalAmount,
      discountAmount,
      payableAmount,
      deliveryFee,
      platformFee,
      idempotencyKey,
    } = req.body;

    if (idempotencyKey) {
      const existingOrder = await MainOrder.findOne({ userId, idempotencyKey });
      if (existingOrder) {
        return res
          .status(200)
          .json(
            new ApiResponse(
              200,
              { order: existingOrder },
              "Order already exists (Idempotent response)",
            ),
          );
      }
    }

    const itemsToVerify = orderItems.map((item: any) => ({
      productId: item.productId,
      shopId: item.shopId,
    }));

    const productPrices =
      await this.inventoryService.getProductPrices(itemsToVerify);

    let mainOrder;
    let vendorOrders: string[] = [];
    let paymentData = null;

    try {
      mainOrder = await this.mainOrderService.createOrder(
        {
          userId,
          orderItems,
          shippingAddress,
          paymentMethod,
          pricing: {
            totalAmount,
            discountAmount,
            payableAmount,
            deliveryFee,
            platformFee,
          },
          idempotencyKey,
        },
        productPrices,
      );

      if (paymentMethod === PaymentMethod.COD) {
        const vendorOrderDrafts =
          this.mainOrderService.OrderSplitByVendor(orderItems);
        for (const draft of vendorOrderDrafts) {
          const vOrderId = await this.vendorOrderService.createVendorOrder({
            mainOrderId: mainOrder.id,
            shopId: draft.shopId,
            userId,
            items: draft.items,
            subtotal: draft.subtotal,
          });
          vendorOrders.push(vOrderId);
        }
      }

      if (paymentMethod !== PaymentMethod.COD) {
        paymentData = await this.paymentService.processPayment(
          payableAmount,
          paymentMethod,
          TransactionType.ORDER_PAYMENT,
          userId,
          mainOrder.id,
          "Order payment",
        );

        if (paymentData?.transactionId) {
          await this.mainOrderService.updatePaymentInfo(
            mainOrder.id,
            paymentData.transactionId,
          );
        }
      }
    } catch (error: any) {
      throw new ApiError(
        error.statusCode || 500,
        error.message || "Failed to create order",
      );
    }

    res.status(201).json(
      new ApiResponse(
        201,
        {
          order: mainOrder,
          payment: paymentData,
          vendorOrderIds: vendorOrders,
        },
        "Order created successfully",
      ),
    );
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const orderId = req.params.id as string;
    const { reason, bankDetails } = req.body;
    const mainOrder = await this.mainOrderService.cancelOrder({
      orderId,
      reason,
      bankDetails,
    });

    await KafkaProducer.sendOrderEvent("order.cancelled", {
      orderId,
      reason,
      paymentMethod: mainOrder.paymentInfo?.method,
      refundBankDetails: bankDetails,
    });

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { order: mainOrder },
          "Main order cancellation initiated successfully",
        ),
      );
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const order = await MainOrder.findOne({ id });
    if (!order) throw new ApiError(404, "Order not found");
    res
      .status(200)
      .json(new ApiResponse(200, order, "Order fetched successfully"));
  });

  getOrderDetails = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const orderDetails = await this.mainOrderService.getOrderDetails(id);
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          orderDetails,
          "Order details fetched successfully",
        ),
      );
  });

  getUserOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, "Unauthorized");

    const { cursor, limit = "10" } = req.query;

    const safeLimit = Math.min(Number(limit), 50);

    const orderswithcursor = await this.mainOrderService.getMainOrders(userId, safeLimit, undefined, cursor as string);

    res.status(200).json(
      new ApiResponse(
        200,
        orderswithcursor,
        "User orders fetched successfully",
      ),
    );
  });

  getAllAdminOrders = asyncHandler(async (req: Request, res: Response) => {
    const { cursor, limit = "10" } = req.query;
    const safeLimit = Math.min(Number(limit), 50);

    const orderswithcursor = await this.mainOrderService.getAllAdminOrders(safeLimit, undefined, cursor as string);

    res.status(200).json(
      new ApiResponse(
        200,
        orderswithcursor,
        "All admin orders fetched successfully",
      ),
    );
  });
}

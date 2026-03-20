import { Request, Response } from "express";
import { VendorOrderService } from "../services/VendorOrder.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { v4 as uuid } from "uuid";

export class VendorOrderController {
  constructor(private readonly vendorOrderService: VendorOrderService) {}

  acceptVendorOrder = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const vendorOrder =
      await this.vendorOrderService.acceptOrder(vendorOrderId);

    res
      .status(200)
      .json(
        new ApiResponse(200, vendorOrder, "Vendor order accepted successfully"),
      );
  });

  verifyPrescription = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const verifiedBy = req.user?.id as string;
    const vendorOrder = await this.vendorOrderService.verifyPrescription(
      vendorOrderId,
      verifiedBy,
    );

    res
      .status(200)
      .json(
        new ApiResponse(200, vendorOrder, "Prescription verified successfully"),
      );
  });

  startProcessing = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const vendorOrder =
      await this.vendorOrderService.startProcessing(vendorOrderId);

    res
      .status(200)
      .json(
        new ApiResponse(200, vendorOrder, "Vendor order moved to processing"),
      );
  });

  assignRider = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const riderInformation = {
      riderId: uuid(),
      name: "Rider 1",
      phone: "9876543210",
      assignedAt: new Date(),
    };

    const vendorOrder = await this.vendorOrderService.assignRider(
      vendorOrderId,
      riderInformation,
    );

    res
      .status(200)
      .json(new ApiResponse(200, vendorOrder, "Rider assigned successfully"));
  });

  markOutForDelivery = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const vendorOrder =
      await this.vendorOrderService.markOutForDelivery(vendorOrderId);

    res
      .status(200)
      .json(new ApiResponse(200, vendorOrder, "Order is out for delivery"));
  });

  getShopOrders = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.params.shopId as string;
    if (!shopId) throw new ApiError(400, "shopId is required");

    const orders = await this.vendorOrderService.getShopOrders(shopId);

    res
      .status(200)
      .json(new ApiResponse(200, orders, "Shop orders fetched successfully"));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (!id) throw new ApiError(400, "vendorOrderId is required");

    const order = await this.vendorOrderService.getById(id);

    res
      .status(200)
      .json(new ApiResponse(200, order, "Order fetched successfully"));
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body;
    if (!id) throw new ApiError(400, "vendorOrderId is required");
    if (!status) throw new ApiError(400, "status is required");

    const vendorOrder = await this.vendorOrderService.updateStatus(id, status);

    res
      .status(200)
      .json(
        new ApiResponse(200, vendorOrder, "Order status updated successfully"),
      );
  });
}


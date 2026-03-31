import { Request, Response } from "express";
import { VendorOrderService } from "../services/VendorOrder.service.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { v4 as uuid } from "uuid";

export class VendorOrderController {
  constructor(private readonly vendorOrderService: VendorOrderService) { }

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

  startPacking = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const vendorOrder =
      await this.vendorOrderService.startPacking(vendorOrderId);

    res
      .status(200)
      .json(
        new ApiResponse(200, vendorOrder, "Vendor order moved to packing"),
      );
  });

  markReadyForPickup = asyncHandler(async (req: Request, res: Response) => {
    const vendorOrderId = req.params.vendorOrderId as string;
    if (!vendorOrderId) throw new ApiError(400, "vendorOrderId is required");

    const vendorOrder =
      await this.vendorOrderService.markReadyForPickup(vendorOrderId);

    res
      .status(200)
      .json(
        new ApiResponse(200, vendorOrder, "Vendor order marked as ready for pickup"),
      );
  });

  getShopOrders = asyncHandler(async (req: Request, res: Response) => {
    const shopId = req.params.vendorId as string;
    if (!shopId) throw new ApiError(400, "shopId is required");

    const { cursor, limit = "10" } = req.query;

    const result = await this.vendorOrderService.getShopOrders(
      shopId,
      Number(limit),
      undefined,
      cursor as string | undefined,
    );

    res.status(200).json(
      new ApiResponse(200, result, "Shop orders fetched successfully"),
    );
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.orderId as string;
    if (!id) throw new ApiError(400, "vendorOrderId is required");

    const order = await this.vendorOrderService.getById(id);

    res
      .status(200)
      .json(new ApiResponse(200, order, "Order fetched successfully"));
  });

  updateStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.orderId as string;
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


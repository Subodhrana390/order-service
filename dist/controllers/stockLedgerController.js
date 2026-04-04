import { asyncHandler } from "../middlewares/asyncHandler.js";
import stockLedgerService from "../services/stockLedgerService.js";
import { ApiResponse } from "../utils/ApiResponse.js";
class StockLedgerController {
    getLedgerByInventoryId = asyncHandler(async (req, res) => {
        const inventoryId = req.params.inventoryId;
        const { cursor, direction = "next", limit = "20", } = req.query;
        const pageSize = Number(limit);
        const ledger = await stockLedgerService.getByInventory(inventoryId, pageSize, cursor, direction);
        const hasNextPage = ledger.length === pageSize;
        const hasPrevPage = !!cursor;
        res.json(new ApiResponse(200, {
            items: ledger,
            hasNextPage,
            hasPrevPage,
            nextCursor: hasNextPage
                ? ledger[ledger.length - 1]?.createdAt.toISOString()
                : null,
            prevCursor: ledger.length ? ledger[0]?.createdAt.toISOString() : null,
        }, "Ledger fetched successfully"));
    });
    getStockHistory = asyncHandler(async (req, res) => {
        const { fromDate, toDate, cursor, direction = "next", limit = "10", } = req.query;
        const shopId = req.params.shopId;
        let from;
        let to;
        if (fromDate) {
            from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
        }
        if (toDate) {
            to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
        }
        const result = await stockLedgerService.getStockHistory(shopId, from, to, Number(limit) || 10, cursor, direction);
        res.json(new ApiResponse(200, result, "Stock history fetched successfully"));
    });
}
const stockLedgerController = new StockLedgerController();
export default stockLedgerController;

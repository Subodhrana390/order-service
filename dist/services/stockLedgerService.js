import StockLedger, { StockLedgerModel, } from "../models/stock-ledger.schema.js";
class StockLedgerService {
    static instance;
    static getInstance() {
        if (!StockLedgerService.instance) {
            StockLedgerService.instance = new StockLedgerService();
        }
        return StockLedgerService.instance;
    }
    async createEntry(params) {
        return StockLedger.create({
            inventoryId: params.inventoryId,
            shopId: params.shopId,
            entryType: params.entryType,
            changeInPacks: params.changeInPacks,
            balanceAfterPacks: params.balanceAfterPacks,
            performedBy: params.performedBy,
            orderId: params.orderId,
            referenceId: params.referenceId,
            reason: params.reason,
        });
    }
    async getByInventory(inventoryId, limit, cursor, direction = "next") {
        const query = { inventoryId };
        if (cursor) {
            query.createdAt =
                direction === "next"
                    ? { $lt: new Date(cursor) }
                    : { $gt: new Date(cursor) };
        }
        const sortOrder = direction === "next" ? -1 : 1;
        const ledger = await StockLedgerModel.find(query)
            .sort({ createdAt: sortOrder })
            .limit(limit);
        return direction === "prev" ? ledger.reverse() : ledger;
    }
    async getStockHistory(shopId, fromDate, toDate, limit = 10, cursor, direction = "next") {
        const match = { shopId };
        const andConditions = [];
        if (fromDate || toDate) {
            const dateFilter = {};
            if (fromDate)
                dateFilter.$gte = fromDate;
            if (toDate)
                dateFilter.$lte = toDate;
            if (Object.keys(dateFilter).length > 0) {
                andConditions.push({ createdAt: dateFilter });
            }
        }
        if (cursor) {
            const cursorObj = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
            const cursorDate = new Date(cursorObj.createdAt);
            const cursorCondition = direction === "next"
                ? {
                    $or: [
                        { createdAt: { $lt: cursorDate } },
                        {
                            createdAt: cursorDate,
                            id: { $lt: cursorObj.id },
                        },
                    ],
                }
                : {
                    $or: [
                        { createdAt: { $gt: cursorDate } },
                        {
                            createdAt: cursorDate,
                            id: { $gt: cursorObj.id },
                        },
                    ],
                };
            andConditions.push(cursorCondition);
        }
        if (andConditions.length > 0) {
            match.$and = andConditions;
        }
        const sortOrder = direction === "next" ? -1 : 1;
        const docs = await StockLedger.find(match)
            .sort({ createdAt: sortOrder, id: sortOrder })
            .limit(limit + 1)
            .lean();
        const hasMore = docs.length > limit;
        if (hasMore)
            docs.pop();
        const history = direction === "prev" ? docs.reverse() : docs;
        const encodeCursor = (doc) => Buffer.from(JSON.stringify({
            createdAt: doc.createdAt,
            id: doc.id,
        })).toString("base64");
        return {
            items: history,
            hasNextPage: direction === "next" ? hasMore : Boolean(cursor),
            hasPrevPage: direction === "prev" ? hasMore : Boolean(cursor),
            nextCursor: history.length > 0 ? encodeCursor(history[history.length - 1]) : null,
            prevCursor: history.length > 0 ? encodeCursor(history[0]) : null,
        };
    }
    async getLastEntry(inventoryId) {
        return StockLedger.findOne({ inventoryId }).sort({ createdAt: -1 });
    }
    async hasAnyMovement(inventoryId) {
        const count = await StockLedger.countDocuments({ inventoryId });
        return count > 0;
    }
}
const stockLedgerService = StockLedgerService.getInstance();
export default stockLedgerService;

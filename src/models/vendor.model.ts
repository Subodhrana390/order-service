import crypto from "crypto";
import { model, Schema } from "mongoose";
import { v4 as uuid } from "uuid";
import {
  IVendorOrder,
  VendorOrderStatus,
} from "../infrastructure/interfaces/order.interface.js";

const OrderItemSchema = new Schema(
  {
    productId: { type: String, required: true },

    productName: { type: String, required: true },
    productType: { type: String },
    productImage: { type: String },

    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },

    shopId: { type: String, required: true },

    requiresPrescription: { type: Boolean, required: true },

    prescription: {
      prescriptionId: { type: String },
      verified: { type: Boolean, default: false },
      verifiedAt: { type: Date },
      verifiedBy: { type: String },
    },
  },
  { _id: false },
);

const VendorOrderSchema = new Schema<IVendorOrder>(
  {
    id: { type: String, default: () => uuid(), unique: true, index: true },
    vendorOrderNumber: {
      type: String,
    },
    mainOrderId: {
      type: String,
      required: true,
      index: true,
    },

    shopId: {
      type: String,
      required: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    items: {
      type: [OrderItemSchema],
      required: true,
    },

    subtotal: { type: Number, required: true },

    status: {
      type: String,
      enum: Object.values(VendorOrderStatus),
      index: true,
    },

    riderInfo: {
      riderId: {
        type: String,
      },
      name: String,
      phone: String,
      assignedAt: Date,
    },

    acceptedAt: Date,

    dispatchedAt: Date,
    packingStartedAt: Date,
    deliveredAt: Date,
    cancelReason: String,
    cancelledAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        const { _id, __v, ...rest } = ret;
        return rest;
      },
    },
    toObject: {
      transform: function (doc, ret) {
        const { _id, __v, ...rest } = ret;
        return rest;
      },
    },
  },
);

VendorOrderSchema.methods.generateVendorOrderNumber = function (): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `VOD${y}${m}${d}${randomSuffix}`;
};

export const VendorOrder = model<IVendorOrder>(
  "VendorOrder",
  VendorOrderSchema,
);

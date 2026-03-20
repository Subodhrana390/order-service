import mongoose, { Schema } from "mongoose";
import { v4 as uuid } from "uuid";
import {
  IMainOrder,
  MainOrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductType,
} from "../infrastructure/interfaces/order.interface.js";

const PrescriptionSchema = new Schema(
  {
    prescriptionId: { type: String, required: true },
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: String,
  },
  { _id: false },
);

const OrderItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    productType: {
      type: String,
      enum: Object.values(ProductType),
      required: true,
    },
    productImage: String,
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    shopId: { type: String, required: true },
    requiresPrescription: { type: Boolean, default: false },
    prescription: { type: PrescriptionSchema },
  },
  { _id: false },
);

const MainOrderSchema = new Schema<IMainOrder>(
  {
    id: { type: String, default: () => uuid(), unique: true, index: true },
    idempotencyKey: { type: String, index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    subOrderIds: [{ type: String }],
    totalAmount: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    payableAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },

    overAllStatus: {
      type: String,
      enum: Object.values(MainOrderStatus),
      default: MainOrderStatus.PLACED,
      index: true,
    },

    paymentInfo: {
      method: {
        type: String,
        enum: Object.values(PaymentMethod),
        required: true,
      },
      status: {
        type: String,
        enum: Object.values(PaymentStatus),
        default: PaymentStatus.PENDING,
        index: true,
        required: true,
      },
      transactionId: String,
      refundTransactionId: String,
      paidAt: Date,
      failAt: Date,
      refundedAt: Date,
      refundBankDetails: {
        accountName: String,
        bankName: String,
        ifscCode: String,
      },
    },
    cancelReason: String,

    shippingAddress: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },

    items: { type: [OrderItemSchema], default: [] },
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

export const MainOrder = mongoose.model<IMainOrder>(
  "MainOrder",
  MainOrderSchema,
);

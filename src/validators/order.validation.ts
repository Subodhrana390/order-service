import {
  PaymentMethod,
  ProductType,
} from "../infrastructure/interfaces/order.interface.js";
import { z } from "zod";

export const orderItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  productType: z.nativeEnum(ProductType),

  productImage: z.string().url().optional(),

  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  subtotal: z.number().positive(),

  shopId: z.string().min(1),

  requiresPrescription: z.boolean(),

  prescription: z
    .object({
      prescriptionId: z.string().min(1),
      verified: z.boolean(),
    })
    .optional(),
});

export const shippingAddressSchema = z.object({
  name: z.string().min(1),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian mobile number"),
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().regex(/^\d{6}$/, "Invalid pincode"),
});

export const createOrderSchema = z.object({
  orderItems: z.array(orderItemSchema).min(1),
  totalAmount: z.number().positive(),
  discountAmount: z.number().min(0).default(0),
  deliveryFee: z.number().min(0).default(0),
  platformFee: z.number().min(0).default(0),
  payableAmount: z.number().positive(),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(Object.values(PaymentMethod)),
  idempotencyKey: z.string().optional(),
});

export const cancelOrderSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(1),
  bankDetails: z
    .object({
      accountName: z.string().min(1),
      bankName: z.string().min(1),
      ifscCode: z.string().min(1),
    })
    .optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.string().min(1),
});

export const returnRequestSchema = z.object({
  reason: z.string().min(1),
  bankDetails: z
    .object({
      accountName: z.string().min(1),
      bankName: z.string().min(1),
      ifscCode: z.string().min(1),
    })
    .optional(),
});

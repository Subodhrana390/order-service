import { Document } from "mongoose";

export enum ProductType {
  MEDICINE = "MEDICINE",
  WELLNESS = "WELLNESS",
  DEVICE = "DEVICE",
  FIRST_AID = "FIRST_AID",
  PERSONAL_CARE = "PERSONAL_CARE",
  ELDERLY_CARE = "ELDERLY_CARE",
  DIAGNOSTICS = "DIAGNOSTICS",
}

/* -------------------- Order Status -------------------- */

export enum VendorOrderStatus {
  NEW = "NEW", // Created after payment success

  ACCEPTED = "ACCEPTED", // Vendor accepted the order

  PRESCRIPTION_VERIFIED = "PRESCRIPTION_VERIFIED", // Prescription checked & approved (if required)

  PACKING = "PACKING", // Items being packed

  READY_FOR_PICKUP = "READY_FOR_PICKUP", // Packed and waiting for rider

  RIDER_ASSIGNED = "RIDER_ASSIGNED", // Rider assigned to vendor order

  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", // Rider picked up and delivering

  DELIVERED = "DELIVERED", // Successfully delivered

  CANCELLED = "CANCELLED", // Cancelled by vendor/admin/user
}

export enum MainOrderStatus {
  PENDING = "PENDING", // Waiting for online payment

  PLACED = "PLACED", // Payment successful / COD created

  CONFIRMED = "CONFIRMED", // At least one vendor accepted

  PRESCRIPTION_PENDING = "PRESCRIPTION_PENDING", // Waiting prescription approval (if required)

  PACKING = "PACKING", // Any vendor packing items

  READY_FOR_PICKUP = "READY_FOR_PICKUP", // All vendors ready for rider pickup

  RIDER_ASSIGNED = "RIDER_ASSIGNED", // Rider assigned to the order

  OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY", // Rider delivering order

  DELIVERED = "DELIVERED", // All vendor orders delivered

  PARTIALLY_CANCELLED = "PARTIALLY_CANCELLED", // Some vendors cancelled

  CANCELLED = "CANCELLED", // All vendors cancelled OR payment failed
}

export enum TransactionType {
  ORDER_PAYMENT = "ORDER_PAYMENT",
  VENDOR_PAYOUT = "VENDOR_PAYOUT",
  RIDER_PAYOUT = "RIDER_PAYOUT",
  REFUND = "REFUND",
  PLATFORM_FEE = "PLATFORM_FEE",
}

/* -------------------- Payment Status -------------------- */
export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export interface ILocation {
  type: "Point";
  coordinates: [number, number];
}

export interface IShippingAddress {
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  location: ILocation;
}

/* -------------------- Order Item -------------------- */
export interface IOrderItem {
  productId: string;
  productName: string;
  productType: ProductType;
  productImage?: string;

  quantity: number;
  unitPrice: number;
  subtotal: number;

  shopId: string;

  requiresPrescription: boolean;

  prescription?: {
    prescriptionId: string;
    verified: boolean;
    verifiedAt?: Date;
    verifiedBy?: string;
  };
}

/* -------------------- Payment Method -------------------- */

export enum PaymentMethod {
  COD = "COD",
  RAZORPAY = "RAZORPAY",
}

/* -------------------- Bank Details for Refunds -------------------- */
export interface BankDetails {
  accountName: string;
  bankName: string;
  ifscCode: string;
}

/* -------------------- Order Interface -------------------- */
export interface IMainOrder extends Document {
  id: string;
  idempotencyKey?: string;
  orderNumber: string;
  userId: string;

  subOrderIds: string[];

  totalAmount: number;
  deliveryFee: number;
  platformFee: number;
  discountAmount: number;
  payableAmount: number;
  currency: string;

  overAllStatus: MainOrderStatus;

  paymentInfo?: {
    method: PaymentMethod;
    status: PaymentStatus;
    transactionId?: string;
    refundTransactionId?: string;
    paidAt?: Date;
    failAt?: Date;
    refundedAt?: Date;
    refundBankDetails?: BankDetails;
  };

  shippingAddress: IShippingAddress;
  items: IOrderItem[];
  cancelReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface IVendorOrder extends Document {
  id: string;
  vendorOrderNumber: string;
  mainOrderId: string;
  shopId: string;
  userId: string;

  items: IOrderItem[];
  subtotal: number;

  status: VendorOrderStatus;

  riderInfo?: {
    riderId: string;
    name: string;
    phone: string;
    assignedAt: Date;
  };

  acceptedAt?: Date;
  packingStartedAt?: Date;
  readyForPickupAt?: Date;
  dispatchedAt?: Date;
  deliveredAt?: Date;
  cancelReason?: string;
  cancelledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

import mongoose, { Schema, Types } from "mongoose";

export const PAYMENT_METHODS = ["card", "cash", "transfer"] as const;

export interface IPayment {
  reservation: Types.ObjectId;
  reservationCode: string;
  provider: "payphone" | "manual" | "datafast";
  mode: "deposit" | "full" | "balance" | "manual";
  /** card = Payphone en línea; cash / transfer = registrado por el personal. */
  method: (typeof PAYMENT_METHODS)[number];
  registeredBy: { id: string; name: string; email: string } | null;
  note: string;
  refundedAt: Date | null;
  amount: number;
  currency: "USD";
  clientTransactionId: string;
  transactionId: string;
  status: "pending" | "approved" | "canceled" | "error" | "refunded";
  providerResponse: unknown;
  approvedAt: Date | null;
}

const paymentSchema = new Schema<IPayment>(
  {
    reservation: { type: Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
    reservationCode: { type: String, required: true, index: true },
    provider: { type: String, enum: ["payphone", "manual", "datafast"], default: "payphone" },
    mode: { type: String, enum: ["deposit", "full", "balance", "manual"], required: true },
    method: { type: String, enum: PAYMENT_METHODS, default: "card" },
    registeredBy: {
      type: new Schema({ id: String, name: String, email: String }, { _id: false }),
      default: null,
    },
    note: { type: String, default: "" },
    refundedAt: { type: Date, default: null },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    clientTransactionId: { type: String, required: true, unique: true, index: true },
    transactionId: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "canceled", "error", "refunded"],
      default: "pending",
      index: true,
    },
    providerResponse: { type: Schema.Types.Mixed, default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Payment = mongoose.models.Payment || mongoose.model<IPayment>("Payment", paymentSchema);

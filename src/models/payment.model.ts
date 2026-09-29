import mongoose, { Schema, Types } from "mongoose";

export interface IPayment {
  reservation: Types.ObjectId;
  reservationCode: string;
  provider: "payphone" | "manual" | "datafast";
  mode: "deposit" | "full" | "balance";
  amount: number;
  currency: "USD";
  clientTransactionId: string;
  transactionId: string;
  status: "pending" | "approved" | "canceled" | "error";
  providerResponse: unknown;
  approvedAt: Date | null;
}

const paymentSchema = new Schema<IPayment>(
  {
    reservation: { type: Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
    reservationCode: { type: String, required: true, index: true },
    provider: { type: String, enum: ["payphone", "manual", "datafast"], default: "payphone" },
    mode: { type: String, enum: ["deposit", "full", "balance"], required: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    clientTransactionId: { type: String, required: true, unique: true, index: true },
    transactionId: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "canceled", "error"],
      default: "pending",
      index: true,
    },
    providerResponse: { type: Schema.Types.Mixed, default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Payment = mongoose.models.Payment || mongoose.model<IPayment>("Payment", paymentSchema);

import mongoose, { Schema, Types } from "mongoose";
import { Attribution, AttributionSchema, I18nText, I18nTextSchema } from "./shared.schema";

export const RESERVATION_STATUSES = [
  "pending_documents",
  "pending_payment",
  "confirmed",
  "delivered",
  "completed",
  "cancelled",
  "expired",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Estados que ocupan una unidad en el calendario. */
export const BLOCKING_STATUSES: ReservationStatus[] = [
  "pending_documents",
  "pending_payment",
  "confirmed",
  "delivered",
];

export const VERIFICATION_STATUSES = ["pending", "verified", "needs_info", "rejected"] as const;

export interface IPriceLine {
  key: string;
  label: I18nText;
  amount: number;
}

/**
 * Snapshot congelado del precio: si mañana cambian las tarifas, la reserva
 * conserva lo que el cliente vio y aceptó.
 */
export interface IPricing {
  days: number;
  currency: "USD";
  categoryPricePerDay: number;
  lines: IPriceLine[];
  total: number;
  deposit: number;
  guaranteeAmount: number;
  includedKm: number | null;
  extraKmPrice: number;
}

export interface IReservation {
  code: string;
  accessToken: string;
  status: ReservationStatus;
  verification: (typeof VERIFICATION_STATUSES)[number];
  verificationNote: string;
  category: Types.ObjectId;
  categorySlug: string;
  categoryName: I18nText;
  vehicle: Types.ObjectId | null;
  customer: Types.ObjectId;
  lead: Types.ObjectId | null;
  pickupAt: Date;
  returnAt: Date;
  pickupLocation: string;
  returnLocation: string;
  pickupAddress: string;
  mileage: "limited" | "unlimited";
  coverage: string;
  extras: { code: string; quantity: number }[];
  pricing: IPricing;
  amountPaid: number;
  balance: number;
  paymentMode: "deposit" | "full" | "";
  /** Calculado por el sistema comparando lo pagado contra el total; nunca se edita a mano. */
  paymentStatus: "pending" | "partial" | "paid" | "refunded";
  /** web = la creó el cliente; walk_in = la creó el personal en el local. */
  channel: "web" | "walk_in";
  createdBy: { id: string; name: string; email: string } | null;
  holdExpiresAt: Date | null;
  documents: { license: boolean; identity: boolean };
  contract: {
    version: string;
    /** pending = generado y esperando aceptación; signed = aceptado electrónicamente. */
    status: "not_required" | "draft" | "pending" | "sent" | "signed";
    fileUrl: string;
    signatureStatus: string;
    signedAt: Date | null;
    /** Texto exacto que el cliente aceptó (congelado) y su huella SHA-256. */
    renderedText: string;
    hash: string;
    acceptance: {
      name: string;
      documentNumber: string;
      ip: string;
      userAgent: string;
      at: Date | null;
    } | null;
  };
  /** Garantía física (Datafast u otro medio). No pasa por PayPhone. */
  guarantee: {
    status: "pending" | "held" | "released" | "charged" | "partially_charged";
    amount: number;
    method: "datafast" | "cash" | "transfer" | "";
    reference: string;
    chargedAmount: number;
    chargeReason: string;
    heldAt: Date | null;
    settledAt: Date | null;
    notes: string;
    updatedBy: { id: string; name: string; email: string } | null;
  };
  language: "es" | "en";
  attribution: Attribution;
  notes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PriceLineSchema = new Schema<IPriceLine>(
  { key: String, label: { type: I18nTextSchema, default: () => ({}) }, amount: Number },
  { _id: false },
);

const reservationSchema = new Schema<IReservation>(
  {
    code: { type: String, required: true, unique: true, index: true },
    accessToken: { type: String, required: true, select: false },
    status: { type: String, enum: RESERVATION_STATUSES, default: "pending_documents", index: true },
    verification: { type: String, enum: VERIFICATION_STATUSES, default: "pending" },
    verificationNote: { type: String, default: "" },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    categorySlug: { type: String, required: true },
    categoryName: { type: I18nTextSchema, default: () => ({}) },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", default: null, index: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    lead: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    pickupAt: { type: Date, required: true, index: true },
    returnAt: { type: Date, required: true, index: true },
    pickupLocation: { type: String, required: true },
    returnLocation: { type: String, required: true },
    pickupAddress: { type: String, default: "" },
    mileage: { type: String, enum: ["limited", "unlimited"], default: "limited" },
    coverage: { type: String, default: "standard" },
    extras: {
      type: [new Schema({ code: String, quantity: { type: Number, default: 1 } }, { _id: false })],
      default: [],
    },
    pricing: {
      days: Number,
      currency: { type: String, default: "USD" },
      categoryPricePerDay: Number,
      lines: { type: [PriceLineSchema], default: [] },
      total: Number,
      deposit: Number,
      guaranteeAmount: Number,
      includedKm: { type: Number, default: null },
      extraKmPrice: Number,
    },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    paymentMode: { type: String, enum: ["deposit", "full", ""], default: "" },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid", "refunded"],
      default: "pending",
      index: true,
    },
    channel: { type: String, enum: ["web", "walk_in"], default: "web" },
    createdBy: {
      type: new Schema({ id: String, name: String, email: String }, { _id: false }),
      default: null,
    },
    holdExpiresAt: { type: Date, default: null },
    documents: {
      license: { type: Boolean, default: false },
      identity: { type: Boolean, default: false },
    },
    // Preparado para firma electrónica futura: hoy queda en "not_required".
    contract: {
      version: { type: String, default: "" },
      status: {
        type: String,
        enum: ["not_required", "draft", "pending", "sent", "signed"],
        default: "not_required",
      },
      fileUrl: { type: String, default: "" },
      signatureStatus: { type: String, default: "" },
      signedAt: { type: Date, default: null },
      renderedText: { type: String, default: "", select: false },
      hash: { type: String, default: "" },
      acceptance: {
        type: new Schema(
          { name: String, documentNumber: String, ip: String, userAgent: String, at: Date },
          { _id: false },
        ),
        default: null,
      },
    },
    guarantee: {
      status: {
        type: String,
        enum: ["pending", "held", "released", "charged", "partially_charged"],
        default: "pending",
      },
      amount: { type: Number, default: 0 },
      method: { type: String, enum: ["datafast", "cash", "transfer", ""], default: "" },
      reference: { type: String, default: "" },
      chargedAmount: { type: Number, default: 0 },
      chargeReason: { type: String, default: "" },
      heldAt: { type: Date, default: null },
      settledAt: { type: Date, default: null },
      notes: { type: String, default: "" },
      updatedBy: {
        type: new Schema({ id: String, name: String, email: String }, { _id: false }),
        default: null,
      },
    },
    language: { type: String, enum: ["es", "en"], default: "es" },
    attribution: { type: AttributionSchema, default: () => ({}) },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Reservation =
  mongoose.models.Reservation || mongoose.model<IReservation>("Reservation", reservationSchema);

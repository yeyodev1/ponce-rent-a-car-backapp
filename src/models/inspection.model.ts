import mongoose, { Schema, Types } from "mongoose";

/**
 * Acta de entrega o devolución. La de devolución se compara contra la de
 * entrega (km recorridos, diferencia de combustible, daños nuevos).
 */
export const FUEL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const; // octavos de tanque
export const DAMAGE_ZONES = [
  "front",
  "rear",
  "left",
  "right",
  "roof",
  "windshield",
  "wheels",
  "interior",
  "trunk",
  "other",
] as const;

export interface IInspectionDamage {
  zone: (typeof DAMAGE_ZONES)[number];
  description: string;
  severity: "minor" | "moderate" | "severe";
  photo: string;
  isNew: boolean;
}

export interface IInspection {
  reservation: Types.ObjectId;
  reservationCode: string;
  vehicle: Types.ObjectId;
  type: "delivery" | "return";
  mileageKm: number;
  fuelLevel: number;
  photos: { url: string; label: string }[];
  damages: IInspectionDamage[];
  checklist: {
    spareTire: boolean;
    jack: boolean;
    documents: boolean;
    cleanInterior: boolean;
    cleanExterior: boolean;
    accessories: boolean;
  };
  notes: string;
  /** El cliente revisó el acta en el local (nombre escrito). */
  customerAgreedName: string;
  performedAt: Date;
  performedBy: { id: string; name: string; email: string } | null;
}

const inspectionSchema = new Schema<IInspection>(
  {
    reservation: { type: Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
    reservationCode: { type: String, required: true },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    type: { type: String, enum: ["delivery", "return"], required: true },
    mileageKm: { type: Number, required: true, min: 0 },
    fuelLevel: { type: Number, required: true, min: 0, max: 8 },
    photos: {
      type: [new Schema({ url: String, label: { type: String, default: "" } }, { _id: false })],
      default: [],
    },
    damages: {
      type: [
        new Schema(
          {
            zone: { type: String, enum: DAMAGE_ZONES, default: "other" },
            description: { type: String, default: "" },
            severity: { type: String, enum: ["minor", "moderate", "severe"], default: "minor" },
            photo: { type: String, default: "" },
            isNew: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    checklist: {
      spareTire: { type: Boolean, default: false },
      jack: { type: Boolean, default: false },
      documents: { type: Boolean, default: false },
      cleanInterior: { type: Boolean, default: false },
      cleanExterior: { type: Boolean, default: false },
      accessories: { type: Boolean, default: false },
    },
    notes: { type: String, default: "" },
    customerAgreedName: { type: String, default: "" },
    performedAt: { type: Date, default: () => new Date() },
    performedBy: {
      type: new Schema({ id: String, name: String, email: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);

// Una entrega y una devolución por reserva.
inspectionSchema.index({ reservation: 1, type: 1 }, { unique: true });

export const Inspection =
  mongoose.models.Inspection || mongoose.model<IInspection>("Inspection", inspectionSchema);

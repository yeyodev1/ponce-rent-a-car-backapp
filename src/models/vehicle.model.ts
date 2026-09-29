import mongoose, { Schema, Types } from "mongoose";

/** Unidad física. Varias marcas/modelos pueden vivir bajo la misma categoría. */
export const VEHICLE_STATUSES = [
  "available",
  "prereserved",
  "reserved",
  "rented",
  "maintenance",
  "blocked",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export interface IVehicle {
  category: Types.ObjectId;
  brand: string;
  model: string;
  year: number;
  plate: string;
  color: string;
  transmission: "automatic" | "manual";
  images: string[];
  status: VehicleStatus;
  /** Dueño si la unidad es de un "Socio sobre Ruedas". Vacío = flota propia. */
  owner: string;
  notes: string;
  isActive: boolean;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, default: () => new Date().getFullYear() },
    plate: { type: String, required: true, unique: true, uppercase: true, trim: true },
    color: { type: String, default: "" },
    transmission: { type: String, enum: ["automatic", "manual"], default: "automatic" },
    images: { type: [String], default: [] },
    status: { type: String, enum: VEHICLE_STATUSES, default: "available", index: true },
    owner: { type: String, default: "" },
    notes: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Vehicle = mongoose.models.Vehicle || mongoose.model<IVehicle>("Vehicle", vehicleSchema);

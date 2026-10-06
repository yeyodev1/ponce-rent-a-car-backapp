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

export const FUEL_TYPES = ["gasoline", "diesel", "hybrid", "electric"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export interface IVehicle {
  /** URL pública de la unidad: /vehiculos/<categoria>/<slug>. Sin la placa. */
  slug: string;
  category: Types.ObjectId;
  brand: string;
  model: string;
  year: number;
  plate: string;
  color: string;
  transmission: "automatic" | "manual";
  fuel: FuelType;
  seats: number;
  /** Odómetro actual en km. */
  mileageKm: number;
  description: string;
  images: string[];
  status: VehicleStatus;
  /** Dueño si la unidad es de un "Socio sobre Ruedas". Vacío = flota propia. */
  owner: string;
  notes: string;
  isActive: boolean;
  lockVersion: number;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    slug: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true, index: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, default: () => new Date().getFullYear() },
    plate: { type: String, required: true, unique: true, uppercase: true, trim: true },
    color: { type: String, default: "" },
    transmission: { type: String, enum: ["automatic", "manual"], default: "automatic" },
    fuel: { type: String, enum: FUEL_TYPES, default: "gasoline" },
    seats: { type: Number, default: 5, min: 1 },
    mileageKm: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" },
    images: { type: [String], default: [] },
    status: { type: String, enum: VEHICLE_STATUSES, default: "available", index: true },
    owner: { type: String, default: "" },
    notes: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    // Se incrementa dentro de la transacción que asigna la unidad a una reserva:
    // dos reservas simultáneas de la misma unidad chocan aquí (WriteConflict) y
    // la segunda reintenta viendo a la primera. Es el candado a nivel de base.
    lockVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Vehicle = mongoose.models.Vehicle || mongoose.model<IVehicle>("Vehicle", vehicleSchema);

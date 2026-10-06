import mongoose, { Schema, Types } from "mongoose";

/**
 * Bitácora de la unidad: mantenimientos, reparaciones y notas. Junto con las
 * actas de entrega/devolución forma el historial del vehículo.
 */
export interface IVehicleLog {
  vehicle: Types.ObjectId;
  type: "maintenance" | "repair" | "damage" | "note" | "status_change";
  date: Date;
  mileageKm: number | null;
  cost: number; // centavos
  description: string;
  reservationCode: string;
  by: { id: string; name: string; email: string } | null;
}

const vehicleLogSchema = new Schema<IVehicleLog>(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    type: {
      type: String,
      enum: ["maintenance", "repair", "damage", "note", "status_change"],
      required: true,
    },
    date: { type: Date, default: () => new Date() },
    mileageKm: { type: Number, default: null },
    cost: { type: Number, default: 0, min: 0 },
    description: { type: String, default: "" },
    reservationCode: { type: String, default: "" },
    by: {
      type: new Schema({ id: String, name: String, email: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);

export const VehicleLog =
  mongoose.models.VehicleLog || mongoose.model<IVehicleLog>("VehicleLog", vehicleLogSchema);

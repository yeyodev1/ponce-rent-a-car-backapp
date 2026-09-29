import mongoose, { Schema, Types } from "mongoose";

/**
 * Licencias y cédulas/pasaportes. Se guardan en Mongo (binario) y NO en un CDN
 * público: son datos personales y solo el admin los puede descargar.
 * El frontend comprime la foto antes de subirla (~1 MB).
 */
export interface IDocument {
  reservation: Types.ObjectId;
  customer: Types.ObjectId;
  kind: "license" | "identity";
  contentType: string;
  size: number;
  data: Buffer;
}

const documentSchema = new Schema<IDocument>(
  {
    reservation: { type: Schema.Types.ObjectId, ref: "Reservation", required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    kind: { type: String, enum: ["license", "identity"], required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true },
);

documentSchema.index({ reservation: 1, kind: 1 }, { unique: true });

export const CustomerDocument =
  mongoose.models.CustomerDocument || mongoose.model<IDocument>("CustomerDocument", documentSchema);

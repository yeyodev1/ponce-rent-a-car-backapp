import mongoose, { Schema } from "mongoose";

/**
 * Imágenes públicas (fotos de unidades, hoteles, promociones) cuando Cloudinary
 * no está configurado. Se sirven desde /api/public/media/:id con caché larga.
 * Con Cloudinary activo, las subidas nuevas van allá y esto queda de respaldo.
 */
export interface IMedia {
  contentType: string;
  size: number;
  width: number;
  height: number;
  data: Buffer;
  uploadedBy: string;
}

const mediaSchema = new Schema<IMedia>(
  {
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    data: { type: Buffer, required: true, select: false },
    uploadedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Media = mongoose.models.Media || mongoose.model<IMedia>("Media", mediaSchema);

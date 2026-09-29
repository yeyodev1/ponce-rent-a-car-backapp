import mongoose, { Schema } from "mongoose";
import { I18nText, I18nTextSchema } from "./shared.schema";

/** Solo dos productos de cobertura: estándar (incluida) y preferencial (premium). */
export interface ICoverage {
  code: string;
  name: I18nText;
  description: I18nText;
  includes: I18nText[];
  excludes: I18nText[];
  pricePerDay: number;
  isDefault: boolean;
  isActive: boolean;
  order: number;
}

const coverageSchema = new Schema<ICoverage>(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: I18nTextSchema, default: () => ({}) },
    description: { type: I18nTextSchema, default: () => ({}) },
    includes: { type: [I18nTextSchema], default: [] },
    excludes: { type: [I18nTextSchema], default: [] },
    pricePerDay: { type: Number, default: 0, min: 0 },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Coverage = mongoose.models.Coverage || mongoose.model<ICoverage>("Coverage", coverageSchema);

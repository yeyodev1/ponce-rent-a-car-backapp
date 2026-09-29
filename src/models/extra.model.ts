import mongoose, { Schema } from "mongoose";
import { I18nText, I18nTextSchema } from "./shared.schema";

export interface IExtra {
  code: string;
  name: I18nText;
  description: I18nText;
  icon: string;
  price: number;
  pricing: "per_day" | "per_rental";
  maxQuantity: number;
  isActive: boolean;
  order: number;
}

const extraSchema = new Schema<IExtra>(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: I18nTextSchema, default: () => ({}) },
    description: { type: I18nTextSchema, default: () => ({}) },
    icon: { type: String, default: "fa-plus" },
    price: { type: Number, default: 0, min: 0 },
    pricing: { type: String, enum: ["per_day", "per_rental"], default: "per_day" },
    maxQuantity: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Extra = mongoose.models.Extra || mongoose.model<IExtra>("Extra", extraSchema);

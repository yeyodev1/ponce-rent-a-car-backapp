import mongoose, { Schema } from "mongoose";
import { I18nText, I18nTextSchema, SeoFields, SeoSchema } from "./shared.schema";

/** Lo que se vende es la categoría (necesidad), no la marca. */
export interface ICategory {
  slug: string;
  name: I18nText;
  tagline: I18nText;
  description: I18nText;
  passengers: number;
  luggage: number;
  transmission: "automatic" | "manual";
  airConditioning: boolean;
  pricePerDay: number;
  image: string;
  gallery: string[];
  exampleModels: string;
  features: I18nText[];
  order: number;
  isActive: boolean;
  seo: SeoFields;
}

const categorySchema = new Schema<ICategory>(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    name: { type: I18nTextSchema, default: () => ({}) },
    tagline: { type: I18nTextSchema, default: () => ({}) },
    description: { type: I18nTextSchema, default: () => ({}) },
    passengers: { type: Number, default: 5 },
    luggage: { type: Number, default: 2 },
    transmission: { type: String, enum: ["automatic", "manual"], default: "automatic" },
    airConditioning: { type: Boolean, default: true },
    pricePerDay: { type: Number, required: true, min: 0 },
    image: { type: String, default: "" },
    gallery: { type: [String], default: [] },
    exampleModels: { type: String, default: "" },
    features: { type: [I18nTextSchema], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    seo: { type: SeoSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export const Category = mongoose.models.Category || mongoose.model<ICategory>("Category", categorySchema);

import mongoose, { Schema } from "mongoose";
import { I18nText, I18nTextSchema, SeoFields, SeoSchema } from "./shared.schema";

/** Modelos de contenido administrable: promociones, hoteles, guías, FAQs y SEO. */

export interface IPromotion {
  slug: string;
  title: I18nText;
  body: I18nText;
  conditions: I18nText;
  badge: I18nText;
  ctaLabel: I18nText;
  ctaUrl: string;
  image: string;
  categorySlug: string;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  order: number;
}

const promotionSchema = new Schema<IPromotion>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: I18nTextSchema, default: () => ({}) },
    body: { type: I18nTextSchema, default: () => ({}) },
    conditions: { type: I18nTextSchema, default: () => ({}) },
    badge: { type: I18nTextSchema, default: () => ({}) },
    ctaLabel: { type: I18nTextSchema, default: () => ({}) },
    ctaUrl: { type: String, default: "" },
    image: { type: String, default: "" },
    categorySlug: { type: String, default: "" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Promotion = mongoose.models.Promotion || mongoose.model<IPromotion>("Promotion", promotionSchema);

export interface IHotel {
  slug: string;
  name: string;
  zone: string;
  description: I18nText;
  benefit: I18nText;
  promotion: I18nText;
  image: string;
  website: string;
  phone: string;
  isActive: boolean;
  order: number;
}

const hotelSchema = new Schema<IHotel>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    zone: { type: String, default: "" },
    description: { type: I18nTextSchema, default: () => ({}) },
    benefit: { type: I18nTextSchema, default: () => ({}) },
    promotion: { type: I18nTextSchema, default: () => ({}) },
    image: { type: String, default: "" },
    website: { type: String, default: "" },
    phone: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Hotel = mongoose.models.Hotel || mongoose.model<IHotel>("Hotel", hotelSchema);

export interface IGuide {
  slug: string;
  title: I18nText;
  excerpt: I18nText;
  cover: string;
  destination: string;
  distanceKm: number;
  driveTime: string;
  readingMinutes: number;
  sections: { heading: I18nText; body: I18nText }[];
  seo: SeoFields;
  isPublished: boolean;
  publishedAt: Date | null;
}

const guideSchema = new Schema<IGuide>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: I18nTextSchema, default: () => ({}) },
    excerpt: { type: I18nTextSchema, default: () => ({}) },
    cover: { type: String, default: "" },
    destination: { type: String, default: "" },
    distanceKm: { type: Number, default: 0 },
    driveTime: { type: String, default: "" },
    readingMinutes: { type: Number, default: 4 },
    sections: {
      type: [
        new Schema(
          {
            heading: { type: I18nTextSchema, default: () => ({}) },
            body: { type: I18nTextSchema, default: () => ({}) },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    seo: { type: SeoSchema, default: () => ({}) },
    isPublished: { type: Boolean, default: true },
    publishedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

export const Guide = mongoose.models.Guide || mongoose.model<IGuide>("Guide", guideSchema);

export const FAQ_TOPICS = [
  "guarantee",
  "mileage",
  "license",
  "age",
  "fuel",
  "coverage",
  "damage",
  "cancellation",
  "airport",
  "payments",
  "return",
  "driver",
] as const;

export interface IFaq {
  topic: (typeof FAQ_TOPICS)[number];
  question: I18nText;
  answer: I18nText;
  order: number;
  isActive: boolean;
}

const faqSchema = new Schema<IFaq>(
  {
    topic: { type: String, enum: FAQ_TOPICS, required: true, index: true },
    question: { type: I18nTextSchema, default: () => ({}) },
    answer: { type: I18nTextSchema, default: () => ({}) },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Faq = mongoose.models.Faq || mongoose.model<IFaq>("Faq", faqSchema);

export interface ISeoPage {
  key: string;
  title: I18nText;
  description: I18nText;
  h1: I18nText;
  intro: I18nText;
  canonical: string;
  ogImage: string;
}

const seoPageSchema = new Schema<ISeoPage>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: I18nTextSchema, default: () => ({}) },
    description: { type: I18nTextSchema, default: () => ({}) },
    h1: { type: I18nTextSchema, default: () => ({}) },
    intro: { type: I18nTextSchema, default: () => ({}) },
    canonical: { type: String, default: "" },
    ogImage: { type: String, default: "" },
  },
  { timestamps: true },
);

export const SeoPage = mongoose.models.SeoPage || mongoose.model<ISeoPage>("SeoPage", seoPageSchema);

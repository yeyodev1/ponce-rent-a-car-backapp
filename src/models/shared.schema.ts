import { Schema } from "mongoose";

/** Texto bilingüe. El frontend elige el idioma; el admin edita ambos. */
export interface I18nText {
  es: string;
  en: string;
}

export const i18nText = {
  es: { type: String, default: "" },
  en: { type: String, default: "" },
};

export const I18nTextSchema = new Schema<I18nText>(i18nText, { _id: false });

/** De dónde llegó un lead o una reserva: base para saber qué campaña vende. */
export interface Attribution {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  fbclid: string;
  gclid: string;
  referrer: string;
  landingPage: string;
}

export const AttributionSchema = new Schema<Attribution>(
  {
    utmSource: { type: String, default: "" },
    utmMedium: { type: String, default: "" },
    utmCampaign: { type: String, default: "" },
    utmContent: { type: String, default: "" },
    utmTerm: { type: String, default: "" },
    fbclid: { type: String, default: "" },
    gclid: { type: String, default: "" },
    referrer: { type: String, default: "" },
    landingPage: { type: String, default: "" },
  },
  { _id: false },
);

export interface SeoFields {
  title: I18nText;
  description: I18nText;
  ogImage: string;
}

export const SeoSchema = new Schema<SeoFields>(
  {
    title: { type: I18nTextSchema, default: () => ({}) },
    description: { type: I18nTextSchema, default: () => ({}) },
    ogImage: { type: String, default: "" },
  },
  { _id: false },
);

import mongoose, { Schema } from "mongoose";
import { I18nText, I18nTextSchema } from "./shared.schema";

/**
 * Configuración editable desde el admin. Documento único (key "main") para que
 * el dueño cambie reglas de reserva y datos del negocio sin tocar código.
 */
export const LOCATION_CODES = ["airport", "office", "hotel", "other"] as const;
export type LocationCode = (typeof LOCATION_CODES)[number];

export interface ILocationOption {
  code: LocationCode;
  label: I18nText;
  fee: number;
}

export interface ISetting {
  key: string;
  business: {
    name: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    mapsUrl: string;
    hours: I18nText;
    instagram: string;
    facebook: string;
    tiktok: string;
  };
  booking: {
    maxDaysAhead: number;
    minHoursNotice: number;
    holdMinutes: number;
    depositMode: "fixed" | "percent" | "none";
    depositValue: number;
    guaranteeAmount: number;
    mileage: { limitedKmPerDay: number; extraKmPrice: number; unlimitedPricePerDay: number };
    locations: ILocationOption[];
    /** Con true, el cliente debe aceptar el contrato en línea antes de pagar. */
    contractRequired: boolean;
  };
  integrations: { webhookUrl: string };
}

const LocationSchema = new Schema<ILocationOption>(
  {
    code: { type: String, enum: LOCATION_CODES, required: true },
    label: { type: I18nTextSchema, default: () => ({}) },
    fee: { type: Number, default: 0 },
  },
  { _id: false },
);

const settingSchema = new Schema<ISetting>(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    business: {
      name: { type: String, default: "Ponce's Rent a Car" },
      phone: { type: String, default: "+593998119853" },
      whatsapp: { type: String, default: "593998119853" },
      email: { type: String, default: "" },
      address: { type: String, default: "Guayaquil, Ecuador" },
      mapsUrl: { type: String, default: "" },
      hours: { type: I18nTextSchema, default: () => ({ es: "Todos los días, 7:00 a 21:00", en: "Every day, 7:00 am to 9:00 pm" }) },
      instagram: { type: String, default: "https://www.instagram.com/ponces.rent.car/" },
      facebook: { type: String, default: "https://www.facebook.com/profile.php?id=61582730782692" },
      tiktok: { type: String, default: "https://www.tiktok.com/@ponces_rentacar" },
    },
    booking: {
      maxDaysAhead: { type: Number, default: 5 },
      minHoursNotice: { type: Number, default: 3 },
      holdMinutes: { type: Number, default: 20 },
      depositMode: { type: String, enum: ["fixed", "percent", "none"], default: "fixed" },
      depositValue: { type: Number, default: 5000 },
      guaranteeAmount: { type: Number, default: 50000 },
      mileage: {
        limitedKmPerDay: { type: Number, default: 150 },
        extraKmPrice: { type: Number, default: 25 },
        unlimitedPricePerDay: { type: Number, default: 2500 },
      },
      locations: { type: [LocationSchema], default: () => [] },
      contractRequired: { type: Boolean, default: true },
    },
    integrations: {
      webhookUrl: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

export const Setting = mongoose.models.Setting || mongoose.model<ISetting>("Setting", settingSchema);

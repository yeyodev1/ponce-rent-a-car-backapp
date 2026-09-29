import mongoose, { Schema, Types } from "mongoose";
import { Attribution, AttributionSchema } from "./shared.schema";

/** Mini CRM: todo contacto comercial (web, WhatsApp, formularios) es un lead. */
export const LEAD_STATUSES = ["new", "contacted", "quoted", "reserved", "delivered", "closed", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "route_a",
  "whatsapp_ad",
  "whatsapp_direct",
  "corporate",
  "partner",
  "hotel",
  "contact",
  "renaissance",
  "booking_abandoned",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_DURATIONS = ["1", "2-3", "4-7", "8-15", "16-30", "30+"] as const;
export const LEAD_PASSENGERS = ["1-2", "3-5", "6+"] as const;
export const LEAD_CHANNELS = ["whatsapp", "call", "callback", "form"] as const;
export const LEAD_PRIORITIES = ["save", "comfort", "space", "specific", "none"] as const;

export interface ILeadNote {
  text: string;
  author: string;
  at: Date;
}

export interface ILead {
  code: string;
  status: LeadStatus;
  source: LeadSource;
  channel: (typeof LEAD_CHANNELS)[number] | "";
  language: "es" | "en";
  tags: string[];
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  company: string;
  vehicles: number;
  comments: string;
  startDate: string;
  startTime: string;
  duration: (typeof LEAD_DURATIONS)[number] | "";
  location: string;
  passengers: (typeof LEAD_PASSENGERS)[number] | "";
  priority: (typeof LEAD_PRIORITIES)[number] | "";
  specificVehicle: string;
  categorySlug: string;
  attribution: Attribution;
  needsHuman: boolean;
  flowCompletedAt: Date | null;
  whatsappOpenedAt: Date | null;
  notes: ILeadNote[];
  reservation: Types.ObjectId | null;
  customer: Types.ObjectId | null;
  assignedTo: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const leadSchema = new Schema<ILead>(
  {
    code: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: LEAD_STATUSES, default: "new", index: true },
    source: { type: String, enum: LEAD_SOURCES, default: "route_a", index: true },
    channel: { type: String, enum: [...LEAD_CHANNELS, ""], default: "" },
    language: { type: String, enum: ["es", "en"], default: "es" },
    tags: { type: [String], default: [] },
    name: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true, index: true },
    whatsapp: { type: String, default: "", trim: true, index: true },
    email: { type: String, default: "", trim: true, lowercase: true },
    company: { type: String, default: "" },
    vehicles: { type: Number, default: 0 },
    comments: { type: String, default: "" },
    startDate: { type: String, default: "" },
    startTime: { type: String, default: "" },
    duration: { type: String, enum: [...LEAD_DURATIONS, ""], default: "" },
    location: { type: String, default: "" },
    passengers: { type: String, enum: [...LEAD_PASSENGERS, ""], default: "" },
    priority: { type: String, enum: [...LEAD_PRIORITIES, ""], default: "" },
    specificVehicle: { type: String, default: "" },
    categorySlug: { type: String, default: "" },
    attribution: { type: AttributionSchema, default: () => ({}) },
    needsHuman: { type: Boolean, default: false },
    flowCompletedAt: { type: Date, default: null },
    whatsappOpenedAt: { type: Date, default: null },
    notes: {
      type: [
        new Schema<ILeadNote>(
          { text: String, author: String, at: { type: Date, default: Date.now } },
          { _id: false },
        ),
      ],
      default: [],
    },
    reservation: { type: Schema.Types.ObjectId, ref: "Reservation", default: null },
    customer: { type: Schema.Types.ObjectId, ref: "Customer", default: null },
    assignedTo: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Lead = mongoose.models.Lead || mongoose.model<ILead>("Lead", leadSchema);

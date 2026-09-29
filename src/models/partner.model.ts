import mongoose, { Schema } from "mongoose";

/** Socio sobre Ruedas: propietarios que ofrecen su vehículo. V1 = solicitud + revisión humana. */
export interface IPartnerApplication {
  code: string;
  name: string;
  whatsapp: string;
  city: string;
  vehicleType: string;
  brand: string;
  model: string;
  year: number;
  photos: string[];
  language: "es" | "en";
  status: "new" | "reviewing" | "approved" | "rejected";
  notes: string;
}

const partnerSchema = new Schema<IPartnerApplication>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    whatsapp: { type: String, required: true, trim: true },
    city: { type: String, default: "" },
    vehicleType: { type: String, default: "" },
    brand: { type: String, default: "" },
    model: { type: String, default: "" },
    year: { type: Number, default: 0 },
    photos: { type: [String], default: [] },
    language: { type: String, enum: ["es", "en"], default: "es" },
    status: { type: String, enum: ["new", "reviewing", "approved", "rejected"], default: "new" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const PartnerApplication =
  mongoose.models.PartnerApplication ||
  mongoose.model<IPartnerApplication>("PartnerApplication", partnerSchema);

/** Ponce's Renaissance: interesados en el club (opcional, nunca obligatorio para reservar). */
export interface IClubMember {
  name: string;
  email: string;
  phone: string;
  language: "es" | "en";
  level: "explorer" | "traveler" | "renaissance";
  rentals: number;
}

const clubMemberSchema = new Schema<IClubMember>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    language: { type: String, enum: ["es", "en"], default: "es" },
    level: { type: String, enum: ["explorer", "traveler", "renaissance"], default: "explorer" },
    rentals: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const ClubMember = mongoose.models.ClubMember || mongoose.model<IClubMember>("ClubMember", clubMemberSchema);

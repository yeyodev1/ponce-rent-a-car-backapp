import mongoose, { Schema } from "mongoose";

/**
 * Cliente = conductor. La web ya no pide el número de documento al reservar
 * (el personal lo completa al revisar las fotos): el cliente se identifica por
 * documento cuando lo hay y, si no, por correo. Así el que vuelve no se
 * duplica y a futuro (Ponce's Renaissance) conserva sus documentos validados.
 */
export interface ICustomer {
  name: string;
  documentType: "cedula" | "passport";
  documentNumber: string;
  email: string;
  phone: string;
  country: string;
  birthDate: string;
  /** Licencia de conducir: debe estar vigente hasta la devolución del vehículo. */
  licenseNumber: string;
  licenseExpiresAt: string;
  licenseCountry: string;
  language: "es" | "en";
  verification: "pending" | "verified" | "needs_info" | "rejected";
  isClubMember: boolean;
  totalRentals: number;
  notes: string;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    documentType: { type: String, enum: ["cedula", "passport"], default: "cedula" },
    documentNumber: { type: String, default: "", trim: true, uppercase: true },
    email: { type: String, default: "", trim: true, lowercase: true, index: true },
    phone: { type: String, default: "", trim: true },
    country: { type: String, default: "EC" },
    birthDate: { type: String, default: "" },
    licenseNumber: { type: String, default: "", trim: true, uppercase: true },
    licenseExpiresAt: { type: String, default: "" }, // YYYY-MM-DD
    licenseCountry: { type: String, default: "" },
    language: { type: String, enum: ["es", "en"], default: "es" },
    verification: {
      type: String,
      enum: ["pending", "verified", "needs_info", "rejected"],
      default: "pending",
    },
    isClubMember: { type: Boolean, default: false },
    totalRentals: { type: Number, default: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

// Único solo cuando hay documento: los clientes sin cédula todavía no deben chocar entre sí.
customerSchema.index(
  { documentType: 1, documentNumber: 1 },
  { unique: true, partialFilterExpression: { documentNumber: { $type: "string", $gt: "" } } },
);

export const Customer = mongoose.models.Customer || mongoose.model<ICustomer>("Customer", customerSchema);

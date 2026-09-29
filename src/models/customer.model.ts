import mongoose, { Schema } from "mongoose";

/**
 * Cliente = conductor. Se identifica por documento: así el mismo cliente que
 * vuelve no se duplica y a futuro (Ponce's Renaissance) conserva sus documentos
 * ya validados.
 */
export interface ICustomer {
  name: string;
  documentType: "cedula" | "passport";
  documentNumber: string;
  email: string;
  phone: string;
  country: string;
  birthDate: string;
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
    documentNumber: { type: String, required: true, trim: true, uppercase: true },
    email: { type: String, default: "", trim: true, lowercase: true, index: true },
    phone: { type: String, default: "", trim: true },
    country: { type: String, default: "EC" },
    birthDate: { type: String, default: "" },
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

customerSchema.index({ documentType: 1, documentNumber: 1 }, { unique: true });

export const Customer = mongoose.models.Customer || mongoose.model<ICustomer>("Customer", customerSchema);

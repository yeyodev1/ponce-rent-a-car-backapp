import mongoose, { Schema } from "mongoose";

/** Registro de accesos y cambios del panel (quién, qué, cuándo, desde dónde). */
export interface IAuditLog {
  actor: { id: string; name: string; email: string; role: string } | null;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  ip: string;
  userAgent: string;
  success: boolean;
  at: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actor: {
    type: new Schema({ id: String, name: String, email: String, role: String }, { _id: false }),
    default: null,
  },
  action: { type: String, required: true, index: true },
  entity: { type: String, default: "", index: true },
  entityId: { type: String, default: "" },
  summary: { type: String, default: "" },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  success: { type: Boolean, default: true },
  at: { type: Date, default: () => new Date(), index: true },
});

// Se conserva un año: suficiente para auditoría sin crecer sin límite en el M0.
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: 365 * 24 * 3600 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", auditLogSchema);

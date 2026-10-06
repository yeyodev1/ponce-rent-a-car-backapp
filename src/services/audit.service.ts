import { Request } from "express";
import { AuditLog } from "../models/auditLog.model";

export interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuditEntry {
  action: string; // p. ej. "login", "login_failed", "reservation.status", "payment.void", "inspection.delivery"
  entity?: string; // "reservation", "payment", "vehicle", "staff", "contract"...
  entityId?: string;
  summary?: string; // texto legible en español: "Confirmó la reserva PON-1020"
  success?: boolean;
  actor?: AuditActor | null;
}

function clientIp(req?: Request): string {
  if (!req) return "";
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || req.ip || "";
}

/**
 * Registra una acción en la bitácora. Nunca lanza: un fallo de auditoría no
 * puede romper la operación que se está registrando.
 */
export async function logAudit(entry: AuditEntry, req?: Request): Promise<void> {
  try {
    await AuditLog.create({
      actor: entry.actor ?? null,
      action: entry.action,
      entity: entry.entity ?? "",
      entityId: entry.entityId ?? "",
      summary: entry.summary ?? "",
      success: entry.success ?? true,
      ip: clientIp(req),
      userAgent: String(req?.headers["user-agent"] || "").slice(0, 300),
      at: new Date(),
    });
  } catch (error) {
    console.error("[audit] no se pudo registrar:", (error as Error).message);
  }
}

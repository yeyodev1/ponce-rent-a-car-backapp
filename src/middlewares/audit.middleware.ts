import { Request, Response, NextFunction } from "express";
import { isValidObjectId } from "mongoose";
import { AuthRequest } from "../types/AuthRequest";
import { logAudit } from "../services/audit.service";
import { Category } from "../models/category.model";
import { Customer } from "../models/customer.model";
import { Lead } from "../models/lead.model";
import { Payment } from "../models/payment.model";
import { Reservation } from "../models/reservation.model";
import { User } from "../models/user.model";
import { Vehicle } from "../models/vehicle.model";
import { waitUntil } from "@vercel/functions";

/**
 * Registra en la bitácora cada mutación del panel (POST/PUT/PATCH/DELETE bajo
 * /admin) al terminar la respuesta, más los accesos sensibles que son GET:
 * exportaciones CSV, documentos del conductor y PDF del contrato.
 *
 * Del cuerpo de la petición solo se leen campos inocuos (estado, monto, tipo)
 * para armar el resumen: nunca se guarda el cuerpo, así que contraseñas, tokens
 * o documentos no llegan a la bitácora.
 *
 * Si un controlador ya registró su acción con logAudit, pone
 * `res.locals.auditLogged = true` y aquí no se duplica.
 */

const RES_STATUS: Record<string, string> = {
  pending_documents: "Pendiente de documentos",
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmada",
  delivered: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  expired: "Vencida",
};
const VERIFICATION: Record<string, string> = {
  pending: "Pendiente",
  verified: "Verificado",
  needs_info: "Falta información",
  rejected: "Rechazado",
};
const LEAD_STATUS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  quoted: "Cotizado",
  reserved: "Reservado",
  delivered: "Entregado",
  closed: "Cerrado",
  lost: "Perdido",
};
const VEHICLE_STATUS: Record<string, string> = {
  available: "Disponible",
  prereserved: "Pre-reservada",
  reserved: "Reservada",
  rented: "Alquilada",
  maintenance: "En mantenimiento",
  blocked: "Bloqueada",
};
const PARTNER_STATUS: Record<string, string> = {
  new: "Nuevo",
  reviewing: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};
const METHOD: Record<string, string> = { cash: "efectivo", transfer: "transferencia", card: "tarjeta", datafast: "Datafast" };
const EXPORTS: Record<string, string> = { leads: "leads", customers: "clientes", reservations: "reservas", payments: "pagos" };
const CONTENT: Record<string, string> = {
  promotions: "la promoción",
  hotels: "el hotel",
  guides: "la guía",
  faqs: "la pregunta frecuente",
};
const DOC_KIND: Record<string, string> = { license: "la licencia", identity: "el documento de identidad" };
const LOG_TYPE: Record<string, string> = {
  maintenance: "un mantenimiento",
  repair: "una reparación",
  damage: "un daño",
  note: "una nota",
  status_change: "un cambio de estado",
};

interface Described {
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
}

const money = (cents: unknown) =>
  typeof cents === "number" ? `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "";
const str = (v: unknown, max = 80) => String(v ?? "").slice(0, max);

async function find<T>(model: any, id: string, fields: string): Promise<T | null> {
  if (!isValidObjectId(id)) return null;
  try {
    return await model.findById(id).select(fields).lean();
  } catch {
    return null;
  }
}

const reservationCode = async (id: string) =>
  (await find<{ code: string }>(Reservation, id, "code"))?.code ?? id;
const leadCode = async (id: string) => {
  const l = await find<{ code: string; name?: string }>(Lead, id, "code name");
  return l ? [l.code, l.name].filter(Boolean).join(" · ") : id;
};
const vehicleName = async (id: string) => {
  const v = await find<{ brand: string; model: string; plate: string }>(Vehicle, id, "brand model plate");
  return v ? `${v.brand} ${v.model} (${v.plate})` : id;
};
const staffName = async (id: string) => {
  const u = await find<{ name: string; email: string }>(User, id, "name email");
  return u ? u.name || u.email : id;
};
const customerName = async (id: string) => (await find<{ name: string }>(Customer, id, "name"))?.name ?? id;
const categoryName = async (id: string) => {
  const c = await find<{ name?: { es?: string }; slug: string }>(Category, id, "name slug");
  return c ? c.name?.es || c.slug : id;
};
const paymentInfo = async (id: string) => {
  const p = await find<{ reservationCode: string; amount: number }>(Payment, id, "reservationCode amount");
  return p ? `de ${money(p.amount)} de la reserva ${p.reservationCode}` : id;
};

/** Nombre legible de lo que se va a borrar: después del DELETE ya no se puede buscar. */
async function labelBeforeDelete(seg: string[]): Promise<string> {
  const [root, id] = seg;
  if (!id) return "";
  if (root === "vehicles" && seg[2] !== "logs") return vehicleName(id);
  if (root === "leads") return leadCode(id);
  if (root === "staff") return staffName(id);
  if (root === "categories") return categoryName(id);
  return "";
}

/** Traduce método + ruta (+ campos inocuos del cuerpo) a una acción y un resumen en español. */
async function describe(method: string, seg: string[], body: any, out: any, pre: string): Promise<Described> {
  const [root, id, sub, subId] = seg;
  const b = body && typeof body === "object" ? body : {};
  const fallback: Described = {
    action: `${root || "admin"}.${method.toLowerCase()}`,
    entity: root || "",
    entityId: id && isValidObjectId(id) ? id : undefined,
    summary: `${method} /admin/${seg.map((s) => (isValidObjectId(s) ? ":id" : s)).join("/")}`,
  };

  if (method === "GET") {
    if (root === "export") {
      const entity = str(id).replace(/\.csv$/, "");
      return { action: "export.csv", entity: "export", entityId: entity, summary: `Exportó el CSV de ${EXPORTS[entity] ?? entity}` };
    }
    if (root === "audit" && id === "export.csv") {
      return { action: "audit.export", entity: "audit", summary: "Exportó el registro de accesos (CSV)" };
    }
    if (root === "reservations" && sub === "documents") {
      const code = await reservationCode(id);
      return { action: "document.view", entity: "reservation", entityId: id, summary: `Abrió ${DOC_KIND[subId] ?? "un documento"} de la reserva ${code}` };
    }
    if (root === "reservations" && sub === "contract.pdf") {
      const code = await reservationCode(id);
      return { action: "contract.pdf", entity: "contract", entityId: id, summary: `Descargó el contrato de la reserva ${code}` };
    }
    return fallback;
  }

  switch (root) {
    case "reservations": {
      if (!id) {
        const code = out?.code ? ` ${out.code}` : "";
        return { action: "reservation.create", entity: "reservation", entityId: out?._id, summary: `Creó la reserva presencial${code}` };
      }
      const code = await reservationCode(id);
      if (!sub && method === "PATCH") {
        if (b.status !== undefined)
          return { action: "reservation.status", entity: "reservation", entityId: id, summary: `Cambió el estado de la reserva ${code} a ${RES_STATUS[b.status] ?? str(b.status)}` };
        if (b.vehicleId !== undefined) {
          const unit = b.vehicleId ? await vehicleName(String(b.vehicleId)) : "";
          return { action: "reservation.vehicle", entity: "reservation", entityId: id, summary: unit ? `Asignó la unidad ${unit} a la reserva ${code}` : `Quitó la unidad de la reserva ${code}` };
        }
        if (b.verification !== undefined)
          return { action: "reservation.verification", entity: "reservation", entityId: id, summary: `Marcó la verificación de la reserva ${code} como ${VERIFICATION[b.verification] ?? str(b.verification)}` };
        return { action: "reservation.update", entity: "reservation", entityId: id, summary: `Editó las notas de la reserva ${code}` };
      }
      if (sub === "payments")
        return { action: "payment.create", entity: "payment", entityId: out?._id ?? id, summary: `Registró un pago de ${money(b.amount)} en ${METHOD[b.method] ?? str(b.method)} en la reserva ${code}` };
      if (sub === "inspections") {
        const type = subId || b.type;
        const what = type === "return" ? "devolución" : "entrega";
        return method === "PUT"
          ? { action: `inspection.${type}.update`, entity: "inspection", entityId: id, summary: `Corrigió el acta de ${what} de la reserva ${code}` }
          : { action: `inspection.${type}`, entity: "inspection", entityId: id, summary: `Registró el acta de ${what} de la reserva ${code}` };
      }
      if (sub === "guarantee") {
        const verbs: Record<string, string> = {
          hold: `Registró la garantía de ${money(b.amount) || "la reserva"} (${METHOD[b.method] ?? "retenida"})`,
          release: "Liberó la garantía",
          charge: `Cobró ${money(b.chargedAmount)} de la garantía`,
        };
        return { action: `guarantee.${str(b.action, 20)}`, entity: "reservation", entityId: id, summary: `${verbs[b.action] ?? "Actualizó la garantía"} de la reserva ${code}` };
      }
      return { ...fallback, summary: `${fallback.summary} (reserva ${code})` };
    }
    case "payments": {
      const info = await paymentInfo(id);
      if (sub === "refund") return { action: "payment.refund", entity: "payment", entityId: id, summary: `Reembolsó el pago ${info}` };
      if (sub === "void") return { action: "payment.void", entity: "payment", entityId: id, summary: `Anuló el pago ${info}` };
      return fallback;
    }
    case "customers":
      return { action: "customer.update", entity: "customer", entityId: id, summary: `Editó los datos del cliente ${await customerName(id)}` };
    case "leads": {
      if (method === "DELETE") return { action: "lead.delete", entity: "lead", entityId: id, summary: `Eliminó el lead ${pre || id}` };
      const lead = await leadCode(id);
      if (sub === "notes") return { action: "lead.note", entity: "lead", entityId: id, summary: `Agregó una nota al lead ${lead}` };
      if (b.status !== undefined)
        return { action: "lead.status", entity: "lead", entityId: id, summary: `Cambió el estado del lead ${lead} a ${LEAD_STATUS[b.status] ?? str(b.status)}` };
      return { action: "lead.update", entity: "lead", entityId: id, summary: `Editó el lead ${lead}` };
    }
    case "vehicles": {
      if (sub === "logs") {
        const unit = await vehicleName(id);
        return method === "DELETE"
          ? { action: "vehicle.log.delete", entity: "vehicle", entityId: id, summary: `Eliminó un registro del historial de ${unit}` }
          : { action: "vehicle.log", entity: "vehicle", entityId: id, summary: `Registró ${LOG_TYPE[b.type] ?? "un evento"} en el historial de ${unit}` };
      }
      if (method === "DELETE") return { action: "vehicle.delete", entity: "vehicle", entityId: id, summary: `Eliminó la unidad ${pre || id}` };
      if (!id) {
        const name = [b.brand, b.model, b.plate ? `(${String(b.plate).toUpperCase()})` : ""].filter(Boolean).join(" ");
        return { action: "vehicle.create", entity: "vehicle", entityId: out?._id, summary: `Creó la unidad ${str(name, 120)}` };
      }
      const unit = await vehicleName(id);
      if (sub === "status")
        return { action: "vehicle.status", entity: "vehicle", entityId: id, summary: `Cambió el estado de ${unit} a ${VEHICLE_STATUS[b.status] ?? str(b.status)}` };
      return { action: "vehicle.update", entity: "vehicle", entityId: id, summary: `Editó la unidad ${unit}` };
    }
    case "categories": {
      if (method === "DELETE") return { action: "category.delete", entity: "category", entityId: id, summary: `Eliminó la categoría ${pre || id}` };
      if (!id) return { action: "category.create", entity: "category", entityId: out?._id, summary: `Creó la categoría ${str(b?.name?.es || b.slug)}` };
      return { action: "category.update", entity: "category", entityId: id, summary: `Editó la categoría ${await categoryName(id)}` };
    }
    case "coverages":
    case "extras": {
      const what = root === "coverages" ? "la cobertura" : "el extra";
      const entity = root === "coverages" ? "coverage" : "extra";
      const verb = method === "DELETE" ? "Eliminó" : id ? "Editó" : "Creó";
      const name = str(b?.name?.es || b.code || out?.code || "");
      return { action: `${entity}.${method === "DELETE" ? "delete" : id ? "update" : "create"}`, entity, entityId: id || out?._id, summary: `${verb} ${what}${name ? ` ${name}` : ""}` };
    }
    case "settings": {
      const parts = [b.business && "datos del negocio", b.booking && "reglas de reserva", b.integrations && "integraciones"].filter(Boolean);
      const extra = typeof b?.booking?.contractRequired === "boolean" ? ` (contrato obligatorio: ${b.booking.contractRequired ? "sí" : "no"})` : "";
      return { action: "settings.update", entity: "settings", summary: `Cambió la configuración${parts.length ? `: ${parts.join(", ")}` : ""}${extra}` };
    }
    case "staff": {
      if (method === "DELETE") return { action: "staff.delete", entity: "staff", entityId: id, summary: `Eliminó la cuenta de ${pre || id}` };
      if (!id) return { action: "staff.create", entity: "staff", entityId: out?.id ?? out?._id, summary: `Creó la cuenta de ${str(b.name || b.email)} (${b.accountType === "admin" ? "administrador" : "empleado"})` };
      const who = await staffName(id);
      if (sub === "active") return { action: "staff.active", entity: "staff", entityId: id, summary: `${b.isActive ? "Activó" : "Desactivó"} la cuenta de ${who}` };
      // La contraseña nunca se registra: solo que se cambió.
      const pwd = b.password ? " (incluye cambio de contraseña)" : "";
      return { action: "staff.update", entity: "staff", entityId: id, summary: `Editó la cuenta de ${who}${pwd}` };
    }
    case "uploads":
      return { action: "media.upload", entity: "media", summary: "Subió una imagen" };
    case "seo":
      return { action: "seo.update", entity: "content", entityId: id, summary: `Editó el SEO de la página ${str(id)}` };
    case "partners":
      return { action: "partner.status", entity: "partner", entityId: id, summary: `Cambió el estado de un Socio sobre Ruedas a ${PARTNER_STATUS[b.status] ?? str(b.status)}` };
    case "contract-templates":
      return { action: "contract.template", entity: "contract", entityId: out?._id, summary: `Publicó la versión ${out?.version ?? ""} de la plantilla del contrato`.replace("  ", " ") };
    default:
      if (CONTENT[root]) {
        const verb = method === "DELETE" ? "Eliminó" : id ? "Editó" : "Creó";
        const title = str(b?.title?.es || b?.name || b?.question?.es || "", 80);
        return { action: `content.${method === "DELETE" ? "delete" : id ? "update" : "create"}`, entity: "content", entityId: id || out?._id, summary: `${verb} ${CONTENT[root]}${title ? ` "${title}"` : ""}` };
      }
      return fallback;
  }
}

function shouldLog(method: string, seg: string[]): boolean {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    // La vista previa del contrato es un POST que no cambia nada.
    return !(seg[0] === "contract-templates" && seg[1] === "preview");
  }
  if (method !== "GET") return false;
  if (seg[0] === "export") return true;
  if (seg[0] === "audit" && seg[1] === "export.csv") return true;
  if (seg[0] === "reservations" && (seg[2] === "documents" || seg[2] === "contract.pdf")) return true;
  return false;
}

export function auditMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const path = req.originalUrl.split("?")[0].replace(/^\/api\/admin\/?/, "");
  const seg = path.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const method = req.method.toUpperCase();
  if (!shouldLog(method, seg)) return next();

  // Del JSON de respuesta solo se rescatan identificadores para el resumen.
  let out: any = null;
  const json = res.json.bind(res);
  res.json = ((payload: any) => {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      out = { _id: payload._id ? String(payload._id) : undefined, id: payload.id, code: payload.code, version: payload.version };
    }
    return json(payload);
  }) as typeof res.json;

  // IP y navegador se copian ya: al terminar la respuesta el socket puede estar cerrado
  // y req.ip quedaría vacío para cuando corren las búsquedas del resumen.
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const origin = {
    ip: forwarded || req.ip || req.socket?.remoteAddress || "",
    headers: { "user-agent": String(req.headers["user-agent"] || "") },
  } as unknown as Request;

  const prePromise = method === "DELETE" ? labelBeforeDelete(seg).catch(() => "") : Promise.resolve("");

  res.on("finish", () => {
    if (res.locals.auditLogged) return;
    const user = req.user;
    // En Vercel la función puede congelarse al enviar la respuesta: waitUntil la
    // mantiene viva hasta que se guarde el registro (fuera de Vercel no hace nada).
    waitUntil((async () => {
      try {
        const pre = await prePromise;
        const d = await describe(method, seg, req.body, out, pre);
        await logAudit(
          {
            ...d,
            entityId: d.entityId ? String(d.entityId) : "",
            success: res.statusCode < 400,
            summary: res.statusCode < 400 ? d.summary : `${d.summary} (falló: ${res.statusCode})`,
            actor: user
              ? { id: user.userId, name: user.name ?? "", email: user.email, role: user.accountType }
              : null,
          },
          origin,
        );
      } catch (error) {
        console.error("[audit] no se pudo describir la acción:", (error as Error).message);
      }
    })());
  });
  next();
}

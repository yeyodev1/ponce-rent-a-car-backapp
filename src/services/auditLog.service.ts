import { AuditLog } from "../models/auditLog.model";
import { paged, pageParams, searchRegex } from "./catalog.service";
import { formatLocal, parseDateInput } from "./pricing.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filtros comunes del listado y del CSV: persona, acción, entidad, fechas y texto libre. */
function buildFilter(query: any): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const actor = String(query?.actor ?? "").trim();
  if (actor) filter["actor.id"] = actor;
  const action = String(query?.action ?? "").trim();
  if (action) {
    // "reservation" agrupa todas las acciones reservation.* ; "login_failed" es exacta.
    filter.action = action.includes(".") || action.startsWith("login") || action === "logout" ? action : new RegExp(`^${action}(\\.|$)`);
  }
  const entity = String(query?.entity ?? "").trim();
  if (entity) filter.entity = entity;
  const at: Record<string, Date> = {};
  const from = query?.from ? parseDateInput(String(query.from)) : null;
  const to = query?.to ? parseDateInput(String(query.to)) : null;
  if (from) at.$gte = from;
  // Un "hasta" con solo fecha incluye el día completo en Guayaquil.
  if (to) at.$lt = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to)) ? new Date(to.getTime() + DAY_MS) : to;
  if (Object.keys(at).length) filter.at = at;
  const rx = searchRegex(query?.q);
  if (rx) filter.$or = [{ summary: rx }, { "actor.name": rx }, { "actor.email": rx }, { ip: rx }, { entityId: rx }];
  if (query?.success === "false") filter.success = false;
  return filter;
}

export async function listAudit(query: any) {
  const { page, limit, skip } = pageParams(query, 30);
  const filter = buildFilter(query);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return paged(items, total, page, limit);
}

/** Personas que aparecen en la bitácora, para el filtro del panel. */
export async function listActors() {
  const rows = await AuditLog.aggregate([
    { $match: { "actor.id": { $nin: [null, ""] } } },
    { $sort: { at: -1 } },
    { $group: { _id: "$actor.id", name: { $first: "$actor.name" }, email: { $first: "$actor.email" } } },
    { $sort: { name: 1 } },
  ]);
  return rows.map((r) => ({ id: r._id, name: r.name || r.email, email: r.email }));
}

function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Neutraliza fórmulas: un resumen que empiece con "=" se ejecutaría en Excel.
  if (/^[=@+\-\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportAuditCsv(query: any): Promise<{ filename: string; csv: string }> {
  const rows = await AuditLog.find(buildFilter(query)).sort({ at: -1 }).limit(20000).lean<any[]>();
  const header = ["Fecha (Guayaquil)", "Persona", "Correo", "Rol", "Acción", "Entidad", "Id", "Resumen", "Resultado", "IP", "Navegador"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatLocal(r.at),
        r.actor?.name ?? "",
        r.actor?.email ?? "",
        r.actor?.role ?? "",
        r.action,
        r.entity,
        r.entityId,
        r.summary,
        r.success ? "Correcto" : "Fallido",
        r.ip,
        r.userAgent,
      ]
        .map(cell)
        .join(","),
    );
  }
  const filename = `ponces-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM: Excel abre el UTF-8 sin él como Latin-1 y rompe las tildes.
  return { filename, csv: `﻿${lines.join("\r\n")}\r\n` };
}

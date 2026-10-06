import { CustomError } from "../errors/customError.error";
import { Customer } from "../models/customer.model";
import { Lead } from "../models/lead.model";
import { Payment } from "../models/payment.model";
import { Reservation } from "../models/reservation.model";
import { formatLocal } from "./pricing.service";

export const EXPORT_ENTITIES = ["leads", "customers", "reservations", "payments"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

type Column<T> = [header: string, value: (row: T) => unknown];

const LABELS: Record<string, string> = {
  // Reservas
  pending_documents: "Pendiente de documentos",
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmada",
  delivered: "Entregada",
  completed: "Finalizada",
  cancelled: "Cancelada",
  expired: "Expirada",
  // Verificación
  pending: "Pendiente",
  verified: "Verificado",
  needs_info: "Falta información",
  rejected: "Rechazado",
  // Leads
  new: "Nuevo",
  contacted: "Contactado",
  quoted: "Cotizado",
  reserved: "Reservado",
  closed: "Cerrado",
  lost: "Perdido",
  // Pagos
  approved: "Aprobado",
  canceled: "Cancelado",
  error: "Error",
  deposit: "Depósito",
  full: "Total",
  balance: "Saldo",
  manual: "Manual",
  refunded: "Reembolsado",
  voided: "Anulado",
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  partial: "Parcial",
  paid: "Pagado",
  web: "Web",
  walk_in: "Presencial",
  // Otros
  limited: "Limitado",
  unlimited: "Ilimitado",
  cedula: "Cédula",
  passport: "Pasaporte",
};

const label = (value: unknown) => LABELS[String(value ?? "")] ?? String(value ?? "");
const usd = (cents: unknown) => (typeof cents === "number" ? (cents / 100).toFixed(2) : "");
const yesNo = (v: unknown) => (v ? "Sí" : "No");

/**
 * Escapa una celda CSV. Además neutraliza fórmulas (=, @, +x, -x): un nombre
 * como "=HYPERLINK(...)" se ejecutaría al abrir el archivo en Excel.
 * Un teléfono "+593..." se deja tal cual porque es solo dígitos.
 */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=@\t\r]/.test(text) || /^[+-](?![\d\s]*$)/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map(([h]) => cell(h)).join(",")];
  for (const row of rows) lines.push(columns.map(([, fn]) => cell(fn(row))).join(","));
  // BOM: sin él, Excel abre el UTF-8 como Latin-1 y rompe tildes y eñes.
  return `﻿${lines.join("\r\n")}\r\n`;
}

async function leadsCsv(): Promise<string> {
  const rows = await Lead.find().sort({ createdAt: -1 }).lean<any[]>();
  return toCsv(rows, [
    ["Código", (r) => r.code],
    ["Fecha", (r) => formatLocal(r.createdAt)],
    ["Estado", (r) => label(r.status)],
    ["Origen", (r) => r.source],
    ["Canal", (r) => r.channel],
    ["Idioma", (r) => r.language],
    ["Nombre", (r) => r.name],
    ["Teléfono", (r) => r.phone],
    ["WhatsApp", (r) => r.whatsapp],
    ["Correo", (r) => r.email],
    ["Empresa", (r) => r.company],
    ["Fecha de inicio", (r) => r.startDate],
    ["Hora", (r) => r.startTime],
    ["Duración (días)", (r) => r.duration],
    ["Ubicación", (r) => r.location],
    ["Pasajeros", (r) => r.passengers],
    ["Categoría", (r) => r.categorySlug],
    ["Prioridad", (r) => r.priority],
    ["Etiquetas", (r) => (r.tags ?? []).join(" | ")],
    ["Comentarios", (r) => r.comments],
    ["Asignado a", (r) => r.assignedTo],
    ["UTM source", (r) => r.attribution?.utmSource],
    ["UTM medium", (r) => r.attribution?.utmMedium],
    ["UTM campaign", (r) => r.attribution?.utmCampaign],
  ]);
}

async function customersCsv(): Promise<string> {
  const rows = await Customer.find().sort({ createdAt: -1 }).lean<any[]>();
  return toCsv(rows, [
    ["Nombre", (r) => r.name],
    ["Tipo de documento", (r) => label(r.documentType)],
    ["Número de documento", (r) => r.documentNumber],
    ["Correo", (r) => r.email],
    ["Teléfono", (r) => r.phone],
    ["País", (r) => r.country],
    ["Fecha de nacimiento", (r) => r.birthDate],
    ["Número de licencia", (r) => r.licenseNumber],
    ["Licencia vence", (r) => r.licenseExpiresAt],
    ["País de la licencia", (r) => r.licenseCountry],
    ["Idioma", (r) => r.language],
    ["Verificación", (r) => label(r.verification)],
    ["Alquileres", (r) => r.totalRentals],
    ["Miembro del club", (r) => yesNo(r.isClubMember)],
    ["Registrado", (r) => formatLocal(r.createdAt)],
  ]);
}

async function reservationsCsv(): Promise<string> {
  const rows = await Reservation.find()
    .populate("customer", "name documentType documentNumber email phone")
    .populate("vehicle", "plate brand model")
    .sort({ createdAt: -1 })
    .lean<any[]>();
  return toCsv(rows, [
    ["Código", (r) => r.code],
    ["Creada", (r) => formatLocal(r.createdAt)],
    ["Estado", (r) => label(r.status)],
    ["Verificación", (r) => label(r.verification)],
    ["Cliente", (r) => r.customer?.name],
    ["Documento", (r) => r.customer?.documentNumber],
    ["Correo", (r) => r.customer?.email],
    ["Teléfono", (r) => r.customer?.phone],
    ["Categoría", (r) => r.categoryName?.es || r.categorySlug],
    [
      "Unidad",
      (r) => (r.vehicle ? `${r.vehicle.plate} (${r.vehicle.brand} ${r.vehicle.model})` : ""),
    ],
    ["Retiro", (r) => formatLocal(r.pickupAt)],
    ["Devolución", (r) => formatLocal(r.returnAt)],
    ["Lugar de retiro", (r) => r.pickupLocation],
    ["Lugar de devolución", (r) => r.returnLocation],
    ["Kilometraje", (r) => label(r.mileage)],
    ["Cobertura", (r) => r.coverage],
    ["Extras", (r) => (r.extras ?? []).map((e: any) => `${e.code} x${e.quantity}`).join(" | ")],
    ["Días", (r) => r.pricing?.days],
    ["Total (USD)", (r) => usd(r.pricing?.total)],
    ["Depósito (USD)", (r) => usd(r.pricing?.deposit)],
    ["Pagado (USD)", (r) => usd(r.amountPaid)],
    ["Saldo (USD)", (r) => usd(r.balance)],
    ["Modo de pago", (r) => label(r.paymentMode)],
    ["Estado de pago", (r) => label(r.paymentStatus)],
    ["Canal", (r) => label(r.channel)],
    ["Creada por", (r) => r.createdBy?.name || r.createdBy?.email || ""],
    ["Idioma", (r) => r.language],
    ["UTM source", (r) => r.attribution?.utmSource],
    ["UTM campaign", (r) => r.attribution?.utmCampaign],
  ]);
}

async function paymentsCsv(): Promise<string> {
  const rows = await Payment.find()
    .select("-providerResponse")
    .sort({ createdAt: -1 })
    .lean<any[]>();
  return toCsv(rows, [
    ["Fecha", (r) => formatLocal(r.createdAt)],
    ["Reserva", (r) => r.reservationCode],
    ["Proveedor", (r) => r.provider],
    ["Tipo", (r) => label(r.mode)],
    ["Método", (r) => label(r.method)],
    ["Monto (USD)", (r) => usd(r.amount)],
    ["Estado", (r) => label(r.status)],
    ["Aprobado el", (r) => formatLocal(r.approvedAt)],
    ["Reembolsado el", (r) => formatLocal(r.refundedAt)],
    ["Anulado el", (r) => formatLocal(r.voidedAt)],
    ["Motivo de anulación", (r) => r.voidReason],
    ["Anulado por", (r) => (r.voidedBy ? r.voidedBy.name || r.voidedBy.email : "")],
    ["Registrado por", (r) => (r.registeredBy ? r.registeredBy.name || r.registeredBy.email : "")],
    ["Nota", (r) => r.note],
    ["ID transacción Payphone", (r) => r.transactionId],
    ["ID transacción interno", (r) => r.clientTransactionId],
  ]);
}

export async function exportCsv(entityRaw: string): Promise<{ filename: string; csv: string }> {
  const entity = String(entityRaw).toLowerCase() as ExportEntity;
  if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) {
    throw new CustomError("Exportación no disponible", 404);
  }
  const builders: Record<ExportEntity, () => Promise<string>> = {
    leads: leadsCsv,
    customers: customersCsv,
    reservations: reservationsCsv,
    payments: paymentsCsv,
  };
  const date = formatLocal(new Date()).slice(0, 10);
  return { filename: `ponce-${entity}-${date}.csv`, csv: await builders[entity]() };
}

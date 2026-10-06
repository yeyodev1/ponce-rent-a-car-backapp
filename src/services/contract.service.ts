import crypto from "crypto";
import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { ContractTemplate } from "../models/contractTemplate.model";
import { Coverage } from "../models/coverage.model";
import { Customer } from "../models/customer.model";
import { Extra } from "../models/extra.model";
import { Reservation } from "../models/reservation.model";
import { Vehicle } from "../models/vehicle.model";
import { assertObjectId } from "./catalog.service";
import { findByAccess, RequestMeta } from "./reservation.service";
import { getSettings } from "./settings.service";

type Lang = "es" | "en";

/** Variables que el administrador puede insertar en la plantilla (las lista el editor). */
export const CONTRACT_VARIABLES: { key: string; label: string; group: string }[] = [
  { key: "reserva.codigo", label: "Código de la reserva", group: "Reserva" },
  { key: "reserva.retiro", label: "Fecha y hora de retiro", group: "Reserva" },
  { key: "reserva.devolucion", label: "Fecha y hora de devolución", group: "Reserva" },
  { key: "reserva.lugarRetiro", label: "Lugar de retiro", group: "Reserva" },
  { key: "reserva.lugarDevolucion", label: "Lugar de devolución", group: "Reserva" },
  { key: "reserva.dias", label: "Días de alquiler", group: "Reserva" },
  { key: "reserva.kilometraje", label: "Kilometraje contratado", group: "Reserva" },
  { key: "reserva.cobertura", label: "Cobertura elegida", group: "Reserva" },
  { key: "reserva.extras", label: "Extras contratados", group: "Reserva" },
  { key: "reserva.total", label: "Total del alquiler", group: "Reserva" },
  { key: "reserva.garantia", label: "Monto de la garantía", group: "Reserva" },
  { key: "cliente.nombre", label: "Nombre completo", group: "Cliente" },
  { key: "cliente.documento", label: "Número de documento", group: "Cliente" },
  { key: "cliente.email", label: "Correo", group: "Cliente" },
  { key: "cliente.telefono", label: "Teléfono", group: "Cliente" },
  { key: "cliente.pais", label: "País de residencia", group: "Cliente" },
  { key: "cliente.licencia", label: "Número de licencia", group: "Cliente" },
  { key: "cliente.licenciaVence", label: "Vencimiento de la licencia", group: "Cliente" },
  { key: "vehiculo.categoria", label: "Categoría", group: "Vehículo" },
  { key: "vehiculo.marca", label: "Marca", group: "Vehículo" },
  { key: "vehiculo.modelo", label: "Modelo", group: "Vehículo" },
  { key: "vehiculo.anio", label: "Año", group: "Vehículo" },
  { key: "vehiculo.placa", label: "Placa", group: "Vehículo" },
  { key: "vehiculo.color", label: "Color", group: "Vehículo" },
  { key: "empresa.nombre", label: "Nombre de la empresa", group: "Empresa" },
  { key: "empresa.telefono", label: "Teléfono de la empresa", group: "Empresa" },
  { key: "empresa.direccion", label: "Dirección de la empresa", group: "Empresa" },
  { key: "fecha.hoy", label: "Fecha de hoy", group: "Empresa" },
];

const TZ = "America/Guayaquil";
const CLOSED = ["cancelled", "expired"];

function money(cents: number | undefined | null): string {
  const value = Math.round(Number(cents) || 0) / 100;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function dateTime(date: Date | null | undefined, lang: Lang): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-EC", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: lang === "en",
  }).format(new Date(date));
}

function dateOnly(date: Date | string | null | undefined, lang: Lang): string {
  if (!date) return "";
  // Las fechas YYYY-MM-DD (licencia) se fijan al mediodía para que la zona no las corra un día.
  const d = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00-05:00`) : new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-EC", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function countryName(code: string, lang: Lang): string {
  if (!code) return "";
  try {
    return new Intl.DisplayNames([lang], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/** Nombre comparable: sin tildes, en mayúsculas y sin espacios repetidos. */
export function normalizeName(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mismo criterio con el que se guarda el documento al crear la reserva. */
export function normalizeDocument(value: string): string {
  return String(value ?? "")
    .replace(/[\s.-]/g, "")
    .toUpperCase();
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/** Reemplaza {{grupo.campo}}; una variable desconocida queda visible para que el admin la corrija. */
export function renderTemplate(body: string, context: Record<string, string>): string {
  return String(body ?? "").replace(/\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(context, key) ? context[key] : match,
  );
}

/** Contexto de variables de una reserva, ya formateado en su idioma. */
export async function buildContext(reservation: any): Promise<Record<string, string>> {
  const lang: Lang = reservation.language === "en" ? "en" : "es";
  const en = lang === "en";
  const [settings, customer, vehicle, coverage, extras] = await Promise.all([
    getSettings(),
    Customer.findById(reservation.customer).lean<any>(),
    reservation.vehicle ? Vehicle.findById(reservation.vehicle).lean<any>() : null,
    Coverage.findOne({ code: reservation.coverage }).lean<any>(),
    Extra.find({ code: { $in: (reservation.extras ?? []).map((e: any) => e.code) } }).lean<any[]>(),
  ]);
  const pending = en ? "To be assigned" : "Por asignar";
  const location = (code: string) => {
    const label = settings.booking.locations.find((l) => l.code === code)?.label?.[lang] || code;
    const address = code === reservation.pickupLocation && reservation.pickupAddress ? ` (${reservation.pickupAddress})` : "";
    return `${label}${["hotel", "other"].includes(code) ? address : ""}`;
  };
  const pricing = reservation.pricing ?? {};
  const mileage =
    reservation.mileage === "unlimited"
      ? en
        ? "Unlimited"
        : "Ilimitado"
      : en
        ? `Limited: ${pricing.includedKm ?? 0} km included; extra km ${money(pricing.extraKmPrice)}`
        : `Limitado: ${pricing.includedKm ?? 0} km incluidos; km adicional ${money(pricing.extraKmPrice)}`;
  const extrasText = (reservation.extras ?? [])
    .filter((e: any) => e.quantity > 0)
    .map((e: any) => {
      const name = extras.find((x) => x.code === e.code)?.name?.[lang] || e.code;
      return `${name} × ${e.quantity}`;
    })
    .join(", ");
  const docType =
    customer?.documentType === "passport" ? (en ? "passport" : "pasaporte") : en ? "national ID" : "cédula";

  return {
    "reserva.codigo": reservation.code,
    "reserva.retiro": dateTime(reservation.pickupAt, lang),
    "reserva.devolucion": dateTime(reservation.returnAt, lang),
    "reserva.lugarRetiro": location(reservation.pickupLocation),
    "reserva.lugarDevolucion": location(reservation.returnLocation),
    "reserva.dias": String(pricing.days ?? ""),
    "reserva.kilometraje": mileage,
    "reserva.cobertura": coverage?.name?.[lang] || reservation.coverage || "",
    "reserva.extras": extrasText || (en ? "None" : "Ninguno"),
    "reserva.total": money(pricing.total),
    "reserva.garantia": money(pricing.guaranteeAmount ?? settings.booking.guaranteeAmount),
    "cliente.nombre": customer?.name ?? "",
    "cliente.documento": customer ? `${customer.documentNumber} (${docType})` : "",
    "cliente.email": customer?.email ?? "",
    "cliente.telefono": customer?.phone ?? "",
    "cliente.pais": countryName(customer?.country ?? "", lang),
    "cliente.licencia": customer?.licenseNumber || (en ? "Not provided" : "No registrada"),
    "cliente.licenciaVence": customer?.licenseExpiresAt ? dateOnly(customer.licenseExpiresAt, lang) : en ? "Not provided" : "No registrada",
    "vehiculo.categoria": reservation.categoryName?.[lang] || reservation.categorySlug || "",
    "vehiculo.marca": vehicle?.brand || pending,
    "vehiculo.modelo": vehicle?.model || pending,
    "vehiculo.anio": vehicle?.year ? String(vehicle.year) : pending,
    "vehiculo.placa": vehicle?.plate || pending,
    "vehiculo.color": vehicle ? vehicle.color || "—" : pending,
    "empresa.nombre": settings.business.name,
    "empresa.telefono": settings.business.phone,
    "empresa.direccion": settings.business.address,
    "fecha.hoy": dateOnly(new Date(), lang),
  };
}

export async function getActiveTemplate() {
  const template = await ContractTemplate.findOne({ isActive: true }).sort({ version: -1 }).lean<any>();
  if (!template) throw new CustomError("Todavía no hay una plantilla de contrato activa", 404);
  return template;
}

function pickLang(text: { es?: string; en?: string } | undefined, lang: Lang): string {
  return (lang === "en" ? text?.en || text?.es : text?.es || text?.en) || "";
}

/** Texto del contrato tal como se mostraría hoy (o el congelado si ya se aceptó). */
async function contractView(reservation: any, includeRendered: boolean) {
  const lang: Lang = reservation.language === "en" ? "en" : "es";
  const c = reservation.contract ?? {};
  const signed = c.status === "signed" && Boolean(c.renderedText);
  if (signed) {
    // El título sale de la versión aceptada (no de la activa): la reserva no guarda una copia.
    const version = Number(c.version) || 0;
    const template = version ? await ContractTemplate.findOne({ version }).select("title").lean<any>() : null;
    const title =
      pickLang(template?.title, lang) || (lang === "en" ? "Vehicle rental agreement" : "Contrato de alquiler de vehículo");
    return {
      status: "signed" as const,
      version: Number(c.version) || null,
      title,
      text: c.renderedText as string,
      hash: c.hash as string,
      language: lang,
      signedAt: c.signedAt,
      acceptance: c.acceptance,
      ...(includeRendered ? { renderedText: c.renderedText } : {}),
    };
  }
  const template = await getActiveTemplate();
  const context = await buildContext(reservation);
  const text = renderTemplate(pickLang(template.body, lang), context);
  return {
    status: "pending" as const,
    version: template.version as number,
    title: renderTemplate(pickLang(template.title, lang), context),
    text,
    hash: null,
    language: lang,
    signedAt: null,
    acceptance: null,
    ...(includeRendered ? { renderedText: "" } : {}),
  };
}

async function contractRequired(): Promise<boolean> {
  const settings = await getSettings();
  return settings.booking.contractRequired !== false;
}

/** renderedText no viaja por defecto (select: false): se pide explícitamente. */
async function loadWithText(filter: Record<string, unknown>) {
  return Reservation.findOne(filter).select("+contract.renderedText").lean<any>();
}

// ---------------------------------------------------------------------------
// Público (con el token de la reserva)
// ---------------------------------------------------------------------------

export async function getPublicContract(code: string, token: string) {
  const access = await findByAccess(code, token);
  const reservation = await loadWithText({ _id: access._id });
  return { ...(await contractView(reservation, false)), required: await contractRequired() };
}

export async function acceptContract(code: string, token: string, body: any, meta: RequestMeta) {
  const access = await findByAccess(code, token);
  const reservation = await loadWithText({ _id: access._id });
  // Idempotente: una segunda aceptación devuelve la primera sin tocarla.
  if (reservation.contract?.status === "signed" && reservation.contract?.renderedText) {
    return { ...(await contractView(reservation, false)), required: await contractRequired() };
  }
  if (CLOSED.includes(reservation.status)) {
    throw new CustomError("Esta reserva ya no está activa", 409).withCode("reservation_closed");
  }
  if (body?.accepted !== true) {
    throw new CustomError("Marca la casilla de aceptación del contrato", 400).withCode("not_accepted");
  }
  const name = String(body?.name ?? "").trim().slice(0, 200);
  const documentNumber = normalizeDocument(String(body?.documentNumber ?? "")).slice(0, 30);
  const customer = await Customer.findById(reservation.customer).lean<any>();
  if (!customer) throw new CustomError("No se encontró el conductor de la reserva", 404);
  if (!name || normalizeName(name) !== normalizeName(customer.name)) {
    throw new CustomError(
      "El nombre no coincide con el del conductor de la reserva. Escríbelo tal como aparece en tu documento",
      400,
    ).withCode("name_mismatch");
  }
  if (!documentNumber || documentNumber !== normalizeDocument(customer.documentNumber)) {
    throw new CustomError("El número de documento no coincide con el de la reserva", 400).withCode(
      "document_mismatch",
    );
  }

  const view = await contractView(reservation, false);
  const at = new Date();
  // La huella cubre el texto exacto: cualquier cambio posterior se detecta al recalcularla.
  const hash = sha256(view.text);
  const updated = await Reservation.findOneAndUpdate(
    { _id: reservation._id, "contract.status": { $ne: "signed" } },
    {
      $set: {
        "contract.status": "signed",
        "contract.version": String(view.version ?? ""),
        "contract.signatureStatus": "accepted_online",
        "contract.signedAt": at,
        "contract.renderedText": view.text,
        "contract.hash": hash,
        "contract.acceptance": {
          name,
          documentNumber,
          ip: String(meta.ip ?? "").slice(0, 100),
          userAgent: String(meta.userAgent ?? "").slice(0, 300),
          at,
        },
      },
    },
    { new: true },
  )
    .select("+contract.renderedText")
    .lean<any>();
  const fresh = updated ?? (await loadWithText({ _id: reservation._id }));
  return { ...(await contractView(fresh, false)), required: await contractRequired() };
}

/** Datos que necesita el PDF (público o admin). */
export async function contractForPdf(filter: { code?: string; token?: string; id?: string }) {
  let reservation: any;
  if (filter.id) {
    assertObjectId(filter.id, "la reserva");
    reservation = await loadWithText({ _id: filter.id });
    if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  } else {
    const access = await findByAccess(String(filter.code), String(filter.token));
    reservation = await loadWithText({ _id: access._id });
  }
  const view = await contractView(reservation, false);
  return { reservation, view };
}

/** El checkout lo exige si así está configurado. */
export async function assertSignedForCheckout(reservation: any) {
  if (!(await contractRequired())) return;
  if (reservation.contract?.status === "signed") return;
  throw new CustomError("Acepta el contrato antes de pagar", 409).withCode("contract_required");
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function adminGetContract(id: string) {
  assertObjectId(id, "la reserva");
  const reservation = await loadWithText({ _id: id });
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  return { ...(await contractView(reservation, true)), required: await contractRequired() };
}

export async function listTemplates() {
  return ContractTemplate.find().sort({ version: -1 }).lean();
}

export async function getActive() {
  return getActiveTemplate();
}

function cleanI18n(value: any, max: number) {
  const v = value && typeof value === "object" ? value : {};
  return { es: String(v.es ?? "").trim().slice(0, max), en: String(v.en ?? "").trim().slice(0, max) };
}

/** Cada guardado crea una versión nueva y la activa; las anteriores quedan intactas. */
export async function createTemplate(body: any, actor: { id: string; name: string; email: string }) {
  const title = cleanI18n(body?.title, 200);
  const text = cleanI18n(body?.body, 60000);
  if (!title.es || !text.es) throw new CustomError("El título y el texto en español son obligatorios", 400);
  if (!title.en) title.en = title.es;
  if (!text.en) text.en = text.es;

  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await ContractTemplate.findOne().sort({ version: -1 }).select("version").lean<any>();
    const version = (last?.version ?? 0) + 1;
    try {
      const created = await ContractTemplate.create({ version, title, body: text, isActive: false, createdBy: actor });
      await ContractTemplate.updateMany({ _id: { $ne: created._id } }, { $set: { isActive: false } });
      await ContractTemplate.updateOne({ _id: created._id }, { $set: { isActive: true } });
      return { ...created.toObject(), isActive: true };
    } catch (error: any) {
      // Dos guardados a la vez: el índice único de version obliga a reintentar con el siguiente número.
      if (error?.code !== 11000) throw error;
    }
  }
  throw new CustomError("No se pudo guardar la versión. Intenta de nuevo", 409);
}

/** Vista previa con una reserva real (o con datos de ejemplo si no se elige ninguna). */
export async function previewTemplate(body: any) {
  const lang: Lang = body?.language === "en" ? "en" : "es";
  const text = String(body?.body ?? "").slice(0, 60000);
  const title = String(body?.title ?? "").slice(0, 200);
  let context: Record<string, string>;
  if (body?.reservationId && isValidObjectId(String(body.reservationId))) {
    const reservation = await Reservation.findById(String(body.reservationId)).lean<any>();
    if (!reservation) throw new CustomError("No se encontró la reserva", 404);
    context = await buildContext({ ...reservation, language: lang });
  } else {
    context = Object.fromEntries(CONTRACT_VARIABLES.map((v) => [v.key, `[${v.label}]`]));
  }
  return { text: renderTemplate(text, context), title: renderTemplate(title, context) };
}

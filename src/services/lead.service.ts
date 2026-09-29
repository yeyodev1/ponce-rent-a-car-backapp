import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { nextSequence } from "../models/counter.model";
import {
  ILead,
  Lead,
  LEAD_CHANNELS,
  LEAD_DURATIONS,
  LEAD_PASSENGERS,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
} from "../models/lead.model";
import { LOCATION_CODES } from "../models/setting.model";
// Se registran los modelos para que populate funcione aunque nadie más los haya importado.
import "../models/reservation.model";
import "../models/customer.model";
import { sendCapiEvent } from "./metaCapi.service";
import { durationLabel, formatShortDate, locationLabel, notifyAdvisor, passengersLabel } from "./leadNotify.service";
import { getSettings, whatsappLink } from "./settings.service";
import { emitWebhook } from "./webhook.service";

type Lang = "es" | "en";

/** Los leads de WhatsApp los crea el webhook, no el sitio. */
const PUBLIC_SOURCES = LEAD_SOURCES.filter((s) => s !== "whatsapp_ad" && s !== "whatsapp_direct");
const ATTRIBUTION_KEYS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "fbclid",
  "gclid",
  "referrer",
  "landingPage",
] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export function digits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function str(value: unknown, max = 500): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function has(body: Record<string, unknown>, key: string): boolean {
  return body[key] !== undefined && body[key] !== null;
}

function checkEnum(list: readonly string[], value: string, label: string): void {
  if (value && !list.includes(value)) throw new CustomError(`El valor de ${label} no es válido`, 400);
}

function sanitizeAttribution(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of ATTRIBUTION_KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (v !== undefined && v !== null && v !== "") out[key] = str(v, 1000);
  }
  return out;
}

/**
 * Valida y normaliza solo los campos que llegaron en el body: así la segunda
 * llamada (elegir canal) no borra lo que se guardó en la primera.
 */
function pickLeadFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (has(body, "source")) {
    const source = str(body.source, 40);
    checkEnum(PUBLIC_SOURCES, source, "origen");
    if (source) out.source = source;
  }
  if (has(body, "language")) {
    out.language = str(body.language, 2) === "en" ? "en" : "es";
  }
  if (has(body, "startDate")) {
    const v = str(body.startDate, 10);
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new CustomError("La fecha debe tener formato AAAA-MM-DD", 400);
    out.startDate = v;
  }
  if (has(body, "startTime")) {
    const v = str(body.startTime, 5);
    if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new CustomError("La hora debe tener formato HH:mm", 400);
    out.startTime = v;
  }
  if (has(body, "duration")) {
    const v = str(body.duration, 10);
    checkEnum(LEAD_DURATIONS, v, "duración");
    out.duration = v;
  }
  if (has(body, "location")) {
    const v = str(body.location, 20);
    checkEnum(LOCATION_CODES, v, "lugar de entrega");
    out.location = v;
  }
  if (has(body, "passengers")) {
    const v = str(body.passengers, 5);
    checkEnum(LEAD_PASSENGERS, v, "pasajeros");
    out.passengers = v;
  }
  if (has(body, "channel")) {
    const v = str(body.channel, 20);
    checkEnum(LEAD_CHANNELS, v, "canal");
    out.channel = v;
  }
  if (has(body, "priority")) {
    const v = str(body.priority, 20);
    checkEnum(LEAD_PRIORITIES, v, "prioridad");
    out.priority = v;
  }
  if (has(body, "name")) out.name = str(body.name, 120);
  if (has(body, "phone")) {
    const v = str(body.phone, 30);
    if (v && digits(v).length < 7) throw new CustomError("El teléfono debe tener al menos 7 dígitos", 400);
    out.phone = v ? digits(v) : "";
  }
  if (has(body, "email")) {
    const v = str(body.email, 160).toLowerCase();
    if (v && !EMAIL.test(v)) throw new CustomError("El correo no es válido", 400);
    out.email = v;
  }
  if (has(body, "company")) out.company = str(body.company, 160);
  if (has(body, "vehicles")) {
    const n = Number(body.vehicles);
    out.vehicles = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 1000) : 0;
  }
  if (has(body, "comments")) out.comments = str(body.comments, 2000);
  if (has(body, "categorySlug")) out.categorySlug = str(body.categorySlug, 80).toLowerCase();
  if (has(body, "specificVehicle")) out.specificVehicle = str(body.specificVehicle, 200);
  return out;
}

function computeTags(lead: { tags?: string[]; duration?: string; source?: string }): string[] {
  const tags = new Set(lead.tags ?? []);
  if (lead.duration === "30+") tags.add("long_term");
  if (lead.source === "corporate") tags.add("corporate");
  if (lead.source === "hotel") tags.add("hotel");
  return [...tags];
}

const INTRO: Record<string, Record<Lang, string>> = {
  route_a: {
    es: "Hola Ponce's, quiero ayuda para elegir mi vehículo.",
    en: "Hi Ponce's, I'd like help choosing my vehicle.",
  },
  corporate: {
    es: "Hola Ponce's, quiero una cotización para mi empresa.",
    en: "Hi Ponce's, I'd like a quote for my company.",
  },
  hotel: {
    es: "Hola Ponce's, vengo de un hotel aliado y quiero rentar un vehículo.",
    en: "Hi Ponce's, I'm coming from a partner hotel and want to rent a vehicle.",
  },
  booking_abandoned: {
    es: "Hola Ponce's, necesito ayuda para terminar mi reserva.",
    en: "Hi Ponce's, I need help finishing my booking.",
  },
  default: {
    es: "Hola Ponce's, tengo una consulta.",
    en: "Hi Ponce's, I have a question.",
  },
};

/** Mensaje prellenado en el idioma del lead: el asesor ve el código y el resumen sin preguntar. */
export async function buildWhatsappMessage(lead: ILead): Promise<string> {
  const lang: Lang = lead.language === "en" ? "en" : "es";
  const intro = (INTRO[lead.source] ?? INTRO.default)[lang];
  const parts = [`${lang === "es" ? "Código" : "Code"} ${lead.code}`];
  if (lead.startDate) {
    const when = [formatShortDate(lead.startDate, lang), lead.startTime].filter(Boolean).join(", ");
    parts.push(`${lang === "es" ? "Retiro" : "Pickup"}: ${when}`);
  }
  if (lead.duration) parts.push(durationLabel(lead.duration, lang));
  if (lead.location) parts.push(await locationLabel(lead.location, lang));
  if (lead.passengers) parts.push(passengersLabel(lead.passengers, lang));
  if (lead.company) parts.push(lead.company);
  return `${intro} ${parts.join(" · ")}`;
}

async function contactLinks(lead: ILead): Promise<{ whatsappUrl: string; phoneUrl: string }> {
  const settings = await getSettings();
  return {
    whatsappUrl: whatsappLink(settings.business.whatsapp, await buildWhatsappMessage(lead)),
    phoneUrl: `tel:${settings.business.phone}`,
  };
}

/**
 * POST /public/leads. Se guarda ANTES de abrir WhatsApp o llamar: si el
 * cliente se arrepiente a mitad de camino, el lead ya está en el CRM.
 */
export async function upsertPublicLead(body: Record<string, unknown>, meta: RequestMeta) {
  const fields = pickLeadFields(body ?? {});
  const attribution = sanitizeAttribution(body?.attribution);
  const leadId = str(body?.leadId, 40);

  let lead: any = leadId && isValidObjectId(leadId) ? await Lead.findById(leadId) : null;
  const isNew = !lead;
  const previousChannel = lead?.channel ?? "";

  const effectivePhone = (fields.phone as string | undefined) ?? lead?.phone ?? "";
  if (fields.channel === "callback" && digits(effectivePhone).length < 7) {
    throw new CustomError("Para que te llamemos necesitamos tu teléfono (mínimo 7 dígitos)", 400);
  }

  if (isNew) {
    lead = new Lead({
      source: "route_a",
      ...fields,
      code: `R${await nextSequence("lead")}`,
      attribution,
    });
  } else {
    lead.set(fields);
    // La atribución original (primer toque) no se pisa; solo se completan huecos.
    for (const [k, v] of Object.entries(attribution)) {
      if (!lead.attribution?.[k]) lead.set(`attribution.${k}`, v);
    }
  }

  lead.tags = computeTags(lead);
  if (fields.channel === "whatsapp") lead.whatsappOpenedAt = new Date();
  if (fields.channel === "whatsapp" && lead.phone && !lead.whatsapp) lead.whatsapp = lead.phone;
  await lead.save();

  const plain = lead.toObject() as ILead & { _id: unknown };
  void emitWebhook(isNew ? "lead.created" : "lead.updated", plain);

  if (isNew) {
    void sendCapiEvent({
      event: "Lead",
      eventId: str(body?.eventId, 100) || `lead-${plain.code}`,
      email: plain.email,
      phone: plain.phone,
      sourceUrl: plain.attribution?.landingPage || undefined,
      ip: meta.ip,
      userAgent: meta.userAgent,
      fbclid: plain.attribution?.fbclid || undefined,
    });
  }

  if (fields.channel === "callback" && previousChannel !== "callback") {
    await notifyAdvisor(plain, "PIDE QUE LO LLAMEN");
  } else if (isNew && plain.source !== "route_a") {
    // Formularios (empresas, contacto, hotel) no pasan por WhatsApp: el asesor se entera aquí.
    await notifyAdvisor(plain, "NUEVA SOLICITUD");
  }

  return {
    _id: plain._id,
    code: plain.code,
    status: plain.status,
    tags: plain.tags,
    ...(await contactLinks(plain)),
  };
}

/** Lead creado desde otro formulario (socio, club). Reutiliza el mismo código R####. */
export async function createInternalLead(data: Partial<ILead>): Promise<any> {
  const lead = await Lead.create({ ...data, code: `R${await nextSequence("lead")}` });
  lead.tags = computeTags(lead);
  if (lead.isModified("tags")) await lead.save();
  void emitWebhook("lead.created", lead.toObject());
  return lead;
}

/* ------------------------------------------------------------------ */
/* Admin (mini CRM)                                                    */
/* ------------------------------------------------------------------ */

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parsePaging(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

/** Fechas del filtro en hora de Guayaquil; "to" incluye el día completo. */
export function dateRange(from: unknown, to: unknown): Record<string, Date> | null {
  const range: Record<string, Date> = {};
  const parse = (v: unknown, endOfDay: boolean): Date | null => {
    const s = str(v, 40);
    if (!s) return null;
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00"}-05:00`)
      : new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const f = parse(from, false);
  const t = parse(to, true);
  if (f) range.$gte = f;
  if (t) range.$lte = t;
  return Object.keys(range).length ? range : null;
}

export async function listLeads(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaging(query);
  const filter: Record<string, unknown> = {};
  const q = str(query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const qDigits = digits(q);
    filter.$or = [
      { code: rx },
      { name: rx },
      { email: rx },
      { company: rx },
      ...(qDigits.length >= 4 ? [{ phone: new RegExp(qDigits) }, { whatsapp: new RegExp(qDigits) }] : []),
    ];
  }
  if (query.status) filter.status = str(query.status, 20);
  if (query.source) filter.source = str(query.source, 40);
  if (query.tag) filter.tags = str(query.tag, 40);
  if (query.needsHuman === "true") filter.needsHuman = true;
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;

  const [items, total] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Lead.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

async function findLeadOr404(id: string): Promise<any> {
  if (!isValidObjectId(id)) throw new CustomError("Lead no encontrado", 404);
  const lead = await Lead.findById(id);
  if (!lead) throw new CustomError("Lead no encontrado", 404);
  return lead;
}

export async function getLead(id: string) {
  if (!isValidObjectId(id)) throw new CustomError("Lead no encontrado", 404);
  const lead = await Lead.findById(id)
    .populate("reservation", "code status pricing.total")
    .populate("customer")
    .lean();
  if (!lead) throw new CustomError("Lead no encontrado", 404);
  return lead;
}

export async function updateLead(id: string, body: Record<string, unknown>) {
  const lead = await findLeadOr404(id);
  // pickLeadFields limita "source" a los públicos; en admin se permite cualquiera del modelo.
  const { source, ...rest } = body ?? {};
  const fields = pickLeadFields(rest);
  if (source !== undefined) {
    checkEnum(LEAD_SOURCES, str(source, 40), "origen");
    fields.source = str(source, 40);
  }
  if (has(body, "status")) {
    const status = str(body.status, 20);
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) throw new CustomError("El estado no es válido", 400);
    fields.status = status;
  }
  if (has(body, "assignedTo")) fields.assignedTo = str(body.assignedTo, 160);
  if (has(body, "whatsapp")) fields.whatsapp = digits(body.whatsapp);
  if (has(body, "needsHuman")) fields.needsHuman = body.needsHuman === true || body.needsHuman === "true";
  if (Array.isArray(body?.tags)) {
    fields.tags = [...new Set((body.tags as unknown[]).map((t) => str(t, 40)).filter(Boolean))];
  }

  lead.set(fields);
  lead.tags = computeTags(lead);
  await lead.save();
  void emitWebhook("lead.updated", lead.toObject());
  return lead.toObject();
}

export async function addLeadNote(id: string, text: unknown, author: string) {
  const clean = str(text, 2000);
  if (!clean) throw new CustomError("Escribe el texto de la nota", 400);
  const lead = await findLeadOr404(id);
  lead.notes.push({ text: clean, author, at: new Date() });
  await lead.save();
  return lead.toObject();
}

export async function deleteLead(id: string): Promise<void> {
  const lead = await findLeadOr404(id);
  await lead.deleteOne();
}

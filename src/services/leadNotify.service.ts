import { env } from "../config/env";
import { ILead } from "../models/lead.model";
import { layout, sendEmail } from "./email.service";
import { getSettings } from "./settings.service";
import { isWhatsappCloudEnabled, sendText } from "./whatsapp.service";

type Lang = "es" | "en";

const MONTHS: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const DURATION_LABELS: Record<string, Record<Lang, string>> = {
  "1": { es: "1 día", en: "1 day" },
  "2-3": { es: "2–3 días", en: "2–3 days" },
  "4-7": { es: "4–7 días", en: "4–7 days" },
  "8-15": { es: "8–15 días", en: "8–15 days" },
  "16-30": { es: "16–30 días", en: "16–30 days" },
  "30+": { es: "Más de 30 días", en: "30+ days" },
};

const PASSENGER_LABELS: Record<string, Record<Lang, string>> = {
  "1-2": { es: "1–2 personas", en: "1–2 people" },
  "3-5": { es: "3–5 personas", en: "3–5 people" },
  "6+": { es: "6 o más personas", en: "6+ people" },
};

export const PRIORITY_LABELS: Record<string, Record<Lang, string>> = {
  save: { es: "Ahorrar", en: "Save money" },
  comfort: { es: "Comodidad", en: "Comfort" },
  space: { es: "Espacio", en: "Space" },
  specific: { es: "Un vehículo específico", en: "A specific vehicle" },
  none: { es: "Sin preferencia", en: "No preference" },
};

const SOURCE_LABELS: Record<string, string> = {
  route_a: "Web · Ayúdame a elegir",
  whatsapp_ad: "Anuncio click-to-WhatsApp",
  whatsapp_direct: "WhatsApp directo",
  corporate: "Empresas",
  partner: "Socio sobre Ruedas",
  hotel: "Hotel aliado",
  contact: "Formulario de contacto",
  renaissance: "Ponce's Renaissance",
  booking_abandoned: "Reserva sin terminar",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  quoted: "Cotizado",
  reserved: "Reservado",
  delivered: "Entregado",
  closed: "Cerrado",
  lost: "Perdido",
};

/** "2026-10-05" → "5 oct" / "Oct 5". Se parsea a mano para no depender de la zona del servidor. */
export function formatShortDate(date: string, lang: Lang, withYear = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
  if (!match) return date || "";
  const [, y, m, d] = match;
  const month = MONTHS[lang][Number(m) - 1] ?? m;
  const day = String(Number(d));
  const base = lang === "es" ? `${day} ${month}` : `${month} ${day}`;
  return withYear ? `${base} ${y}` : base;
}

export function durationLabel(value: string, lang: Lang): string {
  return DURATION_LABELS[value]?.[lang] ?? value;
}

export function passengersLabel(value: string, lang: Lang): string {
  return PASSENGER_LABELS[value]?.[lang] ?? value;
}

/** Etiqueta del lugar según la configuración editable (el dueño puede renombrarlos). */
export async function locationLabel(code: string, lang: Lang): Promise<string> {
  if (!code) return "";
  try {
    const settings = await getSettings();
    const found = settings.booking.locations.find((l) => l.code === code);
    return found?.label?.[lang] || code;
  } catch {
    return code;
  }
}

function originLabel(lead: ILead): string {
  const a = lead.attribution || ({} as ILead["attribution"]);
  const utm = [a.utmSource, a.utmMedium, a.utmCampaign].filter(Boolean).join(" / ");
  const source = SOURCE_LABELS[lead.source] ?? lead.source;
  return utm ? `${source} (${utm})` : source;
}

/** Resumen en texto plano, siempre en español: lo lee el asesor, no el cliente. */
export async function buildAdvisorSummary(lead: ILead, title = "NUEVA SOLICITUD"): Promise<string> {
  const contact = lead.whatsapp || lead.phone;
  const lines: string[] = [`*${title} #${lead.code}*`];
  lines.push(`Cliente: ${lead.name || "Sin nombre"}${contact ? ` · +${contact.replace(/\D/g, "")}` : ""}`);
  if (lead.email) lines.push(`Correo: ${lead.email}`);
  if (lead.company) lines.push(`Empresa: ${lead.company}${lead.vehicles ? ` · ${lead.vehicles} vehículos` : ""}`);
  if (lead.startDate) lines.push(`Fecha inicio: ${formatShortDate(lead.startDate, "es", true)}`);
  if (lead.startTime) lines.push(`Hora aprox: ${lead.startTime}`);
  if (lead.duration) lines.push(`Duración: ${durationLabel(lead.duration, "es")}`);
  if (lead.location) lines.push(`Entrega: ${await locationLabel(lead.location, "es")}`);
  if (lead.passengers) lines.push(`Pasajeros: ${passengersLabel(lead.passengers, "es")}`);
  if (lead.priority) {
    const extra = lead.specificVehicle ? ` (${lead.specificVehicle})` : "";
    lines.push(`Prioridad: ${PRIORITY_LABELS[lead.priority]?.es ?? lead.priority}${extra}`);
  }
  if (lead.categorySlug) lines.push(`Categoría de interés: ${lead.categorySlug}`);
  if (lead.channel === "callback") lines.push("Canal: pidió que lo llamen");
  if (lead.needsHuman) lines.push("Pide hablar con un asesor: Sí");
  if (lead.comments) lines.push(`Comentarios: ${lead.comments}`);
  lines.push(`Origen: ${originLabel(lead)}`);
  lines.push(`Idioma: ${lead.language === "en" ? "Inglés" : "Español"}`);
  lines.push(`Estado: ${STATUS_LABELS[lead.status] ?? lead.status}`);
  if (lead.tags?.length) lines.push(`Etiquetas: ${lead.tags.join(", ")}`);
  if (contact) lines.push(`Escribirle: https://wa.me/${contact.replace(/\D/g, "")}`);
  return lines.join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/**
 * Avisa al asesor por WhatsApp (si el Cloud API está activo) y por correo (si
 * hay ADVISOR_EMAIL). Nunca lanza: un aviso fallido no puede perder el lead,
 * que ya está guardado y visible en el CRM.
 */
export async function notifyAdvisor(lead: ILead, title = "NUEVA SOLICITUD"): Promise<void> {
  try {
    const summary = await buildAdvisorSummary(lead, title);
    const tasks: Promise<unknown>[] = [];

    if (env.ADVISOR_WHATSAPP && isWhatsappCloudEnabled()) {
      tasks.push(sendText(env.ADVISOR_WHATSAPP, summary));
    }

    if (env.ADVISOR_EMAIL) {
      const html = layout(
        `${title} #${lead.code}`,
        `<pre style="font-family:inherit;white-space:pre-wrap;margin:0">${escapeHtml(summary.replace(/\*/g, ""))}</pre>`,
      );
      tasks.push(sendEmail(env.ADVISOR_EMAIL, `${title} #${lead.code}`, html));
    }

    await Promise.allSettled(tasks);
  } catch (error) {
    console.error("[leadNotify] no se pudo avisar al asesor:", (error as Error).message);
  }
}

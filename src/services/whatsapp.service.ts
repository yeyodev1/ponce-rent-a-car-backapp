import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env";
import { nextSequence } from "../models/counter.model";
import {
  ILead,
  Lead,
  LEAD_DURATIONS,
  LEAD_PASSENGERS,
  LEAD_PRIORITIES,
} from "../models/lead.model";
import { LOCATION_CODES } from "../models/setting.model";
import { emitWebhook } from "./webhook.service";
import { notifyAdvisor, PRIORITY_LABELS } from "./leadNotify.service";

type Lang = "es" | "en";

/* ------------------------------------------------------------------ */
/* Transporte: Graph API                                               */
/* ------------------------------------------------------------------ */

export function isWhatsappCloudEnabled(): boolean {
  return !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Envía cualquier mensaje. Sin token queda inactivo (log y false): el sitio
 * sigue funcionando con wa.me aunque el Cloud API no esté configurado.
 */
async function sendMessage(to: string, message: Record<string, unknown>): Promise<boolean> {
  const recipient = normalizePhone(to);
  if (!isWhatsappCloudEnabled()) {
    console.warn(`[whatsapp] Cloud API sin configurar — no se envió ${String(message.type)} a ${recipient}`);
    return false;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", recipient_type: "individual", to: recipient, ...message },
      { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }, timeout: 8000 },
    );
    return true;
  } catch (error) {
    const detail = axios.isAxiosError(error) ? JSON.stringify(error.response?.data ?? error.message) : String(error);
    console.error(`[whatsapp] envío a ${recipient} falló:`, detail);
    return false;
  }
}

export function sendText(to: string, body: string): Promise<boolean> {
  return sendMessage(to, { type: "text", text: { body: body.slice(0, 4096), preview_url: false } });
}

/** Botones de respuesta rápida: máximo 3 y títulos de 20 caracteres (límite de Meta). */
export function sendButtons(to: string, body: string, buttons: { id: string; title: string }[]): Promise<boolean> {
  return sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
      },
    },
  });
}

export function sendList(
  to: string,
  body: string,
  buttonLabel: string,
  rows: { id: string; title: string; description?: string }[],
): Promise<boolean> {
  return sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            title: buttonLabel.slice(0, 24),
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          },
        ],
      },
    },
  });
}

export function sendFlow(
  to: string,
  opts: { flowId: string; flowToken: string; screen: string; cta: string; header: string; body: string; footer?: string },
): Promise<boolean> {
  return sendMessage(to, {
    type: "interactive",
    interactive: {
      type: "flow",
      header: { type: "text", text: opts.header },
      body: { text: opts.body },
      ...(opts.footer ? { footer: { text: opts.footer } } : {}),
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: opts.flowToken,
          flow_id: opts.flowId,
          flow_cta: opts.cta,
          flow_action: "navigate",
          flow_action_payload: { screen: opts.screen },
        },
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Firma del webhook                                                   */
/* ------------------------------------------------------------------ */

/** Sin APP_SECRET no se valida (desarrollo); en producción debe estar definida. */
export function isValidSignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!env.WHATSAPP_APP_SECRET) return true;
  if (!rawBody || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest();
  const received = Buffer.from(header.slice(7), "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

/* ------------------------------------------------------------------ */
/* Textos bilingües                                                    */
/* ------------------------------------------------------------------ */

const T = {
  advisorButton: { es: "Hablar con un asesor", en: "Talk to an agent" },
  flowCta: { es: "Continuar", en: "Continue" },
  shortHeader: { es: "Ponce's Rent a Car", en: "Ponce's Rent a Car" },
  shortBody: {
    es: (code: string) =>
      `¡Hola! Recibimos tu solicitud ${code}. Dos preguntas rápidas y un asesor te ayuda a elegir el vehículo ideal.`,
    en: (code: string) =>
      `Hi! We got your request ${code}. Two quick questions and an agent will help you pick the right vehicle.`,
  },
  fullBody: {
    es: "¡Hola! Gracias por escribir a Ponce's Rent a Car. Cuéntanos tu viaje en menos de un minuto y te ayudamos a elegir.",
    en: "Hi! Thanks for contacting Ponce's Rent a Car. Tell us about your trip in under a minute and we'll help you choose.",
  },
  humanExit: {
    es: "¿Prefieres hablar directo con una persona? Toca el botón.",
    en: "Prefer to talk to a person? Tap the button.",
  },
  welcomeButtons: {
    es: "¡Hola! Gracias por escribir a Ponce's Rent a Car en Guayaquil. ¿Te ayudamos a elegir tu vehículo?",
    en: "Hi! Thanks for contacting Ponce's Rent a Car in Guayaquil. Can we help you pick a vehicle?",
  },
  startButton: { es: "Elegir vehículo", en: "Choose a vehicle" },
  listBody: {
    es: "¿Qué es más importante para ti en este viaje?",
    en: "What matters most to you on this trip?",
  },
  listButton: { es: "Ver opciones", en: "See options" },
  askName: {
    es: "¡Perfecto! ¿A nombre de quién registramos la solicitud? Escríbenos tu nombre y apellido.",
    en: "Great! Who should we put the request under? Please type your full name.",
  },
  thanks: {
    es: (code: string) =>
      `¡Gracias! Tu solicitud ${code} está completa. Un asesor de Ponce's te escribe en breve por este mismo chat.`,
    en: (code: string) =>
      `Thank you! Your request ${code} is complete. A Ponce's agent will message you shortly in this chat.`,
  },
  humanAck: {
    es: "Un asesor te escribe en breve. 🙌",
    en: "An agent will message you shortly. 🙌",
  },
};

const ADVISOR_ID = "advisor";
const START_ID = "start";
const PRIORITY_PREFIX = "prio_";
const HUMAN_WORDS = /\b(asesor|asesora|agente|agent|advisor|humano|human)\b/i;
const CODE_PATTERN = /\bR\d{4,}\b/i;
const RECENT_HOURS = 72;

function sendAdvisorExit(to: string, lang: Lang, body = T.humanExit[lang]): Promise<boolean> {
  return sendButtons(to, body, [{ id: ADVISOR_ID, title: T.advisorButton[lang] }]);
}

/** Pregunta la prioridad: Flow si existe; si no, lista interactiva (incluye la salida humana). */
async function askPriority(lead: any): Promise<void> {
  const lang: Lang = lead.language === "en" ? "en" : "es";
  const to = lead.whatsapp;
  if (env.WHATSAPP_FLOW_ID) {
    await sendFlow(to, {
      flowId: env.WHATSAPP_FLOW_ID,
      flowToken: lead.code,
      screen: "PRIORITY",
      cta: T.flowCta[lang],
      header: T.shortHeader[lang],
      body: T.shortBody[lang](lead.code),
    });
    await sendAdvisorExit(to, lang);
    return;
  }
  await sendList(to, `${T.shortBody[lang](lead.code)}\n\n${T.listBody[lang]}`, T.listButton[lang], [
    ...LEAD_PRIORITIES.map((p) => ({ id: `${PRIORITY_PREFIX}${p}`, title: PRIORITY_LABELS[p][lang] })),
    { id: ADVISOR_ID, title: T.advisorButton[lang] },
  ]);
}

/** Lead nuevo desde anuncio o chat directo: Flow completo o bienvenida con botones. */
async function sendWelcome(lead: any): Promise<void> {
  const lang: Lang = lead.language === "en" ? "en" : "es";
  if (env.WHATSAPP_FLOW_ID_FULL) {
    await sendFlow(lead.whatsapp, {
      flowId: env.WHATSAPP_FLOW_ID_FULL,
      flowToken: lead.code,
      screen: "TRIP",
      cta: T.flowCta[lang],
      header: T.shortHeader[lang],
      body: T.fullBody[lang],
    });
    await sendAdvisorExit(lead.whatsapp, lang);
    return;
  }
  await sendButtons(lead.whatsapp, T.welcomeButtons[lang], [
    { id: START_ID, title: T.startButton[lang] },
    { id: ADVISOR_ID, title: T.advisorButton[lang] },
  ]);
}

/* ------------------------------------------------------------------ */
/* Procesamiento de mensajes entrantes                                 */
/* ------------------------------------------------------------------ */

interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
    nfm_reply?: { response_json: string; name?: string; body?: string };
  };
  referral?: { source_id?: string; source_type?: string; source_url?: string; headline?: string; body?: string };
}

// Meta reintenta el webhook si tarda; este set evita procesar dos veces el mismo
// mensaje dentro de la misma instancia (en serverless es la mejor defensa barata).
const processedIds = new Set<string>();
function alreadyProcessed(id: string): boolean {
  if (!id) return false;
  if (processedIds.has(id)) return true;
  processedIds.add(id);
  if (processedIds.size > 500) processedIds.delete(processedIds.values().next().value as string);
  return false;
}

function guessLanguage(text: string, phone: string): Lang {
  if (/\b(hi|hello|hey|rent|rental|car|price|want|need|please|thanks|airport)\b/i.test(text)) return "en";
  if (/\b(hola|buenas|quiero|necesito|precio|carro|auto|alquiler|renta)\b/i.test(text)) return "es";
  // Ecuador y el resto de Latinoamérica/España → español; EE. UU./Canadá/UK → inglés.
  if (/^(1|44)\d+/.test(phone) && !/^1(787|939|809|829|849)/.test(phone)) return "en";
  return "es";
}

async function findRecentLead(phone: string): Promise<any | null> {
  const since = new Date(Date.now() - RECENT_HOURS * 3600 * 1000);
  return Lead.findOne({ $or: [{ whatsapp: phone }, { phone }], updatedAt: { $gte: since } }).sort({ updatedAt: -1 });
}

async function findLatestLead(phone: string): Promise<any | null> {
  return Lead.findOne({ $or: [{ whatsapp: phone }, { phone }] }).sort({ updatedAt: -1 });
}

async function markNeedsHuman(lead: any): Promise<void> {
  const lang: Lang = lead.language === "en" ? "en" : "es";
  // Si ya lo había pedido no se repite la respuesta: evita el bucle con el cliente.
  if (lead.needsHuman) return;
  lead.needsHuman = true;
  await lead.save();
  await sendText(lead.whatsapp, T.humanAck[lang]);
  await notifyAdvisor(lead.toObject() as ILead, "CLIENTE PIDE ASESOR");
  void emitWebhook("lead.updated", lead.toObject());
}

async function completeLead(lead: any): Promise<void> {
  const lang: Lang = lead.language === "en" ? "en" : "es";
  lead.flowCompletedAt = new Date();
  await lead.save();
  await sendAdvisorExit(lead.whatsapp, lang, T.thanks[lang](lead.code));
  await notifyAdvisor(lead.toObject() as ILead, "NUEVA SOLICITUD");
  void emitWebhook("lead.updated", lead.toObject());
}

/** Tras elegir la prioridad: si falta el nombre se pide; si no, se cierra la solicitud. */
async function applyPriority(lead: any, priority: string): Promise<void> {
  if (!(LEAD_PRIORITIES as readonly string[]).includes(priority)) return;
  lead.priority = priority;
  if (!lead.name) {
    await lead.save();
    const lang: Lang = lead.language === "en" ? "en" : "es";
    await sendText(lead.whatsapp, T.askName[lang]);
    return;
  }
  await completeLead(lead);
}

async function createWhatsappLead(msg: InboundMessage, phone: string, profileName: string): Promise<any> {
  const text = msg.text?.body ?? "";
  const fromAd = !!msg.referral;
  const lead = await Lead.create({
    code: `R${await nextSequence("lead")}`,
    source: fromAd ? "whatsapp_ad" : "whatsapp_direct",
    channel: "whatsapp",
    language: guessLanguage(text, phone),
    whatsapp: phone,
    phone,
    whatsappOpenedAt: new Date(),
    comments: [profileName && `Perfil de WhatsApp: ${profileName}`, text && `Primer mensaje: ${text.slice(0, 500)}`]
      .filter(Boolean)
      .join("\n"),
    attribution: fromAd
      ? {
          utmSource: "meta_ads",
          utmMedium: "click_to_whatsapp",
          utmCampaign: msg.referral?.source_id ?? "",
          utmContent: msg.referral?.headline ?? "",
          landingPage: msg.referral?.source_url ?? "",
        }
      : {},
  });
  void emitWebhook("lead.created", lead.toObject());
  return lead;
}

function pickEnum<T extends readonly string[]>(list: T, value: unknown): T[number] | "" {
  const v = String(value ?? "").trim();
  return (list as readonly string[]).includes(v) ? (v as T[number]) : "";
}

/** El DatePicker devuelve "YYYY-MM-DD" en versiones nuevas y milisegundos en las antiguas. */
function parseFlowDate(value: unknown): string {
  const v = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{10,13}$/.test(v)) {
    const ms = v.length === 13 ? Number(v) : Number(v) * 1000;
    // Hora de Guayaquil (UTC-5) para no correr el día.
    return new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10);
  }
  return "";
}

async function handleFlowReply(msg: InboundMessage, phone: string): Promise<void> {
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(msg.interactive?.nfm_reply?.response_json || "{}");
  } catch {
    console.warn("[whatsapp] response_json inválido en nfm_reply");
  }
  const token = String(data.flow_token ?? "").toUpperCase();
  let lead = CODE_PATTERN.test(token) ? await Lead.findOne({ code: token }) : null;
  if (!lead) lead = await findLatestLead(phone);
  if (!lead) return;

  if (!lead.whatsapp) lead.whatsapp = phone;
  const priority = pickEnum(LEAD_PRIORITIES, data.priority);
  if (priority) lead.priority = priority;
  const specific = String(data.specific_vehicle ?? "").trim();
  if (specific) lead.specificVehicle = specific.slice(0, 200);
  const name = String(data.name ?? "").trim();
  if (name) lead.name = name.slice(0, 120);

  const startDate = parseFlowDate(data.start_date);
  if (startDate) lead.startDate = startDate;
  const startTime = String(data.start_time ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(startTime)) lead.startTime = startTime;
  const duration = pickEnum(LEAD_DURATIONS, data.duration);
  if (duration) lead.duration = duration;
  const location = pickEnum(LOCATION_CODES, data.location);
  if (location) lead.location = location;
  const passengers = pickEnum(LEAD_PASSENGERS, data.passengers);
  if (passengers) lead.passengers = passengers;
  if (duration === "30+" && !lead.tags.includes("long_term")) lead.tags.push("long_term");

  await completeLead(lead);
}

async function handleText(msg: InboundMessage, phone: string, profileName: string): Promise<void> {
  const text = (msg.text?.body ?? msg.button?.text ?? "").trim();
  const code = CODE_PATTERN.exec(text)?.[0]?.toUpperCase();

  if (code) {
    const lead = await Lead.findOne({ code });
    if (lead) {
      lead.whatsapp = phone;
      if (!lead.phone) lead.phone = phone;
      if (!lead.channel) lead.channel = "whatsapp";
      if (!lead.whatsappOpenedAt) lead.whatsappOpenedAt = new Date();
      await lead.save();
      void emitWebhook("lead.updated", lead.toObject());

      if (HUMAN_WORDS.test(text)) return markNeedsHuman(lead);
      if (!lead.priority) return askPriority(lead);
      if (!lead.name) {
        await sendText(phone, T.askName[lead.language === "en" ? "en" : "es"]);
        return;
      }
      if (!lead.flowCompletedAt) return completeLead(lead);
      // Ya completó todo: el asesor sigue la conversación, no respondemos en automático.
      return;
    }
  }

  const recent = await findRecentLead(phone);

  if (recent) {
    if (!recent.whatsapp) recent.whatsapp = phone;
    if (HUMAN_WORDS.test(text)) return markNeedsHuman(recent);
    // Estado "esperando nombre": prioridad elegida, sin nombre, flujo sin cerrar.
    if (recent.priority && !recent.name && !recent.flowCompletedAt && !recent.needsHuman && text) {
      recent.name = text.slice(0, 120);
      return completeLead(recent);
    }
    // Cualquier otro texto libre queda para el asesor: nunca respondemos en bucle.
    if (recent.isModified()) await recent.save();
    return;
  }

  const lead = await createWhatsappLead(msg, phone, profileName);
  if (HUMAN_WORDS.test(text)) return markNeedsHuman(lead);
  await sendWelcome(lead);
}

async function handleReply(msg: InboundMessage, phone: string): Promise<void> {
  const id = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? msg.button?.payload ?? "";
  const lead = await findLatestLead(phone);
  if (!lead) return;
  if (!lead.whatsapp) lead.whatsapp = phone;

  if (id === ADVISOR_ID) return markNeedsHuman(lead);
  if (id === START_ID) return askPriority(lead);
  if (id.startsWith(PRIORITY_PREFIX)) return applyPriority(lead, id.slice(PRIORITY_PREFIX.length));
}

async function handleMessage(msg: InboundMessage, profileName: string): Promise<void> {
  const phone = normalizePhone(msg.from);
  if (!phone || alreadyProcessed(msg.id)) return;
  // Si el asesor le escribe al número del negocio no se trata como cliente.
  if (env.ADVISOR_WHATSAPP && phone === normalizePhone(env.ADVISOR_WHATSAPP)) return;

  if (msg.type === "interactive" && msg.interactive?.type === "nfm_reply") return handleFlowReply(msg, phone);
  if (msg.type === "interactive" || msg.type === "button") {
    // Un botón de plantilla sin id conocido se trata como texto.
    const hasId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
    if (hasId || msg.button?.payload) return handleReply(msg, phone);
  }
  if (msg.type === "text" || msg.type === "button") return handleText(msg, phone, profileName);
  // Audio, imagen, ubicación, etc.: lo atiende el asesor. Solo se asegura el lead.
  if (!(await findRecentLead(phone))) {
    const lead = await createWhatsappLead(msg, phone, profileName);
    await sendWelcome(lead);
  }
}

/**
 * Recorre entry[].changes[].value.messages[]. Cada mensaje se procesa aislado:
 * un error en uno no impide los demás ni hace que Meta reintente todo el lote.
 */
export async function processWebhook(payload: any): Promise<void> {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const contacts: { wa_id?: string; profile?: { name?: string } }[] = value.contacts ?? [];
      for (const msg of (value.messages ?? []) as InboundMessage[]) {
        const profileName = contacts.find((c) => c.wa_id === msg.from)?.profile?.name ?? "";
        try {
          await handleMessage(msg, profileName);
        } catch (error) {
          console.error("[whatsapp] error procesando mensaje:", (error as Error).message);
        }
      }
    }
  }
}

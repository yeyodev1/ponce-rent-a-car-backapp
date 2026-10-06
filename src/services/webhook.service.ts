import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env";
import { Setting } from "../models/setting.model";
import { waitUntil } from "@vercel/functions";

export type WebhookEvent =
  | "lead.created"
  | "lead.updated"
  | "reservation.created"
  | "reservation.confirmed"
  | "payment.approved";

/**
 * Webhook saliente para conectar un CRM externo sin tocar código.
 * Nunca lanza: un CRM caído no puede romper una reserva.
 */
export function emitWebhook(event: WebhookEvent, data: unknown): Promise<void> {
  // Se llama sin await desde los servicios: waitUntil mantiene viva la función
  // en Vercel hasta que el CRM reciba el evento.
  const work = deliver(event, data);
  waitUntil(work);
  return work;
}

async function deliver(event: WebhookEvent, data: unknown): Promise<void> {
  try {
    const setting = await Setting.findOne({ key: "main" }).lean<{ integrations?: { webhookUrl?: string } }>();
    const url = setting?.integrations?.webhookUrl || env.WEBHOOK_URL;
    if (!url) return;

    const body = JSON.stringify({ event, data, at: new Date().toISOString() });
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (env.WEBHOOK_SECRET) {
      headers["X-Ponce-Signature"] = crypto.createHmac("sha256", env.WEBHOOK_SECRET).update(body).digest("hex");
    }
    await axios.post(url, body, { headers, timeout: 5000 });
  } catch (error) {
    console.error(`[webhook] ${event} no se pudo entregar:`, (error as Error).message);
  }
}

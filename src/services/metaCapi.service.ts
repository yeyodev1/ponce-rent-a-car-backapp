import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env";
import { waitUntil } from "@vercel/functions";

export type CapiEvent = "Lead" | "InitiateCheckout" | "Purchase" | "Contact";

interface CapiInput {
  event: CapiEvent;
  eventId: string;
  email?: string;
  phone?: string;
  value?: number; // centavos
  sourceUrl?: string;
  ip?: string;
  userAgent?: string;
  fbclid?: string;
}

function hash(value?: string): string | undefined {
  if (!value) return undefined;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Meta Conversions API. El eventId es el mismo que manda el Pixel desde el
 * navegador, así Meta deduplica. Nunca lanza.
 */
export function sendCapiEvent(input: CapiInput): Promise<void> {
  // Igual que el webhook: puede llamarse sin await, waitUntil asegura el envío.
  const work = deliver(input);
  waitUntil(work);
  return work;
}

async function deliver(input: CapiInput): Promise<void> {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) return;
  try {
    const fbc = input.fbclid ? `fb.1.${Date.now()}.${input.fbclid}` : undefined;
    const payload = {
      data: [
        {
          event_name: input.event,
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          action_source: "website",
          event_source_url: input.sourceUrl,
          user_data: {
            em: hash(input.email) ? [hash(input.email)] : undefined,
            ph: hash(input.phone?.replace(/\D/g, "")) ? [hash(input.phone?.replace(/\D/g, ""))] : undefined,
            client_ip_address: input.ip,
            client_user_agent: input.userAgent,
            fbc,
          },
          custom_data:
            input.value !== undefined ? { currency: "USD", value: input.value / 100 } : undefined,
        },
      ],
      test_event_code: env.META_TEST_EVENT_CODE || undefined,
    };
    await axios.post(
      `https://graph.facebook.com/v21.0/${env.META_PIXEL_ID}/events`,
      payload,
      { params: { access_token: env.META_CAPI_TOKEN }, timeout: 5000 },
    );
  } catch (error) {
    console.error(`[capi] ${input.event} falló:`, (error as Error).message);
  }
}

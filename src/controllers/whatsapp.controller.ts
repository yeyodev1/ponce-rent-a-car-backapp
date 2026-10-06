import { Request, Response } from "express";
import { env } from "../config/env";
import * as whatsappService from "../services/whatsapp.service";
import { waitUntil } from "@vercel/functions";

// Meta espera respuesta en pocos segundos o reintenta. En Vercel el trabajo que
// sigue después de responder puede congelarse, así que se procesa dentro de la
// petición pero con un tope: pasado ese tiempo se responde 200 igual.
const PROCESS_BUDGET_MS = 8000;

/** GET /api/whatsapp/webhook — verificación de la suscripción en Meta. */
export function verify(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).type("text/plain").send(String(challenge ?? ""));
    return;
  }
  res.status(403).json({ message: "Token de verificación inválido" });
}

/** POST /api/whatsapp/webhook — mensajes entrantes y respuestas de Flows. */
export async function receive(req: Request, res: Response) {
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!whatsappService.isValidSignature(rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
    res.status(401).json({ message: "Firma inválida" });
    return;
  }
  try {
    // Si el proceso pasa del presupuesto se responde igual a Meta, pero
    // waitUntil evita que Vercel congele la función antes de terminarlo.
    const work = whatsappService.processWebhook(req.body);
    waitUntil(work.catch((error) => console.error("[whatsapp] webhook:", (error as Error).message)));
    await Promise.race([
      work,
      new Promise((resolve) => setTimeout(resolve, PROCESS_BUDGET_MS)),
    ]);
  } catch (error) {
    // Nunca se devuelve error a Meta: reintentaría el mismo lote en bucle.
    console.error("[whatsapp] webhook:", (error as Error).message);
  }
  res.sendStatus(200);
}

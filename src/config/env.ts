import "dotenv/config";

/**
 * Único lugar que lee process.env. Leerlo en otro archivo a nivel de módulo
 * es el bug clásico de "la variable está en .env pero llega undefined".
 */

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function list(key: string): string[] {
  return optional(key, "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export const env = {
  PORT: Number(optional("PORT", "8100")),
  NODE_ENV: optional("NODE_ENV", "development"),
  IS_VERCEL: Boolean(process.env.VERCEL),
  DB_URI: required("DB_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  CORS_ORIGINS: list("CORS_ORIGINS"),
  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:5173"),
  SLACK_ERROR_WEBHOOK: optional("SLACK_ERROR_WEBHOOK", ""),
  ADMIN_EMAIL: optional("ADMIN_EMAIL", "admin@cliente.com").toLowerCase(),
  ADMIN_PASSWORD: optional("ADMIN_PASSWORD", ""),
  ADMIN_NAME: optional("ADMIN_NAME", "Administración"),
  RESEND_API_KEY: optional("RESEND_API_KEY", ""),
  RESEND_FROM_EMAIL: optional("RESEND_FROM_EMAIL", "Ponce Rent A Car <onboarding@resend.dev>"),
  CLOUDINARY_CLOUD_NAME: optional("CLOUDINARY_CLOUD_NAME", ""),
  CLOUDINARY_API_KEY: optional("CLOUDINARY_API_KEY", ""),
  CLOUDINARY_API_SECRET: optional("CLOUDINARY_API_SECRET", ""),
  CRON_SECRET: optional("CRON_SECRET", ""),
  // Payphone (Cajita de Pagos). Sin ambos, el checkout responde 503 y el sitio sigue funcionando.
  PAYPHONE_TOKEN: optional("PAYPHONE_TOKEN", ""),
  PAYPHONE_STORE_ID: optional("PAYPHONE_STORE_ID", ""),
  // WhatsApp Business Platform / Cloud API + Flows.
  WHATSAPP_TOKEN: optional("WHATSAPP_TOKEN", ""),
  WHATSAPP_PHONE_NUMBER_ID: optional("WHATSAPP_PHONE_NUMBER_ID", ""),
  WHATSAPP_VERIFY_TOKEN: optional("WHATSAPP_VERIFY_TOKEN", ""),
  WHATSAPP_APP_SECRET: optional("WHATSAPP_APP_SECRET", ""),
  WHATSAPP_FLOW_ID: optional("WHATSAPP_FLOW_ID", ""),
  WHATSAPP_FLOW_ID_FULL: optional("WHATSAPP_FLOW_ID_FULL", ""),
  WHATSAPP_API_VERSION: optional("WHATSAPP_API_VERSION", "v21.0"),
  // Número del asesor que recibe el resumen del lead (solo dígitos con código de país).
  ADVISOR_WHATSAPP: optional("ADVISOR_WHATSAPP", ""),
  ADVISOR_EMAIL: optional("ADVISOR_EMAIL", ""),
  // Meta Conversions API.
  META_PIXEL_ID: optional("META_PIXEL_ID", ""),
  META_CAPI_TOKEN: optional("META_CAPI_TOKEN", ""),
  META_TEST_EVENT_CODE: optional("META_TEST_EVENT_CODE", ""),
  // Webhook saliente para un CRM externo (Kommo, HubSpot, Zoho...).
  WEBHOOK_URL: optional("WEBHOOK_URL", ""),
  WEBHOOK_SECRET: optional("WEBHOOK_SECRET", ""),
} as const;

import { CustomError } from "../errors/customError.error";

/**
 * Todo teléfono se guarda en E.164 (+593991234567): la API de WhatsApp lo exige
 * y así los mensajes se automatizan sin limpiar datos. Sin prefijo se asume
 * Ecuador, que es el caso normal del negocio.
 */
export function toE164(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let d = text.replace(/\D/g, "");
  if (text.startsWith("+")) return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null;
  if (d.startsWith("00")) d = d.slice(2);
  else if (/^0\d{9}$/.test(d)) d = `593${d.slice(1)}`; // 0991234567 (marcación nacional)
  else if (/^9\d{8}$/.test(d)) d = `593${d}`; // 991234567
  return /^[1-9]\d{7,14}$/.test(d) ? `+${d}` : null;
}

/** Igual que toE164 pero con error legible para el formulario. */
export function requireE164(raw: unknown, field = "teléfono"): string {
  const value = toE164(raw);
  if (!value) {
    throw new CustomError(
      `Escribe un ${field} válido con código de país, por ejemplo +593 99 123 4567`,
      400,
    );
  }
  return value;
}

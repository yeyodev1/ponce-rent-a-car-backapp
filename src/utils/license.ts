import { CustomError } from "../errors/customError.error";
import { GYE_OFFSET_MS } from "../services/pricing.service";

export interface LicenseData {
  licenseNumber: string;
  licenseExpiresAt: string;
  licenseCountry: string;
}

const NUMBER = /^[A-Z0-9]{4,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const LICENSE_EXPIRED_MESSAGE = "Tu licencia vence antes de la devolución del vehículo";

export function parseLicenseNumber(raw: unknown): string {
  // Se aceptan guiones y espacios al escribir; se guarda compacto para buscar y comparar.
  const value = String(raw ?? "")
    .replace(/[\s.-]/g, "")
    .toUpperCase();
  if (!NUMBER.test(value)) {
    throw new CustomError("El número de licencia debe tener entre 4 y 20 letras o números", 400);
  }
  return value;
}

/** YYYY-MM-DD que además sea una fecha real (rechaza 2026-02-31). */
export function parseLicenseDate(raw: unknown): string {
  const value = String(raw ?? "").trim();
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !DATE.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new CustomError("Indica la fecha de vencimiento de la licencia (AAAA-MM-DD)", 400);
  }
  return value;
}

export function parseLicenseCountry(raw: unknown, fallback: string): string {
  const value = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (!value) return fallback;
  if (!/^[A-Z]{2}$/.test(value)) {
    throw new CustomError("El país de emisión de la licencia debe ser un código de 2 letras", 400);
  }
  return value;
}

/**
 * Licencia del `driver`. En la web es obligatoria; en la reserva presencial se
 * valida si llega (el personal puede registrarla después en la ficha del cliente).
 */
export function parseDriverLicense(d: any, country: string, required: boolean): LicenseData | null {
  const hasAny = [d?.licenseNumber, d?.licenseExpiresAt].some((v) => String(v ?? "").trim());
  if (!hasAny && !required) return null;
  return {
    licenseNumber: parseLicenseNumber(d?.licenseNumber),
    licenseExpiresAt: parseLicenseDate(d?.licenseExpiresAt),
    licenseCountry: parseLicenseCountry(d?.licenseCountry, country),
  };
}

/** Fecha de devolución en Guayaquil como YYYY-MM-DD. */
function localDate(date: Date): string {
  return new Date(date.getTime() - GYE_OFFSET_MS).toISOString().slice(0, 10);
}

/** La licencia debe cubrir hasta el día de la devolución inclusive. */
export function assertLicenseCovers(license: LicenseData | null, returnAt: Date) {
  if (!license) return;
  if (license.licenseExpiresAt < localDate(returnAt)) {
    throw new CustomError(LICENSE_EXPIRED_MESSAGE, 400).withCode("license_expired");
  }
}

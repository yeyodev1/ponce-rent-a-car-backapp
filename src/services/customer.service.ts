import { CustomError } from "../errors/customError.error";
import { Customer } from "../models/customer.model";
import { parseLicenseCountry, parseLicenseDate, parseLicenseNumber } from "../utils/license";
import { requireE164 } from "../utils/phone";
import { assertObjectId } from "./catalog.service";
import { adminGetCustomer, findByAccess, publicView } from "./reservation.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Con la reserva cerrada ya no hay nada que coordinar: el contacto queda como estaba. */
const CLOSED_STATUSES = ["completed", "cancelled", "expired"];

function parseEmail(raw: unknown): string {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) throw new CustomError("Escribe un correo válido", 400);
  return email;
}

/**
 * PATCH /public/reservations/:code/contact — el cliente corrige su correo o
 * teléfono. Nombre y documento no: están atados a los documentos verificados.
 */
export async function updatePublicContact(code: string, token: string, body: any) {
  const reservation = await findByAccess(code, token);
  if (CLOSED_STATUSES.includes(reservation.status)) {
    throw new CustomError("Esta reserva ya no admite cambios de contacto", 409);
  }
  const set: Record<string, string> = {};
  if (body?.email !== undefined) set.email = parseEmail(body.email);
  if (body?.phone !== undefined) set.phone = requireE164(body.phone);
  if (!Object.keys(set).length) throw new CustomError("Indica el correo o el teléfono", 400);
  await Customer.updateOne({ _id: reservation.customer }, { $set: set });
  return publicView(reservation);
}

/** PATCH /admin/customers/:id — el personal corrige datos de contacto y la licencia. */
export async function adminUpdateCustomer(id: string, body: any) {
  assertObjectId(id, "el cliente");
  const customer = await Customer.findById(id);
  if (!customer) throw new CustomError("No se encontró el cliente", 404);

  if (body?.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (name.length < 3) throw new CustomError("Escribe el nombre completo del cliente", 400);
    customer.name = name.slice(0, 160);
  }
  if (body?.email !== undefined) customer.email = parseEmail(body.email);
  if (body?.phone !== undefined) customer.phone = requireE164(body.phone);
  // Vacío = borrar el dato (p. ej. una licencia mal cargada que el cliente traerá en persona).
  if (body?.licenseNumber !== undefined) {
    customer.licenseNumber = String(body.licenseNumber ?? "").trim()
      ? parseLicenseNumber(body.licenseNumber)
      : "";
  }
  if (body?.licenseExpiresAt !== undefined) {
    customer.licenseExpiresAt = String(body.licenseExpiresAt ?? "").trim()
      ? parseLicenseDate(body.licenseExpiresAt)
      : "";
  }
  if (body?.licenseCountry !== undefined) {
    customer.licenseCountry = parseLicenseCountry(body.licenseCountry, "");
  }
  if (body?.notes !== undefined) customer.notes = String(body.notes ?? "").slice(0, 5000);

  await customer.save();
  return adminGetCustomer(id);
}

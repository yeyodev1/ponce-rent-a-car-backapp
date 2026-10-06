import { CustomError } from "../errors/customError.error";
import { Reservation } from "../models/reservation.model";
import { assertObjectId } from "./catalog.service";
import { StaffRef } from "./reservation.service";

const ACTIONS = ["hold", "release", "charge"] as const;
const METHODS = ["datafast", "cash", "transfer"];
/** Desde qué estado se puede hacer cada acción (ciclo de la garantía). */
const FROM: Record<(typeof ACTIONS)[number], string> = {
  hold: "pending",
  release: "held",
  charge: "held",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "pendiente",
  held: "retenida",
  released: "liberada",
  charged: "cobrada",
  partially_charged: "cobrada parcialmente",
};

function cents(value: unknown, what: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new CustomError(`${what} debe ser un entero en centavos mayor a 0`, 400);
  }
  return n;
}

const text = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/**
 * PATCH /admin/reservations/:id/guarantee — la garantía física (voucher de
 * Datafast, efectivo o transferencia). No mueve dinero: deja constancia.
 * `isAdmin` lo decide el controller con el rol de la sesión.
 */
export async function updateGuarantee(
  reservationId: string,
  body: any,
  staff: StaffRef,
  isAdmin: boolean,
) {
  assertObjectId(reservationId, "la reserva");
  const action = String(body?.action ?? "") as (typeof ACTIONS)[number];
  if (!(ACTIONS as readonly string[]).includes(action)) {
    throw new CustomError('La acción debe ser "hold", "release" o "charge"', 400);
  }
  if (action === "charge" && !isAdmin) {
    throw new CustomError("Solo un administrador puede hacer esto", 403);
  }

  const reservation = await Reservation.findById(reservationId)
    .select("code status guarantee pricing.guaranteeAmount")
    .lean<any>();
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  const current = reservation.guarantee ?? {};
  const status: string = current.status || "pending";
  if (status !== FROM[action]) {
    throw new CustomError(
      `No se puede ${action === "hold" ? "retener" : action === "release" ? "liberar" : "cobrar"} una garantía ${STATUS_LABELS[status] ?? status}`,
      409,
    );
  }

  const now = new Date();
  const set: Record<string, unknown> = { "guarantee.updatedBy": staff };
  if (body?.notes !== undefined) set["guarantee.notes"] = text(body.notes, 1000);

  if (action === "hold") {
    if (["cancelled", "expired"].includes(reservation.status)) {
      throw new CustomError("La reserva está cerrada: no se puede retener la garantía", 409);
    }
    const method = String(body?.method ?? "");
    if (!METHODS.includes(method)) {
      throw new CustomError("El método debe ser Datafast, efectivo o transferencia", 400);
    }
    // Reservas anteriores a v1.3 no traen el monto inicializado: se toma el de la tarifa congelada.
    const amount =
      body?.amount !== undefined && body.amount !== null && body.amount !== ""
        ? cents(body.amount, "El monto")
        : current.amount || reservation.pricing?.guaranteeAmount || 0;
    if (!amount) throw new CustomError("Indica el monto de la garantía", 400);
    Object.assign(set, {
      "guarantee.status": "held",
      "guarantee.method": method,
      "guarantee.reference": text(body?.reference, 120),
      "guarantee.amount": amount,
      "guarantee.heldAt": now,
    });
  } else if (action === "release") {
    Object.assign(set, { "guarantee.status": "released", "guarantee.settledAt": now });
  } else {
    const chargedAmount = cents(body?.chargedAmount, "El monto cobrado");
    const amount = current.amount || 0;
    if (chargedAmount > amount) {
      throw new CustomError("No se puede cobrar más que el monto retenido", 400);
    }
    const chargeReason = text(body?.chargeReason, 1000);
    if (!chargeReason) throw new CustomError("Escribe el motivo del cobro", 400);
    Object.assign(set, {
      "guarantee.status": chargedAmount === amount ? "charged" : "partially_charged",
      "guarantee.chargedAmount": chargedAmount,
      "guarantee.chargeReason": chargeReason,
      "guarantee.settledAt": now,
    });
  }

  // El filtro por estado evita que dos clics simultáneos apliquen dos transiciones.
  const updated = await Reservation.findOneAndUpdate(
    { _id: reservation._id, "guarantee.status": status === "pending" ? { $in: ["pending", null] } : status },
    { $set: set },
    { new: true },
  )
    .select("code guarantee")
    .lean<any>();
  if (!updated) throw new CustomError("La garantía cambió mientras tanto; recarga la reserva", 409);
  return { code: updated.code, guarantee: updated.guarantee, action };
}

import { CustomError } from "../errors/customError.error";
import { Payment } from "../models/payment.model";
import { assertObjectId } from "./catalog.service";
import { recalculatePayments } from "./payment.service";
import { StaffRef } from "./reservation.service";

/** Ventana en la que un empleado puede corregir su propio error de registro. */
const STAFF_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * POST /admin/payments/:id/void — anula un pago manual registrado por error
 * (no entró dinero). Distinto del reembolso: ahí sí hubo dinero y se devolvió.
 */
export async function voidPayment(
  paymentId: string,
  body: any,
  staff: StaffRef,
  isAdmin: boolean,
) {
  assertObjectId(paymentId, "el pago");
  const reason = String(body?.reason ?? "")
    .trim()
    .slice(0, 500);
  if (reason.length < 3) throw new CustomError("Escribe el motivo de la anulación", 400);

  const payment = await Payment.findById(paymentId).select("-providerResponse").lean<any>();
  if (!payment) throw new CustomError("No se encontró el pago", 404);
  if (payment.provider !== "manual") {
    throw new CustomError(
      "Solo se anulan pagos registrados en el local; un pago en línea se reembolsa",
      409,
    );
  }
  if (payment.status !== "approved") {
    throw new CustomError("Solo se puede anular un pago aprobado", 409);
  }
  const registeredAt = new Date(payment.approvedAt || payment.createdAt).getTime();
  if (!isAdmin && Date.now() - registeredAt > STAFF_WINDOW_MS) {
    throw new CustomError(
      "Pasaron más de 24 horas desde el registro: solo un administrador puede anularlo",
      403,
    );
  }

  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "approved" },
    { $set: { status: "voided", voidedAt: new Date(), voidReason: reason, voidedBy: staff } },
    { new: true },
  )
    .select("-providerResponse")
    .lean<any>();
  if (!updated) throw new CustomError("Solo se puede anular un pago aprobado", 409);

  const totals = await recalculatePayments(payment.reservation);
  return { ...updated, reservationTotals: totals };
}

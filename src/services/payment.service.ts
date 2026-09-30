import crypto from "crypto";
import { Types } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Payment } from "../models/payment.model";
import { Reservation } from "../models/reservation.model";
import { assertObjectId } from "./catalog.service";
import { emitWebhook } from "./webhook.service";

const MANUAL_METHODS = ["cash", "transfer", "card"] as const;
/** Reservas que ya no admiten cobros: se cerraron sin alquiler. */
const CLOSED_STATUSES = ["cancelled", "expired"];
const PENDING_STATUSES = ["pending_documents", "pending_payment"];

export interface Staff {
  id: string;
  name: string;
  email: string;
}

export interface PaymentTotals {
  amountPaid: number;
  balance: number;
  paymentStatus: "pending" | "partial" | "paid" | "refunded";
  paymentMode: "deposit" | "full" | "";
}

/**
 * Único lugar que calcula lo pagado de una reserva: lo usan Payphone, los pagos
 * manuales y los reembolsos. Se recalcula desde los pagos (no se suma/resta
 * sobre el valor guardado) para que dos operaciones simultáneas no descuadren.
 */
export async function recalculatePayments(reservationId: unknown): Promise<PaymentTotals> {
  const id = new Types.ObjectId(String(reservationId));
  const [reservation, rows] = await Promise.all([
    Reservation.findById(id).select("pricing.total").lean<any>(),
    Payment.aggregate<{ _id: string; total: number; count: number }>([
      { $match: { reservation: id, status: { $in: ["approved", "refunded"] } } },
      { $group: { _id: "$status", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);

  const total = reservation.pricing?.total ?? 0;
  const approved = rows.find((r) => r._id === "approved");
  const refundedCount = rows.find((r) => r._id === "refunded")?.count ?? 0;
  const amountPaid = approved?.total ?? 0;
  const balance = Math.max(total - amountPaid, 0);

  let paymentStatus: PaymentTotals["paymentStatus"] = "pending";
  if (amountPaid === 0) paymentStatus = refundedCount > 0 ? "refunded" : "pending";
  else paymentStatus = amountPaid >= total ? "paid" : "partial";

  const paymentMode: PaymentTotals["paymentMode"] =
    amountPaid === 0 ? "" : balance === 0 ? "full" : "deposit";

  const totals = { amountPaid, balance, paymentStatus, paymentMode };
  await Reservation.updateOne({ _id: id }, { $set: totals });
  return totals;
}

function publicPayment(payment: any) {
  const { providerResponse: _raw, ...rest } = payment;
  return rest;
}

/** POST /admin/reservations/:id/payments — efectivo, transferencia o tarjeta en el local. */
export async function addManualPayment(reservationId: string, body: any, staff: Staff) {
  assertObjectId(reservationId, "la reserva");
  const amount = body?.amount;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new CustomError("El monto debe ser un entero en centavos mayor a 0", 400);
  }
  const method = String(body?.method ?? "");
  if (!(MANUAL_METHODS as readonly string[]).includes(method)) {
    throw new CustomError("El método de pago debe ser efectivo, transferencia o tarjeta", 400);
  }
  const note = String(body?.note ?? "")
    .trim()
    .slice(0, 500);

  const reservation = await Reservation.findById(reservationId)
    .select("code status holdExpiresAt")
    .lean<any>();
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  if (CLOSED_STATUSES.includes(reservation.status)) {
    throw new CustomError("No se pueden registrar pagos en una reserva cancelada o expirada", 409);
  }

  const now = new Date();
  const payment = await Payment.create({
    reservation: reservation._id,
    reservationCode: reservation.code,
    provider: "manual",
    mode: "manual",
    method,
    registeredBy: staff,
    note,
    amount,
    currency: "USD",
    clientTransactionId: `MANUAL-${reservation.code}-${now.getTime().toString(36)}${crypto.randomBytes(3).toString("hex")}`,
    status: "approved",
    approvedAt: now,
  });

  // No se confirma sola (eso lo hace el personal), pero una reserva web con dinero
  // recibido ya no puede vencer por el hold de 20 minutos mientras la confirman.
  if (PENDING_STATUSES.includes(reservation.status) && reservation.holdExpiresAt) {
    await Reservation.updateOne({ _id: reservation._id }, { $set: { holdExpiresAt: null } });
  }
  await recalculatePayments(reservation._id);

  await emitWebhook("payment.approved", {
    reservationCode: reservation.code,
    clientTransactionId: payment.clientTransactionId,
    transactionId: "",
    mode: "manual",
    method,
    amount,
    currency: "USD",
    registeredBy: staff,
  });

  return publicPayment(payment.toObject());
}

/**
 * POST /admin/payments/:id/refund — registra el reembolso. No mueve dinero en
 * Payphone: la devolución se hace en el proveedor o en caja y aquí queda anotada.
 */
export async function refundPayment(paymentId: string) {
  assertObjectId(paymentId, "el pago");
  const payment = await Payment.findOneAndUpdate(
    { _id: paymentId, status: "approved" },
    { $set: { status: "refunded", refundedAt: new Date() } },
    { new: true },
  ).lean<any>();
  if (!payment) {
    if (!(await Payment.exists({ _id: paymentId })))
      throw new CustomError("No se encontró el pago", 404);
    throw new CustomError("Solo se puede reembolsar un pago aprobado", 409);
  }
  await recalculatePayments(payment.reservation);
  return publicPayment(payment);
}

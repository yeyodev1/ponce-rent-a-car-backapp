import crypto from "crypto";
import axios from "axios";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { Customer } from "../models/customer.model";
import { Lead } from "../models/lead.model";
import { Payment } from "../models/payment.model";
import { Reservation } from "../models/reservation.model";
import { assignUnitToReservation, freeVehicles, syncVehicleStatus } from "./availability.service";
import { sendReservationConfirmed } from "./bookingEmail.service";
import { sendCapiEvent } from "./metaCapi.service";
import { recalculatePayments } from "./payment.service";
import { findByAccess, webhookPayload } from "./reservation.service";
import { emitWebhook } from "./webhook.service";

const CONFIRM_URL = "https://paymentbox.payphonetodoesposible.com/api/confirm";
/** La Cajita vence a los 10 minutos: el hold debe cubrir al menos ese tiempo mientras el cliente paga. */
const CHECKOUT_HOLD_MS = 15 * 60 * 1000;

export function isPayphoneEnabled(): boolean {
  return Boolean(env.PAYPHONE_TOKEN && env.PAYPHONE_STORE_ID);
}

/** Payphone espera el teléfono en formato internacional (+593...). */
function toInternationalPhone(raw: string, country: string): string {
  const trimmed = String(raw ?? "").trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("593")) return `+${digits}`;
  if ((country || "EC") === "EC" && digits.startsWith("0")) return `+593${digits.slice(1)}`;
  return `+${digits}`;
}

/** Único por intento y ≤ 50 caracteres (límite de Payphone). */
function newClientTransactionId(code: string): string {
  const base = code
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 20);
  return `${base}-${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`.slice(0, 50);
}

export async function createCheckout(code: string, token: string, modeRaw: unknown) {
  const reservation = await findByAccess(code, token);
  const requested = modeRaw === "full" ? "full" : modeRaw === "deposit" ? "deposit" : null;
  if (!requested) throw new CustomError("Elige pagar el depósito o el total", 400);

  let mode: "deposit" | "full" | "balance";
  let amount: number;
  if (reservation.status === "pending_payment") {
    mode = requested;
    if (mode === "deposit" && !(reservation.pricing.deposit > 0)) {
      throw new CustomError("Esta reserva no admite depósito: elige pagar el total", 400);
    }
    amount = mode === "deposit" ? reservation.pricing.deposit : reservation.pricing.total;
  } else if (
    reservation.status === "confirmed" &&
    reservation.balance > 0 &&
    requested === "full"
  ) {
    mode = "balance";
    amount = reservation.balance;
  } else if (reservation.status === "pending_documents") {
    throw new CustomError("Sube tu licencia y tu documento de identidad antes de pagar", 409);
  } else if (reservation.status === "expired") {
    throw new CustomError("El tiempo para completar la reserva venció. Vuelve a cotizar", 409);
  } else {
    throw new CustomError("Esta reserva no tiene pagos pendientes", 409);
  }

  if (!isPayphoneEnabled()) throw new CustomError("Los pagos en línea aún no están activos", 503);
  if (!(amount > 0)) throw new CustomError("No hay monto por cobrar", 409);

  const customer = await Customer.findById(reservation.customer).lean<any>();
  if (!customer) throw new CustomError("No se encontró el cliente de la reserva", 404);

  const clientTransactionId = newClientTransactionId(reservation.code);
  await Payment.create({
    reservation: reservation._id,
    reservationCode: reservation.code,
    provider: "payphone",
    mode,
    method: "card",
    amount,
    currency: "USD",
    clientTransactionId,
    status: "pending",
  });

  if (reservation.status === "pending_payment") {
    const minHold = new Date(Date.now() + CHECKOUT_HOLD_MS);
    if (!reservation.holdExpiresAt || reservation.holdExpiresAt < minHold) {
      reservation.holdExpiresAt = minHold;
      await reservation.save();
    }
  }

  return {
    token: env.PAYPHONE_TOKEN,
    storeId: env.PAYPHONE_STORE_ID,
    clientTransactionId,
    amount,
    amountWithoutTax: amount,
    currency: "USD",
    reference: `Reserva ${reservation.code}`.slice(0, 100),
    email: customer.email,
    phoneNumber: toInternationalPhone(customer.phone, customer.country),
    documentId: customer.documentNumber,
    mode,
  };
}

type ConfirmStatus = "approved" | "canceled" | "error";

async function accessTokenOf(reservationId: unknown): Promise<string> {
  const r = await Reservation.findById(reservationId).select("+accessToken code").lean<any>();
  return r?.accessToken ?? "";
}

/**
 * Si el hold venció mientras el cliente pagaba, la unidad pudo pasar a otra
 * reserva. El pago ya entró, así que la reserva se confirma igual: se busca
 * otra unidad libre (con el mismo candado transaccional que una reserva nueva)
 * o queda sin asignar para que el personal la resuelva.
 */
async function ensureVehicle(reservation: any): Promise<void> {
  const id = String(reservation._id);
  const previous = reservation.vehicle ? String(reservation.vehicle) : null;
  const free = await freeVehicles(
    String(reservation.category),
    reservation.pickupAt,
    reservation.returnAt,
    id,
  );
  // Primero su propia unidad; si ya la tomó otra reserva, cualquier libre de la categoría.
  const candidates = [
    ...(previous ? [previous] : []),
    ...free.map((v) => String(v._id)).filter((v) => v !== previous),
  ];
  let assigned: string | null = null;
  for (const candidate of candidates) {
    // El estado viaja dentro de la transacción: así la reserva ya ocupa la unidad al soltar el candado.
    if (
      await assignUnitToReservation(reservation, candidate, {
        status: "confirmed",
        holdExpiresAt: null,
      })
    ) {
      assigned = candidate;
      break;
    }
  }
  reservation.vehicle = assigned;
  if (!assigned) {
    reservation.notes = `${reservation.notes ? `${reservation.notes}\n` : ""}[${new Date().toISOString()}] Pago aprobado sin unidad libre: asignar una manualmente.`;
  }
  if (previous && previous !== assigned) await syncVehicleStatus(previous);
}

export async function confirmPayment(body: any, meta: { ip?: string; userAgent?: string }) {
  const id = Number(body?.id);
  const clientTransactionId = String(body?.clientTransactionId ?? "").trim();
  if (!Number.isFinite(id) || id <= 0 || !clientTransactionId) {
    throw new CustomError("Faltan los datos de la transacción", 400);
  }

  const payment = await Payment.findOne({ clientTransactionId });
  if (!payment) throw new CustomError("No se encontró el pago", 404);

  const reservationCode = payment.reservationCode;
  const done = async (status: ConfirmStatus, message: string) => ({
    status,
    reservationCode,
    accessToken: status === "approved" ? await accessTokenOf(payment.reservation) : "",
    message,
  });

  // Idempotencia: la página de respuesta se recarga más de lo que uno cree.
  if (payment.status === "approved") return done("approved", "Pago aprobado");
  if (payment.status === "canceled") return done("canceled", "El pago fue cancelado");

  if (!isPayphoneEnabled()) throw new CustomError("Los pagos en línea aún no están activos", 503);

  let data: any;
  try {
    const response = await axios.post(
      CONFIRM_URL,
      { id, clientTxId: clientTransactionId },
      { headers: { Authorization: `Bearer ${env.PAYPHONE_TOKEN}` }, timeout: 20000 },
    );
    data = response.data;
  } catch (error: any) {
    const providerData = error?.response?.data;
    if (providerData) {
      // Error funcional de Payphone ({ message, errorCode }): se guarda para soporte y el pago
      // queda pendiente por si el cliente reintenta con la misma transacción.
      await Payment.updateOne(
        { _id: payment._id, status: "pending" },
        { $set: { providerResponse: providerData } },
      );
      return done("error", providerData.message || "Payphone no pudo confirmar el pago");
    }
    throw new CustomError(
      "No se pudo contactar a Payphone. Intenta de nuevo en unos segundos",
      502,
    );
  }

  const statusCode = Number(data?.statusCode);
  if (statusCode === 2) {
    await Payment.updateOne(
      { _id: payment._id, status: "pending" },
      {
        $set: {
          status: "canceled",
          providerResponse: data,
          transactionId: String(data?.transactionId ?? id),
        },
      },
    );
    return done("canceled", "El pago fue cancelado");
  }
  if (statusCode !== 3) {
    await Payment.updateOne(
      { _id: payment._id, status: "pending" },
      { $set: { providerResponse: data } },
    );
    return done("error", data?.message || "El pago no fue aprobado");
  }

  if (Number(data.amount) !== payment.amount) {
    await Payment.updateOne(
      { _id: payment._id, status: "pending" },
      { $set: { status: "error", providerResponse: data } },
    );
    console.error(
      `[payphone] monto distinto en ${clientTransactionId}: esperado ${payment.amount}, recibido ${data.amount}`,
    );
    return done("error", "El monto cobrado no coincide con la reserva. Contáctanos para revisarlo");
  }

  // Reclamo atómico: si dos confirmaciones llegan juntas, solo una aplica efectos.
  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: "pending" },
    {
      $set: {
        status: "approved",
        method: "card",
        approvedAt: new Date(),
        transactionId: String(data.transactionId ?? id),
        providerResponse: data,
      },
    },
    { new: true },
  );
  if (!claimed) return done("approved", "Pago aprobado");

  // Se recalcula antes de cargar la reserva: el save de abajo no debe pisar los totales.
  await recalculatePayments(payment.reservation);
  const reservation = await Reservation.findById(payment.reservation).select("+accessToken");
  if (!reservation) throw new CustomError("No se encontró la reserva del pago", 404);

  const firstConfirmation = !["confirmed", "delivered", "completed"].includes(reservation.status);
  if (firstConfirmation) {
    if (reservation.status === "expired" || reservation.status === "cancelled")
      await ensureVehicle(reservation);
    reservation.status = "confirmed";
    reservation.holdExpiresAt = null;
  }
  await reservation.save();
  await syncVehicleStatus(reservation.vehicle);

  const customer = firstConfirmation
    ? await Customer.findByIdAndUpdate(
        reservation.customer,
        { $inc: { totalRentals: 1 } },
        { new: true },
      ).lean<any>()
    : await Customer.findById(reservation.customer).lean<any>();

  if (reservation.lead) {
    await Lead.updateOne(
      { _id: reservation.lead, status: { $in: ["new", "contacted", "quoted"] } },
      { $set: { status: "reserved", customer: reservation.customer } },
    );
  }

  const payload = await webhookPayload(reservation);
  await Promise.all([
    firstConfirmation
      ? sendReservationConfirmed({
          reservation,
          customer,
          accessToken: reservation.accessToken,
          paidNow: claimed.amount,
        })
      : Promise.resolve(),
    emitWebhook("payment.approved", {
      reservationCode,
      clientTransactionId,
      transactionId: claimed.transactionId,
      mode: claimed.mode,
      method: "card",
      amount: claimed.amount,
      currency: "USD",
    }),
    firstConfirmation ? emitWebhook("reservation.confirmed", payload) : Promise.resolve(),
    sendCapiEvent({
      event: "Purchase",
      // Mismo id que puede mandar el Pixel desde la página de respuesta, para deduplicar.
      eventId: `purchase-${clientTransactionId}`,
      email: customer?.email,
      phone: customer?.phone,
      value: claimed.amount,
      sourceUrl: reservation.attribution?.landingPage || undefined,
      ip: meta.ip,
      userAgent: meta.userAgent,
      fbclid: reservation.attribution?.fbclid || undefined,
    }),
  ]);

  return {
    status: "approved" as ConfirmStatus,
    reservationCode,
    accessToken: reservation.accessToken,
    message: "Pago aprobado",
  };
}

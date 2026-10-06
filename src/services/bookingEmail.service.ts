import { env } from "../config/env";
import { layout, sendEmail } from "./email.service";
import { formatLocal } from "./pricing.service";
import { getSettings } from "./settings.service";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(cents: number): string {
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 0;color:#71717a;width:45%">${label}</td><td style="padding:6px 0;font-weight:bold">${value}</td></tr>`;
}

/** Enlace para que el cliente vuelva a su reserva sin cuenta (lleva el token de acceso). */
export function reservationLink(code: string, accessToken: string): string {
  return `${env.FRONTEND_URL.replace(/\/$/, "")}/reserva/${encodeURIComponent(code)}?t=${accessToken}`;
}

/**
 * PDF del contrato con el token de la reserva. Sin API_PUBLIC_URL no se conoce la
 * URL absoluta del API: se manda a la página de la reserva, que tiene el botón de descarga.
 */
export function contractPdfLink(code: string, accessToken: string): string {
  if (!env.API_PUBLIC_URL) return reservationLink(code, accessToken);
  return `${env.API_PUBLIC_URL}/api/public/reservations/${encodeURIComponent(code)}/contract.pdf?t=${accessToken}`;
}

/**
 * Correo de reserva confirmada, en el idioma que eligió el cliente, y aviso
 * al asesor. Nunca lanza: sendEmail ya absorbe los fallos.
 */
export async function sendReservationConfirmed(params: {
  reservation: any;
  customer: any;
  accessToken: string;
  paidNow: number;
}): Promise<void> {
  const { reservation, customer, accessToken, paidNow } = params;
  const settings = await getSettings();
  const en = reservation.language === "en";
  const lang = en ? "en" : "es";
  const location = (code: string) =>
    settings.booking.locations.find((l) => l.code === code)?.label?.[lang] ?? code;
  const category = reservation.categoryName?.[lang] || reservation.categorySlug;
  const link = reservationLink(reservation.code, accessToken);
  const contractLink = contractPdfLink(reservation.code, accessToken);
  const guarantee = money(reservation.pricing?.guaranteeAmount ?? settings.booking.guaranteeAmount);

  const lines = (reservation.pricing?.lines ?? [])
    .map((l: any) => row(esc(l.label?.[lang] ?? l.key), money(l.amount)))
    .join("");

  const t = en
    ? {
        subject: `Your reservation ${reservation.code} is confirmed`,
        title: "Reservation confirmed",
        hi: `Hi ${esc(customer?.name)}, your vehicle is booked. Here are the details:`,
        code: "Reservation code",
        vehicle: "Vehicle",
        pickup: "Pick-up",
        ret: "Return",
        total: "Total",
        paid: "Paid online",
        balance: "Balance due at pick-up",
        guarantee: `At pick-up we will place a refundable security hold of ${guarantee} on a credit card (Datafast). It is not charged online.`,
        docs: "Please bring your original driver's license and ID or passport.",
        cta: "View my reservation",
        contract: "Download your rental agreement (PDF)",
        help: `Questions? WhatsApp us at +${esc(settings.business.whatsapp)}.`,
      }
    : {
        subject: `Tu reserva ${reservation.code} está confirmada`,
        title: "Reserva confirmada",
        hi: `Hola ${esc(customer?.name)}, tu vehículo quedó reservado. Estos son los detalles:`,
        code: "Código de reserva",
        vehicle: "Vehículo",
        pickup: "Retiro",
        ret: "Devolución",
        total: "Total",
        paid: "Pagado en línea",
        balance: "Saldo a pagar al retirar",
        guarantee: `Al retirar se bloquea una garantía reembolsable de ${guarantee} en tarjeta de crédito (Datafast). No se cobra en línea.`,
        docs: "Trae tu licencia de conducir y tu cédula o pasaporte originales.",
        cta: "Ver mi reserva",
        contract: "Descargar tu contrato de alquiler (PDF)",
        help: `¿Dudas? Escríbenos por WhatsApp al +${esc(settings.business.whatsapp)}.`,
      };

  const body = `
    <p>${t.hi}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      ${row(t.code, esc(reservation.code))}
      ${row(t.vehicle, `${esc(category)}`)}
      ${row(t.pickup, `${esc(formatLocal(reservation.pickupAt))} · ${esc(location(reservation.pickupLocation))}`)}
      ${row(t.ret, `${esc(formatLocal(reservation.returnAt))} · ${esc(location(reservation.returnLocation))}`)}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-top:1px solid #e4e4e7">
      ${lines}
      ${row(t.total, money(reservation.pricing?.total ?? 0))}
      ${row(t.paid, money(reservation.amountPaid))}
      ${row(t.balance, money(reservation.balance))}
    </table>
    <p style="background:#f4f4f5;padding:12px 16px;border-radius:8px">${t.guarantee}</p>
    <p>${t.docs}</p>
    <p style="margin:24px 0"><a href="${esc(link)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${t.cta}</a></p>
    <p><a href="${esc(contractLink)}" style="color:#1d4ed8;font-weight:bold">${t.contract}</a></p>
    <p style="color:#71717a">${t.help}</p>`;

  const tasks: Promise<boolean>[] = [];
  if (customer?.email) tasks.push(sendEmail(customer.email, t.subject, layout(t.title, body)));

  if (env.ADVISOR_EMAIL) {
    const advisorBody = `
      <p>Se confirmó un pago en línea de <b>${money(paidNow)}</b>.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
        ${row("Reserva", esc(reservation.code))}
        ${row("Cliente", esc(customer?.name))}
        ${row("Documento", `${esc(customer?.documentType)} ${esc(customer?.documentNumber)}`)}
        ${row("Teléfono", esc(customer?.phone))}
        ${row("Correo", esc(customer?.email))}
        ${row("Categoría", esc(reservation.categoryName?.es || reservation.categorySlug))}
        ${row("Retiro", `${esc(formatLocal(reservation.pickupAt))} · ${esc(location(reservation.pickupLocation))}`)}
        ${row("Devolución", `${esc(formatLocal(reservation.returnAt))} · ${esc(location(reservation.returnLocation))}`)}
        ${row("Total", money(reservation.pricing?.total ?? 0))}
        ${row("Pagado", money(reservation.amountPaid))}
        ${row("Saldo", money(reservation.balance))}
        ${row("Idioma", reservation.language === "en" ? "Inglés" : "Español")}
      </table>
      <p>Revisa los documentos y la verificación en el panel.</p>`;
    tasks.push(
      sendEmail(env.ADVISOR_EMAIL, `Reserva confirmada ${reservation.code}`, layout("Nueva reserva pagada", advisorBody)),
    );
  }

  await Promise.all(tasks);
}

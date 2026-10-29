import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Coverage } from "../models/coverage.model";
import { Extra } from "../models/extra.model";
import { Promotion } from "../models/content.model";
import { BILLING_TYPES, BillingType, IPriceLine, IPricing } from "../models/reservation.model";
import { ISetting } from "../models/setting.model";
import { I18nText } from "../models/shared.schema";
import { countAvailableUnits } from "./availability.service";
import { getSettings } from "./settings.service";

/**
 * Guayaquil es UTC-5 todo el año (Ecuador no tiene horario de verano), así que
 * un desfase fijo es exacto y evita depender de la base de zonas del runtime.
 */
export const GYE_OFFSET_MS = 5 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Una fecha sin zona ("2026-10-05T10:00") se interpreta como hora de Guayaquil:
 * en Vercel el runtime corre en UTC y la leería 5 horas corrida.
 */
export function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = value.trim();
  if (!raw) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const withTime = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw;
  const date = new Date(hasZone ? withTime : `${withTime}-05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Componentes de fecha en hora de Guayaquil. */
export function localParts(date: Date): { year: number; month: number; day: number } {
  const local = new Date(date.getTime() - GYE_OFFSET_MS);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() };
}

/** Instante UTC que corresponde a una fecha/hora local de Guayaquil. */
export function fromLocal(
  year: number,
  month: number,
  day: number,
  h = 0,
  m = 0,
  s = 0,
  ms = 0,
): Date {
  return new Date(Date.UTC(year, month, day, h, m, s, ms) + GYE_OFFSET_MS);
}

/** "2026-10-05 10:00" en hora de Guayaquil, para correos y CSV. */
export function formatLocal(date: Date | null | undefined): string {
  if (!date) return "";
  const d = new Date(new Date(date).getTime() - GYE_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function rentalDays(pickupAt: Date, returnAt: Date): number {
  const hours = (returnAt.getTime() - pickupAt.getTime()) / HOUR_MS;
  return Math.max(1, Math.ceil(hours / 24));
}

export type QuoteErrorCode =
  "too_far" | "too_soon" | "return_before_pickup" | "unavailable" | "in_past";

/** Margen para que el personal registre una reserva "para ahora" mientras llena el formulario. */
const STAFF_PAST_TOLERANCE_MS = 15 * 60 * 1000;

export interface QuoteExtraInput {
  code: string;
  quantity: number;
}

export interface QuoteInput {
  categorySlug: string;
  pickupAt: Date;
  returnAt: Date;
  pickupLocation: string;
  returnLocation: string;
  mileage: "limited" | "unlimited";
  coverage: string;
  extras: QuoteExtraInput[];
  promoCode: string;
  /** final = consumidor final (precio del paso 1); invoice = factura con datos (+ IVA). */
  billingType: BillingType;
}

/** IVA vigente en Ecuador (2024+). Solo se suma cuando el cliente pide factura con datos. */
export const TAX_RATE = 0.15;

export interface QuoteResult {
  days: number;
  available: boolean;
  availableUnits: number;
  lines: IPriceLine[];
  total: number;
  deposit: number;
  guaranteeAmount: number;
  mileageInfo: { includedKm: number | null; extraKmPrice: number };
  /** Conceptos que se cotizan aparte (entrega en otra dirección). Texto en español. */
  pendingItems: string[];
  errors: string[];
  errorCodes: QuoteErrorCode[];
}

export function parseBillingType(raw: unknown): BillingType {
  const type = raw && typeof raw === "object" ? (raw as { type?: unknown }).type : raw;
  if (type === undefined || type === null || type === "") return "final";
  if (!(BILLING_TYPES as readonly string[]).includes(String(type))) {
    throw new CustomError("El tipo de facturación debe ser consumidor final o factura con datos", 400);
  }
  return String(type) as BillingType;
}

/** Normaliza y valida la forma del body. Errores de forma → 400; reglas de negocio → `errors`. */
export function parseQuoteInput(body: any): QuoteInput {
  const b = body ?? {};
  const categorySlug = String(b.categorySlug ?? "")
    .trim()
    .toLowerCase();
  if (!categorySlug) throw new CustomError("Elige una categoría de vehículo", 400);

  const pickupAt = parseDateInput(b.pickupAt);
  const returnAt = parseDateInput(b.returnAt);
  if (!pickupAt) throw new CustomError("La fecha y hora de retiro no es válida", 400);
  if (!returnAt) throw new CustomError("La fecha y hora de devolución no es válida", 400);

  const pickupLocation = String(b.pickupLocation ?? "").trim();
  const returnLocation = String(b.returnLocation ?? "").trim() || pickupLocation;
  if (!pickupLocation) throw new CustomError("Elige el lugar de retiro", 400);

  // Ilimitado es lo incluido por defecto; "limitado" es la opción para ahorrar.
  const mileage = b.mileage === "limited" ? "limited" : "unlimited";
  if (b.mileage && !["limited", "unlimited"].includes(b.mileage)) {
    throw new CustomError("Tipo de kilometraje inválido", 400);
  }

  // Se agrupan por código: el mismo extra enviado dos veces suma cantidades.
  const extrasMap = new Map<string, number>();
  if (b.extras !== undefined && !Array.isArray(b.extras)) {
    throw new CustomError("Los extras deben ser una lista", 400);
  }
  for (const item of (b.extras ?? []) as any[]) {
    const code = String(item?.code ?? "")
      .trim()
      .toLowerCase();
    const quantity = item?.quantity === undefined ? 1 : Number(item.quantity);
    if (!code) continue;
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new CustomError(`Cantidad inválida para el extra "${code}"`, 400);
    }
    if (quantity === 0) continue;
    extrasMap.set(code, (extrasMap.get(code) ?? 0) + quantity);
  }

  return {
    categorySlug,
    pickupAt,
    returnAt,
    pickupLocation,
    returnLocation,
    mileage,
    coverage: String(b.coverage ?? "")
      .trim()
      .toLowerCase(),
    extras: [...extrasMap].map(([code, quantity]) => ({ code, quantity })),
    promoCode: String(b.promoCode ?? "").trim(),
    billingType: parseBillingType(b.billing),
  };
}

/** Kilometraje de la categoría si lo tiene; si no, el general. */
export function mileageRules(category: any, booking: ISetting["booking"]) {
  const general = booking.mileage;
  const own = category?.mileage;
  return {
    limitedKmPerDay: Number(own?.limitedKmPerDay ?? general.limitedKmPerDay) || 0,
    extraKmPrice: Number(own?.extraKmPrice ?? general.extraKmPrice) || 0,
    unlimitedPricePerDay: Number(own?.unlimitedPricePerDay ?? general.unlimitedPricePerDay) || 0,
    limitedDiscountPerDay: Number(own?.limitedDiscountPerDay ?? general.limitedDiscountPerDay) || 0,
  };
}

/** Garantía de la categoría; 0 = la general de la configuración. */
export function guaranteeFor(category: any, booking: ISetting["booking"]): number {
  return Number(category?.guarantee) > 0 ? Number(category.guarantee) : booking.guaranteeAmount;
}

/** Hotel/domicilio u otra dirección sin tarifa cargada: el traslado se cotiza al coordinar. */
function isPendingLocation(loc: { code: string; fee: number }): boolean {
  return (loc.code === "other" || loc.code === "hotel") && !(loc.fee > 0);
}

/** Ventana de reserva online: entre ahora+minHoursNotice y el fin del día hoy+maxDaysAhead (Guayaquil). */
export function validateWindow(
  booking: ISetting["booking"],
  pickupAt: Date,
  returnAt: Date,
  now = new Date(),
): { errors: string[]; errorCodes: QuoteErrorCode[] } {
  const errors: string[] = [];
  const errorCodes: QuoteErrorCode[] = [];

  if (returnAt.getTime() <= pickupAt.getTime()) {
    errors.push("La devolución debe ser posterior al retiro");
    errorCodes.push("return_before_pickup");
  }

  const minPickup = now.getTime() + booking.minHoursNotice * HOUR_MS;
  if (pickupAt.getTime() < minPickup) {
    errors.push(`El retiro debe ser con al menos ${booking.minHoursNotice} horas de anticipación`);
    errorCodes.push("too_soon");
  }

  const today = localParts(now);
  const lastMoment = fromLocal(
    today.year,
    today.month,
    today.day + booking.maxDaysAhead,
    23,
    59,
    59,
    999,
  );
  if (pickupAt.getTime() > lastMoment.getTime()) {
    errors.push(
      `La fecha de retiro supera el máximo de ${booking.maxDaysAhead} días. Para fechas más lejanas escríbenos por WhatsApp`,
    );
    errorCodes.push("too_far");
  }

  return { errors, errorCodes };
}

/**
 * Ventana del personal (reserva presencial): sin tope de días ni aviso mínimo,
 * solo que el retiro no quede en el pasado.
 */
export function validateStaffWindow(
  pickupAt: Date,
  returnAt: Date,
  now = new Date(),
): { errors: string[]; errorCodes: QuoteErrorCode[] } {
  const errors: string[] = [];
  const errorCodes: QuoteErrorCode[] = [];
  if (returnAt.getTime() <= pickupAt.getTime()) {
    errors.push("La devolución debe ser posterior al retiro");
    errorCodes.push("return_before_pickup");
  }
  if (pickupAt.getTime() < now.getTime() - STAFF_PAST_TOLERANCE_MS) {
    errors.push("La fecha de retiro ya pasó");
    errorCodes.push("in_past");
  }
  return { errors, errorCodes };
}

export function computeDeposit(booking: ISetting["booking"], total: number): number {
  if (booking.depositMode === "none") return 0;
  if (booking.depositMode === "percent") {
    return Math.min(total, Math.round((total * booking.depositValue) / 100));
  }
  return Math.min(total, Math.max(0, booking.depositValue));
}

function plural(n: number, es: [string, string], en: [string, string]): I18nText {
  return { es: n === 1 ? es[0] : es[1], en: n === 1 ? en[0] : en[1] };
}

export interface ComputedQuote {
  input: QuoteInput;
  category: any;
  settings: ISetting;
  quote: QuoteResult;
  pricing: IPricing;
}

/**
 * Cotiza en el servidor. La reserva usa esta misma función: el total que se
 * cobra nunca viene del navegador.
 */
export async function computeQuote(
  input: QuoteInput,
  options: {
    excludeReservationId?: string;
    skipAvailability?: boolean;
    window?: "public" | "staff";
  } = {},
): Promise<ComputedQuote> {
  const settings = await getSettings();
  const booking = settings.booking;

  const category = await Category.findOne({ slug: input.categorySlug, isActive: true }).lean<any>();
  if (!category) throw new CustomError("La categoría no existe o no está disponible", 404);

  const coverage = input.coverage
    ? await Coverage.findOne({ code: input.coverage, isActive: true }).lean<any>()
    : ((await Coverage.findOne({ isDefault: true, isActive: true }).lean<any>()) ??
      (await Coverage.findOne({ isActive: true }).sort({ order: 1 }).lean<any>()));
  if (input.coverage && !coverage) throw new CustomError("La cobertura elegida no existe", 400);

  const extraDocs = input.extras.length
    ? await Extra.find({ code: { $in: input.extras.map((e) => e.code) }, isActive: true }).lean<
        any[]
      >()
    : [];

  const locationOf = (code: string) => booking.locations.find((l) => l.code === code);
  const pickupLoc = locationOf(input.pickupLocation);
  const returnLoc = locationOf(input.returnLocation);
  if (!pickupLoc) throw new CustomError("El lugar de retiro no es válido", 400);
  if (!returnLoc) throw new CustomError("El lugar de devolución no es válido", 400);

  const days = rentalDays(input.pickupAt, input.returnAt);
  const dayWord = plural(days, ["día", "días"], ["day", "days"]);
  const lines: IPriceLine[] = [];

  lines.push({
    key: "base",
    label: {
      es: `${category.name?.es || category.slug} × ${days} ${dayWord.es}`,
      en: `${category.name?.en || category.name?.es || category.slug} × ${days} ${dayWord.en}`,
    },
    amount: category.pricePerDay * days,
  });

  const { limitedKmPerDay, extraKmPrice, unlimitedPricePerDay, limitedDiscountPerDay } =
    mileageRules(category, booking);
  const includedKm = input.mileage === "limited" ? limitedKmPerDay * days : null;
  if (input.mileage === "limited") {
    // Limitado = opción para ahorrar: descuento por día (o $0 si la categoría no lo da).
    const saving = limitedDiscountPerDay * days;
    lines.push({
      key: "mileage",
      label: {
        es: `Kilometraje limitado (${includedKm} km incluidos)${saving ? " · ahorro" : ""}`,
        en: `Limited mileage (${includedKm} km included)${saving ? " · savings" : ""}`,
      },
      amount: -saving,
    });
  } else if (unlimitedPricePerDay > 0) {
    lines.push({
      key: "mileage",
      label: {
        es: `Kilometraje ilimitado × ${days} ${dayWord.es}`,
        en: `Unlimited mileage × ${days} ${dayWord.en}`,
      },
      amount: unlimitedPricePerDay * days,
    });
  } else {
    // El precio base ya incluye kilometraje ilimitado: se muestra en $0 para que se vea.
    lines.push({
      key: "mileage",
      label: { es: "Kilometraje ilimitado incluido", en: "Unlimited mileage included" },
      amount: 0,
    });
  }

  if (coverage) {
    lines.push({
      key: "coverage",
      // El nombre ya dice "Cobertura ..." (lo edita el admin): se usa tal cual.
      label: {
        es: `${coverage.name?.es || coverage.code}${coverage.pricePerDay ? ` × ${days} ${dayWord.es}` : ""}`,
        en: `${coverage.name?.en || coverage.name?.es || coverage.code}${coverage.pricePerDay ? ` × ${days} ${dayWord.en}` : ""}`,
      },
      amount: coverage.pricePerDay * days,
    });
  }

  for (const item of input.extras) {
    const extra = extraDocs.find((e) => e.code === item.code);
    if (!extra)
      throw new CustomError(`El extra "${item.code}" no existe o no está disponible`, 400);
    if (item.quantity > extra.maxQuantity) {
      throw new CustomError(
        `Puedes agregar como máximo ${extra.maxQuantity} de "${extra.name?.es || extra.code}"`,
        400,
      );
    }
    const perDay = extra.pricing === "per_day";
    const qty = item.quantity > 1 ? ` × ${item.quantity}` : "";
    lines.push({
      key: `extra:${extra.code}`,
      label: {
        es: `${extra.name?.es || extra.code}${qty}${perDay ? ` × ${days} ${dayWord.es}` : ""}`,
        en: `${extra.name?.en || extra.name?.es || extra.code}${qty}${perDay ? ` × ${days} ${dayWord.en}` : ""}`,
      },
      amount: extra.price * item.quantity * (perDay ? days : 1),
    });
  }

  // El cargo de ubicación se cobra en cada extremo solo si son lugares distintos;
  // si retiro y devolución coinciden se cobra una vez. Otra dirección sin tarifa
  // cargada no bloquea la reserva: queda "por cotizar" al coordinar la entrega.
  const sameEnds = input.returnLocation === input.pickupLocation;
  const locationFee = (pickupLoc.fee || 0) + (!sameEnds ? returnLoc.fee || 0 : 0);
  const pendingLocation = isPendingLocation(pickupLoc) || (!sameEnds && isPendingLocation(returnLoc));
  const pendingItems: string[] = [];
  if (pendingLocation) {
    pendingItems.push("Entrega o recepción en otra dirección: valor por cotizar al coordinar la entrega");
  }
  lines.push({
    key: "location",
    label: pendingLocation
      ? {
          es: "Entrega/recepción en otra dirección: valor por cotizar",
          en: "Delivery/return at another address: to be quoted",
        }
      : !sameEnds
        ? {
            es: `Entrega: ${pickupLoc.label.es} · Devolución: ${returnLoc.label.es}`,
            en: `Pick-up: ${pickupLoc.label.en} · Return: ${returnLoc.label.en}`,
          }
        : {
            es: `Entrega y devolución: ${pickupLoc.label.es}`,
            en: `Pick-up and return: ${pickupLoc.label.en}`,
          },
    amount: locationFee,
    ...(pendingLocation ? { pending: true } : {}),
  });

  // Promo elegida desde /promociones: se descuenta antes del IVA. Si todavía no
  // aplica (p. ej. 7x6 con menos de 7 días) se muestra en $0 con la condición.
  const promoLine = await promotionLine(input, category, days, locationFee);
  if (promoLine) lines.push(promoLine);

  // Factura con datos: se suma el IVA sobre todo lo anterior. Consumidor final
  // conserva el precio que vio desde el paso 1 (simplificada).
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.amount), 0);
  if (input.billingType === "invoice") {
    lines.push({
      key: "tax",
      label: { es: "IVA", en: "VAT" },
      amount: Math.round(subtotal * TAX_RATE),
    });
  }

  const total = lines.reduce((sum, l) => sum + Math.round(l.amount), 0);
  const deposit = computeDeposit(booking, total);
  const guaranteeAmount = guaranteeFor(category, booking);

  const { errors, errorCodes } =
    options.window === "staff"
      ? validateStaffWindow(input.pickupAt, input.returnAt)
      : validateWindow(booking, input.pickupAt, input.returnAt);

  const availableUnits =
    options.skipAvailability || errorCodes.includes("return_before_pickup")
      ? 0
      : await countAvailableUnits(
          String(category._id),
          input.pickupAt,
          input.returnAt,
          options.excludeReservationId,
        );
  if (
    !options.skipAvailability &&
    !errorCodes.includes("return_before_pickup") &&
    availableUnits === 0
  ) {
    errors.push("No hay vehículos disponibles de esta categoría para esas fechas");
    errorCodes.push("unavailable");
  }

  const quote: QuoteResult = {
    days,
    available: errors.length === 0,
    availableUnits,
    lines,
    total,
    deposit,
    guaranteeAmount,
    mileageInfo: { includedKm, extraKmPrice },
    pendingItems,
    errors,
    errorCodes,
  };

  const pricing: IPricing = {
    days,
    currency: "USD",
    categoryPricePerDay: category.pricePerDay,
    lines,
    total,
    deposit,
    guaranteeAmount,
    includedKm,
    extraKmPrice,
    pendingItems,
  };

  return {
    input: { ...input, coverage: coverage?.code ?? input.coverage },
    category,
    settings,
    quote,
    pricing,
  };
}

/** Línea de descuento de la promo vigente (o null si no hay o no corresponde a la categoría). */
async function promotionLine(
  input: QuoteInput,
  category: any,
  days: number,
  locationFee: number,
): Promise<IPriceLine | null> {
  if (!input.promoCode) return null;
  const now = new Date();
  const promo = await Promotion.findOne({
    slug: input.promoCode.toLowerCase(),
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).lean<any>();
  const d = promo?.discount;
  if (!promo || !d || d.type === "none") return null;
  if (promo.categorySlug && promo.categorySlug !== category.slug) return null;

  const minDays = Math.max(1, Number(d.minDays) || 1);
  const rental = category.pricePerDay * days;
  let amount = 0;
  if (days >= minDays) {
    if (d.type === "percent") amount = Math.round((rental * Math.min(100, d.value)) / 100);
    else if (d.type === "fixed") amount = Math.min(d.value, rental);
    else if (d.type === "free_days") amount = Math.floor(days / minDays) * d.value * category.pricePerDay;
    else if (d.type === "free_delivery") amount = locationFee;
  }
  const title = { es: promo.title?.es || promo.slug, en: promo.title?.en || promo.title?.es || promo.slug };
  if (days < minDays) {
    return {
      key: "promo",
      label: {
        es: `Promoción «${title.es}»: aplica desde ${minDays} días`,
        en: `“${title.en}” offer: applies from ${minDays} days`,
      },
      amount: 0,
    };
  }
  return { key: "promo", label: { es: `Promoción: ${title.es}`, en: `Offer: ${title.en}` }, amount: -amount };
}

/** POST /public/quote: no guarda nada. */
export async function quote(body: unknown): Promise<QuoteResult> {
  const { quote: result } = await computeQuote(parseQuoteInput(body));
  return result;
}

import crypto from "crypto";
import { isValidObjectId, Types } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { nextSequence } from "../models/counter.model";
import { Customer } from "../models/customer.model";
import { CustomerDocument } from "../models/document.model";
import { Lead } from "../models/lead.model";
import { Payment } from "../models/payment.model";
import {
  BLOCKING_STATUSES,
  RESERVATION_STATUSES,
  Reservation,
  VERIFICATION_STATUSES,
} from "../models/reservation.model";
import { Vehicle } from "../models/vehicle.model";
import {
  activeReservationFilter,
  assignUnitToReservation,
  createWithUnit,
  freeVehicles,
  syncVehicleStatus,
} from "./availability.service";
import { assertObjectId, paged, pageParams, searchRegex } from "./catalog.service";
import { sendCapiEvent } from "./metaCapi.service";
import { computeQuote, parseDateInput, parseQuoteInput, QuoteInput } from "./pricing.service";
import { emitWebhook } from "./webhook.service";
import { assertLicenseCovers, parseDriverLicense } from "../utils/license";
import { requireE164 } from "../utils/phone";

const HOLD_STATUSES = ["pending_documents", "pending_payment"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ATTRIBUTION_FIELDS = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "fbclid",
  "gclid",
  "referrer",
  "landingPage",
] as const;
/** Estados del lead que todavía no reflejan una reserva: se pueden avanzar a "reserved". */
const LEAD_PRE_RESERVED = ["new", "contacted", "quoted"];

/** Persona del personal que hizo la acción (se guarda tal cual en la reserva o el pago). */
export interface StaffRef {
  id: string;
  name: string;
  email: string;
}

/**
 * Ciclo estricto: sin saltos ni retrocesos. `expired` solo lo pone el sistema.
 * Pendiente = pending_documents / pending_payment.
 */
const TRANSITIONS: Record<string, string[]> = {
  pending_documents: ["confirmed", "cancelled"],
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
  expired: [],
};

export function allowedTransitions(status: string): string[] {
  return TRANSITIONS[status] ?? [];
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Acceso del cliente sin cuenta
// ---------------------------------------------------------------------------

function tokensMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Busca la reserva validando su token. Sin token válido responde 404, igual
 * que si no existiera: los códigos PON-#### son correlativos y adivinables.
 */
export async function findByAccess(code: string, token: string) {
  const notFound = new CustomError("Reserva no encontrada", 404);
  if (!code || !token) throw notFound;
  const reservation = await Reservation.findOne({ code: String(code).toUpperCase() }).select(
    "+accessToken",
  );
  if (!reservation || !tokensMatch(reservation.accessToken, String(token))) throw notFound;
  await expireIfStale(reservation);
  return reservation;
}

/** Vence en el momento el hold de una reserva que el cron todavía no alcanzó a procesar. */
async function expireIfStale(reservation: any) {
  if (
    HOLD_STATUSES.includes(reservation.status) &&
    reservation.holdExpiresAt &&
    reservation.holdExpiresAt.getTime() <= Date.now()
  ) {
    reservation.status = "expired";
    await reservation.save();
    await syncVehicleStatus(reservation.vehicle);
  }
}

export async function publicView(reservation: any) {
  const [category, customer] = await Promise.all([
    Category.findById(reservation.category).select("slug name image").lean<any>(),
    Customer.findById(reservation.customer).select("name email phone").lean<any>(),
  ]);
  return {
    code: reservation.code,
    status: reservation.status,
    verification: reservation.verification,
    category: category
      ? { slug: category.slug, name: category.name, image: category.image }
      : { slug: reservation.categorySlug, name: reservation.categoryName, image: "" },
    pickupAt: reservation.pickupAt,
    returnAt: reservation.returnAt,
    pickupLocation: reservation.pickupLocation,
    returnLocation: reservation.returnLocation,
    pickupAddress: reservation.pickupAddress,
    mileage: reservation.mileage,
    coverage: reservation.coverage,
    extras: reservation.extras,
    pricing: reservation.pricing,
    amountPaid: reservation.amountPaid,
    balance: reservation.balance,
    paymentMode: reservation.paymentMode,
    guaranteeAmount: reservation.pricing?.guaranteeAmount ?? 0,
    // phone: el cliente lo ve para confirmar o corregir su contacto desde el enlace seguro.
    driver: {
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
    },
    documents: reservation.documents,
    holdExpiresAt: reservation.holdExpiresAt,
    contract: reservation.contract,
    language: reservation.language,
  };
}

export async function getPublicReservation(code: string, token: string) {
  return publicView(await findByAccess(code, token));
}

// ---------------------------------------------------------------------------
// Crear reserva (Ruta B)
// ---------------------------------------------------------------------------

/** `requireLicense`: la web la exige; la presencial la valida solo si llega. */
function parseDriver(raw: any, requireLicense: boolean) {
  const d = raw ?? {};
  const name = String(d.name ?? "").trim();
  const documentType = d.documentType === "passport" ? "passport" : "cedula";
  const documentNumber = String(d.documentNumber ?? "")
    .replace(/[\s.-]/g, "")
    .toUpperCase();
  const email = String(d.email ?? "")
    .trim()
    .toLowerCase();

  if (d.documentType && !["cedula", "passport"].includes(d.documentType)) {
    throw new CustomError("El tipo de documento debe ser cédula o pasaporte", 400);
  }
  if (name.length < 3) throw new CustomError("Escribe el nombre completo del conductor", 400);
  if (documentType === "cedula" && !/^\d{10}$/.test(documentNumber)) {
    throw new CustomError("La cédula debe tener 10 dígitos", 400);
  }
  if (documentType === "passport" && !/^[A-Z0-9]{5,20}$/.test(documentNumber)) {
    throw new CustomError("El número de pasaporte no es válido", 400);
  }
  if (!EMAIL.test(email)) throw new CustomError("Escribe un correo válido", 400);
  const phone = requireE164(d.phone);
  const country =
    String(d.country ?? "EC")
      .trim()
      .toUpperCase()
      .slice(0, 2) || "EC";

  return {
    name,
    documentType,
    documentNumber,
    email,
    phone,
    country,
    birthDate: String(d.birthDate ?? "").trim(),
    license: parseDriverLicense(d, country, requireLicense),
  };
}

function parseAttribution(raw: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ATTRIBUTION_FIELDS) {
    if (raw?.[f] !== undefined) out[f] = String(raw[f]).slice(0, 500);
  }
  return out;
}

async function upsertCustomer(driver: ReturnType<typeof parseDriver>, language: "es" | "en") {
  const filter = { documentType: driver.documentType, documentNumber: driver.documentNumber };
  const update = {
    $set: {
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      country: driver.country,
      language,
      ...(driver.birthDate ? { birthDate: driver.birthDate } : {}),
      ...(driver.license ?? {}),
    },
  };
  try {
    return await Customer.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      runValidators: true,
    });
  } catch (error: any) {
    // Dos reservas simultáneas del mismo cliente: una gana el insert, la otra actualiza.
    if (error?.code === 11000) return Customer.findOneAndUpdate(filter, update, { new: true });
    throw error;
  }
}

/** Resumen que viaja al CRM externo por webhook. */
export async function webhookPayload(reservation: any) {
  const customer = await Customer.findById(reservation.customer).lean<any>();
  return {
    id: String(reservation._id),
    code: reservation.code,
    status: reservation.status,
    category: reservation.categorySlug,
    pickupAt: reservation.pickupAt,
    returnAt: reservation.returnAt,
    pickupLocation: reservation.pickupLocation,
    returnLocation: reservation.returnLocation,
    total: reservation.pricing?.total,
    amountPaid: reservation.amountPaid,
    balance: reservation.balance,
    currency: "USD",
    language: reservation.language,
    leadId: reservation.lead ? String(reservation.lead) : null,
    customer: customer
      ? {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          documentType: customer.documentType,
          documentNumber: customer.documentNumber,
        }
      : null,
    attribution: reservation.attribution,
  };
}

async function linkLead(leadId: unknown, reservation: any) {
  if (typeof leadId !== "string" || !isValidObjectId(leadId)) return null;
  const lead = await Lead.findById(leadId);
  if (!lead) return null;
  lead.reservation = reservation._id;
  lead.customer = reservation.customer;
  if (LEAD_PRE_RESERVED.includes(lead.status)) lead.status = "reserved";
  await lead.save();
  return lead._id;
}

function createResponse(reservation: any) {
  return {
    _id: reservation._id,
    code: reservation.code,
    status: reservation.status,
    accessToken: reservation.accessToken,
    holdExpiresAt: reservation.holdExpiresAt,
    pricing: reservation.pricing,
  };
}

const NO_UNITS = "Ya no quedan vehículos de esta categoría para esas fechas";

/**
 * Cotiza en el servidor con el mismo motor que /public/quote y corta si hay
 * errores de negocio. `staff` = reserva presencial: sin ventana de días.
 */
async function quoteForBooking(input: QuoteInput, window: "public" | "staff") {
  const computed = await computeQuote(input, { window });
  const { quote } = computed;
  const blocking = quote.errorCodes.filter((c) => c !== "unavailable");
  if (blocking.length) {
    const messages = quote.errors.filter((_, i) => quote.errorCodes[i] !== "unavailable");
    throw new CustomError(messages.join(". "), 400, { errorCodes: blocking });
  }
  if (quote.errorCodes.includes("unavailable")) throw new CustomError(NO_UNITS, 409);
  return computed;
}

/** Campos comunes de una reserva nueva (web o presencial); la unidad la pone createWithUnit. */
function baseReservationData(
  computed: Awaited<ReturnType<typeof computeQuote>>,
  customer: any,
  body: any,
  language: "es" | "en",
) {
  const { category, pricing, input } = computed;
  return {
    code: "",
    accessToken: crypto.randomBytes(16).toString("hex"),
    category: category._id,
    categorySlug: category.slug,
    categoryName: category.name,
    customer: customer._id,
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    pickupLocation: input.pickupLocation,
    returnLocation: input.returnLocation,
    pickupAddress: String(body?.pickupAddress ?? "")
      .trim()
      .slice(0, 300),
    mileage: input.mileage,
    coverage: input.coverage,
    extras: input.extras,
    pricing,
    amountPaid: 0,
    balance: pricing.total,
    paymentStatus: "pending",
    // La garantía física arranca pendiente con el monto de la tarifa congelada.
    guarantee: { status: "pending", amount: pricing.guaranteeAmount ?? 0 },
    language,
  };
}

export async function createReservation(
  body: any,
  meta: RequestMeta,
): Promise<{ created: boolean; reservation: ReturnType<typeof createResponse> }> {
  const input = parseQuoteInput(body);
  const driver = parseDriver(body?.driver, true);
  assertLicenseCovers(driver.license, input.returnAt);
  const language: "es" | "en" = body?.language === "en" ? "en" : "es";

  // Anti-duplicado antes de cotizar: la reserva existente ocupa la unidad y la
  // cotización diría "sin disponibilidad" a quien solo recargó la página.
  const existingCustomer = await Customer.findOne({
    documentType: driver.documentType,
    documentNumber: driver.documentNumber,
  }).lean<any>();
  if (existingCustomer) {
    const duplicate = await Reservation.findOne({
      ...activeReservationFilter(),
      customer: existingCustomer._id,
      categorySlug: input.categorySlug,
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
    }).select("+accessToken");
    if (duplicate) return { created: false, reservation: createResponse(duplicate) };
  }

  const computed = await quoteForBooking(input, "public");
  const { category, settings, pricing } = computed;

  const customer = await upsertCustomer(driver, language);
  const candidates = await freeVehicles(String(category._id), input.pickupAt, input.returnAt);
  if (!candidates.length) throw new CustomError(NO_UNITS, 409);

  const reservation = await createWithUnit(
    {
      ...baseReservationData(computed, customer, body, language),
      code: `PON-${await nextSequence("reservation")}`,
      status: "pending_documents",
      channel: "web",
      holdExpiresAt: new Date(Date.now() + settings.booking.holdMinutes * 60 * 1000),
      attribution: parseAttribution(body?.attribution),
    },
    candidates.map((c) => c._id),
  );
  if (!reservation) throw new CustomError(NO_UNITS, 409);
  await syncVehicleStatus(reservation.vehicle);

  const leadRef = await linkLead(body?.leadId, reservation);
  if (leadRef) {
    reservation.lead = leadRef;
    await reservation.save();
  }

  await Promise.all([
    emitWebhook("reservation.created", await webhookPayload(reservation)),
    sendCapiEvent({
      event: "InitiateCheckout",
      eventId:
        typeof body?.eventId === "string" && body.eventId
          ? body.eventId
          : `checkout-${reservation.code}`,
      email: customer.email,
      phone: customer.phone,
      value: pricing.total,
      sourceUrl: reservation.attribution?.landingPage || undefined,
      ip: meta.ip,
      userAgent: meta.userAgent,
      fbclid: reservation.attribution?.fbclid || undefined,
    }),
  ]);

  return { created: true, reservation: createResponse(reservation) };
}

/**
 * POST /admin/reservations — reserva presencial. Mismo motor de precio y de
 * asignación que la web, sin ventana de días ni hold: no expira sola.
 */
export async function adminCreateReservation(body: any, staff: StaffRef) {
  const input = parseQuoteInput(body);
  const driver = parseDriver(body?.driver, false);
  assertLicenseCovers(driver.license, input.returnAt);
  const language: "es" | "en" = body?.language === "en" ? "en" : "es";
  const computed = await quoteForBooking(input, "staff");
  const { category } = computed;

  let candidateIds: string[];
  if (body?.vehicleId !== undefined && body.vehicleId !== null && body.vehicleId !== "") {
    const vehicleId = String(body.vehicleId);
    if (!isValidObjectId(vehicleId)) throw new CustomError("No se encontró la unidad", 404);
    const vehicle = await Vehicle.findOne({ _id: vehicleId, isActive: true }).lean<any>();
    if (!vehicle) throw new CustomError("No se encontró la unidad", 404);
    if (String(vehicle.category) !== String(category._id)) {
      throw new CustomError("La unidad elegida no pertenece a esa categoría", 400);
    }
    if (["maintenance", "blocked"].includes(vehicle.status)) {
      throw new CustomError("La unidad está en mantenimiento o bloqueada", 409);
    }
    candidateIds = [vehicleId];
  } else {
    candidateIds = (await freeVehicles(String(category._id), input.pickupAt, input.returnAt)).map(
      (v) => String(v._id),
    );
    if (!candidateIds.length) throw new CustomError(NO_UNITS, 409);
  }

  const customer = await upsertCustomer(driver, language);
  const reservation = await createWithUnit(
    {
      ...baseReservationData(computed, customer, body, language),
      code: `PON-${await nextSequence("reservation")}`,
      status: "pending_payment",
      channel: "walk_in",
      createdBy: staff,
      holdExpiresAt: null,
      notes: String(body?.notes ?? "")
        .trim()
        .slice(0, 5000),
    },
    candidateIds,
  );
  if (!reservation) {
    throw new CustomError(
      candidateIds.length === 1 && body?.vehicleId
        ? "La unidad elegida ya está ocupada en esas fechas"
        : NO_UNITS,
      409,
    );
  }
  await syncVehicleStatus(reservation.vehicle);
  await emitWebhook("reservation.created", await webhookPayload(reservation));

  return adminGetReservation(String(reservation._id));
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

/** Libera las pre-reservas cuyo hold venció (cliente que no subió documentos o no pagó). */
export async function expireHolds(): Promise<{ expired: number; codes: string[] }> {
  const now = new Date();
  const stale = await Reservation.find({
    status: { $in: HOLD_STATUSES },
    holdExpiresAt: { $ne: null, $lte: now },
  })
    .select("_id code vehicle")
    .lean<any[]>();
  if (!stale.length) return { expired: 0, codes: [] };

  // El filtro de estado se repite en el update: si un pago confirmó entre la
  // lectura y la escritura, esa reserva no se expira.
  await Reservation.updateMany(
    {
      _id: { $in: stale.map((r) => r._id) },
      status: { $in: HOLD_STATUSES },
      holdExpiresAt: { $lte: now },
    },
    { $set: { status: "expired" } },
  );
  const vehicles = [...new Set(stale.map((r) => String(r.vehicle ?? "")).filter(Boolean))];
  for (const v of vehicles) await syncVehicleStatus(v);
  return { expired: stale.length, codes: stale.map((r) => r.code) };
}

// ---------------------------------------------------------------------------
// Admin: reservas
// ---------------------------------------------------------------------------

function dateRange(query: any, field: string): Record<string, unknown> {
  const from = parseDateInput(query?.from);
  const to = parseDateInput(query?.to);
  if (!from && !to) return {};
  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  // "to" como fecha sola incluye todo ese día.
  if (to)
    range.$lte = /^\d{4}-\d{2}-\d{2}$/.test(String(query.to))
      ? new Date(to.getTime() + 86_399_999)
      : to;
  return { [field]: range };
}

export async function adminListReservations(query: any) {
  // Vercel Hobby solo permite un cron diario: el panel vence los holds al abrirse
  // para no mostrar como "pendientes" reservas que ya expiraron.
  await expireHolds();
  const { page, limit, skip } = pageParams(query);
  const filter: Record<string, unknown> = { ...dateRange(query, "pickupAt") };
  if (query?.status) filter.status = String(query.status);
  if (query?.verification) filter.verification = String(query.verification);
  if (query?.category) filter.categorySlug = String(query.category).toLowerCase();

  const rx = searchRegex(query?.q);
  if (rx) {
    const [customers, vehicles] = await Promise.all([
      Customer.find({ $or: [{ name: rx }, { email: rx }, { phone: rx }, { documentNumber: rx }] })
        .select("_id")
        .limit(500)
        .lean<any[]>(),
      Vehicle.find({ plate: rx }).select("_id").limit(100).lean<any[]>(),
    ]);
    filter.$or = [
      { code: rx },
      { customer: { $in: customers.map((c) => c._id) } },
      { vehicle: { $in: vehicles.map((v) => v._id) } },
    ];
  }

  const [items, total] = await Promise.all([
    Reservation.find(filter)
      .populate("customer", "name email phone documentType documentNumber verification")
      .populate("vehicle", "plate brand model")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Reservation.countDocuments(filter),
  ]);
  return paged(
    items.map((r: any) => ({ ...r, allowedTransitions: allowedTransitions(r.status) })),
    total,
    page,
    limit,
  );
}

export async function adminGetReservation(id: string) {
  assertObjectId(id, "la reserva");
  const reservation = await Reservation.findById(id)
    .select("+accessToken")
    .populate("customer")
    .populate("vehicle", "plate brand model color status")
    .populate("lead", "code status source name phone")
    .lean<any>();
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  const [payments, documents] = await Promise.all([
    Payment.find({ reservation: id }).sort({ createdAt: -1 }).lean(),
    CustomerDocument.find({ reservation: id })
      .select("kind contentType size createdAt updatedAt")
      .lean(),
  ]);
  return {
    ...reservation,
    allowedTransitions: allowedTransitions(reservation.status),
    payments,
    documentFiles: documents,
  };
}

export async function adminUpdateReservation(id: string, body: any) {
  assertObjectId(id, "la reserva");
  const reservation = await Reservation.findById(id);
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  // Una pendiente con el hold vencido ya no se puede confirmar: su unidad pudo pasar a otra reserva.
  await expireIfStale(reservation);
  const previousStatus: string = reservation.status;
  const previousVehicle = reservation.vehicle ? String(reservation.vehicle) : null;
  const set: Record<string, unknown> = {};

  let status = previousStatus;
  if (body?.status !== undefined) {
    const next = String(body.status);
    if (!(RESERVATION_STATUSES as readonly string[]).includes(next)) {
      throw new CustomError("Estado de reserva inválido", 400);
    }
    // Reenviar el mismo estado (formulario completo) no es un salto: se ignora.
    if (next !== previousStatus) {
      if (!allowedTransitions(previousStatus).includes(next)) {
        throw new CustomError(`No se puede pasar de ${previousStatus} a ${next}`, 409);
      }
      status = next;
      set.status = next;
      // Confirmada, en curso o cerrada ya no depende del hold de 20 minutos.
      if (!HOLD_STATUSES.includes(next)) set.holdExpiresAt = null;
    }
  }

  let vehicle = previousVehicle;
  if (body?.vehicleId !== undefined) {
    if (body.vehicleId === null || body.vehicleId === "") {
      vehicle = null;
    } else {
      const vehicleId = String(body.vehicleId);
      if (!isValidObjectId(vehicleId)) throw new CustomError("No se encontró la unidad", 404);
      const found = await Vehicle.findById(vehicleId).lean<any>();
      if (!found || !found.isActive) throw new CustomError("No se encontró la unidad", 404);
      if (["maintenance", "blocked"].includes(found.status)) {
        throw new CustomError("La unidad está en mantenimiento o bloqueada", 409);
      }
      vehicle = String(found._id);
    }
  }
  const vehicleChanged = vehicle !== previousVehicle;
  if (status === "delivered" && !vehicle) {
    throw new CustomError("Asigna una unidad antes de marcar la reserva como en curso", 409);
  }

  if (body?.verification !== undefined) {
    if (!(VERIFICATION_STATUSES as readonly string[]).includes(String(body.verification))) {
      throw new CustomError("Estado de verificación inválido", 400);
    }
    set.verification = String(body.verification);
  }
  if (body?.verificationNote !== undefined)
    set.verificationNote = String(body.verificationNote).slice(0, 2000);
  if (body?.notes !== undefined) set.notes = String(body.notes).slice(0, 5000);

  // Si la reserva sigue ocupando calendario y cambia su unidad o su estado, se
  // escribe dentro del candado transaccional de la unidad.
  const stillBlocking = (BLOCKING_STATUSES as string[]).includes(status);
  if (vehicle && stillBlocking && (vehicleChanged || set.status !== undefined)) {
    const ok = await assignUnitToReservation(reservation, vehicle, set);
    if (!ok)
      throw new CustomError("La unidad ya está ocupada por otra reserva en esas fechas", 409);
  } else {
    if (vehicleChanged) set.vehicle = vehicle ? new Types.ObjectId(vehicle) : null;
    if (Object.keys(set).length)
      await Reservation.updateOne({ _id: reservation._id }, { $set: set });
  }

  if (set.verification !== undefined) {
    // La verificación es del conductor, no solo de esta reserva: el cliente que vuelve ya viene verificado.
    await Customer.updateOne(
      { _id: reservation.customer },
      { $set: { verification: set.verification } },
    );
  }

  const touched = new Set([previousVehicle, vehicle]);
  for (const v of touched) if (v) await syncVehicleStatus(v);

  if (set.status === "confirmed") {
    // Mismo efecto que una confirmación por Payphone: cuenta como alquiler y avisa al CRM.
    await Customer.updateOne({ _id: reservation.customer }, { $inc: { totalRentals: 1 } });
    const fresh = await Reservation.findById(id).lean<any>();
    await emitWebhook("reservation.confirmed", await webhookPayload(fresh));
  }

  return adminGetReservation(id);
}

// ---------------------------------------------------------------------------
// Admin: clientes y pagos
// ---------------------------------------------------------------------------

export async function adminListCustomers(query: any) {
  const { page, limit, skip } = pageParams(query);
  const filter: Record<string, unknown> = { ...dateRange(query, "createdAt") };
  if (query?.status) filter.verification = String(query.status);
  const rx = searchRegex(query?.q);
  if (rx) filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { documentNumber: rx }];
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);
  return paged(items, total, page, limit);
}

export async function adminGetCustomer(id: string) {
  assertObjectId(id, "el cliente");
  const customer = await Customer.findById(id).lean<any>();
  if (!customer) throw new CustomError("No se encontró el cliente", 404);
  const leadOr: Record<string, unknown>[] = [{ customer: customer._id }];
  if (customer.email) leadOr.push({ email: customer.email });
  const [reservations, leads] = await Promise.all([
    Reservation.find({ customer: id })
      .select(
        "code status verification categorySlug categoryName pickupAt returnAt pricing.total amountPaid balance createdAt",
      )
      .sort({ createdAt: -1 })
      .lean(),
    Lead.find({ $or: leadOr })
      .select("code status source channel name phone email createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);
  return { ...customer, reservations, leads };
}

export async function adminListPayments(query: any) {
  const { page, limit, skip } = pageParams(query);
  const filter: Record<string, unknown> = { ...dateRange(query, "createdAt") };
  if (query?.status) filter.status = String(query.status);
  if (query?.method) filter.method = String(query.method);
  const rx = searchRegex(query?.q);
  if (rx)
    filter.$or = [{ reservationCode: rx }, { clientTransactionId: rx }, { transactionId: rx }];
  const [items, total] = await Promise.all([
    Payment.find(filter)
      .select("-providerResponse")
      .populate({
        path: "reservation",
        select: "code customer status",
        populate: { path: "customer", select: "name email" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);
  return paged(items, total, page, limit);
}

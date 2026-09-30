import { isValidObjectId, Types } from "mongoose";
import { env } from "../config/env";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Coverage } from "../models/coverage.model";
import { Extra } from "../models/extra.model";
import { Reservation } from "../models/reservation.model";
import { ISetting, LOCATION_CODES } from "../models/setting.model";
import { FUEL_TYPES, Vehicle, VEHICLE_STATUSES } from "../models/vehicle.model";
import { slugify } from "../utils/slugify";
import {
  activeReservationFilter,
  availableCountsByCategory,
  countReservableByCategory,
  overlapFilter,
} from "./availability.service";
import { parseDateInput } from "./pricing.service";
import { getSettings, updateSettings } from "./settings.service";

// ---------------------------------------------------------------------------
// Utilidades compartidas por los listados del admin
// ---------------------------------------------------------------------------

/** El texto del buscador va a una regex: sin escapar, un "(" rompe la consulta o abre un ReDoS. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function searchRegex(q: unknown): RegExp | null {
  const text = typeof q === "string" ? q.trim() : "";
  return text ? new RegExp(escapeRegex(text.slice(0, 100)), "i") : null;
}

export function pageParams(
  query: any,
  defaultLimit = 20,
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.floor(Number(query?.page)) || 1);
  const limit = Math.min(200, Math.max(1, Math.floor(Number(query?.limit)) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function assertObjectId(id: unknown, what = "el registro"): string {
  if (typeof id !== "string" || !isValidObjectId(id))
    throw new CustomError(`No se encontró ${what}`, 404);
  return id;
}

function pick(body: any, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (body?.[f] !== undefined) out[f] = body[f];
  return out;
}

function assertCents(value: unknown, label: string) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new CustomError(`${label} debe ser un monto en centavos (entero, sin decimales)`, 400);
  }
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export async function getPublicConfig() {
  const settings = await getSettings();
  // holdMinutes es un detalle interno del anti-acaparamiento; integrations tiene URLs privadas.
  const { holdMinutes: _hold, ...booking } = settings.booking;
  return {
    business: settings.business,
    booking,
    // Mismo criterio que payphone.service: sin ambos datos el checkout responde 503.
    payphoneEnabled: Boolean(env.PAYPHONE_TOKEN && env.PAYPHONE_STORE_ID),
    whatsappCloudEnabled: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
  };
}

/**
 * `?from&to` opcionales: con ambos, `availableUnits` son las libres en ese
 * rango; sin ellos, las reservables de la categoría (sin mirar el calendario).
 */
function parseRange(query: any): { from: Date; to: Date } | null {
  if (query?.from === undefined && query?.to === undefined) return null;
  const from = parseDateInput(query?.from);
  const to = parseDateInput(query?.to);
  if (!from || !to) throw new CustomError("Indica fechas válidas en from y to", 400);
  if (to.getTime() <= from.getTime())
    throw new CustomError("La fecha to debe ser posterior a from", 400);
  return { from, to };
}

async function unitCounts(query: any): Promise<Map<string, number>> {
  const range = parseRange(query);
  return range ? availableCountsByCategory(range.from, range.to) : countReservableByCategory();
}

export async function listPublicCategories(query: any = {}) {
  const [categories, counts] = await Promise.all([
    Category.find({ isActive: true }).sort({ order: 1, pricePerDay: 1 }).lean<any[]>(),
    unitCounts(query),
  ]);
  return categories.map((c) => ({ ...c, availableUnits: counts.get(String(c._id)) ?? 0 }));
}

export async function getPublicCategory(slug: string, query: any = {}) {
  const category = await Category.findOne({
    slug: String(slug).toLowerCase(),
    isActive: true,
  }).lean<any>();
  if (!category) throw new CustomError("Categoría no encontrada", 404);
  const [counts, vehicles] = await Promise.all([
    unitCounts(query),
    // Dato secundario: la venta es por categoría. Sin placa, dueño ni notas internas.
    Vehicle.find({ category: category._id, isActive: true, status: { $ne: "blocked" } })
      .select("brand model year transmission fuel seats color images")
      .sort({ createdAt: 1, _id: 1 })
      .lean<any[]>(),
  ]);
  return {
    ...category,
    availableUnits: counts.get(String(category._id)) ?? 0,
    units: vehicles.map((v) => ({
      brand: v.brand,
      model: v.model,
      year: v.year,
      transmission: v.transmission,
      fuel: v.fuel ?? "gasoline",
      seats: v.seats ?? category.passengers,
      color: v.color ?? "",
      image: v.images?.[0] ?? "",
    })),
  };
}

export async function listPublicCoverages() {
  return Coverage.find({ isActive: true }).sort({ order: 1 }).lean();
}

export async function listPublicExtras() {
  return Extra.find({ isActive: true }).sort({ order: 1 }).lean();
}

// ---------------------------------------------------------------------------
// Admin: categorías
// ---------------------------------------------------------------------------

const CATEGORY_FIELDS = [
  "slug",
  "name",
  "tagline",
  "description",
  "passengers",
  "luggage",
  "transmission",
  "airConditioning",
  "pricePerDay",
  "image",
  "gallery",
  "exampleModels",
  "features",
  "order",
  "isActive",
  "seo",
] as const;

function categoryData(body: any, isCreate: boolean) {
  const data = pick(body, CATEGORY_FIELDS);
  if (isCreate && !data.slug) data.slug = slugify(String(body?.name?.es ?? ""));
  if (data.slug !== undefined) {
    data.slug = slugify(String(data.slug));
    if (!data.slug) throw new CustomError("La categoría necesita un slug o un nombre", 400);
  }
  if (isCreate && data.pricePerDay === undefined)
    throw new CustomError("Indica el precio por día", 400);
  assertCents(data.pricePerDay, "El precio por día");
  return data;
}

export async function adminListCategories(query: any) {
  const { page, limit, skip } = pageParams(query, 50);
  const filter: Record<string, unknown> = {};
  const rx = searchRegex(query?.q);
  if (rx) filter.$or = [{ slug: rx }, { "name.es": rx }, { "name.en": rx }];
  if (query?.status === "active") filter.isActive = true;
  if (query?.status === "inactive") filter.isActive = false;
  const [items, total, counts] = await Promise.all([
    Category.find(filter).sort({ order: 1 }).skip(skip).limit(limit).lean<any[]>(),
    Category.countDocuments(filter),
    Vehicle.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { isActive: true } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]),
  ]);
  const byCat = new Map(counts.map((c) => [String(c._id), c.count]));
  return paged(
    items.map((c) => ({ ...c, vehicleCount: byCat.get(String(c._id)) ?? 0 })),
    total,
    page,
    limit,
  );
}

export async function adminGetCategory(id: string) {
  const category = await Category.findById(assertObjectId(id, "la categoría")).lean();
  if (!category) throw new CustomError("No se encontró la categoría", 404);
  return category;
}

export async function adminCreateCategory(body: any) {
  return (await Category.create(categoryData(body, true))).toObject();
}

export async function adminUpdateCategory(id: string, body: any) {
  const category = await Category.findByIdAndUpdate(
    assertObjectId(id, "la categoría"),
    { $set: categoryData(body, false) },
    { new: true, runValidators: true },
  ).lean();
  if (!category) throw new CustomError("No se encontró la categoría", 404);
  return category;
}

export async function adminDeleteCategory(id: string) {
  assertObjectId(id, "la categoría");
  // Borrarla dejaría unidades y reservas apuntando a nada; desactivarla conserva el historial.
  if (await Vehicle.exists({ category: id })) {
    throw new CustomError(
      "La categoría tiene unidades asociadas: desactívala en lugar de borrarla",
      409,
    );
  }
  if (await Reservation.exists({ category: id })) {
    throw new CustomError("La categoría tiene reservas: desactívala en lugar de borrarla", 409);
  }
  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("No se encontró la categoría", 404);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: unidades
// ---------------------------------------------------------------------------

const VEHICLE_FIELDS = [
  "category",
  "brand",
  "model",
  "year",
  "plate",
  "color",
  "transmission",
  "fuel",
  "seats",
  "mileageKm",
  "description",
  "images",
  "status",
  "owner",
  "notes",
  "isActive",
] as const;

async function vehicleData(body: any, isCreate: boolean) {
  const data = pick(body, VEHICLE_FIELDS);
  if (isCreate) {
    for (const [f, label] of [
      ["category", "la categoría"],
      ["brand", "la marca"],
      ["model", "el modelo"],
      ["plate", "la placa"],
    ] as const) {
      if (!data[f]) throw new CustomError(`Indica ${label} de la unidad`, 400);
    }
  }
  if (data.category !== undefined) {
    if (!isValidObjectId(data.category) || !(await Category.exists({ _id: data.category }))) {
      throw new CustomError("La categoría indicada no existe", 400);
    }
  }
  if (
    data.status !== undefined &&
    !(VEHICLE_STATUSES as readonly string[]).includes(String(data.status))
  ) {
    throw new CustomError("Estado de unidad inválido", 400);
  }
  if (data.fuel !== undefined && !(FUEL_TYPES as readonly string[]).includes(String(data.fuel))) {
    throw new CustomError("El combustible debe ser gasolina, diésel, híbrido o eléctrico", 400);
  }
  if (
    data.seats !== undefined &&
    (!Number.isInteger(data.seats) || (data.seats as number) < 1 || (data.seats as number) > 60)
  ) {
    throw new CustomError("Los asientos deben ser un número entero entre 1 y 60", 400);
  }
  if (
    data.mileageKm !== undefined &&
    (!Number.isInteger(data.mileageKm) || (data.mileageKm as number) < 0)
  ) {
    throw new CustomError("El kilometraje debe ser un número entero mayor o igual a 0", 400);
  }
  if (data.description !== undefined)
    data.description = String(data.description ?? "").slice(0, 3000);
  return data;
}

export async function adminListVehicles(query: any) {
  const { page, limit, skip } = pageParams(query, 50);
  const filter: Record<string, unknown> = {};
  const rx = searchRegex(query?.q);
  if (rx) filter.$or = [{ plate: rx }, { brand: rx }, { model: rx }, { owner: rx }];
  if (query?.status) filter.status = String(query.status);
  if (query?.category) {
    const cat = String(query.category);
    if (isValidObjectId(cat)) filter.category = cat;
    else {
      const found = await Category.findOne({ slug: cat.toLowerCase() }).select("_id").lean<any>();
      filter.category = found?._id ?? new Types.ObjectId();
    }
  }
  const [items, total] = await Promise.all([
    Vehicle.find(filter)
      .populate("category", "slug name")
      .sort({ plate: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Vehicle.countDocuments(filter),
  ]);
  return paged(items, total, page, limit);
}

export async function adminGetVehicle(id: string) {
  const vehicle = await Vehicle.findById(assertObjectId(id, "la unidad"))
    .populate("category", "slug name")
    .lean();
  if (!vehicle) throw new CustomError("No se encontró la unidad", 404);
  const reservations = await Reservation.find({ vehicle: id })
    .select("code status pickupAt returnAt categorySlug")
    .sort({ pickupAt: -1 })
    .limit(20)
    .lean();
  return { ...vehicle, reservations };
}

export async function adminCreateVehicle(body: any) {
  return (await Vehicle.create(await vehicleData(body, true))).toObject();
}

export async function adminUpdateVehicle(id: string, body: any) {
  const vehicle = await Vehicle.findByIdAndUpdate(
    assertObjectId(id, "la unidad"),
    { $set: await vehicleData(body, false) },
    { new: true, runValidators: true },
  ).lean();
  if (!vehicle) throw new CustomError("No se encontró la unidad", 404);
  return vehicle;
}

export async function adminSetVehicleStatus(id: string, status: unknown) {
  if (!(VEHICLE_STATUSES as readonly string[]).includes(String(status))) {
    throw new CustomError("Estado de unidad inválido", 400);
  }
  return adminUpdateVehicle(id, { status });
}

export async function adminDeleteVehicle(id: string) {
  assertObjectId(id, "la unidad");
  if (await Reservation.exists({ vehicle: id })) {
    throw new CustomError("La unidad tiene reservas: desactívala en lugar de borrarla", 409);
  }
  const deleted = await Vehicle.findByIdAndDelete(id);
  if (!deleted) throw new CustomError("No se encontró la unidad", 404);
  return { ok: true };
}

/** GET /admin/availability: ocupación por unidad en un rango (por defecto, los próximos 30 días). */
export async function adminAvailability(query: any) {
  const from = parseDateInput(query?.from) ?? new Date();
  const to = parseDateInput(query?.to) ?? new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (to.getTime() <= from.getTime()) throw new CustomError("El rango de fechas no es válido", 400);

  const [vehicles, reservations] = await Promise.all([
    Vehicle.find({ isActive: true })
      .populate("category", "slug name order")
      .sort({ plate: 1 })
      .lean<any[]>(),
    Reservation.find({
      ...activeReservationFilter(),
      ...overlapFilter(from, to),
      vehicle: { $ne: null },
    })
      .select("code status vehicle pickupAt returnAt")
      .sort({ pickupAt: 1 })
      .lean<any[]>(),
  ]);

  return vehicles.map((vehicle) => ({
    vehicle,
    busy: reservations
      .filter((r) => String(r.vehicle) === String(vehicle._id))
      .map((r) => ({
        from: r.pickupAt,
        to: r.returnAt,
        reservationCode: r.code,
        status: r.status,
      })),
  }));
}

// ---------------------------------------------------------------------------
// Admin: coberturas y extras (misma forma de CRUD)
// ---------------------------------------------------------------------------

const COVERAGE_FIELDS = [
  "code",
  "name",
  "description",
  "includes",
  "excludes",
  "pricePerDay",
  "isDefault",
  "isActive",
  "order",
] as const;
const EXTRA_FIELDS = [
  "code",
  "name",
  "description",
  "icon",
  "price",
  "pricing",
  "maxQuantity",
  "isActive",
  "order",
] as const;

function codeData(body: any, fields: readonly string[], isCreate: boolean, priceField: string) {
  const data = pick(body, fields);
  if (isCreate && !data.code) data.code = slugify(String(body?.name?.es ?? ""));
  if (data.code !== undefined) {
    data.code = slugify(String(data.code));
    if (!data.code) throw new CustomError("Indica un código", 400);
  }
  assertCents(data[priceField], "El precio");
  if (data.pricing !== undefined && !["per_day", "per_rental"].includes(String(data.pricing))) {
    throw new CustomError("El tipo de cobro debe ser por día o por alquiler", 400);
  }
  if (
    data.maxQuantity !== undefined &&
    (!Number.isInteger(data.maxQuantity) || (data.maxQuantity as number) < 1)
  ) {
    throw new CustomError("La cantidad máxima debe ser un entero mayor o igual a 1", 400);
  }
  return data;
}

async function listByCode(model: any, query: any) {
  const { page, limit, skip } = pageParams(query, 50);
  const filter: Record<string, unknown> = {};
  const rx = searchRegex(query?.q);
  if (rx) filter.$or = [{ code: rx }, { "name.es": rx }, { "name.en": rx }];
  if (query?.status === "active") filter.isActive = true;
  if (query?.status === "inactive") filter.isActive = false;
  const [items, total] = await Promise.all([
    model.find(filter).sort({ order: 1 }).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return paged(items, total, page, limit);
}

/** Solo puede haber una cobertura por defecto: la que queda marcada desmarca las demás. */
async function keepSingleDefault(coverage: any) {
  if (coverage?.isDefault) {
    await Coverage.updateMany(
      { _id: { $ne: coverage._id }, isDefault: true },
      { $set: { isDefault: false } },
    );
  }
}

export const adminListCoverages = (query: any) => listByCode(Coverage, query);

export async function adminGetCoverage(id: string) {
  const doc = await Coverage.findById(assertObjectId(id, "la cobertura")).lean();
  if (!doc) throw new CustomError("No se encontró la cobertura", 404);
  return doc;
}

export async function adminCreateCoverage(body: any) {
  const doc = (
    await Coverage.create(codeData(body, COVERAGE_FIELDS, true, "pricePerDay"))
  ).toObject();
  await keepSingleDefault(doc);
  return doc;
}

export async function adminUpdateCoverage(id: string, body: any) {
  const doc = await Coverage.findByIdAndUpdate(
    assertObjectId(id, "la cobertura"),
    { $set: codeData(body, COVERAGE_FIELDS, false, "pricePerDay") },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw new CustomError("No se encontró la cobertura", 404);
  await keepSingleDefault(doc);
  return doc;
}

export async function adminDeleteCoverage(id: string) {
  const deleted = await Coverage.findByIdAndDelete(assertObjectId(id, "la cobertura"));
  if (!deleted) throw new CustomError("No se encontró la cobertura", 404);
  return { ok: true };
}

export const adminListExtras = (query: any) => listByCode(Extra, query);

export async function adminGetExtra(id: string) {
  const doc = await Extra.findById(assertObjectId(id, "el extra")).lean();
  if (!doc) throw new CustomError("No se encontró el extra", 404);
  return doc;
}

export async function adminCreateExtra(body: any) {
  return (await Extra.create(codeData(body, EXTRA_FIELDS, true, "price"))).toObject();
}

export async function adminUpdateExtra(id: string, body: any) {
  const doc = await Extra.findByIdAndUpdate(
    assertObjectId(id, "el extra"),
    { $set: codeData(body, EXTRA_FIELDS, false, "price") },
    { new: true, runValidators: true },
  ).lean();
  if (!doc) throw new CustomError("No se encontró el extra", 404);
  return doc;
}

export async function adminDeleteExtra(id: string) {
  const deleted = await Extra.findByIdAndDelete(assertObjectId(id, "el extra"));
  if (!deleted) throw new CustomError("No se encontró el extra", 404);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin: configuración y subida de imágenes
// ---------------------------------------------------------------------------

export async function adminGetSettings() {
  return getSettings();
}

function assertNonNegativeInt(value: unknown, label: string) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new CustomError(`${label} debe ser un número entero mayor o igual a 0`, 400);
  }
}

export async function adminUpdateSettings(body: any) {
  const current = await getSettings();
  const patch: Partial<ISetting> = {};

  if (body?.business && typeof body.business === "object") {
    patch.business = pick(body.business, [
      "name",
      "phone",
      "whatsapp",
      "email",
      "address",
      "mapsUrl",
      "hours",
      "instagram",
      "facebook",
      "tiktok",
    ]) as unknown as ISetting["business"];
  }

  if (body?.booking && typeof body.booking === "object") {
    const b = body.booking;
    const booking = pick(b, [
      "maxDaysAhead",
      "minHoursNotice",
      "holdMinutes",
      "depositMode",
      "depositValue",
      "guaranteeAmount",
      "locations",
    ]) as Record<string, any>;
    assertNonNegativeInt(booking.maxDaysAhead, "Los días máximos de anticipación");
    assertNonNegativeInt(booking.minHoursNotice, "Las horas mínimas de anticipación");
    assertNonNegativeInt(booking.holdMinutes, "Los minutos de pre-reserva");
    assertNonNegativeInt(booking.depositValue, "El valor del depósito");
    assertCents(booking.guaranteeAmount, "La garantía");
    if (booking.holdMinutes !== undefined && booking.holdMinutes < 5) {
      throw new CustomError("La pre-reserva debe durar al menos 5 minutos", 400);
    }
    if (
      booking.depositMode !== undefined &&
      !["fixed", "percent", "none"].includes(booking.depositMode)
    ) {
      throw new CustomError("El modo de depósito debe ser fijo, porcentaje o ninguno", 400);
    }
    const mode = booking.depositMode ?? current.booking.depositMode;
    const value = booking.depositValue ?? current.booking.depositValue;
    if (mode === "percent" && value > 100)
      throw new CustomError("El porcentaje de depósito no puede superar 100", 400);

    if (b.mileage && typeof b.mileage === "object") {
      // Se mezcla con lo guardado: updateSettings reemplaza el subobjeto completo.
      const mileage = {
        ...current.booking.mileage,
        ...pick(b.mileage, ["limitedKmPerDay", "extraKmPrice", "unlimitedPricePerDay"]),
      };
      assertNonNegativeInt(mileage.limitedKmPerDay, "Los km incluidos por día");
      assertCents(mileage.extraKmPrice, "El precio por km adicional");
      assertCents(mileage.unlimitedPricePerDay, "El precio del kilometraje ilimitado");
      booking.mileage = mileage;
    }

    if (booking.locations !== undefined) {
      if (!Array.isArray(booking.locations))
        throw new CustomError("Las ubicaciones deben ser una lista", 400);
      for (const l of booking.locations) {
        if (!(LOCATION_CODES as readonly string[]).includes(l?.code)) {
          throw new CustomError(`Ubicación desconocida: ${l?.code}`, 400);
        }
        assertCents(l.fee ?? 0, "El cargo de la ubicación");
      }
    }
    patch.booking = booking as ISetting["booking"];
  }

  if (body?.integrations && typeof body.integrations === "object") {
    const webhookUrl = String(body.integrations.webhookUrl ?? "").trim();
    if (webhookUrl && !/^https:\/\//i.test(webhookUrl)) {
      throw new CustomError("La URL del webhook debe empezar con https://", 400);
    }
    patch.integrations = { webhookUrl };
  }

  return updateSettings(patch);
}

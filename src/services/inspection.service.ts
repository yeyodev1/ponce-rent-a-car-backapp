import { CustomError } from "../errors/customError.error";
import { DAMAGE_ZONES, Inspection } from "../models/inspection.model";
import { Reservation } from "../models/reservation.model";
import { Vehicle } from "../models/vehicle.model";
import { VehicleLog } from "../models/vehicleLog.model";
import { assertObjectId } from "./catalog.service";
import { adminUpdateReservation, StaffRef } from "./reservation.service";

const TYPES = ["delivery", "return"] as const;
type InspectionType = (typeof TYPES)[number];
const SEVERITIES = ["minor", "moderate", "severe"];
const CHECKLIST_KEYS = [
  "spareTire",
  "jack",
  "documents",
  "cleanInterior",
  "cleanExterior",
  "accessories",
] as const;
const MAX_PHOTOS = 40;
const ZONE_LABELS: Record<string, string> = {
  front: "frente",
  rear: "atrás",
  left: "lado izquierdo",
  right: "lado derecho",
  roof: "techo",
  windshield: "parabrisas",
  wheels: "llantas",
  interior: "interior",
  trunk: "maletero",
  other: "otro",
};
const MAX_DAMAGES = 30;

/** Solo URLs http(s): son las que devuelve POST /admin/uploads (Cloudinary o Media). */
function cleanUrl(value: unknown): string {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url) || url.length > 1000) {
    throw new CustomError("Una de las fotos no tiene una URL válida", 400);
  }
  return url;
}

function parseType(value: unknown): InspectionType {
  const type = String(value ?? "");
  if (!(TYPES as readonly string[]).includes(type)) {
    throw new CustomError('El tipo de acta debe ser "delivery" o "return"', 400);
  }
  return type as InspectionType;
}

interface ParsedInspection {
  mileageKm: number;
  fuelLevel: number;
  photos: { url: string; label: string }[];
  damages: {
    zone: string;
    description: string;
    severity: string;
    photo: string;
    isNew: boolean;
    claimedNew: boolean;
  }[];
  checklist: Record<(typeof CHECKLIST_KEYS)[number], boolean>;
  notes: string;
  customerAgreedName: string;
}

function parseBody(body: any): ParsedInspection {
  const mileageKm = Number(body?.mileageKm);
  if (!Number.isInteger(mileageKm) || mileageKm < 0 || mileageKm > 2_000_000) {
    throw new CustomError("El kilometraje debe ser un número entero de km", 400);
  }
  const fuelLevel = Number(body?.fuelLevel);
  if (!Number.isInteger(fuelLevel) || fuelLevel < 0 || fuelLevel > 8) {
    throw new CustomError("El combustible va de 0 a 8 octavos", 400);
  }

  const rawPhotos = Array.isArray(body?.photos) ? body.photos : [];
  if (rawPhotos.length > MAX_PHOTOS)
    throw new CustomError(`Máximo ${MAX_PHOTOS} fotos por acta`, 400);
  const photos = rawPhotos
    .map((p: any) => ({
      url: cleanUrl(p?.url),
      label: String(p?.label ?? "")
        .trim()
        .slice(0, 60),
    }))
    .filter((p: { url: string }) => p.url);

  const rawDamages = Array.isArray(body?.damages) ? body.damages : [];
  if (rawDamages.length > MAX_DAMAGES)
    throw new CustomError(`Máximo ${MAX_DAMAGES} daños por acta`, 400);
  const damages = rawDamages.map((d: any) => {
    const zone = String(d?.zone ?? "other");
    if (!(DAMAGE_ZONES as readonly string[]).includes(zone)) {
      throw new CustomError("Zona de daño inválida", 400);
    }
    const severity = String(d?.severity ?? "minor");
    if (!SEVERITIES.includes(severity)) throw new CustomError("Severidad de daño inválida", 400);
    return {
      zone,
      description: String(d?.description ?? "")
        .trim()
        .slice(0, 500),
      severity,
      photo: cleanUrl(d?.photo),
      isNew: false,
      claimedNew: d?.isNew === true,
    };
  });

  const checklist = Object.fromEntries(
    CHECKLIST_KEYS.map((k) => [k, body?.checklist?.[k] === true]),
  ) as ParsedInspection["checklist"];

  return {
    mileageKm,
    fuelLevel,
    photos,
    damages,
    checklist,
    notes: String(body?.notes ?? "")
      .trim()
      .slice(0, 3000),
    customerAgreedName: String(body?.customerAgreedName ?? "")
      .trim()
      .slice(0, 120),
  };
}

/**
 * Un daño de la devolución es nuevo si su zona no tenía daños en la entrega.
 * El personal puede marcarlo como nuevo aunque la zona ya tuviera otro (un
 * segundo rayón en el mismo parachoques).
 */
function markNewDamages(damages: ParsedInspection["damages"], deliveryDamages: any[]) {
  const before = new Set(deliveryDamages.map((d) => d.zone));
  return damages.map(({ claimedNew, ...d }) => ({ ...d, isNew: claimedNew || !before.has(d.zone) }));
}

function stripClaims(damages: ParsedInspection["damages"]) {
  return damages.map(({ claimedNew: _c, ...d }) => ({ ...d, isNew: false }));
}

export function compare(delivery: any, ret: any, pricing: any) {
  if (!delivery || !ret) return null;
  const kmDriven = Math.max(ret.mileageKm - delivery.mileageKm, 0);
  const includedKm: number | null = pricing?.includedKm ?? null;
  const extraKm = includedKm === null ? 0 : Math.max(kmDriven - includedKm, 0);
  return {
    kmDriven,
    includedKm,
    extraKm,
    extraKmCharge: extraKm * (pricing?.extraKmPrice ?? 0),
    fuelDiff: ret.fuelLevel - delivery.fuelLevel,
    newDamages: (ret.damages || []).filter((d: any) => d.isNew).length,
  };
}

/** GET /admin/reservations/:id/inspections */
export async function getInspections(reservationId: string) {
  assertObjectId(reservationId, "la reserva");
  const reservation = await Reservation.findById(reservationId)
    .select("code status vehicle pricing")
    .lean<any>();
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  const [rows, vehicle] = await Promise.all([
    Inspection.find({ reservation: reservation._id }).lean<any[]>(),
    reservation.vehicle
      ? Vehicle.findById(reservation.vehicle)
          .select("brand model plate year color mileageKm status images")
          .lean<any>()
      : null,
  ]);
  const delivery = rows.find((r) => r.type === "delivery") ?? null;
  const ret = rows.find((r) => r.type === "return") ?? null;
  return {
    delivery,
    return: ret,
    comparison: compare(delivery, ret, reservation.pricing),
    // El panel prellena el km de la entrega con el odómetro actual de la unidad.
    vehicle,
  };
}

/** Odómetro de la unidad: nunca retrocede por un acta. */
async function bumpMileage(vehicleId: unknown, km: number) {
  await Vehicle.updateOne({ _id: vehicleId, mileageKm: { $lt: km } }, { $set: { mileageKm: km } });
}

/** POST /admin/reservations/:id/inspections — guarda el acta y avanza la reserva. */
export async function createInspection(reservationId: string, body: any, staff: StaffRef) {
  assertObjectId(reservationId, "la reserva");
  const type = parseType(body?.type);
  const data = parseBody(body);
  const reservation = await Reservation.findById(reservationId)
    .select("code status vehicle pricing")
    .lean<any>();
  if (!reservation) throw new CustomError("No se encontró la reserva", 404);
  if (!reservation.vehicle) {
    throw new CustomError("Asigna una unidad antes de hacer el acta", 409);
  }

  let damages = stripClaims(data.damages);
  let delivery: any = null;
  if (type === "delivery") {
    if (reservation.status !== "confirmed") {
      throw new CustomError("El acta de entrega se hace con la reserva confirmada", 409);
    }
  } else {
    if (reservation.status !== "delivered") {
      throw new CustomError("El acta de devolución se hace con la reserva en curso", 409);
    }
    delivery = await Inspection.findOne({
      reservation: reservation._id,
      type: "delivery",
    }).lean<any>();
    if (!delivery) throw new CustomError("Primero registra el acta de entrega", 409);
    if (data.mileageKm < delivery.mileageKm) {
      throw new CustomError(
        `El kilometraje no puede ser menor al de la entrega (${delivery.mileageKm} km)`,
        400,
      );
    }
    damages = markNewDamages(data.damages, delivery.damages || []);
  }

  if (await Inspection.exists({ reservation: reservation._id, type })) {
    throw new CustomError("Esta acta ya fue registrada; un administrador puede corregirla", 409);
  }

  let inspection: any;
  try {
    inspection = await Inspection.create({
      ...data,
      damages,
      reservation: reservation._id,
      reservationCode: reservation.code,
      vehicle: reservation.vehicle,
      type,
      performedAt: new Date(),
      performedBy: staff,
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      throw new CustomError("Esta acta ya fue registrada; un administrador puede corregirla", 409);
    }
    throw error;
  }

  // El cambio de estado reutiliza el ciclo estricto (candado de unidad, estado
  // de la unidad, webhooks). Si falla, el acta no queda huérfana.
  try {
    await adminUpdateReservation(reservationId, {
      status: type === "delivery" ? "delivered" : "completed",
    });
  } catch (error) {
    await Inspection.deleteOne({ _id: inspection._id });
    throw error;
  }

  await bumpMileage(reservation.vehicle, data.mileageKm);

  const saved = inspection.toObject();
  if (type === "return") {
    const fresh = damages.filter((d) => d.isNew);
    if (fresh.length) {
      await VehicleLog.create({
        vehicle: reservation.vehicle,
        type: "damage",
        date: new Date(),
        mileageKm: data.mileageKm,
        cost: 0,
        description: `Daños nuevos en la devolución: ${fresh
          .map((d) => `${ZONE_LABELS[d.zone] ?? d.zone}${d.description ? ` (${d.description})` : ""}`)
          .join(", ")}`.slice(0, 2000),
        reservationCode: reservation.code,
        by: staff,
      });
    }
    return {
      inspection: saved,
      comparison: compare(delivery, saved, reservation.pricing),
    };
  }
  return { inspection: saved, comparison: null };
}

/**
 * PUT /admin/reservations/:id/inspections/:type — corrección (solo admin). No
 * cambia el estado de la reserva; recalcula los daños nuevos si es la devolución.
 */
export async function updateInspection(reservationId: string, typeRaw: string, body: any) {
  assertObjectId(reservationId, "la reserva");
  const type = parseType(typeRaw);
  const data = parseBody(body);
  const inspection = await Inspection.findOne({ reservation: reservationId, type });
  if (!inspection) throw new CustomError("No se encontró el acta", 404);
  const reservation = await Reservation.findById(reservationId).select("pricing").lean<any>();

  let damages = stripClaims(data.damages);
  let delivery: any = null;
  let ret: any = null;
  if (type === "return") {
    delivery = await Inspection.findOne({ reservation: reservationId, type: "delivery" }).lean();
    if (delivery && data.mileageKm < delivery.mileageKm) {
      throw new CustomError(
        `El kilometraje no puede ser menor al de la entrega (${delivery.mileageKm} km)`,
        400,
      );
    }
    damages = markNewDamages(data.damages, delivery?.damages || []);
  } else {
    ret = await Inspection.findOne({ reservation: reservationId, type: "return" }).lean<any>();
    if (ret && data.mileageKm > ret.mileageKm) {
      throw new CustomError(
        `El kilometraje no puede ser mayor al de la devolución (${ret.mileageKm} km)`,
        400,
      );
    }
  }

  Object.assign(inspection, { ...data, damages });
  await inspection.save();
  await bumpMileage(inspection.vehicle, data.mileageKm);

  const saved = inspection.toObject();
  return {
    inspection: saved,
    comparison:
      type === "return"
        ? compare(delivery, saved, reservation?.pricing)
        : compare(saved, ret, reservation?.pricing),
  };
}

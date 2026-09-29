import { Types } from "mongoose";
import { BLOCKING_STATUSES, Reservation } from "../models/reservation.model";
import { Vehicle, VehicleStatus } from "../models/vehicle.model";

/** Estados de unidad que la sacan del inventario reservable, pase lo que pase en el calendario. */
const OUT_OF_SERVICE: VehicleStatus[] = ["maintenance", "blocked"];
const HOLD_STATUSES = ["pending_documents", "pending_payment"];

/**
 * Filtro de reservas que ocupan una unidad. Las pendientes solo cuentan
 * mientras su hold esté vigente: un carrito abandonado no puede bloquear
 * la flota aunque el cron aún no lo haya marcado como expirado.
 */
export function activeReservationFilter(now = new Date()): Record<string, unknown> {
  return {
    status: { $in: BLOCKING_STATUSES },
    $or: [
      { status: { $nin: HOLD_STATUSES } },
      { holdExpiresAt: null },
      { holdExpiresAt: { $gt: now } },
    ],
  };
}

/** Solape de rangos semiabiertos: devolver a las 10:00 y retirar a las 10:00 no choca. */
export function overlapFilter(from: Date, to: Date): Record<string, unknown> {
  return { pickupAt: { $lt: to }, returnAt: { $gt: from } };
}

export function reservableVehicleFilter(categoryId?: string): Record<string, unknown> {
  const filter: Record<string, unknown> = { isActive: true, status: { $nin: OUT_OF_SERVICE } };
  if (categoryId) filter.category = new Types.ObjectId(categoryId);
  return filter;
}

/** Ids de unidades ocupadas en el rango. */
export async function busyVehicleIds(from: Date, to: Date, excludeReservationId?: string): Promise<Set<string>> {
  const filter: Record<string, unknown> = {
    ...activeReservationFilter(),
    ...overlapFilter(from, to),
    vehicle: { $ne: null },
  };
  if (excludeReservationId) filter._id = { $ne: new Types.ObjectId(excludeReservationId) };
  const ids: unknown[] = await Reservation.distinct("vehicle", filter);
  return new Set(ids.map(String));
}

/** Unidades libres de una categoría, en orden estable para que la asignación sea predecible. */
export async function freeVehicles(
  categoryId: string,
  from: Date,
  to: Date,
  excludeReservationId?: string,
): Promise<any[]> {
  const [vehicles, busy] = await Promise.all([
    Vehicle.find(reservableVehicleFilter(categoryId)).sort({ createdAt: 1, _id: 1 }).lean<any[]>(),
    busyVehicleIds(from, to, excludeReservationId),
  ]);
  return vehicles.filter((v) => !busy.has(String(v._id)));
}

export async function countAvailableUnits(
  categoryId: string,
  from: Date,
  to: Date,
  excludeReservationId?: string,
): Promise<number> {
  return (await freeVehicles(categoryId, from, to, excludeReservationId)).length;
}

/** Unidades reservables por categoría, sin rango de fechas (listado público). */
export async function countReservableByCategory(): Promise<Map<string, number>> {
  const rows = await Vehicle.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: reservableVehicleFilter() },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/** ¿Está la unidad libre en el rango (ignorando la propia reserva)? */
export async function isVehicleFree(
  vehicleId: string,
  from: Date,
  to: Date,
  excludeReservationId?: string,
): Promise<boolean> {
  const filter: Record<string, unknown> = {
    ...activeReservationFilter(),
    ...overlapFilter(from, to),
    vehicle: new Types.ObjectId(vehicleId),
  };
  if (excludeReservationId) filter._id = { $ne: new Types.ObjectId(excludeReservationId) };
  return !(await Reservation.exists(filter));
}

/**
 * Recalcula el estado visible de la unidad a partir de sus reservas activas.
 * Mantenimiento y bloqueo son decisiones manuales del admin: no se pisan.
 */
export async function syncVehicleStatus(vehicleId: unknown): Promise<void> {
  if (!vehicleId) return;
  const vehicle = await Vehicle.findById(vehicleId).select("status").lean<any>();
  if (!vehicle || OUT_OF_SERVICE.includes(vehicle.status)) return;

  const active = await Reservation.find({ ...activeReservationFilter(), vehicle: vehicle._id })
    .select("status")
    .lean<any[]>();

  let next: VehicleStatus = "available";
  if (active.some((r) => r.status === "delivered")) next = "rented";
  else if (active.some((r) => r.status === "confirmed")) next = "reserved";
  else if (active.length) next = "prereserved";

  if (vehicle.status !== next) await Vehicle.updateOne({ _id: vehicle._id }, { $set: { status: next } });
}

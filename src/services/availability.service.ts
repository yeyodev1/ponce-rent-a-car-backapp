import mongoose, { ClientSession, Types } from "mongoose";
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
export async function busyVehicleIds(
  from: Date,
  to: Date,
  excludeReservationId?: string,
): Promise<Set<string>> {
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

/** Unidades libres por categoría en un rango: una sola lectura de flota y de reservas. */
export async function availableCountsByCategory(
  from: Date,
  to: Date,
): Promise<Map<string, number>> {
  const [vehicles, busy] = await Promise.all([
    Vehicle.find(reservableVehicleFilter()).select("_id category").lean<any[]>(),
    busyVehicleIds(from, to),
  ]);
  const counts = new Map<string, number>();
  for (const v of vehicles) {
    if (busy.has(String(v._id))) continue;
    counts.set(String(v.category), (counts.get(String(v.category)) ?? 0) + 1);
  }
  return counts;
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

  if (vehicle.status !== next)
    await Vehicle.updateOne({ _id: vehicle._id }, { $set: { status: next } });
}

// ---------------------------------------------------------------------------
// Asignación de unidad con candado en base de datos
// ---------------------------------------------------------------------------

/**
 * Corre `work` en una transacción que primero bloquea la unidad: revisa el
 * solape con la misma sesión e incrementa `lockVersion`. Dos transacciones que
 * tocan la misma unidad a la vez chocan en ese incremento (WriteConflict);
 * `withTransaction` reintenta la perdedora con una foto nueva, ve la reserva de
 * la ganadora y la descarta. Devuelve false si la unidad estaba ocupada.
 */
async function withUnitLock(
  session: ClientSession,
  vehicleId: Types.ObjectId | string,
  range: { from: Date; to: Date; excludeReservationId?: string },
  work: () => Promise<void>,
): Promise<boolean> {
  let assigned = false;
  await session.withTransaction(async () => {
    assigned = false;
    const filter: Record<string, unknown> = {
      ...activeReservationFilter(),
      ...overlapFilter(range.from, range.to),
      vehicle: new Types.ObjectId(String(vehicleId)),
    };
    if (range.excludeReservationId)
      filter._id = { $ne: new Types.ObjectId(range.excludeReservationId) };
    if (await Reservation.exists(filter).session(session)) return;
    await Vehicle.updateOne({ _id: vehicleId }, { $inc: { lockVersion: 1 } }, { session });
    await work();
    assigned = true;
  });
  return assigned;
}

/**
 * Crea la reserva con la primera unidad candidata que siga libre dentro de la
 * transacción. null = ninguna quedó libre (el que llama responde 409).
 */
export async function createWithUnit(
  data: Record<string, any>,
  candidateIds: (Types.ObjectId | string)[],
): Promise<any | null> {
  const session = await mongoose.startSession();
  try {
    for (const vehicleId of candidateIds) {
      let created: any = null;
      const ok = await withUnitLock(
        session,
        vehicleId,
        { from: data.pickupAt, to: data.returnAt },
        async () => {
          const [doc] = await Reservation.create([{ ...data, vehicle: vehicleId }], { session });
          created = doc;
        },
      );
      if (ok && created) return created;
    }
    return null;
  } finally {
    await session.endSession();
  }
}

/**
 * Pone `vehicleId` a una reserva existente (y el resto de `set`) solo si la
 * unidad sigue libre en su rango. Se usa en reasignaciones del admin y al
 * confirmar un pago cuyo hold ya había vencido.
 */
export async function assignUnitToReservation(
  reservation: { _id: unknown; pickupAt: Date; returnAt: Date },
  vehicleId: Types.ObjectId | string,
  set: Record<string, unknown> = {},
): Promise<boolean> {
  const session = await mongoose.startSession();
  try {
    return await withUnitLock(
      session,
      vehicleId,
      {
        from: reservation.pickupAt,
        to: reservation.returnAt,
        excludeReservationId: String(reservation._id),
      },
      async () => {
        await Reservation.updateOne(
          { _id: reservation._id },
          { $set: { ...set, vehicle: new Types.ObjectId(String(vehicleId)) } },
          { session },
        );
      },
    );
  } finally {
    await session.endSession();
  }
}

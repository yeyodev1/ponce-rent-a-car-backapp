import { Types } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Inspection } from "../models/inspection.model";
import { Payment } from "../models/payment.model";
import { Reservation } from "../models/reservation.model";
import { Vehicle } from "../models/vehicle.model";
import { VehicleLog } from "../models/vehicleLog.model";
import { assertObjectId } from "./catalog.service";
import { StaffRef } from "./reservation.service";

const LOG_TYPES = ["maintenance", "repair", "damage", "note"] as const;
const LOG_LABELS: Record<string, string> = {
  maintenance: "Mantenimiento",
  repair: "Reparación",
  damage: "Daño",
  note: "Nota",
  status_change: "Cambio de estado",
};
const STATUS_LABELS: Record<string, string> = {
  pending_documents: "Pendiente",
  pending_payment: "Pendiente",
  confirmed: "Confirmada",
  delivered: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  expired: "Expirada",
};
const FUEL_LABEL = (octavos: number) =>
  octavos === 8 ? "lleno" : octavos === 0 ? "vacío" : `${octavos}/8`;

async function findVehicle(id: string) {
  assertObjectId(id, "la unidad");
  const vehicle = await Vehicle.findById(id).populate("category", "slug name").lean<any>();
  if (!vehicle) throw new CustomError("No se encontró la unidad", 404);
  return vehicle;
}

/** GET /admin/vehicles/:id/history — reservas, actas y bitácora en una sola línea de tiempo. */
export async function getHistory(id: string) {
  const vehicle = await findVehicle(id);
  const vid = new Types.ObjectId(id);
  const [reservations, inspections, logs] = await Promise.all([
    Reservation.find({ vehicle: vid })
      .select("code status pickupAt returnAt pricing.total amountPaid customer createdAt")
      .populate("customer", "name")
      .sort({ pickupAt: -1 })
      .limit(500)
      .lean<any[]>(),
    Inspection.find({ vehicle: vid }).sort({ performedAt: -1 }).limit(1000).lean<any[]>(),
    VehicleLog.find({ vehicle: vid }).sort({ date: -1 }).limit(1000).lean<any[]>(),
  ]);

  // Ingresos = lo cobrado de verdad en reservas que usaron la unidad (sin anulados ni reembolsos).
  const revenueRows = reservations.length
    ? await Payment.aggregate<{ total: number }>([
        {
          $match: {
            reservation: { $in: reservations.map((r) => r._id) },
            status: "approved",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
    : [];

  const timeline: any[] = [];
  for (const r of reservations) {
    timeline.push({
      kind: "reservation",
      id: String(r._id),
      at: r.pickupAt,
      title: `Reserva ${r.code} · ${STATUS_LABELS[r.status] ?? r.status}`,
      detail: `${r.customer?.name ?? "Cliente"} · ${new Date(r.pickupAt).toISOString().slice(0, 10)} → ${new Date(r.returnAt).toISOString().slice(0, 10)}`,
      reservationCode: r.code,
      reservationId: String(r._id),
      status: r.status,
      amount: r.pricing?.total ?? 0,
    });
  }
  for (const i of inspections) {
    const newDamages = (i.damages || []).filter((d: any) => d.isNew).length;
    const parts = [
      `${i.mileageKm.toLocaleString("es-EC")} km`,
      `combustible ${FUEL_LABEL(i.fuelLevel)}`,
      `${(i.damages || []).length} daño(s)${newDamages ? `, ${newDamages} nuevo(s)` : ""}`,
    ];
    timeline.push({
      kind: "inspection",
      id: String(i._id),
      at: i.performedAt,
      title: `${i.type === "delivery" ? "Acta de entrega" : "Acta de devolución"} · ${i.reservationCode}`,
      detail: parts.join(" · "),
      reservationCode: i.reservationCode,
      reservationId: String(i.reservation),
      mileageKm: i.mileageKm,
      fuelLevel: i.fuelLevel,
      inspectionType: i.type,
      photos: i.photos || [],
      damages: i.damages || [],
      notes: i.notes || "",
      by: i.performedBy?.name || i.performedBy?.email || "",
    });
  }
  for (const l of logs) {
    timeline.push({
      kind: "log",
      id: String(l._id),
      at: l.date,
      title: LOG_LABELS[l.type] ?? l.type,
      detail: l.description,
      logType: l.type,
      reservationCode: l.reservationCode || undefined,
      mileageKm: l.mileageKm ?? undefined,
      cost: l.cost || 0,
      by: l.by?.name || l.by?.email || "",
    });
  }
  timeline.sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const rentals = reservations.filter((r) => ["delivered", "completed"].includes(r.status));
  let kmDriven = 0;
  const byReservation = new Map<string, { delivery?: number; return?: number }>();
  for (const i of inspections) {
    const key = String(i.reservation);
    const entry = byReservation.get(key) ?? {};
    entry[i.type as "delivery" | "return"] = i.mileageKm;
    byReservation.set(key, entry);
  }
  for (const e of byReservation.values()) {
    if (e.delivery !== undefined && e.return !== undefined) kmDriven += Math.max(e.return - e.delivery, 0);
  }

  return {
    vehicle,
    timeline,
    stats: {
      rentals: rentals.length,
      kmDriven,
      revenue: revenueRows[0]?.total ?? 0,
      lastInspectionAt: inspections[0]?.performedAt ?? null,
      maintenanceCost: logs.reduce((sum, l) => sum + (l.cost || 0), 0),
    },
  };
}

/** GET /admin/vehicles/:id/logs */
export async function listLogs(id: string) {
  await findVehicle(id);
  return VehicleLog.find({ vehicle: id }).sort({ date: -1 }).limit(1000).lean();
}

/** POST /admin/vehicles/:id/logs */
export async function createLog(id: string, body: any, staff: StaffRef) {
  const vehicle = await findVehicle(id);
  const type = String(body?.type ?? "");
  if (!(LOG_TYPES as readonly string[]).includes(type)) {
    throw new CustomError("Tipo inválido: mantenimiento, reparación, daño o nota", 400);
  }
  const description = String(body?.description ?? "")
    .trim()
    .slice(0, 2000);
  if (!description) throw new CustomError("Escribe una descripción", 400);

  let date = new Date();
  if (body?.date) {
    const raw = String(body.date);
    // "YYYY-MM-DD" es un día de Guayaquil: se ancla al mediodía para que no cambie de fecha.
    date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00-05:00` : raw);
    if (Number.isNaN(date.getTime())) throw new CustomError("Fecha inválida", 400);
  }

  let mileageKm: number | null = null;
  if (body?.mileageKm !== undefined && body.mileageKm !== null && body.mileageKm !== "") {
    mileageKm = Number(body.mileageKm);
    if (!Number.isInteger(mileageKm) || mileageKm < 0) {
      throw new CustomError("El kilometraje debe ser un número entero de km", 400);
    }
  }
  const cost = body?.cost === undefined || body.cost === null || body.cost === "" ? 0 : Number(body.cost);
  if (!Number.isInteger(cost) || cost < 0) {
    throw new CustomError("El costo debe ser un entero en centavos", 400);
  }

  const log = await VehicleLog.create({
    vehicle: vehicle._id,
    type,
    date,
    mileageKm,
    cost,
    description,
    reservationCode: String(body?.reservationCode ?? "")
      .trim()
      .slice(0, 30),
    by: staff,
  });
  if (mileageKm !== null) {
    await Vehicle.updateOne(
      { _id: vehicle._id, mileageKm: { $lt: mileageKm } },
      { $set: { mileageKm } },
    );
  }
  return log.toObject();
}

/** DELETE /admin/vehicles/:id/logs/:logId (solo admin) */
export async function deleteLog(id: string, logId: string) {
  assertObjectId(id, "la unidad");
  assertObjectId(logId, "el registro");
  const log = await VehicleLog.findOneAndDelete({ _id: logId, vehicle: id }).lean<any>();
  if (!log) throw new CustomError("No se encontró el registro de la bitácora", 404);
  return log;
}

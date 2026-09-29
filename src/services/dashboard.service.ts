import { Lead, LEAD_STATUSES } from "../models/lead.model";
import { Payment } from "../models/payment.model";
import { Reservation } from "../models/reservation.model";
import { Vehicle, VEHICLE_STATUSES } from "../models/vehicle.model";
import { fromLocal, localParts } from "./pricing.service";
import { expireHolds } from "./reservation.service";

/** Una reserva "cuenta" cuando se pagó; los holds vencidos o cancelados no son ventas. */
const SOLD_STATUSES = ["confirmed", "delivered", "completed"];
const TZ = "-05:00";

function monthStart(year: number, month: number): Date {
  return fromLocal(year, month, 1);
}

async function revenueBetween(from: Date, to: Date): Promise<number> {
  const [row] = await Payment.aggregate<{ total: number }>([
    { $match: { status: "approved", approvedAt: { $gte: from, $lt: to } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return row?.total ?? 0;
}

export async function getDashboard() {
  // Mantiene "fleet" al día aunque el cron de Vercel corra una vez al día.
  await expireHolds();
  const now = new Date();
  const { year, month } = localParts(now);
  const thisMonth = monthStart(year, month);
  const nextMonth = monthStart(year, month + 1);
  const prevMonth = monthStart(year, month - 1);
  const yearAgo = monthStart(year, month - 11);

  const between = (from: Date, to: Date) => ({ createdAt: { $gte: from, $lt: to } });

  const [
    leadsMonth,
    leadsPrevMonth,
    reservationsMonth,
    reservationsPrevMonth,
    revenueMonth,
    revenuePrevMonth,
    leadStatusRows,
    leadSourceRows,
    reservationsByMonthRows,
    revenueByMonthRows,
    latestReservations,
    latestLeads,
    fleetRows,
  ] = await Promise.all([
    Lead.countDocuments(between(thisMonth, nextMonth)),
    Lead.countDocuments(between(prevMonth, thisMonth)),
    Reservation.countDocuments({ ...between(thisMonth, nextMonth), status: { $in: SOLD_STATUSES } }),
    Reservation.countDocuments({ ...between(prevMonth, thisMonth), status: { $in: SOLD_STATUSES } }),
    revenueBetween(thisMonth, nextMonth),
    revenueBetween(prevMonth, thisMonth),
    Lead.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Lead.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Reservation.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: yearAgo }, status: { $in: SOLD_STATUSES } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: TZ } }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ _id: string; revenue: number }>([
      { $match: { status: "approved", approvedAt: { $gte: yearAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$approvedAt", timezone: TZ } },
          revenue: { $sum: "$amount" },
        },
      },
    ]),
    Reservation.find()
      .populate("customer", "name")
      .select("code status categorySlug categoryName pickupAt returnAt pricing.total amountPaid customer createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean<any[]>(),
    Lead.find()
      .select("code status source channel name phone categorySlug createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Vehicle.aggregate<{ _id: string; count: number }>([
      { $match: { isActive: true } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const leadsByStatus: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
  for (const r of leadStatusRows) leadsByStatus[r._id] = r.count;

  const fleet: Record<string, number> = Object.fromEntries(VEHICLE_STATUSES.map((s) => [s, 0]));
  for (const r of fleetRows) fleet[r._id] = r.count;

  // Los 12 meses siempre presentes (con 0) para que el gráfico no tenga huecos.
  const reservationsByMonth = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 11 + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      month: key,
      count: reservationsByMonthRows.find((r) => r._id === key)?.count ?? 0,
      revenue: revenueByMonthRows.find((r) => r._id === key)?.revenue ?? 0,
    };
  });

  return {
    kpis: {
      leadsMonth,
      leadsPrevMonth,
      reservationsMonth,
      reservationsPrevMonth,
      revenueMonth,
      revenuePrevMonth,
      conversionRate: leadsMonth ? Math.round((reservationsMonth / leadsMonth) * 1000) / 10 : 0,
    },
    leadsByStatus,
    leadsBySource: leadSourceRows.map((r) => ({ source: r._id, count: r.count })),
    reservationsByMonth,
    latestReservations: latestReservations.map((r) => ({
      _id: r._id,
      code: r.code,
      status: r.status,
      customerName: r.customer?.name ?? "",
      categorySlug: r.categorySlug,
      categoryName: r.categoryName,
      pickupAt: r.pickupAt,
      returnAt: r.returnAt,
      total: r.pricing?.total ?? 0,
      amountPaid: r.amountPaid,
      createdAt: r.createdAt,
    })),
    latestLeads,
    fleet,
  };
}

import { Request, Response, NextFunction } from "express";
import * as guaranteeService from "../services/guarantee.service";
import * as inspectionService from "../services/inspection.service";
import * as paymentVoidService from "../services/paymentVoid.service";
import * as vehicleHistoryService from "../services/vehicleHistory.service";
import { AuditEntry, logAudit } from "../services/audit.service";
import { StaffRef } from "../services/reservation.service";
import { AuthRequest } from "../types/AuthRequest";

/**
 * Ejecuta el service, responde y deja constancia en la auditoría solo si la
 * operación salió bien (`audit` recibe el resultado para armar el resumen).
 */
function handle(
  fn: (req: AuthRequest) => Promise<any>,
  status = 200,
  audit?: (req: AuthRequest, result: any) => AuditEntry,
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await fn(req);
      if (audit) {
        await logAudit({ ...audit(req, result), actor: actorOf(req) }, req);
        // Ya quedó un registro más rico que el genérico: el middleware no lo repite.
        res.locals.auditLogged = true;
      }
      if (status === 204) res.status(204).end();
      else res.status(status).json(result);
    } catch (error) {
      next(error);
    }
  };
}

const id = (req: Request) => String(req.params.id);
const isAdmin = (req: AuthRequest) => req.user?.accountType === "admin";

const staffOf = (req: AuthRequest): StaffRef => ({
  id: String(req.user?.userId ?? ""),
  name: req.user?.name ?? "",
  email: req.user?.email ?? "",
});
const actorOf = (req: AuthRequest) => ({ ...staffOf(req), role: req.user?.accountType ?? "" });

const TYPE_LABEL: Record<string, string> = { delivery: "entrega", return: "devolución" };
const GUARANTEE_VERB: Record<string, string> = {
  hold: "Retuvo",
  release: "Liberó",
  charge: "Cobró",
};
const usd = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

// Actas
export const getInspections = handle((req) => inspectionService.getInspections(id(req)));
export const createInspection = handle(
  (req) => inspectionService.createInspection(id(req), req.body, staffOf(req)),
  201,
  (req, r) => ({
    action: `inspection.${r.inspection.type}`,
    entity: "reservation",
    entityId: id(req),
    summary: `Registró el acta de ${TYPE_LABEL[r.inspection.type]} de ${r.inspection.reservationCode} (${r.inspection.mileageKm} km)`,
  }),
);
export const updateInspection = handle(
  (req) => inspectionService.updateInspection(id(req), String(req.params.type), req.body),
  200,
  (req, r) => ({
    action: "inspection.update",
    entity: "reservation",
    entityId: id(req),
    summary: `Corrigió el acta de ${TYPE_LABEL[r.inspection.type]} de ${r.inspection.reservationCode}`,
  }),
);

// Historial y bitácora de la unidad
export const vehicleHistory = handle((req) => vehicleHistoryService.getHistory(id(req)));
export const listLogs = handle((req) => vehicleHistoryService.listLogs(id(req)));
export const createLog = handle(
  (req) => vehicleHistoryService.createLog(id(req), req.body, staffOf(req)),
  201,
  (req, r) => ({
    action: "vehicle.log_create",
    entity: "vehicle",
    entityId: id(req),
    summary: `Agregó a la bitácora (${r.type}): ${String(r.description).slice(0, 120)}`,
  }),
);
export const deleteLog = handle(
  (req) => vehicleHistoryService.deleteLog(id(req), String(req.params.logId)),
  204,
  (req, r) => ({
    action: "vehicle.log_delete",
    entity: "vehicle",
    entityId: id(req),
    summary: `Eliminó de la bitácora (${r.type}): ${String(r.description).slice(0, 120)}`,
  }),
);

// Garantía
export const updateGuarantee = handle(
  (req) => guaranteeService.updateGuarantee(id(req), req.body, staffOf(req), isAdmin(req)),
  200,
  (req, r) => ({
    action: `guarantee.${r.action}`,
    entity: "reservation",
    entityId: id(req),
    summary: `${GUARANTEE_VERB[r.action]} la garantía de ${r.code}: ${usd(
      r.action === "charge" ? r.guarantee.chargedAmount : r.guarantee.amount,
    )}${r.action === "charge" ? ` · ${r.guarantee.chargeReason}` : ""}`,
  }),
);

// Anulación de pagos
export const voidPayment = handle(
  (req) => paymentVoidService.voidPayment(id(req), req.body, staffOf(req), isAdmin(req)),
  200,
  (req, r) => ({
    action: "payment.void",
    entity: "payment",
    entityId: id(req),
    summary: `Anuló un pago de ${usd(r.amount)} de ${r.reservationCode}: ${r.voidReason}`,
  }),
);

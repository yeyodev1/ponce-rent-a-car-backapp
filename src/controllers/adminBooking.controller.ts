import { Request, Response, NextFunction } from "express";
import * as documentService from "../services/document.service";
import * as paymentService from "../services/payment.service";
import * as reservationService from "../services/reservation.service";
import { AuthRequest } from "../types/AuthRequest";

function handle(fn: (req: AuthRequest) => Promise<unknown>, status = 200) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.status(status).json(await fn(req));
    } catch (error) {
      next(error);
    }
  };
}

const id = (req: Request) => String(req.params.id);

/** Quién hizo la acción, tal como queda guardado en la reserva o el pago. */
const staffOf = (req: AuthRequest): reservationService.StaffRef => ({
  id: String(req.user?.userId ?? ""),
  name: req.user?.name ?? "",
  email: req.user?.email ?? "",
});

export const listReservations = handle((req) =>
  reservationService.adminListReservations(req.query),
);
export const getReservation = handle((req) => reservationService.adminGetReservation(id(req)));
export const createReservation = handle(
  (req) => reservationService.adminCreateReservation(req.body, staffOf(req)),
  201,
);
export const updateReservation = handle((req) =>
  reservationService.adminUpdateReservation(id(req), req.body),
);

export const listCustomers = handle((req) => reservationService.adminListCustomers(req.query));
export const getCustomer = handle((req) => reservationService.adminGetCustomer(id(req)));

export const addPayment = handle(
  (req) => paymentService.addManualPayment(id(req), req.body, staffOf(req)),
  201,
);
export const listPayments = handle((req) => reservationService.adminListPayments(req.query));
export const refundPayment = handle((req) => paymentService.refundPayment(id(req)));

/** GET /api/admin/reservations/:id/documents/:kind — archivo binario para verlo en el navegador. */
export async function getDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const file = await documentService.getDocumentFile(id(req), String(req.params.kind));
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Length", String(file.data.length));
    res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
    // Datos personales: que ningún proxy ni el navegador los guarde en caché.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(file.data);
  } catch (error) {
    next(error);
  }
}

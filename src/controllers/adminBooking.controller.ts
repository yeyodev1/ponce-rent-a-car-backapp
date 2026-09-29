import { Request, Response, NextFunction } from "express";
import * as documentService from "../services/document.service";
import * as reservationService from "../services/reservation.service";

function handle(fn: (req: Request) => Promise<unknown>, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json(await fn(req));
    } catch (error) {
      next(error);
    }
  };
}

const id = (req: Request) => String(req.params.id);

export const listReservations = handle((req) => reservationService.adminListReservations(req.query));
export const getReservation = handle((req) => reservationService.adminGetReservation(id(req)));
export const updateReservation = handle((req) => reservationService.adminUpdateReservation(id(req), req.body));

export const listCustomers = handle((req) => reservationService.adminListCustomers(req.query));
export const getCustomer = handle((req) => reservationService.adminGetCustomer(id(req)));

export const listPayments = handle((req) => reservationService.adminListPayments(req.query));

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

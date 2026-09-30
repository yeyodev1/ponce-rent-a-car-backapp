import { Request, Response, NextFunction } from "express";
import * as customerService from "../services/customer.service";
import * as documentService from "../services/document.service";
import * as pricingService from "../services/pricing.service";
import * as reservationService from "../services/reservation.service";

/** El token del cliente llega como `?t=` o en el header `X-Reservation-Token`. */
export function accessToken(req: Request): string {
  const fromQuery = typeof req.query.t === "string" ? req.query.t : "";
  return fromQuery || String(req.get("x-reservation-token") ?? "");
}

export function requestMeta(req: Request): reservationService.RequestMeta {
  const forwarded = String(req.get("x-forwarded-for") ?? "")
    .split(",")[0]
    .trim();
  return { ip: forwarded || req.ip, userAgent: req.get("user-agent") ?? undefined };
}

/** POST /api/public/quote */
export async function quote(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await pricingService.quote(req.body));
  } catch (error) {
    next(error);
  }
}

/** POST /api/public/reservations — 201 si es nueva, 200 si era un duplicado. */
export async function createReservation(req: Request, res: Response, next: NextFunction) {
  try {
    const { created, reservation } = await reservationService.createReservation(
      req.body,
      requestMeta(req),
    );
    res.status(created ? 201 : 200).json(reservation);
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/reservations/:code?t= */
export async function getReservation(req: Request, res: Response, next: NextFunction) {
  try {
    res
      .status(200)
      .json(
        await reservationService.getPublicReservation(String(req.params.code), accessToken(req)),
      );
  } catch (error) {
    next(error);
  }
}

/** PATCH /api/public/reservations/:code/contact?t= — { email?, phone? } */
export async function updateContact(req: Request, res: Response, next: NextFunction) {
  try {
    res
      .status(200)
      .json(
        await customerService.updatePublicContact(
          String(req.params.code),
          accessToken(req),
          req.body,
        ),
      );
  } catch (error) {
    next(error);
  }
}

/** POST /api/public/reservations/:code/documents?t= — multipart (license, identity) o JSON { kind, dataUrl }. */
export async function uploadDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const incoming: documentService.IncomingDocument[] = [];
    for (const kind of documentService.DOCUMENT_KINDS) {
      const file = files[kind]?.[0];
      if (file) incoming.push({ kind, buffer: file.buffer, declaredType: file.mimetype });
    }
    if (!incoming.length && req.body?.dataUrl) {
      incoming.push(documentService.fromDataUrl(req.body.kind, req.body.dataUrl));
    }
    const result = await documentService.uploadDocuments(
      String(req.params.code),
      accessToken(req),
      incoming,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

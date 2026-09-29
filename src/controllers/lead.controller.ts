import { Request, Response, NextFunction } from "express";
import * as leadService from "../services/lead.service";
import * as partnerService from "../services/partner.service";

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.ip || undefined;
}

/** POST /api/public/leads — crea o actualiza (por leadId) antes de abrir WhatsApp o llamar. */
export async function upsertLead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await leadService.upsertPublicLead(req.body ?? {}, {
      ip: clientIp(req),
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/public/partners — Socio sobre Ruedas. */
export async function createPartner(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await partnerService.createPartnerApplication(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** POST /api/public/renaissance — interés en el club. */
export async function joinRenaissance(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await partnerService.joinRenaissance(req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/geo — país según Vercel; señal secundaria para el idioma. */
export function geo(req: Request, res: Response) {
  const header = req.headers["x-vercel-ip-country"];
  const country = String((Array.isArray(header) ? header[0] : header) ?? "").toUpperCase();
  res.set("Cache-Control", "private, no-store");
  res.status(200).json({ country });
}

import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as leadService from "../services/lead.service";
import * as partnerService from "../services/partner.service";

export async function listLeads(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await leadService.listLeads(req.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
}

export async function getLead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await leadService.getLead(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

export async function updateLead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await leadService.updateLead(String(req.params.id), req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

export async function addNote(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const lead = await leadService.addLeadNote(String(req.params.id), req.body?.text, req.user?.email ?? "admin");
    res.status(201).json(lead);
  } catch (error) {
    next(error);
  }
}

export async function deleteLead(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await leadService.deleteLead(String(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function listPartners(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await partnerService.listPartners(req.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
}

export async function updatePartner(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await partnerService.updatePartner(String(req.params.id), req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

export async function listRenaissance(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await partnerService.listClubMembers(req.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from "express";
import * as auditLogService from "../services/auditLog.service";

/** GET /api/admin/audit?actor=&action=&entity=&from=&to=&q=&page= */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await auditLogService.listAudit(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/audit/actors */
export async function actors(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await auditLogService.listActors());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/audit/export.csv (mismos filtros del listado) */
export async function exportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const { filename, csv } = await auditLogService.exportAuditCsv(req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

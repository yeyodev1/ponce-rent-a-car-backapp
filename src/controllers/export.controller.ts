import { Request, Response, NextFunction } from "express";
import * as exportService from "../services/export.service";

/** GET /api/admin/export/:entity.csv */
export async function csv(req: Request, res: Response, next: NextFunction) {
  try {
    const { filename, csv: body } = await exportService.exportCsv(String(req.params.entity));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(body);
  } catch (error) {
    next(error);
  }
}

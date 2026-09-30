import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as staffService from "../services/staff.service";

function handle(fn: (req: AuthRequest) => Promise<unknown>, status = 200) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.status(status).json(await fn(req));
    } catch (error) {
      next(error);
    }
  };
}

const id = (req: AuthRequest) => String(req.params.id);
const actor = (req: AuthRequest) => String(req.user?.userId ?? "");

export const list = handle((req) => staffService.listStaff(req.query));
export const create = handle((req) => staffService.createStaff(req.body), 201);
export const update = handle((req) => staffService.updateStaff(id(req), req.body, actor(req)));
/** DELETE /api/admin/staff/:id → 204 */
export async function remove(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await staffService.deleteStaff(id(req), actor(req));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export const setActive = handle((req) =>
  staffService.setStaffActive(id(req), req.body?.isActive, actor(req)),
);

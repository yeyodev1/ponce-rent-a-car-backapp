import { Response, NextFunction } from "express";
import { STAFF_TYPES } from "../models/user.model";
import { AuthRequest } from "../types/AuthRequest";

/** Personal del local (employee o admin). Va siempre después de authMiddleware. */
export function staffMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!(STAFF_TYPES as readonly string[]).includes(String(req.user?.accountType))) {
    res.status(403).json({ message: "No tienes permiso para ver esto" });
    return;
  }
  next();
}

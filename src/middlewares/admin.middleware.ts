import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";

/** Solo administradores. Va siempre después de authMiddleware + staffMiddleware. */
export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.accountType !== "admin") {
    res.status(403).json({ message: "Solo un administrador puede hacer esto" });
    return;
  }
  next();
}

import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";

/**
 * Registra en la bitácora cada mutación del panel (POST/PUT/PATCH/DELETE bajo
 * /admin) al terminar la respuesta. Implementación en v1.3 (ver docs/API.md §8.D).
 */
export function auditMiddleware(_req: AuthRequest, _res: Response, next: NextFunction) {
  next();
}

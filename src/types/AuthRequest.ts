import { Request } from "express";

export interface JwtPayload {
  userId: string;
  email: string;
  accountType: string;
  /** Lo completa authMiddleware desde la base; el token no lo lleva. */
  name?: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

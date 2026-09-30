import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User } from "../models/user.model";
import { AuthRequest, JwtPayload } from "../types/AuthRequest";

/**
 * Además de la firma, consulta la cuenta en cada petición: un token vive 30 días
 * y desactivar a un empleado o cambiarle el rol tiene que surtir efecto ya, no
 * cuando el token venza. Una consulta por _id es barata.
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  try {
    const user = await User.findById(decoded.userId)
      .select("email name accountType isActive")
      .lean<any>();
    if (!user || !user.isActive) {
      res.status(401).json({ message: "Tu cuenta no está activa. Inicia sesión de nuevo" });
      return;
    }
    // El rol sale de la base, no del token: así un cambio de rol aplica de inmediato.
    req.user = {
      userId: String(user._id),
      email: user.email,
      accountType: user.accountType,
      name: user.name ?? "",
    };
    next();
  } catch (error) {
    next(error);
  }
}

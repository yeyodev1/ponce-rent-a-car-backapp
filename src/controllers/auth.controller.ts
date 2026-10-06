import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import { CustomError } from "../errors/customError.error";
import * as authService from "../services/auth.service";
import { logAudit } from "../services/audit.service";

/** POST /api/auth/login — body: { email, password } */
export async function login(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body ?? {};
  // Solo el correo intentado (recortado) va a la bitácora; la contraseña nunca.
  const tried = String(email ?? "").toLowerCase().trim().slice(0, 120);
  try {
    const result = await authService.login(String(email ?? ""), String(password ?? ""));
    await logAudit(
      {
        action: "login",
        entity: "staff",
        entityId: result.user.id,
        summary: "Inició sesión en el panel",
        actor: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.accountType },
      },
      req,
    );
    res.status(200).json(result);
  } catch (error) {
    const status = (error as CustomError).status;
    if (status && status < 500) {
      await logAudit(
        {
          action: "login_failed",
          entity: "staff",
          summary: `Intento de inicio de sesión fallido con ${tried || "(sin correo)"}`,
          success: false,
          actor: null,
        },
        req,
      );
    }
    next(error);
  }
}

/** GET /api/auth/me — devuelve la sesión del token. */
export async function me(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new CustomError("No autorizado", 401);
    const user = await authService.findById(req.user.userId);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}

/** PUT /api/auth/password — body: { current, next } */
export async function changePassword(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new CustomError("No autorizado", 401);
    const { current, next: nueva } = req.body ?? {};
    const user = await authService.changePassword(
      req.user.userId,
      String(current ?? ""),
      String(nueva ?? ""),
    );
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import { CustomError } from "../errors/customError.error";
import * as contractService from "../services/contract.service";
import { renderContractPdf } from "../services/contractPdf.service";
import { accessToken, requestMeta } from "./booking.controller";

async function sendPdf(res: Response, data: Awaited<ReturnType<typeof contractService.contractForPdf>>, inline: boolean) {
  const { reservation, view } = data;
  const pdf = await renderContractPdf({
    code: reservation.code,
    version: view.version,
    title: view.title,
    text: view.text,
    language: view.language,
    signed: view.status === "signed",
    hash: view.hash,
    acceptance: view.acceptance,
  });
  const suffix = view.status === "signed" ? "" : "-borrador";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="contrato-${reservation.code}${suffix}.pdf"`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).send(pdf);
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

/** GET /api/public/reservations/:code/contract?t= */
export async function getPublic(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await contractService.getPublicContract(String(req.params.code), accessToken(req)));
  } catch (error) {
    next(error);
  }
}

/** POST /api/public/reservations/:code/contract/accept?t= — { name, documentNumber, accepted: true } */
export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    res
      .status(200)
      .json(
        await contractService.acceptContract(String(req.params.code), accessToken(req), req.body, requestMeta(req)),
      );
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/reservations/:code/contract.pdf?t= (?inline=1 para abrirlo en el navegador) */
export async function publicPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await contractService.contractForPdf({ code: String(req.params.code), token: accessToken(req) });
    await sendPdf(res, data, req.query.inline === "1");
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /api/admin/reservations/:id/contract */
export async function adminGet(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await contractService.adminGetContract(String(req.params.id)));
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/reservations/:id/contract.pdf */
export async function adminPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await contractService.contractForPdf({ id: String(req.params.id) });
    await sendPdf(res, data, false);
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/contract-templates */
export async function listTemplates(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await contractService.listTemplates());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/contract-templates/active */
export async function activeTemplate(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await contractService.getActive());
  } catch (error) {
    next(error);
  }
}

/** GET /api/admin/contract-templates/variables */
export function variables(_req: Request, res: Response) {
  res.status(200).json(contractService.CONTRACT_VARIABLES);
}

/** POST /api/admin/contract-templates — { title, body } → versión nueva activa. */
export async function createTemplate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new CustomError("No autorizado", 401);
    const actor = { id: req.user.userId, name: req.user.name ?? "", email: req.user.email };
    res.status(201).json(await contractService.createTemplate(req.body, actor));
  } catch (error) {
    next(error);
  }
}

/** POST /api/admin/contract-templates/preview — { body, title?, reservationId?, language? } */
export async function preview(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await contractService.previewTemplate(req.body));
  } catch (error) {
    next(error);
  }
}

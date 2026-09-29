import { Request, Response, NextFunction } from "express";
import * as payphoneService from "../services/payphone.service";
import { accessToken, requestMeta } from "./booking.controller";

/** POST /api/public/reservations/:code/checkout?t= — body: { mode: "deposit" | "full" } */
export async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await payphoneService.createCheckout(String(req.params.code), accessToken(req), req.body?.mode);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/** POST /api/public/payments/confirm — body: { id, clientTransactionId } */
export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await payphoneService.confirmPayment(req.body, requestMeta(req)));
  } catch (error) {
    next(error);
  }
}

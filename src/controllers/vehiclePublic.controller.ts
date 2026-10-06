import { Request, Response, NextFunction } from "express";
import * as vehiclePublicService from "../services/vehiclePublic.service";

/** GET /api/public/vehicles/:slug */
export async function getVehicle(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await vehiclePublicService.getPublicVehicle(String(req.params.slug)));
  } catch (error) {
    next(error);
  }
}

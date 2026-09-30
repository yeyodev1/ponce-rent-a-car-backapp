import { Request, Response, NextFunction } from "express";
import * as catalogService from "../services/catalog.service";

/** GET /api/public/config */
export async function config(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.getPublicConfig());
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/categories?from=&to= */
export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.listPublicCategories(req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/categories/:slug */
export async function getCategory(req: Request, res: Response, next: NextFunction) {
  try {
    res
      .status(200)
      .json(await catalogService.getPublicCategory(String(req.params.slug), req.query));
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/coverages */
export async function listCoverages(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.listPublicCoverages());
  } catch (error) {
    next(error);
  }
}

/** GET /api/public/extras */
export async function listExtras(_req: Request, res: Response, next: NextFunction) {
  try {
    res.status(200).json(await catalogService.listPublicExtras());
  } catch (error) {
    next(error);
  }
}

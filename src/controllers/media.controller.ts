import { Request, Response, NextFunction } from "express";
import * as mediaService from "../services/media.service";

/** GET /api/public/media/:id — el id nunca cambia de contenido, así que la caché es inmutable. */
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const media = await mediaService.getMedia(String(req.params.id));
    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Content-Length", String(media.data.length));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(media.data);
  } catch (error) {
    next(error);
  }
}

import { Request, Response, NextFunction } from "express";
import * as contentService from "../services/content.service";

// Contenido público que cambia poco: se deja cachear en el CDN un rato corto.
const PUBLIC_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

export async function promotions(_req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", PUBLIC_CACHE).json(await contentService.listPublicPromotions());
  } catch (error) {
    next(error);
  }
}

export async function hotels(_req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", PUBLIC_CACHE).json(await contentService.listPublicHotels());
  } catch (error) {
    next(error);
  }
}

export async function guides(_req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", PUBLIC_CACHE).json(await contentService.listPublicGuides());
  } catch (error) {
    next(error);
  }
}

export async function guide(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", PUBLIC_CACHE).json(await contentService.getPublicGuide(String(req.params.slug)));
  } catch (error) {
    next(error);
  }
}

export async function faqs(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", PUBLIC_CACHE).json(await contentService.listPublicFaqs(req.query.topic));
  } catch (error) {
    next(error);
  }
}

export async function seo(req: Request, res: Response, next: NextFunction) {
  try {
    res.set("Cache-Control", PUBLIC_CACHE).json(await contentService.getPublicSeo(String(req.params.key)));
  } catch (error) {
    next(error);
  }
}

export async function sitemap(_req: Request, res: Response, next: NextFunction) {
  try {
    const xml = await contentService.buildSitemap();
    res.set("Cache-Control", "public, s-maxage=3600").type("application/xml").send(xml);
  } catch (error) {
    next(error);
  }
}

import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";
import * as contentService from "../services/content.service";
import { ContentKind } from "../services/content.service";

/**
 * Promociones, hoteles, guías y FAQs comparten el mismo CRUD: cada handler se
 * genera para su tipo y así las cuatro rutas se comportan igual.
 */
export function crud(kind: ContentKind) {
  return {
    list: async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        res.json(await contentService.listContent(kind, req.query as Record<string, unknown>));
      } catch (error) {
        next(error);
      }
    },
    get: async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        res.json(await contentService.getContent(kind, String(req.params.id)));
      } catch (error) {
        next(error);
      }
    },
    create: async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        res.status(201).json(await contentService.createContent(kind, req.body ?? {}));
      } catch (error) {
        next(error);
      }
    },
    update: async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        res.json(await contentService.updateContent(kind, String(req.params.id), req.body ?? {}));
      } catch (error) {
        next(error);
      }
    },
    remove: async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        await contentService.deleteContent(kind, String(req.params.id));
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  };
}

export async function listSeo(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await contentService.listSeo());
  } catch (error) {
    next(error);
  }
}

export async function getSeo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await contentService.getSeo(String(req.params.key)));
  } catch (error) {
    next(error);
  }
}

export async function upsertSeo(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await contentService.upsertSeo(String(req.params.key), req.body ?? {}));
  } catch (error) {
    next(error);
  }
}

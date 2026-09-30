import { Router } from "express";
import { adminMiddleware } from "../middlewares/admin.middleware";
import * as adminContentController from "../controllers/adminContent.controller";
import { ContentKind } from "../services/content.service";

const router = Router();

// Auth + staff vienen de routes/index.ts; eliminar es solo del admin.

const kinds: ContentKind[] = ["promotions", "hotels", "guides", "faqs"];
for (const kind of kinds) {
  const handlers = adminContentController.crud(kind);
  router.get(`/${kind}`, handlers.list);
  router.get(`/${kind}/:id`, handlers.get);
  router.post(`/${kind}`, handlers.create);
  router.put(`/${kind}/:id`, handlers.update);
  router.delete(`/${kind}/:id`, adminMiddleware, handlers.remove);
}

router.get("/seo", adminContentController.listSeo);
router.get("/seo/:key", adminContentController.getSeo);
router.put("/seo/:key", adminContentController.upsertSeo);

export default router;

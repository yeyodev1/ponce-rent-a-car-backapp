import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import * as adminContentController from "../controllers/adminContent.controller";
import { ContentKind } from "../services/content.service";

const router = Router();

// Por ruta y no con router.use: el prefijo /admin lo comparten varios routers.
const guard = [authMiddleware, adminMiddleware];

const kinds: ContentKind[] = ["promotions", "hotels", "guides", "faqs"];
for (const kind of kinds) {
  const handlers = adminContentController.crud(kind);
  router.get(`/${kind}`, guard, handlers.list);
  router.get(`/${kind}/:id`, guard, handlers.get);
  router.post(`/${kind}`, guard, handlers.create);
  router.put(`/${kind}/:id`, guard, handlers.update);
  router.delete(`/${kind}/:id`, guard, handlers.remove);
}

router.get("/seo", guard, adminContentController.listSeo);
router.get("/seo/:key", guard, adminContentController.getSeo);
router.put("/seo/:key", guard, adminContentController.upsertSeo);

export default router;

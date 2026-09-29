import { Router } from "express";
import * as catalogController from "../controllers/catalog.controller";

const router = Router();

router.get("/config", catalogController.config);
router.get("/categories", catalogController.listCategories);
router.get("/categories/:slug", catalogController.getCategory);
router.get("/coverages", catalogController.listCoverages);
router.get("/extras", catalogController.listExtras);

export default router;

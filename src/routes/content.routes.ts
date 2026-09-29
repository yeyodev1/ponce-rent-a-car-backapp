import { Router } from "express";
import * as contentController from "../controllers/content.controller";

const router = Router();

router.get("/promotions", contentController.promotions);
router.get("/hotels", contentController.hotels);
router.get("/guides", contentController.guides);
router.get("/guides/:slug", contentController.guide);
router.get("/faqs", contentController.faqs);
router.get("/seo/:key", contentController.seo);
router.get("/sitemap.xml", contentController.sitemap);

export default router;

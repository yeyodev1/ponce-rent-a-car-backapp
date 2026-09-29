import { Router } from "express";
import * as whatsappController from "../controllers/whatsapp.controller";

const router = Router();

router.get("/webhook", whatsappController.verify);
router.post("/webhook", whatsappController.receive);

export default router;

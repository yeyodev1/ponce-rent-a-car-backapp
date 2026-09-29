import { Router } from "express";
import * as leadController from "../controllers/lead.controller";

const router = Router();

router.post("/leads", leadController.upsertLead);
router.post("/partners", leadController.createPartner);
router.post("/renaissance", leadController.joinRenaissance);
router.get("/geo", leadController.geo);

export default router;

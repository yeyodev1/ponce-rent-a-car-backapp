import { Router } from "express";
import { adminMiddleware } from "../middlewares/admin.middleware";
import * as adminCrmController from "../controllers/adminCrm.controller";

const router = Router();

// Auth + staff vienen de routes/index.ts; eliminar es solo del admin.

router.get("/leads", adminCrmController.listLeads);
router.get("/leads/:id", adminCrmController.getLead);
router.patch("/leads/:id", adminCrmController.updateLead);
router.post("/leads/:id/notes", adminCrmController.addNote);
router.delete("/leads/:id", adminMiddleware, adminCrmController.deleteLead);

router.get("/partners", adminCrmController.listPartners);
router.patch("/partners/:id", adminCrmController.updatePartner);

router.get("/renaissance", adminCrmController.listRenaissance);

export default router;

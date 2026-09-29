import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import * as adminCrmController from "../controllers/adminCrm.controller";

const router = Router();

// Se aplica por ruta y no con router.use: varios routers comparten /admin y un
// use() global también interceptaría rutas de los otros routers.
const guard = [authMiddleware, adminMiddleware];

router.get("/leads", guard, adminCrmController.listLeads);
router.get("/leads/:id", guard, adminCrmController.getLead);
router.patch("/leads/:id", guard, adminCrmController.updateLead);
router.post("/leads/:id/notes", guard, adminCrmController.addNote);
router.delete("/leads/:id", guard, adminCrmController.deleteLead);

router.get("/partners", guard, adminCrmController.listPartners);
router.patch("/partners/:id", guard, adminCrmController.updatePartner);

router.get("/renaissance", guard, adminCrmController.listRenaissance);

export default router;

import { Router } from "express";
import * as contractController from "../controllers/contract.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

// Auth + staff + auditoría vienen de routes/index.ts. Las plantillas son solo del admin;
// el contrato de cada reserva lo consulta cualquier persona del personal.

router.get("/contract-templates", adminMiddleware, contractController.listTemplates);
router.get("/contract-templates/active", adminMiddleware, contractController.activeTemplate);
router.get("/contract-templates/variables", adminMiddleware, contractController.variables);
router.post("/contract-templates/preview", adminMiddleware, contractController.preview);
router.post("/contract-templates", adminMiddleware, contractController.createTemplate);

router.get("/reservations/:id/contract", contractController.adminGet);
router.get("/reservations/:id/contract.pdf", contractController.adminPdf);

export default router;

import { Router } from "express";
import * as adminOpsController from "../controllers/adminOps.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

// Auth + staff + auditoría vienen de routes/index.ts. Operación diaria: actas,
// garantía, anulación de pagos e historial de la unidad (§8.A y §8.B).

router.get("/reservations/:id/inspections", adminOpsController.getInspections);
router.post("/reservations/:id/inspections", adminOpsController.createInspection);
router.put(
  "/reservations/:id/inspections/:type",
  adminMiddleware,
  adminOpsController.updateInspection,
);

// "charge" es solo del admin: lo valida el service según la acción.
router.patch("/reservations/:id/guarantee", adminOpsController.updateGuarantee);

// Staff dentro de 24 h del registro; después, solo admin (lo valida el service).
router.post("/payments/:id/void", adminOpsController.voidPayment);

router.get("/vehicles/:id/history", adminOpsController.vehicleHistory);
router.get("/vehicles/:id/logs", adminOpsController.listLogs);
router.post("/vehicles/:id/logs", adminOpsController.createLog);
router.delete("/vehicles/:id/logs/:logId", adminMiddleware, adminOpsController.deleteLog);

export default router;

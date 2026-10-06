import { Router } from "express";
import * as auditLogController from "../controllers/auditLog.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

// Auth + staff vienen de routes/index.ts. La bitácora es solo del admin.
router.get("/audit", adminMiddleware, auditLogController.list);
router.get("/audit/actors", adminMiddleware, auditLogController.actors);
router.get("/audit/export.csv", adminMiddleware, auditLogController.exportCsv);

export default router;

import { Router } from "express";
import * as staffController from "../controllers/staff.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

// Auth + staff ya vienen de routes/index.ts; gestionar al personal es solo del admin.
router.get("/staff", adminMiddleware, staffController.list);
router.post("/staff", adminMiddleware, staffController.create);
router.put("/staff/:id", adminMiddleware, staffController.update);
router.patch("/staff/:id/active", adminMiddleware, staffController.setActive);

export default router;

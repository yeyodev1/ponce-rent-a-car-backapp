import { Router } from "express";
import * as adminFleetController from "../controllers/adminFleet.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { uploadMiddleware } from "../middlewares/upload.middleware";

const router = Router();

// Auth + staff vienen de routes/index.ts. Solo el admin elimina y toca tarifas y configuración.

router.get("/categories", adminFleetController.listCategories);
router.get("/categories/:id", adminFleetController.getCategory);
router.post("/categories", adminFleetController.createCategory);
router.put("/categories/:id", adminFleetController.updateCategory);
router.delete("/categories/:id", adminMiddleware, adminFleetController.deleteCategory);

router.get("/vehicles", adminFleetController.listVehicles);
router.get("/vehicles/:id", adminFleetController.getVehicle);
router.post("/vehicles", adminFleetController.createVehicle);
router.put("/vehicles/:id", adminFleetController.updateVehicle);
router.patch("/vehicles/:id/status", adminFleetController.setVehicleStatus);
router.delete("/vehicles/:id", adminMiddleware, adminFleetController.deleteVehicle);

router.get("/availability", adminFleetController.availability);

router.get("/coverages", adminFleetController.listCoverages);
router.get("/coverages/:id", adminFleetController.getCoverage);
router.post("/coverages", adminMiddleware, adminFleetController.createCoverage);
router.put("/coverages/:id", adminMiddleware, adminFleetController.updateCoverage);
router.delete("/coverages/:id", adminMiddleware, adminFleetController.deleteCoverage);

router.get("/extras", adminFleetController.listExtras);
router.get("/extras/:id", adminFleetController.getExtra);
router.post("/extras", adminMiddleware, adminFleetController.createExtra);
router.put("/extras/:id", adminMiddleware, adminFleetController.updateExtra);
router.delete("/extras/:id", adminMiddleware, adminFleetController.deleteExtra);

router.get("/settings", adminFleetController.getSettings);
router.put("/settings", adminMiddleware, adminFleetController.updateSettings);

router.post("/uploads", uploadMiddleware.single("file"), adminFleetController.upload);

export default router;

import { Router, Request, Response, NextFunction } from "express";
import { CustomError } from "../errors/customError.error";
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

/** Traduce los errores de multer (archivo enorme, campo equivocado) a un 400 legible. */
const singleFile = uploadMiddleware.single("file");
function uploadImage(req: Request, res: Response, next: NextFunction) {
  singleFile(req, res, (error: unknown) => {
    if (!error) return next();
    const code = (error as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE")
      return next(new CustomError("La imagen supera el máximo de 8 MB", 400));
    return next(new CustomError('Adjunta la imagen en el campo "file"', 400));
  });
}

router.post("/uploads", uploadImage, adminFleetController.upload);

export default router;

import { Router, Request, Response, NextFunction } from "express";
import * as bookingController from "../controllers/booking.controller";
import * as paymentController from "../controllers/payment.controller";
import { CustomError } from "../errors/customError.error";
import { uploadMiddleware } from "../middlewares/upload.middleware";

const router = Router();

/**
 * multer solo actúa con multipart; un JSON { kind, dataUrl } pasa de largo.
 * Sus errores (archivo enorme, campo inesperado) llegan como 500 si no se traducen.
 */
const documentFiles = uploadMiddleware.fields([
  { name: "license", maxCount: 1 },
  { name: "identity", maxCount: 1 },
]);
function uploadDocuments(req: Request, res: Response, next: NextFunction) {
  documentFiles(req, res, (error: unknown) => {
    if (!error) return next();
    const code = (error as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE")
      return next(new CustomError("El archivo supera el máximo de 8 MB", 400));
    return next(new CustomError("Solo se aceptan los campos license e identity", 400));
  });
}

router.post("/quote", bookingController.quote);
router.post("/reservations", bookingController.createReservation);
router.get("/reservations/:code", bookingController.getReservation);
router.patch("/reservations/:code/contact", bookingController.updateContact);
router.post("/reservations/:code/documents", uploadDocuments, bookingController.uploadDocuments);
router.post("/reservations/:code/checkout", paymentController.checkout);
router.post("/payments/confirm", paymentController.confirm);

export default router;

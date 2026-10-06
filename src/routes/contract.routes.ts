import { Router } from "express";
import * as contractController from "../controllers/contract.controller";

const router = Router();

// El cliente (sin cuenta) lee, acepta y descarga su contrato con el token de la reserva.
router.get("/reservations/:code/contract", contractController.getPublic);
router.post("/reservations/:code/contract/accept", contractController.accept);
router.get("/reservations/:code/contract.pdf", contractController.publicPdf);

export default router;

import { Router } from "express";
import * as adminBookingController from "../controllers/adminBooking.controller";
import * as dashboardController from "../controllers/dashboard.controller";
import * as exportController from "../controllers/export.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get("/dashboard", dashboardController.get);

router.get("/reservations", adminBookingController.listReservations);
router.get("/reservations/:id", adminBookingController.getReservation);
router.patch("/reservations/:id", adminBookingController.updateReservation);
router.get("/reservations/:id/documents/:kind", adminBookingController.getDocument);

router.get("/customers", adminBookingController.listCustomers);
router.get("/customers/:id", adminBookingController.getCustomer);

router.get("/payments", adminBookingController.listPayments);

router.get("/export/:entity.csv", exportController.csv);

export default router;

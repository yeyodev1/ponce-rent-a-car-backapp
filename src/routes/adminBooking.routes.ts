import { Router } from "express";
import * as adminBookingController from "../controllers/adminBooking.controller";
import * as dashboardController from "../controllers/dashboard.controller";
import * as exportController from "../controllers/export.controller";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

// Auth + staff vienen de routes/index.ts.

router.get("/dashboard", dashboardController.get);

router.get("/reservations", adminBookingController.listReservations);
router.get("/reservations/:id", adminBookingController.getReservation);
router.post("/reservations", adminBookingController.createReservation);
router.patch("/reservations/:id", adminBookingController.updateReservation);
router.post("/reservations/:id/payments", adminBookingController.addPayment);
router.get("/reservations/:id/documents/:kind", adminBookingController.getDocument);

router.get("/customers", adminBookingController.listCustomers);
router.get("/customers/:id", adminBookingController.getCustomer);

router.get("/payments", adminBookingController.listPayments);
router.post("/payments/:id/refund", adminMiddleware, adminBookingController.refundPayment);

router.get("/export/:entity.csv", adminMiddleware, exportController.csv);

export default router;

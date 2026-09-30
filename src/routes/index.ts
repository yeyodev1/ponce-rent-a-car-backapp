import express, { Application } from "express";
import authRoutes from "./auth.routes";
import healthRoutes from "./health.routes";
import cronRoutes from "./cron.routes";
import catalogRoutes from "./catalog.routes";
import bookingRoutes from "./booking.routes";
import contentRoutes from "./content.routes";
import leadRoutes from "./lead.routes";
import whatsappRoutes from "./whatsapp.routes";
import adminFleetRoutes from "./adminFleet.routes";
import adminBookingRoutes from "./adminBooking.routes";
import adminCrmRoutes from "./adminCrm.routes";
import adminContentRoutes from "./adminContent.routes";
import staffRoutes from "./staff.routes";
import { authMiddleware } from "../middlewares/auth.middleware";
import { staffMiddleware } from "../middlewares/staff.middleware";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);
  router.use("/cron", cronRoutes);

  // Público: varios routers comparten el prefijo; cada uno define rutas distintas.
  router.use("/public", catalogRoutes);
  router.use("/public", bookingRoutes);
  router.use("/public", contentRoutes);
  router.use("/public", leadRoutes);
  router.use("/whatsapp", whatsappRoutes);

  // Admin: sesión + personal se validan una sola vez aquí (authMiddleware consulta
  // la cuenta en la base). Cada router agrega adminMiddleware en lo que es solo del admin.
  router.use("/admin", authMiddleware, staffMiddleware);
  router.use("/admin", adminFleetRoutes);
  router.use("/admin", adminBookingRoutes);
  router.use("/admin", adminCrmRoutes);
  router.use("/admin", adminContentRoutes);
  router.use("/admin", staffRoutes);
}

export default routerApi;

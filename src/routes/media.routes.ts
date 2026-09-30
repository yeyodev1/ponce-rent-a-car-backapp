import { Router } from "express";
import * as mediaController from "../controllers/media.controller";

const router = Router();

router.get("/media/:id", mediaController.get);

export default router;

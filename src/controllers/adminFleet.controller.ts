import { Request, Response, NextFunction } from "express";
import * as catalogService from "../services/catalog.service";

/** Envuelve un handler que solo delega al service: evita repetir try/catch en cada CRUD. */
function handle(fn: (req: Request) => Promise<unknown>, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json(await fn(req));
    } catch (error) {
      next(error);
    }
  };
}

const id = (req: Request) => String(req.params.id);

// Categorías
export const listCategories = handle((req) => catalogService.adminListCategories(req.query));
export const getCategory = handle((req) => catalogService.adminGetCategory(id(req)));
export const createCategory = handle((req) => catalogService.adminCreateCategory(req.body), 201);
export const updateCategory = handle((req) => catalogService.adminUpdateCategory(id(req), req.body));
export const deleteCategory = handle((req) => catalogService.adminDeleteCategory(id(req)));

// Unidades
export const listVehicles = handle((req) => catalogService.adminListVehicles(req.query));
export const getVehicle = handle((req) => catalogService.adminGetVehicle(id(req)));
export const createVehicle = handle((req) => catalogService.adminCreateVehicle(req.body), 201);
export const updateVehicle = handle((req) => catalogService.adminUpdateVehicle(id(req), req.body));
export const setVehicleStatus = handle((req) => catalogService.adminSetVehicleStatus(id(req), req.body?.status));
export const deleteVehicle = handle((req) => catalogService.adminDeleteVehicle(id(req)));
export const availability = handle((req) => catalogService.adminAvailability(req.query));

// Coberturas
export const listCoverages = handle((req) => catalogService.adminListCoverages(req.query));
export const getCoverage = handle((req) => catalogService.adminGetCoverage(id(req)));
export const createCoverage = handle((req) => catalogService.adminCreateCoverage(req.body), 201);
export const updateCoverage = handle((req) => catalogService.adminUpdateCoverage(id(req), req.body));
export const deleteCoverage = handle((req) => catalogService.adminDeleteCoverage(id(req)));

// Extras
export const listExtras = handle((req) => catalogService.adminListExtras(req.query));
export const getExtra = handle((req) => catalogService.adminGetExtra(id(req)));
export const createExtra = handle((req) => catalogService.adminCreateExtra(req.body), 201);
export const updateExtra = handle((req) => catalogService.adminUpdateExtra(id(req), req.body));
export const deleteExtra = handle((req) => catalogService.adminDeleteExtra(id(req)));

// Configuración
export const getSettings = handle(() => catalogService.adminGetSettings());
export const updateSettings = handle((req) => catalogService.adminUpdateSettings(req.body));

/** POST /api/admin/uploads — multipart `file` → { url, publicId } */
export const upload = handle((req) => catalogService.adminUpload(req.file), 201);

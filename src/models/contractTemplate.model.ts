import mongoose, { Schema } from "mongoose";
import { I18nText, I18nTextSchema } from "./shared.schema";

/**
 * Plantilla del contrato de alquiler, editable por el administrador. El cuerpo
 * usa variables {{cliente.nombre}}, {{vehiculo.placa}}... que se reemplazan al
 * generar el contrato de cada reserva. Cada cambio crea una versión nueva: los
 * contratos ya aceptados conservan su texto congelado.
 */
export interface IContractTemplate {
  version: number;
  title: I18nText;
  body: I18nText;
  isActive: boolean;
  createdBy: { id: string; name: string; email: string } | null;
}

const contractTemplateSchema = new Schema<IContractTemplate>(
  {
    version: { type: Number, required: true, unique: true },
    title: { type: I18nTextSchema, default: () => ({}) },
    body: { type: I18nTextSchema, default: () => ({}) },
    isActive: { type: Boolean, default: false, index: true },
    createdBy: {
      type: new Schema({ id: String, name: String, email: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);

export const ContractTemplate =
  mongoose.models.ContractTemplate ||
  mongoose.model<IContractTemplate>("ContractTemplate", contractTemplateSchema);

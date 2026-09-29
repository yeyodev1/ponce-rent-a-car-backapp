import { CustomError } from "../errors/customError.error";
import { CustomerDocument } from "../models/document.model";
import { Reservation } from "../models/reservation.model";
import { assertObjectId } from "./catalog.service";
import { findByAccess } from "./reservation.service";
import { getSettings } from "./settings.service";

export const DOCUMENT_KINDS = ["license", "identity"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
/** Estados en los que el cliente todavía puede subir o reemplazar documentos. */
const UPLOAD_STATUSES = ["pending_documents", "pending_payment", "confirmed"];

export interface IncomingDocument {
  kind: string;
  buffer: Buffer;
  declaredType: string;
}

/**
 * Tipo real según los primeros bytes. El content-type declarado lo controla el
 * cliente; los bytes no mienten y evitan guardar un HTML disfrazado de JPG.
 */
function sniff(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/** Convierte `{ kind, dataUrl }` del JSON en un documento entrante. */
export function fromDataUrl(kind: unknown, dataUrl: unknown): IncomingDocument {
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl ?? ""));
  if (!match) throw new CustomError("El archivo debe enviarse como data URL en base64", 400);
  // base64 ocupa ~4/3 del binario: se corta antes de decodificar algo enorme.
  if (match[2].length > Math.ceil((MAX_BYTES * 4) / 3) + 4) {
    throw new CustomError("El archivo supera el máximo de 8 MB", 400);
  }
  return { kind: String(kind ?? ""), declaredType: match[1].toLowerCase(), buffer: Buffer.from(match[2], "base64") };
}

export async function uploadDocuments(code: string, token: string, incoming: IncomingDocument[]) {
  const reservation = await findByAccess(code, token);
  if (!UPLOAD_STATUSES.includes(reservation.status)) {
    throw new CustomError("Esta reserva ya no admite documentos", 409);
  }
  if (!incoming.length) throw new CustomError("Adjunta la licencia y/o el documento de identidad", 400);

  // Se valida todo antes de guardar nada: o entran todos los archivos o ninguno.
  const ready = incoming.map((doc) => {
    if (!(DOCUMENT_KINDS as readonly string[]).includes(doc.kind)) {
      throw new CustomError("El tipo de documento debe ser license o identity", 400);
    }
    if (!doc.buffer.length) throw new CustomError("El archivo está vacío", 400);
    if (doc.buffer.length > MAX_BYTES) throw new CustomError("El archivo supera el máximo de 8 MB", 400);
    const contentType = sniff(doc.buffer);
    if (!contentType || !ALLOWED.includes(contentType)) {
      throw new CustomError("Solo se aceptan imágenes JPG, PNG o WebP, o un PDF", 400);
    }
    return { kind: doc.kind as DocumentKind, contentType, buffer: doc.buffer };
  });

  for (const doc of ready) {
    await CustomerDocument.findOneAndUpdate(
      { reservation: reservation._id, kind: doc.kind },
      {
        $set: {
          customer: reservation.customer,
          contentType: doc.contentType,
          size: doc.buffer.length,
          data: doc.buffer,
        },
      },
      { upsert: true, new: true },
    );
    reservation.documents[doc.kind] = true;
  }

  const settings = await getSettings();
  if (["pending_documents", "pending_payment"].includes(reservation.status)) {
    // Subir fotos desde el celular toma tiempo: cada avance renueva el hold.
    reservation.holdExpiresAt = new Date(Date.now() + settings.booking.holdMinutes * 60 * 1000);
    if (reservation.documents.license && reservation.documents.identity) reservation.status = "pending_payment";
  }
  // Un documento nuevo sobre uno que el admin pidió corregir vuelve a revisión.
  if (reservation.verification === "needs_info") reservation.verification = "pending";
  reservation.markModified("documents");
  await reservation.save();

  return {
    documents: { license: reservation.documents.license, identity: reservation.documents.identity },
    status: reservation.status,
    holdExpiresAt: reservation.holdExpiresAt,
  };
}

/** Archivo para el admin (stream binario). */
export async function getDocumentFile(reservationId: string, kind: string) {
  assertObjectId(reservationId, "la reserva");
  if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) throw new CustomError("Documento no encontrado", 404);
  const [doc, reservation] = await Promise.all([
    CustomerDocument.findOne({ reservation: reservationId, kind }).select("+data").lean<any>(),
    Reservation.findById(reservationId).select("code").lean<any>(),
  ]);
  if (!doc || !reservation) throw new CustomError("Documento no encontrado", 404);
  const data: Buffer = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data.buffer ?? doc.data);
  return {
    contentType: doc.contentType as string,
    data,
    filename: `${reservation.code}-${kind}.${EXTENSIONS[doc.contentType] ?? "bin"}`,
  };
}

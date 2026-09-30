import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { Media } from "../models/media.model";
import { isCloudinaryConfigured, uploadBuffer } from "./cloudinary.service";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type ImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Tipo real por los primeros bytes: el content-type lo declara el navegador y
 * no garantiza que el archivo no sea, por ejemplo, un HTML servido como imagen.
 */
function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Recorre los segmentos JPEG hasta el SOF, que trae alto y ancho. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** Ancho y alto desde la cabecera, sin librerías. Si no se puede leer, 0 × 0. */
function imageSize(buf: Buffer, type: ImageType): { width: number; height: number } {
  try {
    const size =
      type === "image/png"
        ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
        : type === "image/jpeg"
          ? jpegSize(buf)
          : webpSize(buf);
    return size ?? { width: 0, height: 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

/**
 * POST /admin/uploads. Con Cloudinary configurado sube allá; si no, guarda en
 * Media y devuelve una URL absoluta servida por este mismo API.
 */
export async function uploadPublicImage(
  file: Express.Multer.File | undefined,
  baseUrl: string,
  uploadedBy: string,
): Promise<{ url: string; publicId: string }> {
  if (!file) throw new CustomError('Adjunta un archivo en el campo "file"', 400);
  if (file.size > MAX_IMAGE_BYTES) throw new CustomError("La imagen supera el máximo de 8 MB", 400);
  const contentType = sniffImage(file.buffer);
  if (!contentType) throw new CustomError("Solo se aceptan imágenes JPG, PNG o WebP", 400);

  if (isCloudinaryConfigured()) return uploadBuffer(file.buffer, "ponce-rent-a-car");

  const media = await Media.create({
    contentType,
    size: file.buffer.length,
    ...imageSize(file.buffer, contentType),
    data: file.buffer,
    uploadedBy,
  });
  const id = String(media._id);
  return { url: `${baseUrl}/api/public/media/${id}`, publicId: `media:${id}` };
}

/** GET /public/media/:id — 404 limpio para ids inválidos o inexistentes. */
export async function getMedia(id: string): Promise<{ contentType: string; data: Buffer }> {
  const notFound = new CustomError("Imagen no encontrada", 404);
  if (!isValidObjectId(id)) throw notFound;
  const media = await Media.findById(id).select("+data contentType").lean<any>();
  if (!media?.data) throw notFound;
  // lean() entrega el Binary de Mongo, no un Buffer de Node.
  const data = Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data.buffer);
  return { contentType: media.contentType, data };
}

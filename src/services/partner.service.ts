import { isValidObjectId } from "mongoose";
import { CustomError } from "../errors/customError.error";
import { nextSequence } from "../models/counter.model";
import { ILead, Lead } from "../models/lead.model";
import { ClubMember, PartnerApplication } from "../models/partner.model";
import { isCloudinaryConfigured, uploadImage } from "./cloudinary.service";
import { createInternalLead, dateRange, digits, escapeRegex, parsePaging } from "./lead.service";
import { notifyAdvisor } from "./leadNotify.service";
import { requireE164 } from "../utils/phone";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PHOTOS = 5;
const PARTNER_STATUSES = ["new", "reviewing", "approved", "rejected"] as const;

function str(value: unknown, max = 200): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/**
 * Las fotos llegan como dataURL o URL. Nunca se guarda base64 en Mongo (infla
 * el documento y el CRM): si no hay Cloudinary, los dataURL se descartan.
 */
async function resolvePhotos(input: unknown): Promise<string[]> {
  if (!Array.isArray(input)) return [];
  const photos = input.slice(0, MAX_PHOTOS).map((p) => String(p ?? "").trim()).filter(Boolean);
  const canUpload = isCloudinaryConfigured();
  const result: string[] = [];
  for (const photo of photos) {
    if (/^https?:\/\//i.test(photo)) {
      result.push(photo.slice(0, 1000));
    } else if (canUpload && /^data:image\/[a-z+]+;base64,/i.test(photo)) {
      try {
        const { url } = await uploadImage(photo, "ponce-rent-a-car/socios");
        result.push(url);
      } catch (error) {
        console.error("[partner] no se pudo subir una foto:", (error as Error).message);
      }
    }
  }
  return result;
}

/** POST /public/partners — Socio sobre Ruedas. */
export async function createPartnerApplication(body: Record<string, unknown>) {
  const name = str(body?.name, 120);
  if (!name) throw new CustomError("Escribe tu nombre", 400);
  const whatsapp = requireE164(body?.whatsapp, "WhatsApp");

  const currentYear = new Date().getFullYear();
  const yearRaw = Number(body?.year);
  const year = Number.isFinite(yearRaw) ? Math.floor(yearRaw) : 0;
  if (year && (year < 1980 || year > currentYear + 1)) {
    throw new CustomError("El año del vehículo no es válido", 400);
  }
  if (Array.isArray(body?.photos) && body.photos.length > MAX_PHOTOS) {
    throw new CustomError(`Puedes enviar hasta ${MAX_PHOTOS} fotos`, 400);
  }

  const language = str(body?.language, 2) === "en" ? "en" : "es";
  const application = await PartnerApplication.create({
    code: `S${await nextSequence("partner")}`,
    name,
    whatsapp,
    city: str(body?.city, 80),
    vehicleType: str(body?.vehicleType, 60),
    brand: str(body?.brand, 60),
    model: str(body?.model, 60),
    year,
    photos: await resolvePhotos(body?.photos),
    language,
  });

  // También como lead: el asesor trabaja todo desde el mismo CRM.
  const vehicle = [application.brand, application.model, application.year || ""].filter(Boolean).join(" ");
  const lead = await createInternalLead({
    source: "partner",
    language,
    name,
    phone: whatsapp,
    whatsapp,
    tags: ["partner"],
    comments: `Socio sobre Ruedas ${application.code}: ${vehicle || "vehículo sin detallar"}${
      application.vehicleType ? ` (${application.vehicleType})` : ""
    }${application.city ? ` en ${application.city}` : ""}. Fotos: ${application.photos.length}.`,
  });
  await notifyAdvisor(lead.toObject() as ILead, "NUEVO SOCIO SOBRE RUEDAS");

  return { _id: application._id, code: application.code };
}

/** POST /public/renaissance — interés en el club. Idempotente por correo. */
export async function joinRenaissance(body: Record<string, unknown>) {
  const name = str(body?.name, 120);
  const email = str(body?.email, 160).toLowerCase();
  if (!name) throw new CustomError("Escribe tu nombre", 400);
  if (!EMAIL.test(email)) throw new CustomError("Escribe un correo válido", 400);
  const phone = body?.phone ? requireE164(body.phone) : "";
  const language = str(body?.language, 2) === "en" ? "en" : "es";

  await ClubMember.findOneAndUpdate(
    { email },
    { $set: { name, language, ...(phone ? { phone } : {}) }, $setOnInsert: { email } },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
  );

  // Un solo lead por correo: volver a enviar el formulario no ensucia el CRM.
  const existing = await Lead.findOne({ source: "renaissance", email });
  if (existing) {
    existing.set({ name, language, ...(phone ? { phone } : {}) });
    await existing.save();
  } else {
    await createInternalLead({ source: "renaissance", language, name, email, phone, tags: ["renaissance"] });
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function listPartners(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaging(query);
  const filter: Record<string, unknown> = {};
  const q = str(query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ code: rx }, { name: rx }, { brand: rx }, { model: rx }, { city: rx }, { whatsapp: rx }];
  }
  if (query.status) filter.status = str(query.status, 20);
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;
  const [items, total] = await Promise.all([
    PartnerApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PartnerApplication.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function updatePartner(id: string, body: Record<string, unknown>) {
  if (!isValidObjectId(id)) throw new CustomError("Solicitud no encontrada", 404);
  const set: Record<string, unknown> = {};
  if (body?.status !== undefined) {
    const status = str(body.status, 20);
    if (!(PARTNER_STATUSES as readonly string[]).includes(status)) {
      throw new CustomError("El estado no es válido", 400);
    }
    set.status = status;
  }
  if (body?.notes !== undefined) set.notes = str(body.notes, 2000);
  const doc = await PartnerApplication.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
  if (!doc) throw new CustomError("Solicitud no encontrada", 404);
  return doc;
}

export async function listClubMembers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePaging(query);
  const filter: Record<string, unknown> = {};
  const q = str(query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const range = dateRange(query.from, query.to);
  if (range) filter.createdAt = range;
  const [items, total] = await Promise.all([
    ClubMember.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ClubMember.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

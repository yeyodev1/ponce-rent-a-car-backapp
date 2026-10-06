import { isValidObjectId, Model } from "mongoose";
import { env } from "../config/env";
import { listVehiclesForSitemap } from "./vehiclePublic.service";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Faq, FAQ_TOPICS, Guide, Hotel, Promotion, SeoPage } from "../models/content.model";
import { slugify } from "../utils/slugify";
import { escapeRegex, parsePaging } from "./lead.service";

/* ------------------------------------------------------------------ */
/* Público                                                             */
/* ------------------------------------------------------------------ */

const PROMOTION_FIELDS = "slug title body conditions image startsAt endsAt categorySlug ctaLabel ctaUrl badge order";
const HOTEL_FIELDS = "slug name zone description benefit promotion image website phone order";
const GUIDE_LIST_FIELDS = "slug title excerpt cover readingMinutes destination distanceKm driveTime publishedAt";

/** Vigente = activa y dentro de su ventana; fechas vacías significan "sin límite". */
export function listPublicPromotions() {
  const now = new Date();
  return Promotion.find({
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .select(PROMOTION_FIELDS)
    .sort({ order: 1, createdAt: -1 })
    .lean();
}

export function listPublicHotels() {
  return Hotel.find({ isActive: true }).select(HOTEL_FIELDS).sort({ order: 1, name: 1 }).lean();
}

export function listPublicGuides() {
  return Guide.find({ isPublished: true }).select(GUIDE_LIST_FIELDS).sort({ publishedAt: -1 }).lean();
}

export async function getPublicGuide(slug: string) {
  const guide = await Guide.findOne({ slug: String(slug).toLowerCase(), isPublished: true })
    .select(`${GUIDE_LIST_FIELDS} sections seo`)
    .lean();
  if (!guide) throw new CustomError("Guía no encontrada", 404);
  return guide;
}

export function listPublicFaqs(topic?: unknown) {
  const filter: Record<string, unknown> = { isActive: true };
  if (topic) filter.topic = String(topic);
  return Faq.find(filter).select("topic question answer order").sort({ topic: 1, order: 1 }).lean();
}

export async function getPublicSeo(key: string) {
  const page = await SeoPage.findOne({ key: String(key) })
    .select("key title description h1 intro canonical ogImage -_id")
    .lean();
  if (!page) throw new CustomError("Página SEO no encontrada", 404);
  return page;
}

const STATIC_ROUTES = [
  "/",
  "/vehiculos",
  "/alquiler-autos-guayaquil",
  "/alquiler-autos-aeropuerto-guayaquil",
  "/alquiler-suv-guayaquil",
  "/alquiler-camionetas-guayaquil",
  "/alquiler-autos-larga-duracion-guayaquil",
  "/empresas",
  "/promociones",
  "/hoteles-aliados",
  "/guias-de-viaje",
  "/preguntas-frecuentes",
  "/socio-sobre-ruedas",
  "/ponces-renaissance",
  "/contacto",
];

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function day(date: Date | string | undefined | null): string {
  const d = date ? new Date(date) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10);
}

/** Sitemap para Google: rutas fijas del sitio + categorías activas + guías publicadas. */
export async function buildSitemap(): Promise<string> {
  const base = env.FRONTEND_URL.replace(/\/+$/, "");
  const [categories, guides, units] = await Promise.all([
    Category.find({ isActive: true }).select("slug updatedAt").sort({ order: 1 }).lean<{ slug: string; updatedAt?: Date }[]>(),
    Guide.find({ isPublished: true }).select("slug updatedAt").sort({ publishedAt: -1 }).lean<{ slug: string; updatedAt?: Date }[]>(),
    listVehiclesForSitemap(),
  ]);
  const today = day(new Date());
  const urls: { loc: string; lastmod: string; priority: string }[] = [
    ...STATIC_ROUTES.map((path) => ({
      loc: `${base}${path === "/" ? "/" : path}`,
      lastmod: today,
      priority: path === "/" ? "1.0" : "0.8",
    })),
    ...categories.map((c) => ({ loc: `${base}/vehiculos/${c.slug}`, lastmod: day(c.updatedAt), priority: "0.7" })),
    ...guides.map((g) => ({ loc: `${base}/guias-de-viaje/${g.slug}`, lastmod: day(g.updatedAt), priority: "0.6" })),
    ...units.map((u) => ({ loc: `${base}/vehiculos/${u.category}/${u.slug}`, lastmod: day(u.updatedAt), priority: "0.5" })),
  ];
  const body = urls
    .map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/* ------------------------------------------------------------------ */
/* Admin: normalizadores                                               */
/* ------------------------------------------------------------------ */

type Body = Record<string, unknown>;
type Normalizer = (body: Body, isCreate: boolean) => Body;

function str(value: unknown, max = 500): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function i18n(value: unknown, max = 5000): { es: string; en: string } {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return { es: str(v.es, max), en: str(v.en, max) };
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function optionalDate(value: unknown, label: string): Date | null {
  if (value === null || value === "" || value === undefined) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new CustomError(`${label} no es una fecha válida`, 400);
  return d;
}

/**
 * Copia solo las claves presentes: en PUT se actualiza lo enviado sin
 * resetear lo demás. Cada spec transforma su valor.
 */
function pick(body: Body, spec: Record<string, (v: unknown) => unknown>): Body {
  const out: Body = {};
  for (const [key, fn] of Object.entries(spec)) {
    if (body[key] !== undefined) out[key] = fn(body[key]);
  }
  return out;
}

function withSlug(out: Body, body: Body, isCreate: boolean, source: string): Body {
  if (body.slug !== undefined && str(body.slug)) {
    out.slug = slugify(str(body.slug, 120));
  } else if (isCreate) {
    out.slug = slugify(source);
  }
  if (isCreate && !out.slug) throw new CustomError("Falta el título para generar el slug", 400);
  return out;
}

const normalizePromotion: Normalizer = (body, isCreate) => {
  const out = pick(body, {
    title: (v) => i18n(v, 200),
    body: (v) => i18n(v),
    conditions: (v) => i18n(v),
    badge: (v) => i18n(v, 40),
    ctaLabel: (v) => i18n(v, 60),
    ctaUrl: (v) => str(v, 300),
    image: (v) => str(v, 1000),
    categorySlug: (v) => str(v, 80).toLowerCase(),
    startsAt: (v) => optionalDate(v, "La fecha de inicio"),
    endsAt: (v) => optionalDate(v, "La fecha de fin"),
    isActive: (v) => v === true || v === "true",
    order: (v) => num(v),
  });
  const title = out.title as { es: string } | undefined;
  if (isCreate && !title?.es) throw new CustomError("El título en español es obligatorio", 400);
  const s = out.startsAt as Date | null | undefined;
  const e = out.endsAt as Date | null | undefined;
  if (s && e && s > e) throw new CustomError("La fecha de inicio no puede ser posterior a la de fin", 400);
  return withSlug(out, body, isCreate, title?.es ?? "");
};

const normalizeHotel: Normalizer = (body, isCreate) => {
  const out = pick(body, {
    name: (v) => str(v, 160),
    zone: (v) => str(v, 120),
    description: (v) => i18n(v),
    benefit: (v) => i18n(v, 500),
    promotion: (v) => i18n(v, 500),
    image: (v) => str(v, 1000),
    website: (v) => str(v, 300),
    phone: (v) => str(v, 40),
    isActive: (v) => v === true || v === "true",
    order: (v) => num(v),
  });
  if ((isCreate || out.name !== undefined) && !out.name) throw new CustomError("El nombre del hotel es obligatorio", 400);
  return withSlug(out, body, isCreate, String(out.name ?? ""));
};

const normalizeGuide: Normalizer = (body, isCreate) => {
  const out = pick(body, {
    title: (v) => i18n(v, 200),
    excerpt: (v) => i18n(v, 600),
    cover: (v) => str(v, 1000),
    destination: (v) => str(v, 120),
    distanceKm: (v) => Math.max(0, num(v)),
    driveTime: (v) => str(v, 60),
    readingMinutes: (v) => Math.max(1, Math.round(num(v, 4))),
    sections: (v) =>
      (Array.isArray(v) ? v : []).map((s) => ({
        heading: i18n((s as Body)?.heading, 200),
        body: i18n((s as Body)?.body, 20000),
      })),
    seo: (v) => {
      const seo = (v && typeof v === "object" ? v : {}) as Body;
      return { title: i18n(seo.title, 120), description: i18n(seo.description, 300), ogImage: str(seo.ogImage, 1000) };
    },
    isPublished: (v) => v === true || v === "true",
    publishedAt: (v) => optionalDate(v, "La fecha de publicación") ?? new Date(),
  });
  const title = out.title as { es: string } | undefined;
  if (isCreate && !title?.es) throw new CustomError("El título en español es obligatorio", 400);
  return withSlug(out, body, isCreate, title?.es ?? "");
};

const normalizeFaq: Normalizer = (body, isCreate) => {
  const out = pick(body, {
    topic: (v) => str(v, 40),
    question: (v) => i18n(v, 500),
    answer: (v) => i18n(v),
    order: (v) => num(v),
    isActive: (v) => v === true || v === "true",
  });
  if ((isCreate || out.topic !== undefined) && !(FAQ_TOPICS as readonly string[]).includes(String(out.topic ?? ""))) {
    throw new CustomError("El tema de la pregunta no es válido", 400);
  }
  if (isCreate && !(out.question as { es: string } | undefined)?.es) {
    throw new CustomError("La pregunta en español es obligatoria", 400);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Admin: CRUD genérico                                                */
/* ------------------------------------------------------------------ */

export type ContentKind = "promotions" | "hotels" | "guides" | "faqs";

const REGISTRY: Record<
  ContentKind,
  { model: Model<any>; normalize: Normalizer; label: string; search: string[]; sort: Record<string, 1 | -1> }
> = {
  promotions: {
    model: Promotion,
    normalize: normalizePromotion,
    label: "Promoción no encontrada",
    search: ["slug", "title.es", "title.en"],
    sort: { order: 1, createdAt: -1 },
  },
  hotels: {
    model: Hotel,
    normalize: normalizeHotel,
    label: "Hotel no encontrado",
    search: ["slug", "name", "zone"],
    sort: { order: 1, name: 1 },
  },
  guides: {
    model: Guide,
    normalize: normalizeGuide,
    label: "Guía no encontrada",
    search: ["slug", "title.es", "title.en", "destination"],
    sort: { publishedAt: -1 },
  },
  faqs: {
    model: Faq,
    normalize: normalizeFaq,
    label: "Pregunta no encontrada",
    search: ["question.es", "question.en"],
    sort: { topic: 1, order: 1 },
  },
};

export async function listContent(kind: ContentKind, query: Record<string, unknown>) {
  const { model, search, sort } = REGISTRY[kind];
  const { page, limit, skip } = parsePaging({ limit: 50, ...query });
  const filter: Record<string, unknown> = {};
  const q = str(query.q, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = search.map((field) => ({ [field]: rx }));
  }
  if (kind === "faqs" && query.topic) filter.topic = str(query.topic, 40);
  if (query.status === "active") filter[kind === "guides" ? "isPublished" : "isActive"] = true;
  if (query.status === "inactive") filter[kind === "guides" ? "isPublished" : "isActive"] = false;
  const [items, total] = await Promise.all([
    model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    model.countDocuments(filter),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

export async function getContent(kind: ContentKind, id: string) {
  const { model, label } = REGISTRY[kind];
  const doc = isValidObjectId(id) ? await model.findById(id).lean() : null;
  if (!doc) throw new CustomError(label, 404);
  return doc;
}

export async function createContent(kind: ContentKind, body: Body) {
  const { model, normalize } = REGISTRY[kind];
  const doc = await model.create(normalize(body ?? {}, true));
  return doc.toObject();
}

export async function updateContent(kind: ContentKind, id: string, body: Body) {
  const { model, normalize, label } = REGISTRY[kind];
  if (!isValidObjectId(id)) throw new CustomError(label, 404);
  const doc = await model.findByIdAndUpdate(id, { $set: normalize(body ?? {}, false) }, { new: true, runValidators: true }).lean();
  if (!doc) throw new CustomError(label, 404);
  return doc;
}

export async function deleteContent(kind: ContentKind, id: string): Promise<void> {
  const { model, label } = REGISTRY[kind];
  const doc = isValidObjectId(id) ? await model.findByIdAndDelete(id) : null;
  if (!doc) throw new CustomError(label, 404);
}

/* ------------------------------------------------------------------ */
/* Admin: SEO por key                                                  */
/* ------------------------------------------------------------------ */

export function listSeo() {
  return SeoPage.find().sort({ key: 1 }).lean();
}

export async function getSeo(key: string) {
  const doc = await SeoPage.findOne({ key: String(key) }).lean();
  if (!doc) throw new CustomError("Página SEO no encontrada", 404);
  return doc;
}

export async function upsertSeo(key: string, body: Body) {
  const cleanKey = str(key, 60);
  if (!/^[a-z0-9-]+$/.test(cleanKey)) throw new CustomError("La clave SEO solo admite minúsculas, números y guiones", 400);
  const set = pick(body ?? {}, {
    title: (v) => i18n(v, 120),
    description: (v) => i18n(v, 300),
    h1: (v) => i18n(v, 200),
    intro: (v) => i18n(v, 2000),
    canonical: (v) => str(v, 300),
    ogImage: (v) => str(v, 1000),
  });
  return SeoPage.findOneAndUpdate(
    { key: cleanKey },
    { $set: set, $setOnInsert: { key: cleanKey } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
}

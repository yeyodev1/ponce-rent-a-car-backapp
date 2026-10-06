import crypto from "crypto";
import { CustomError } from "../errors/customError.error";
import { Category } from "../models/category.model";
import { Vehicle } from "../models/vehicle.model";
import { slugify } from "../utils/slugify";

/**
 * marca-modelo-anio-<4 hex>. Sin la placa: la URL es pública y la placa es un
 * dato interno. El sufijo aleatorio evita choques entre unidades gemelas.
 */
export async function generateVehicleSlug(brand: string, model: string, year?: number): Promise<string> {
  const base = slugify([brand, model, year ? String(year) : ""].filter(Boolean).join(" ")) || "vehiculo";
  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = `${base}-${crypto.randomBytes(2).toString("hex")}`;
    if (!(await Vehicle.exists({ slug }))) return slug;
  }
  return `${base}-${crypto.randomBytes(4).toString("hex")}`;
}

/** Asigna slug a las unidades que no lo tienen. Idempotente: no toca las que ya tienen uno. */
export async function backfillVehicleSlugs(): Promise<number> {
  const missing = await Vehicle.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] })
    .select("brand model year")
    .lean<any[]>();
  for (const v of missing) {
    const slug = await generateVehicleSlug(v.brand, v.model, v.year);
    await Vehicle.updateOne(
      { _id: v._id, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: "" }] },
      { $set: { slug } },
    );
  }
  return missing.length;
}

/** Ficha pública de una unidad: sin placa, dueño, notas ni kilometraje. */
export async function getPublicVehicle(slug: string) {
  const vehicle = await Vehicle.findOne({
    slug: String(slug ?? "").toLowerCase().trim(),
    isActive: true,
    status: { $ne: "blocked" },
  })
    .select("slug brand model year transmission fuel seats color description images status category")
    .lean<any>();
  if (!vehicle) throw new CustomError("Vehículo no encontrado", 404);
  const category = await Category.findOne({ _id: vehicle.category, isActive: true })
    .select("slug name tagline pricePerDay passengers luggage airConditioning features image")
    .lean<any>();
  if (!category) throw new CustomError("Vehículo no encontrado", 404);
  return {
    slug: vehicle.slug,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
    transmission: vehicle.transmission,
    fuel: vehicle.fuel ?? "gasoline",
    seats: vehicle.seats ?? category.passengers,
    color: vehicle.color ?? "",
    description: vehicle.description ?? "",
    images: vehicle.images ?? [],
    category: {
      slug: category.slug,
      name: category.name,
      tagline: category.tagline,
      pricePerDay: category.pricePerDay,
      passengers: category.passengers,
      luggage: category.luggage,
      airConditioning: category.airConditioning,
      features: category.features ?? [],
      image: category.image ?? "",
    },
    // Libre hoy: ni en mantenimiento ni alquilada o reservada. La venta sigue siendo por categoría.
    available: vehicle.status === "available",
  };
}

/** Unidades con URL pública para el sitemap. */
export async function listVehiclesForSitemap(): Promise<{ category: string; slug: string; updatedAt?: Date }[]> {
  const [vehicles, categories] = await Promise.all([
    Vehicle.find({ isActive: true, status: { $ne: "blocked" }, slug: { $nin: [null, ""] } })
      .select("slug category updatedAt")
      .lean<any[]>(),
    Category.find({ isActive: true }).select("slug").lean<any[]>(),
  ]);
  const bySlug = new Map(categories.map((c) => [String(c._id), c.slug as string]));
  return vehicles
    .filter((v) => bySlug.has(String(v.category)))
    .map((v) => ({ category: bySlug.get(String(v.category))!, slug: v.slug, updatedAt: v.updatedAt }));
}

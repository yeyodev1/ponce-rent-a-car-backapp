/**
 * Migración v2 (correcciones de Victor, oct-2026). Idempotente: se puede correr
 * las veces que haga falta. Uso: pnpm migrate:v2
 *
 * - Categorías: nombres, frase corta, precio por día, pasajeros y garantía por
 *   categoría (sin tocar imágenes, galerías ni descripciones).
 * - Configuración: la reserva en línea se asegura con el 30% del total.
 * - Clientes: el índice único por documento pasa a ser parcial (la web ya no
 *   exige cédula al reservar) y se indexa el correo.
 * - Reservas existentes: no se tocan (conservan su kilometraje y su precio congelado).
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../config/mongo";
import { Category } from "../models/category.model";
import { Customer } from "../models/customer.model";
import { Setting } from "../models/setting.model";

const CATEGORIES = [
  {
    slug: "economico",
    name: { es: "EV & Hatchback", en: "EV & Hatchback" },
    tagline: {
      es: "Ágil, cómodo y ahorrador para moverte por la ciudad",
      en: "Nimble, comfortable and fuel-efficient for the city",
    },
    pricePerDay: 4500,
    guarantee: 100000,
    passengers: 5,
  },
  {
    slug: "sedan",
    name: { es: "Sedán / Ejecutivo", en: "Sedan / Executive" },
    tagline: {
      es: "Comodidad y maletero amplio para trabajo o carretera",
      en: "Comfort and a roomy trunk for work or the highway",
    },
    pricePerDay: 5000,
    guarantee: 100000,
    passengers: 5,
  },
  {
    slug: "suv",
    name: { es: "SUV & Crossover", en: "SUV & Crossover" },
    tagline: {
      es: "Más espacio, altura y confort para la familia o carretera",
      en: "More space, height and comfort for the family or the road",
    },
    pricePerDay: 6000,
    guarantee: 150000,
    passengers: 7,
  },
  {
    slug: "camioneta",
    name: { es: "Pick-up", en: "Pickup" },
    tagline: {
      es: "Doble cabina, lista para trabajo y carga",
      en: "Double cab, ready for work and cargo",
    },
    pricePerDay: 9000,
    guarantee: 150000,
    passengers: 5,
  },
  {
    slug: "van",
    name: { es: "Van", en: "Van" },
    tagline: {
      es: "Capacidad total para grupos, eventos o viajes en delegación",
      en: "Full capacity for groups, events or delegation trips",
    },
    pricePerDay: 10000,
    guarantee: 200000,
    passengers: 12,
  },
  {
    slug: "lujo",
    name: { es: "Lujo", en: "Luxury" },
    tagline: {
      es: "Elegancia, presencia imponente y máximo estatus ejecutivo",
      en: "Elegance, commanding presence and top executive status",
    },
    pricePerDay: 15000,
    guarantee: 200000,
    passengers: 5,
  },
];

async function migrateCategories() {
  let updated = 0;
  for (const c of CATEGORIES) {
    const { slug, ...data } = c;
    const res = await Category.updateOne({ slug }, { $set: data });
    if (res.matchedCount) updated += 1;
    else console.log(`  · categoría "${slug}" no existe: se omite`);
  }
  console.log(`✔ ${updated} categorías actualizadas (nombre, frase, precio, pasajeros, garantía)`);
}

async function migrateSettings() {
  const res = await Setting.updateOne(
    { key: "main" },
    { $set: { "booking.depositMode": "percent", "booking.depositValue": 30 } },
  );
  console.log(
    res.matchedCount
      ? "✔ Configuración: la reserva en línea se asegura con el 30% del total"
      : "  · no hay configuración guardada todavía (se creará con los nuevos valores por defecto)",
  );
}

async function migrateCustomerIndexes() {
  const collection = Customer.collection;
  const indexes = await collection.indexes();
  const old = indexes.find(
    (i) => i.name === "documentType_1_documentNumber_1" && !i.partialFilterExpression,
  );
  if (old) {
    await collection.dropIndex("documentType_1_documentNumber_1");
    console.log("✔ Índice único viejo por documento eliminado");
  }
  await Customer.syncIndexes();
  console.log("✔ Índices de clientes sincronizados (documento parcial + correo)");
}

async function main() {
  console.log("Conectando a MongoDB...");
  await dbConnect();
  await migrateCategories();
  await migrateSettings();
  await migrateCustomerIndexes();
  console.log("Listo. Las reservas existentes no se tocaron.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("✖ Falló la migración v2:", error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});

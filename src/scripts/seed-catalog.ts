/**
 * Seed del catálogo: configuración, categorías, unidades de ejemplo, coberturas y extras.
 * Uso: pnpm seed:catalog            → crea lo que falte y no toca lo que el admin ya editó.
 *      pnpm seed:catalog --force    → además sobrescribe textos y precios con los de este archivo.
 * Idempotente: upsert por slug (categorías), placa (unidades) y código (coberturas/extras).
 * Los campos de ficha de las unidades (combustible, asientos, km, descripción) solo
 * se completan si están vacíos: nunca pisan lo que el admin ya cargó.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { dbConnect } from "../config/mongo";
import { Category } from "../models/category.model";
import { Coverage } from "../models/coverage.model";
import { Extra } from "../models/extra.model";
import { Vehicle } from "../models/vehicle.model";
import { getSettings } from "../services/settings.service";

const FORCE = process.argv.includes("--force");

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=70`;

const categories = [
  {
    slug: "economico",
    order: 1,
    name: { es: "Económico", en: "Economy" },
    tagline: {
      es: "Ágil y ahorrador para moverte por la ciudad",
      en: "Nimble and fuel-efficient for city driving",
    },
    description: {
      es: "Ideal para recorrer Guayaquil sin complicaciones: fácil de parquear, gasta poco combustible y tiene lo necesario para ir de la reunión al hotel o del aeropuerto a casa.",
      en: "Perfect for getting around Guayaquil with no hassle: easy to park, light on fuel and with everything you need to go from the airport to your hotel or your next meeting.",
    },
    passengers: 4,
    luggage: 2,
    transmission: "manual",
    pricePerDay: 4500,
    exampleModels: "Kia Picanto o similar",
    image: img("1541899481282-d53bffe3c35d"),
    gallery: [img("1541899481282-d53bffe3c35d"), img("1549317661-bd32c8ce0db2")],
    features: [
      { es: "Bajo consumo de combustible", en: "Low fuel consumption" },
      { es: "Fácil de parquear en la ciudad", en: "Easy to park in the city" },
      { es: "Aire acondicionado", en: "Air conditioning" },
      { es: "Bluetooth y USB", en: "Bluetooth and USB" },
    ],
  },
  {
    slug: "sedan",
    order: 2,
    name: { es: "Sedán", en: "Sedan" },
    tagline: {
      es: "Comodidad y maletero amplio para viajes de trabajo",
      en: "Comfort and a roomy trunk for business trips",
    },
    description: {
      es: "Un auto cómodo para viajes de negocios o escapadas a la costa: más espacio atrás, maletero amplio y un andar suave en carretera.",
      en: "A comfortable car for business trips or getaways to the coast: more rear legroom, a roomy trunk and a smooth ride on the highway.",
    },
    passengers: 5,
    luggage: 3,
    transmission: "automatic",
    pricePerDay: 5000,
    exampleModels: "Hyundai Accent o similar",
    image: img("1617788138017-80ad40651399"),
    gallery: [img("1617788138017-80ad40651399"), img("1619767886558-efdc259cde1a")],
    features: [
      { es: "Transmisión automática", en: "Automatic transmission" },
      { es: "Maletero amplio para 3 maletas", en: "Trunk fits 3 suitcases" },
      { es: "Cómodo en carretera", en: "Comfortable on the highway" },
      { es: "Aire acondicionado", en: "Air conditioning" },
    ],
  },
  {
    slug: "suv",
    order: 3,
    name: { es: "SUV", en: "SUV" },
    tagline: {
      es: "Más espacio y altura para la familia",
      en: "More space and ride height for the family",
    },
    description: {
      es: "Posición de manejo alta, espacio para toda la familia y equipaje, y la tranquilidad de ir cómodo tanto en la ciudad como en la ruta a la playa o a la sierra.",
      en: "High driving position, room for the whole family and luggage, and peace of mind both in the city and on the road to the beach or the Andes.",
    },
    passengers: 5,
    luggage: 4,
    transmission: "automatic",
    pricePerDay: 8000,
    exampleModels: "Chevrolet Tracker o similar",
    image: img("1519641471654-76ce0107ad1b"),
    gallery: [img("1519641471654-76ce0107ad1b"), img("1606016159991-dfe4f2746ad5")],
    features: [
      { es: "Posición de manejo elevada", en: "Raised driving position" },
      { es: "Espacio para 4 maletas", en: "Room for 4 suitcases" },
      { es: "Ideal para viajes en familia", en: "Great for family trips" },
      { es: "Transmisión automática", en: "Automatic transmission" },
    ],
  },
  {
    slug: "camioneta",
    order: 4,
    name: { es: "Camioneta", en: "Pickup truck" },
    tagline: {
      es: "Doble cabina, lista para trabajo y carga",
      en: "Double cab, ready for work and cargo",
    },
    description: {
      es: "Camioneta doble cabina para obra, campo o viajes con carga: balde amplio, cinco puestos y la robustez que piden las vías fuera de la ciudad.",
      en: "Double-cab pickup for job sites, farm visits or trips with cargo: a large bed, five seats and the toughness roads outside the city demand.",
    },
    passengers: 5,
    luggage: 4,
    transmission: "manual",
    pricePerDay: 9000,
    exampleModels: "Toyota Hilux doble cabina o similar",
    image: img("1631377875146-b10de5d7acb7"),
    gallery: [img("1631377875146-b10de5d7acb7"), img("1631377875413-b1e3e660bfa2")],
    features: [
      { es: "Doble cabina, 5 puestos", en: "Double cab, 5 seats" },
      { es: "Balde para carga", en: "Cargo bed" },
      { es: "Robusta para vías rurales", en: "Tough on rural roads" },
      { es: "Ideal para empresas y obra", en: "Ideal for companies and job sites" },
    ],
  },
  {
    slug: "van",
    order: 5,
    name: { es: "Van", en: "Van" },
    tagline: {
      es: "Hasta 12 pasajeros en un solo vehículo",
      en: "Up to 12 passengers in a single vehicle",
    },
    description: {
      es: "Para grupos, familias grandes, equipos de trabajo o traslados de eventos: todos juntos, con espacio para el equipaje y aire acondicionado para el calor de la costa.",
      en: "For groups, large families, work crews or event transfers: everyone together, with room for luggage and air conditioning for the coastal heat.",
    },
    passengers: 12,
    luggage: 6,
    transmission: "manual",
    pricePerDay: 11000,
    exampleModels: "Hyundai H1 / Toyota Hiace o similar",
    image: img("1775054185026-8dc74fac136f"),
    gallery: [img("1775054185026-8dc74fac136f"), img("1688619103602-35c5b27a6619")],
    features: [
      { es: "Hasta 12 pasajeros", en: "Up to 12 passengers" },
      { es: "Espacio para equipaje de grupo", en: "Room for group luggage" },
      { es: "Aire acondicionado", en: "Air conditioning" },
      { es: "Ideal para traslados y eventos", en: "Ideal for transfers and events" },
    ],
  },
  {
    slug: "lujo",
    order: 6,
    name: { es: "Lujo", en: "Luxury" },
    tagline: {
      es: "Elegancia y confort para ocasiones que importan",
      en: "Elegance and comfort for the moments that matter",
    },
    description: {
      es: "Un sedán premium para reuniones ejecutivas, recibir a un invitado especial o darte un gusto: interior de cuero, manejo silencioso y la presencia que una buena primera impresión merece.",
      en: "A premium sedan for executive meetings, welcoming a special guest or simply treating yourself: leather interior, a quiet ride and the presence a great first impression deserves.",
    },
    passengers: 5,
    luggage: 3,
    transmission: "automatic",
    pricePerDay: 15000,
    exampleModels: "Mercedes-Benz Clase C o similar",
    image: img("1605294338880-61c61efb2287"),
    gallery: [img("1605294338880-61c61efb2287"), img("1589667679645-cadf2f3139f2")],
    features: [
      { es: "Interior de cuero", en: "Leather interior" },
      { es: "Transmisión automática", en: "Automatic transmission" },
      { es: "Manejo silencioso y suave", en: "Quiet, smooth ride" },
      { es: "Ideal para ejecutivos y eventos", en: "Ideal for executives and events" },
    ],
  },
];

const NOTE = "Unidad de ejemplo: reemplazar por la flota real";
type Fuel = "gasoline" | "diesel" | "hybrid" | "electric";
const vehicles: {
  category: string;
  brand: string;
  model: string;
  year: number;
  plate: string;
  color: string;
  transmission: string;
  fuel: Fuel;
  seats: number;
  mileageKm: number;
  description: string;
}[] = [
  {
    category: "economico",
    brand: "Kia",
    model: "Picanto",
    year: 2024,
    plate: "GBA-1001",
    color: "Blanco",
    transmission: "manual",
    fuel: "gasoline",
    seats: 4,
    mileageKm: 18500,
    description: "Compacto y económico, ideal para moverse por la ciudad.",
  },
  {
    category: "economico",
    brand: "Chevrolet",
    model: "Spark GT",
    year: 2023,
    plate: "GBA-1002",
    color: "Plata",
    transmission: "manual",
    fuel: "gasoline",
    seats: 4,
    mileageKm: 32400,
    description: "Hatchback ágil y fácil de parquear.",
  },
  {
    category: "sedan",
    brand: "Hyundai",
    model: "Accent",
    year: 2024,
    plate: "GBA-1003",
    color: "Negro",
    transmission: "automatic",
    fuel: "gasoline",
    seats: 5,
    mileageKm: 15200,
    description: "Sedán cómodo con maletero amplio.",
  },
  {
    category: "sedan",
    brand: "Kia",
    model: "Soluto",
    year: 2024,
    plate: "GBA-1004",
    color: "Gris",
    transmission: "automatic",
    fuel: "gasoline",
    seats: 5,
    mileageKm: 21800,
    description: "Sedán eficiente para viajes de trabajo.",
  },
  {
    category: "suv",
    brand: "Chevrolet",
    model: "Tracker",
    year: 2024,
    plate: "GBA-1005",
    color: "Blanco",
    transmission: "automatic",
    fuel: "gasoline",
    seats: 5,
    mileageKm: 12600,
    description: "SUV compacta con posición de manejo elevada.",
  },
  {
    category: "suv",
    brand: "Hyundai",
    model: "Tucson",
    year: 2023,
    plate: "GBA-1006",
    color: "Azul",
    transmission: "automatic",
    fuel: "gasoline",
    seats: 5,
    mileageKm: 38900,
    description: "SUV familiar con espacio para cuatro maletas.",
  },
  {
    category: "camioneta",
    brand: "Toyota",
    model: "Hilux doble cabina",
    year: 2024,
    plate: "GBA-1007",
    color: "Plata",
    transmission: "manual",
    fuel: "diesel",
    seats: 5,
    mileageKm: 24300,
    description: "Camioneta diésel robusta para obra y carga.",
  },
  {
    category: "camioneta",
    brand: "Chevrolet",
    model: "D-Max doble cabina",
    year: 2023,
    plate: "GBA-1008",
    color: "Blanco",
    transmission: "manual",
    fuel: "diesel",
    seats: 5,
    mileageKm: 41700,
    description: "Doble cabina diésel para vías rurales.",
  },
  {
    category: "van",
    brand: "Hyundai",
    model: "H1",
    year: 2023,
    plate: "GBA-1009",
    color: "Blanco",
    transmission: "manual",
    fuel: "diesel",
    seats: 12,
    mileageKm: 45200,
    description: "Van para grupos de hasta 12 pasajeros.",
  },
  {
    category: "van",
    brand: "Toyota",
    model: "Hiace",
    year: 2024,
    plate: "GBA-1010",
    color: "Gris",
    transmission: "manual",
    fuel: "diesel",
    seats: 12,
    mileageKm: 19800,
    description: "Van amplia para traslados y eventos.",
  },
  {
    category: "lujo",
    brand: "Mercedes-Benz",
    model: "C 200",
    year: 2024,
    plate: "GBA-1011",
    color: "Blanco",
    transmission: "automatic",
    fuel: "gasoline",
    seats: 5,
    mileageKm: 9800,
    description: "Sedán premium con interior de cuero.",
  },
  {
    category: "lujo",
    brand: "Mercedes-Benz",
    model: "C 300",
    year: 2023,
    plate: "GBA-1012",
    color: "Negro",
    transmission: "automatic",
    fuel: "gasoline",
    seats: 5,
    mileageKm: 16400,
    description: "Sedán ejecutivo, silencioso y confortable.",
  },
];

/** Valores que cuentan como "sin cargar" para cada campo de ficha. */
const EMPTY: Record<"fuel" | "seats" | "mileageKm" | "description", unknown[]> = {
  fuel: [null, ""],
  seats: [null, 0],
  mileageKm: [null, 0],
  description: [null, ""],
};

const coverages = [
  {
    code: "standard",
    order: 1,
    isDefault: true,
    pricePerDay: 0,
    name: { es: "Cobertura estándar", en: "Standard coverage" },
    description: {
      es: "Incluida en todas las tarifas. Cubre lo básico para que manejes tranquilo.",
      en: "Included in every rate. It covers the basics so you can drive with peace of mind.",
    },
    includes: [
      { es: "Responsabilidad civil básica", en: "Basic third-party liability" },
      { es: "Asistencia en carretera", en: "Roadside assistance" },
    ],
    excludes: [
      { es: "No cubre lucro cesante", en: "Does not cover loss of use" },
      { es: "No cubre rayones ni daños menores", en: "Does not cover scratches or minor damage" },
      {
        es: "No cubre pérdidas parciales determinadas",
        en: "Does not cover certain partial losses",
      },
    ],
  },
  {
    code: "preferential",
    order: 2,
    isDefault: false,
    pricePerDay: 1500,
    name: { es: "Cobertura preferencial", en: "Preferred coverage" },
    description: {
      es: "Más protección y menos preocupaciones: mejores condiciones ante un siniestro y atención prioritaria.",
      en: "More protection and fewer worries: better terms if something happens and priority assistance.",
    },
    includes: [
      { es: "Asistencia prioritaria", en: "Priority assistance" },
      { es: "Mejores condiciones de protección", en: "Better protection terms" },
      { es: "Coberturas adicionales", en: "Additional coverages" },
      { es: "Cubre el 50% del lucro cesante", en: "Covers 50% of loss of use" },
    ],
    excludes: [],
  },
];

const extras = [
  {
    code: "child-seat",
    order: 1,
    icon: "fa-baby",
    price: 1000,
    pricing: "per_day",
    maxQuantity: 2,
    name: { es: "Silla para bebé", en: "Child seat" },
    description: {
      es: "Para bebés y niños pequeños, instalada antes de la entrega.",
      en: "For babies and toddlers, installed before pick-up.",
    },
  },
  {
    code: "additional-driver",
    order: 2,
    icon: "fa-user-plus",
    price: 1000,
    pricing: "per_day",
    maxQuantity: 2,
    name: { es: "Conductor adicional", en: "Additional driver" },
    description: {
      es: "Otra persona autorizada para manejar. Debe presentar su licencia.",
      en: "Another person authorized to drive. They must show their license.",
    },
  },
  {
    code: "gps",
    order: 3,
    icon: "fa-location-dot",
    price: 500,
    pricing: "per_day",
    maxQuantity: 1,
    name: { es: "GPS", en: "GPS" },
    description: {
      es: "Navegador para moverte sin depender de datos móviles.",
      en: "Navigation without relying on mobile data.",
    },
  },
  {
    code: "booster-seat",
    order: 4,
    icon: "fa-child",
    price: 500,
    pricing: "per_day",
    maxQuantity: 2,
    name: { es: "Asiento elevador", en: "Booster seat" },
    description: {
      es: "Para niños que ya no usan silla pero aún no alcanzan el cinturón.",
      en: "For kids who have outgrown a car seat but still need a boost.",
    },
  },
];

/** $setOnInsert respeta lo que el admin ya editó; con --force se pisa con el seed. */
function upsertOps(data: Record<string, unknown>) {
  return FORCE ? { $set: data } : { $setOnInsert: data };
}

async function main() {
  console.log("Conectando a MongoDB...");
  await dbConnect();

  await getSettings();
  console.log("✔ Configuración lista");

  const categoryIds = new Map<string, unknown>();
  for (const c of categories) {
    const { slug, ...data } = c;
    const doc = await Category.findOneAndUpdate(
      { slug },
      { ...upsertOps({ ...data, isActive: true }) },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
    categoryIds.set(slug, doc._id);
  }
  console.log(`✔ ${categories.length} categorías`);

  for (const v of vehicles) {
    const { plate, category, fuel, seats, mileageKm, description, ...data } = v;
    await Vehicle.findOneAndUpdate(
      { plate },
      { ...upsertOps({ ...data, category: categoryIds.get(category), notes: NOTE }) },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    // Campo por campo y solo si está vacío: $in con null también cubre el campo inexistente.
    const sheet = { fuel, seats, mileageKm, description };
    for (const [field, value] of Object.entries(sheet) as [keyof typeof EMPTY, unknown][]) {
      await Vehicle.updateOne(
        { plate, [field]: { $in: EMPTY[field] } },
        { $set: { [field]: value } },
      );
    }
  }
  console.log(`✔ ${vehicles.length} unidades de ejemplo`);

  for (const c of coverages) {
    const { code, ...data } = c;
    await Coverage.findOneAndUpdate(
      { code },
      { ...upsertOps({ ...data, isActive: true }) },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  }
  console.log(`✔ ${coverages.length} coberturas`);

  for (const e of extras) {
    const { code, ...data } = e;
    await Extra.findOneAndUpdate(
      { code },
      { ...upsertOps({ ...data, isActive: true }) },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  }
  console.log(`✔ ${extras.length} extras`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("✖ Falló el seed del catálogo:", error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});

import { ISetting, LOCATION_CODES, Setting } from "../models/setting.model";

const DEFAULT_LOCATIONS = [
  { code: "airport", label: { es: "Aeropuerto de Guayaquil", en: "Guayaquil Airport" }, fee: 0 },
  { code: "office", label: { es: "Nuestra ubicación", en: "Our location" }, fee: 0 },
  { code: "hotel", label: { es: "Hotel o domicilio", en: "Hotel or address" }, fee: 0 },
  { code: "other", label: { es: "Otro lugar", en: "Other" }, fee: 0 },
] as const;

/**
 * Devuelve la configuración única, creándola con valores por defecto la primera
 * vez. Todo el backend lee reglas de negocio desde acá, no de constantes.
 */
export async function getSettings(): Promise<ISetting> {
  let doc = await Setting.findOne({ key: "main" });
  if (!doc) {
    doc = await Setting.create({ key: "main", booking: { locations: DEFAULT_LOCATIONS } });
  }
  if (!doc.booking.locations?.length) {
    doc.booking.locations = DEFAULT_LOCATIONS as unknown as ISetting["booking"]["locations"];
    await doc.save();
  }
  return doc.toObject() as ISetting;
}

export async function updateSettings(patch: Partial<ISetting>): Promise<ISetting> {
  await getSettings();
  const set: Record<string, unknown> = {};
  for (const section of ["business", "booking", "integrations"] as const) {
    const value = patch[section] as Record<string, unknown> | undefined;
    if (!value) continue;
    for (const [k, v] of Object.entries(value)) set[`${section}.${k}`] = v;
  }
  if (Array.isArray((patch.booking as ISetting["booking"] | undefined)?.locations)) {
    const locations = (patch.booking as ISetting["booking"]).locations.filter((l) =>
      (LOCATION_CODES as readonly string[]).includes(l.code),
    );
    set["booking.locations"] = locations;
  }
  const doc = await Setting.findOneAndUpdate({ key: "main" }, { $set: set }, { new: true, runValidators: true });
  return doc!.toObject() as ISetting;
}

/** Enlace de WhatsApp con mensaje prellenado. */
export function whatsappLink(number: string, message: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}

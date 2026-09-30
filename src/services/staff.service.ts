import { CustomError } from "../errors/customError.error";
import { STAFF_TYPES, User } from "../models/user.model";
import { assertObjectId, escapeRegex, paged, pageParams, searchRegex } from "./catalog.service";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type StaffType = (typeof STAFF_TYPES)[number];

function view(user: any) {
  return {
    id: String(user._id),
    name: user.name ?? "",
    email: user.email,
    phone: user.phone ?? "",
    accountType: user.accountType,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}

function parseName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2) throw new CustomError("Escribe el nombre de la persona", 400);
  return name.slice(0, 120);
}

function parseEmail(raw: unknown): string {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL.test(email)) throw new CustomError("Escribe un correo válido", 400);
  return email;
}

function parseRole(raw: unknown): StaffType {
  if (!(STAFF_TYPES as readonly string[]).includes(String(raw))) {
    throw new CustomError("El rol debe ser employee o admin", 400);
  }
  return raw as StaffType;
}

function parsePassword(raw: unknown): string {
  const password = String(raw ?? "");
  if (password.length < 8)
    throw new CustomError("La contraseña debe tener al menos 8 caracteres", 400);
  return password;
}

async function assertEmailFree(email: string, exceptId?: string) {
  // El email se guarda en minúsculas; la regex anclada cubre cuentas antiguas con otra capitalización.
  const filter: Record<string, unknown> = { email: new RegExp(`^${escapeRegex(email)}$`, "i") };
  if (exceptId) filter._id = { $ne: exceptId };
  if (await User.exists(filter)) throw new CustomError("Ya existe una cuenta con ese correo", 409);
}

/** ¿Queda al menos otro admin activo además de `userId`? */
async function hasOtherActiveAdmin(userId: string): Promise<boolean> {
  return Boolean(await User.exists({ _id: { $ne: userId }, accountType: "admin", isActive: true }));
}

export async function listStaff(query: any) {
  const { page, limit, skip } = pageParams(query, 50);
  const filter: Record<string, unknown> = { accountType: { $in: STAFF_TYPES } };
  if (
    query?.accountType &&
    (STAFF_TYPES as readonly string[]).includes(String(query.accountType))
  ) {
    filter.accountType = String(query.accountType);
  }
  if (query?.status === "active") filter.isActive = true;
  if (query?.status === "inactive") filter.isActive = false;
  const rx = searchRegex(query?.q);
  if (rx) filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  const [items, total] = await Promise.all([
    User.find(filter).sort({ isActive: -1, name: 1 }).skip(skip).limit(limit).lean<any[]>(),
    User.countDocuments(filter),
  ]);
  return paged(items.map(view), total, page, limit);
}

export async function createStaff(body: any) {
  const name = parseName(body?.name);
  const email = parseEmail(body?.email);
  const accountType = parseRole(body?.accountType ?? "employee");
  const password = parsePassword(body?.password);
  await assertEmailFree(email);
  const user = await User.create({
    name,
    email,
    phone: String(body?.phone ?? "")
      .trim()
      .slice(0, 30),
    accountType,
    password,
    isActive: true,
  });
  return view(user.toObject());
}

async function findStaff(id: string) {
  assertObjectId(id, "la cuenta");
  const user = await User.findOne({ _id: id, accountType: { $in: STAFF_TYPES } }).select(
    "+password",
  );
  if (!user) throw new CustomError("No se encontró la cuenta", 404);
  return user;
}

export async function updateStaff(id: string, body: any, actorId: string) {
  const user = await findStaff(id);

  if (body?.name !== undefined) user.name = parseName(body.name);
  if (body?.phone !== undefined)
    user.phone = String(body.phone ?? "")
      .trim()
      .slice(0, 30);
  if (body?.email !== undefined) {
    const email = parseEmail(body.email);
    if (email !== user.email) await assertEmailFree(email, id);
    user.email = email;
  }
  if (body?.accountType !== undefined) {
    const accountType = parseRole(body.accountType);
    if (user.accountType === "admin" && accountType !== "admin") {
      if (id === actorId) throw new CustomError("No puedes quitarte el rol de administrador", 409);
      if (user.isActive && !(await hasOtherActiveAdmin(id))) {
        throw new CustomError("Debe quedar al menos un administrador activo", 409);
      }
    }
    user.accountType = accountType;
  }
  // Vacío = no cambiar: el formulario de edición suele mandar el campo en blanco.
  if (body?.password !== undefined && body.password !== "" && body.password !== null) {
    user.password = parsePassword(body.password);
  }

  await user.save();
  return view(user.toObject());
}

/**
 * Borra la cuenta. Reservas y pagos guardan una copia de { id, name, email }
 * de quien los creó, así que el historial sigue mostrando su nombre.
 */
export async function deleteStaff(id: string, actorId: string) {
  const user = await findStaff(id);
  if (id === actorId) throw new CustomError("No puedes eliminar tu propia cuenta", 409);
  if (user.accountType === "admin" && user.isActive && !(await hasOtherActiveAdmin(id))) {
    throw new CustomError("Debe quedar al menos un administrador activo", 409);
  }
  await User.deleteOne({ _id: user._id });
}

export async function setStaffActive(id: string, isActiveRaw: unknown, actorId: string) {
  if (typeof isActiveRaw !== "boolean")
    throw new CustomError("Indica isActive como true o false", 400);
  const user = await findStaff(id);
  if (!isActiveRaw) {
    if (id === actorId) throw new CustomError("No puedes desactivar tu propia cuenta", 409);
    if (user.accountType === "admin" && user.isActive && !(await hasOtherActiveAdmin(id))) {
      throw new CustomError("Debe quedar al menos un administrador activo", 409);
    }
  }
  user.isActive = isActiveRaw;
  await user.save();
  return view(user.toObject());
}

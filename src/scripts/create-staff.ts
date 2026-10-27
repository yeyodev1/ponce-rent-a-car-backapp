/**
 * Alta de una cuenta del panel (admin o employee) sin pasar por la interfaz.
 * Uso: pnpm staff:create -- --email correo@dominio.com --name "Nombre" [--role admin|employee] [--password ...]
 * Sin --password se genera una contraseña fuerte y se imprime una sola vez.
 * Si el correo ya existe, se actualiza (nombre, rol, contraseña y se reactiva).
 */
import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import { dbConnect } from "../config/mongo";
import { STAFF_TYPES, User } from "../models/user.model";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? String(process.argv[i + 1]) : "";
}

function generatePassword(): string {
  // Sin caracteres ambiguos (0/O, 1/l): se dicta por teléfono sin errores.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(14);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const email = arg("email").trim().toLowerCase();
  const name = arg("name").trim() || "Administración";
  const role = arg("role") || "admin";
  const password = arg("password") || generatePassword();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Indica --email válido");
  if (!(STAFF_TYPES as readonly string[]).includes(role)) throw new Error("--role debe ser admin o employee");
  if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");

  console.log("Conectando a MongoDB...");
  await dbConnect();
  const existing = await User.findOne({ email }).select("+password");
  if (existing) {
    existing.name = name;
    existing.accountType = role;
    existing.password = password;
    existing.isActive = true;
    await existing.save();
    console.log(`✔ Cuenta actualizada: ${email} (${role})`);
  } else {
    await User.create({ email, name, accountType: role, password, isActive: true });
    console.log(`✔ Cuenta creada: ${email} (${role})`);
  }
  console.log(`Contraseña: ${password}`);
  console.log("Pídele a la persona que la cambie al entrar (Panel → Mi cuenta).");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("✖ No se pudo crear la cuenta:", error.message || error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});

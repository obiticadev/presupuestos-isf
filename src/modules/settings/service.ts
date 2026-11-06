import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { CompanySettings, Tax } from "@/generated/prisma/client";
import { logAction } from "@/modules/audit/service";
import { assertAdmin } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/session";
import { settingsInput, taxInput, type SettingsInput, type TaxInput } from "./schema";

// Spanish labels for the audit log summary; the history page shows it as is.
const FIELD_LABEL: Record<keyof SettingsInput, string> = {
  legalName: "Razón social", taxId: "CIF", address: "Dirección", phone: "Teléfono", email: "Email",
  registryText: "Datos registrales", letterGreeting: "Saludo", letterIntro: "Introducción",
  letterClosing: "Despedida", letterPlace: "Lugar de la firma", defaultExclusions: "Exclusiones",
  defaultPaymentTerms: "Forma de pago", offerValidityDays: "Validez de la oferta",
  defaultMarginPct: "Margen por defecto", travelOriginText: "Origen del desplazamiento",
  numberPattern: "Patrón de numeración", numberYearlyReset: "Reinicio anual", numberStart: "Valor inicial",
};

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");

export async function getSettings(): Promise<CompanySettings> {
  return prisma.companySettings.findUniqueOrThrow({ where: { id: 1 } });
}

export async function updateSettings(actor: CurrentUser, raw: SettingsInput): Promise<void> {
  assertAdmin(actor);
  const data = parseOrThrow(settingsInput, raw);
  await prisma.$transaction(async (tx) => {
    await tx.companySettings.update({ where: { id: 1 }, data });
    await logAction(tx, {
      userId: actor.id, entity: "settings", entityId: "1", action: "update",
      summary: `Configuración: ${Object.keys(data).map((k) => FIELD_LABEL[k as keyof SettingsInput]).join(", ")}`, data,
    });
  });
}

export async function listTaxes(opts: { includeInactive?: boolean } = {}): Promise<Tax[]> {
  return prisma.tax.findMany({
    where: opts.includeInactive ? undefined : { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export async function saveTax(actor: CurrentUser, raw: TaxInput): Promise<Tax> {
  assertAdmin(actor);
  const input = parseOrThrow(taxInput, raw);
  return prisma.$transaction(async (tx) => {
    const clash = await tx.tax.findUnique({ where: { name: input.name } });
    if (clash && clash.id !== input.id) throw new ValidationError({ name: "Ya existe un impuesto con ese nombre" });
    // Lock every tax row so two concurrent "default" changes cannot leave two defaults.
    await tx.$queryRaw`SELECT id FROM "Tax" FOR UPDATE`;
    if (input.isDefault) await tx.tax.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const data = { name: input.name, ratePct: input.ratePct, isDefault: input.isDefault };
    let tax: Tax;
    if (input.id) {
      const current = await tx.tax.findUnique({ where: { id: input.id } });
      if (!current) throw new NotFoundError("El impuesto no existe");
      if (input.isDefault && !current.active) throw new ValidationError({ isDefault: "Activa el impuesto antes de marcarlo como predeterminado" });
      if (current.isDefault && !input.isDefault) throw new ValidationError({ isDefault: "Marca otro impuesto como predeterminado en su lugar" });
      tax = await tx.tax.update({ where: { id: input.id }, data });
    } else {
      tax = await tx.tax.create({ data });
    }
    await logAction(tx, {
      userId: actor.id, entity: "tax", entityId: tax.id, action: input.id ? "update" : "create",
      summary: `${tax.name}: ${tax.ratePct.toFixed(2).replace(".", ",")} %${tax.isDefault ? " (por defecto)" : ""}`,
    });
    return tax;
  });
}

export async function setTaxActive(actor: CurrentUser, id: string, active: boolean): Promise<void> {
  assertAdmin(actor);
  await prisma.$transaction(async (tx) => {
    const tax = await tx.tax.findUnique({ where: { id } });
    if (!tax) throw new NotFoundError("El impuesto no existe");
    if (!active && tax.isDefault) throw new ValidationError({ _: "No se puede desactivar el impuesto por defecto" });
    await tx.tax.update({ where: { id }, data: { active } });
    await logAction(tx, {
      userId: actor.id, entity: "tax", entityId: id, action: active ? "reactivate" : "deactivate",
      summary: `${tax.name} ${active ? "activado" : "desactivado"}`,
    });
  });
}

/** Image type from the file's first bytes; the declared MIME type is never trusted on its own. */
function sniffImage(bytes: Uint8Array): "png" | "jpg" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export async function saveLogo(actor: CurrentUser, file: { name: string; type: string; bytes: Uint8Array }): Promise<void> {
  assertAdmin(actor);
  const kind = sniffImage(file.bytes);
  const declaredOk = file.type === "image/png" || file.type === "image/jpeg";
  if (!declaredOk || !kind) throw new ValidationError({ logo: "El logo debe ser una imagen PNG o JPEG" });
  if (file.bytes.byteLength > MAX_LOGO_BYTES) throw new ValidationError({ logo: "El logo no puede pasar de 2 MB" });
  const logoPath = `uploads/logo.${kind}`;
  await mkdir(path.join(dataDir(), "uploads"), { recursive: true });
  await writeFile(path.join(dataDir(), logoPath), file.bytes);
  await prisma.$transaction(async (tx) => {
    await tx.companySettings.update({ where: { id: 1 }, data: { logoPath } });
    await logAction(tx, { userId: actor.id, entity: "settings", entityId: "1", action: "logo", summary: `Logo actualizado (${file.name})` });
  });
}

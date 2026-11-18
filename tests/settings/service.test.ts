import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { getSettings, listTaxes, readLogo, saveLogo, saveTax, setTaxActive, updateSettings } from "@/modules/settings/service";
import { makeUser } from "../helpers/users";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("un impuesto «21,5» se guarda exacto como 21.50", async () => {
  const admin = await makeUser("admin");
  const t = await saveTax(admin, { name: "IVA reducido prueba", ratePct: "21,5", isDefault: false });
  expect(t.ratePct.toFixed(2)).toBe("21.50");
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "tax", entityId: t.id } });
  expect(log.summary).toBe("IVA reducido prueba: 21,50 %");
});

test.each(["150", "-1", "abc"])("ratePct %s se rechaza con ValidationError", async (r) => {
  const admin = await makeUser("admin");
  await expect(saveTax(admin, { name: `X${r}`, ratePct: r, isDefault: false })).rejects.toThrow(ValidationError);
});

test("marcar un impuesto por defecto desmarca el anterior", async () => {
  const admin = await makeUser("admin");
  const t = await saveTax(admin, { name: "IVA 10 %", ratePct: "10", isDefault: true });
  const defaults = (await listTaxes()).filter((x) => x.isDefault);
  expect(defaults.map((x) => x.id)).toEqual([t.id]);
});

test("un impuesto desactivado no puede ser el predeterminado", async () => {
  const admin = await makeUser("admin");
  const t = await saveTax(admin, { name: "IVA 4 %", ratePct: "4", isDefault: false });
  await setTaxActive(admin, t.id, false);
  await expect(saveTax(admin, { id: t.id, name: "IVA 4 %", ratePct: "4", isDefault: true })).rejects.toThrow(ValidationError);
  expect((await listTaxes()).find((x) => x.isDefault)?.name).toBe("IVA 21 %");
});

test("un impuesto desactivado no se lista salvo que se pida", async () => {
  const admin = await makeUser("admin");
  const t = await saveTax(admin, { name: "IGIC 7 %", ratePct: "7", isDefault: false });
  await setTaxActive(admin, t.id, false);
  expect((await listTaxes()).some((x) => x.id === t.id)).toBe(false);
  expect((await listTaxes({ includeInactive: true })).some((x) => x.id === t.id)).toBe(true);
});

test("un presupuestador no puede cambiar la configuración ni los impuestos", async () => {
  const p = await makeUser("presupuestador");
  await expect(updateSettings(p, { legalName: "X" })).rejects.toThrow(ForbiddenError);
  await expect(saveTax(p, { name: "T", ratePct: "1", isDefault: false })).rejects.toThrow(ForbiddenError);
  const [iva] = await listTaxes();
  await expect(setTaxActive(p, iva.id, false)).rejects.toThrow(ForbiddenError);
  await expect(saveLogo(p, { name: "l.png", type: "image/png", bytes: new Uint8Array(PNG) })).rejects.toThrow(ForbiddenError);
});

test("los datos registrales se guardan en una sola línea", async () => {
  const admin = await makeUser("admin");
  await updateSettings(admin, { registryText: "Reg. Mercantil \r\n Tomo 1\nFolio 2" });
  expect((await getSettings()).registryText).toBe("Reg. Mercantil Tomo 1 Folio 2");
});

test("updateSettings guarda los textos y lo registra en el historial", async () => {
  const admin = await makeUser("admin");
  await updateSettings(admin, { legalName: "ISF, S.L.", offerValidityDays: "45", defaultMarginPct: "35,5" });
  const s = await getSettings();
  expect(s.legalName).toBe("ISF, S.L.");
  expect(s.offerValidityDays).toBe(45);
  expect(s.defaultMarginPct.toFixed(2)).toBe("35.50");
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "settings", action: "update" } });
  expect(log.summary).toBe("Configuración: Razón social, Validez de la oferta, Margen por defecto");
});

test("el logo solo admite PNG/JPEG de hasta 2 MB", async () => {
  const admin = await makeUser("admin");
  const svg = new TextEncoder().encode("<svg onload=alert(1)>");
  await expect(saveLogo(admin, { name: "l.svg", type: "image/svg+xml", bytes: svg })).rejects.toThrow(ValidationError);
  const big = new Uint8Array(2 * 1024 * 1024 + 1);
  big.set(PNG);
  await expect(saveLogo(admin, { name: "l.png", type: "image/png", bytes: big })).rejects.toThrow(ValidationError);
  const fake = new TextEncoder().encode("<svg>no es png</svg>");
  await expect(saveLogo(admin, { name: "l.png", type: "image/png", bytes: fake })).rejects.toThrow(ValidationError);
});

const PNG_B = [...PNG, 1, 2, 3];
const LOGO_NAME = /^uploads\/logo-[0-9a-f]{12}\.(png|jpg)$/;
const png = (b: number[]) => ({ name: "logo.png", type: "image/png", bytes: new Uint8Array(b) });

test("un PNG válido se guarda por contenido en DATA_DIR/uploads y queda en logoPath", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "isf-data-"));
  const admin = await makeUser("admin");
  await saveLogo(admin, png(PNG));
  const s = await getSettings();
  expect(s.logoPath).toMatch(LOGO_NAME);
  expect([...(await readFile(path.join(process.env.DATA_DIR, s.logoPath!)))]).toEqual(PNG);
});

test("un logo nuevo no sobrescribe el anterior y readLogo lee por ruta, con respaldo al actual", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "isf-data-"));
  const admin = await makeUser("admin");
  await saveLogo(admin, png(PNG));
  const pathA = (await getSettings()).logoPath!;
  await saveLogo(admin, png(PNG_B));
  const pathB = (await getSettings()).logoPath!;
  expect(pathA).toMatch(LOGO_NAME);
  expect(pathB).toMatch(LOGO_NAME);
  expect(pathB).not.toBe(pathA);
  expect([...(await readFile(path.join(process.env.DATA_DIR, pathA)))]).toEqual(PNG);
  expect(await readLogo(pathA)).toEqual({ mime: "image/png", base64: Buffer.from(PNG).toString("base64") });
  await rm(path.join(process.env.DATA_DIR, pathA));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await readLogo(pathA)).toEqual({ mime: "image/png", base64: Buffer.from(PNG_B).toString("base64") });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("pdf: falta el logo"));
  warn.mockRestore();
});

test("readLogo(null) sin logo configurado devuelve null", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(tmpdir(), "isf-data-"));
  await prisma.companySettings.update({ where: { id: 1 }, data: { logoPath: null } });
  expect(await readLogo(null)).toBeNull();
});

test("la migración deja IVA 21 % como impuesto por defecto", async () => {
  const d = (await listTaxes()).find((x) => x.isDefault);
  expect(d?.name).toBe("IVA 21 %");
  expect(d?.ratePct.toFixed(2)).toBe("21.00");
});

test("la configuración trae los textos de la carta por defecto", async () => {
  const s = await getSettings();
  expect(s.letterGreeting).toBe("Muy Sres. Nuestros:");
  expect(s.letterPlace).toBe("Alcalá de Henares");
  expect(s.offerValidityDays).toBe(30);
  expect(s.defaultMarginPct.toFixed(2)).toBe("35.00");
});

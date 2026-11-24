import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { KitInstance, Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/modules/auth/session";
import { kitDefinition, refConceptId, type KitDefinition } from "@/modules/kits/definition";
import { expandKit, overrideKey, type ConceptForKit } from "@/modules/kits/formulas";
import { kitInstanceInput, type KitInstanceInput } from "./schema";
import { logQuote, withDraft, type Tx } from "./service";

/** Keeps only the data and choices the definition knows about, plus a draft's own measure of a fixed material (never empty). */
function clean(def: KitDefinition, input: { params: Record<string, string>; choices: Record<string, string> }) {
  const params = Object.fromEntries(def.params.filter((p) => input.params[p.key] !== undefined).map((p) => [p.key, input.params[p.key].trim()]));
  for (const c of def.components) {
    const own = input.params[overrideKey(c.slot)]?.trim();
    if (own && (c.formula.type === "FIXED" || c.formula.type === "PER_QTY")) params[overrideKey(c.slot)] = own;
  }
  const slots = ["main", ...def.components.map((c) => c.slot)];
  const choices = Object.fromEntries(slots.filter((s) => input.choices[s]).map((s) => [s, input.choices[s]]));
  return { params, choices };
}

/**
 * Re-expands the instance from its own copy of the definition and brings its lines in line.
 * A line that keeps its slot and concept keeps its copied price (and any adjustment); a new concept re-copies from the catalog.
 */
async function regenerate(tx: Tx, actor: CurrentUser, quoteId: string, instance: KitInstance): Promise<string[]> {
  const def = kitDefinition.parse(instance.definition);
  const choices = instance.choices as Record<string, string>;
  const ids = [refConceptId(def.main), ...def.components.map((c) => refConceptId(c.ref)), ...Object.values(choices)].filter((x): x is string => !!x);
  const rows = await tx.concept.findMany({ where: { id: { in: ids } }, include: { unit: true, tax: true } });
  const concepts = new Map<string, ConceptForKit & { code: string; taxName: string }>(rows.map((c) => [c.id, {
    id: c.id, code: c.code, categoryId: c.categoryId, description: c.description, unitName: c.unit.name,
    salePrice: c.salePrice, taxName: c.tax.name, taxRatePct: c.tax.ratePct, active: c.active,
  }]));
  const section = await tx.quoteSection.findUniqueOrThrow({ where: { id: instance.sectionId }, select: { mode: true } });
  const input = { quantity: instance.quantity.toString(), params: instance.params as Record<string, string>, choices };
  const expansion = expandKit(def, input, concepts, section.mode === "GLOBAL");

  const existing = await tx.quoteLine.findMany({ where: { kitInstanceId: instance.id }, include: { adjustments: true } });
  const keep = new Set<string>();
  for (const [i, l] of expansion.lines.entries()) {
    const c = concepts.get(l.conceptId)!;
    const copy = {
      conceptId: c.id, description: c.description, unitName: c.unitName,
      unitPrice: c.salePrice, taxName: c.taxName, taxRatePct: c.taxRatePct,
    };
    const old = existing.find((e) => e.kitSlot === l.slot);
    if (old && old.conceptId === l.conceptId) {
      await tx.quoteLine.update({ where: { id: old.id }, data: { quantity: l.quantity.toString(), position: i + 1 } });
      keep.add(old.id);
    } else if (old) {
      if (old.adjustments.length) {
        await tx.priceAdjustment.deleteMany({ where: { lineId: old.id } });
        await logQuote(tx, actor, quoteId, "update", `Ajuste descartado al cambiar el concepto: ${old.description} → ${c.description}`);
      }
      await tx.quoteLine.update({ where: { id: old.id }, data: { ...copy, quantity: l.quantity.toString(), position: i + 1 } });
      keep.add(old.id);
    } else {
      const created = await tx.quoteLine.create({
        data: { ...copy, sectionId: instance.sectionId, kitInstanceId: instance.id, kitSlot: l.slot, quantity: l.quantity.toString(), position: i + 1 },
      });
      keep.add(created.id);
    }
  }
  await tx.quoteLine.deleteMany({ where: { kitInstanceId: instance.id, id: { notIn: [...keep] } } });
  await tx.kitInstance.update({ where: { id: instance.id }, data: { missing: expansion.missing } });
  return expansion.missing;
}

export async function addKitInstance(actor: CurrentUser, subsectionId: string, raw: KitInstanceInput & { templateId: string }): Promise<KitInstance> {
  const input = parseOrThrow(kitInstanceInput, raw);
  const sub = await prisma.quoteSection.findUnique({ where: { id: subsectionId } });
  if (!sub) throw new NotFoundError("La partida no existe");
  if (!sub.parentId) throw new ValidationError({ _: "Los conjuntos van dentro de una subpartida" });
  const template = await prisma.kitTemplate.findUnique({ where: { id: raw.templateId } });
  if (!template?.active) throw new ValidationError({ templateId: "Elige un conjunto activo" });
  const def = kitDefinition.parse(template.definition);
  return withDraft(actor, sub.quoteId, async (tx) => {
    const max = (await tx.kitInstance.aggregate({ where: { sectionId: sub.id }, _max: { position: true } }))._max.position ?? 0;
    const instance = await tx.kitInstance.create({
      data: {
        sectionId: sub.id, templateId: template.id, name: template.name, definition: def as Prisma.InputJsonValue,
        quantity: input.quantity, ...clean(def, input), position: max + 1,
      },
    });
    const missing = await regenerate(tx, actor, sub.quoteId, instance);
    await logQuote(tx, actor, sub.quoteId, "update", `Conjunto añadido: ${template.name} × ${input.quantity.replace(".", ",")}${missing.length ? " (incompleto)" : ""}`);
    return instance;
  });
}

export async function updateKitInstance(actor: CurrentUser, instanceId: string, raw: KitInstanceInput): Promise<void> {
  const input = parseOrThrow(kitInstanceInput, raw);
  const found = await prisma.kitInstance.findUnique({ where: { id: instanceId }, include: { section: true } });
  if (!found) throw new NotFoundError("El conjunto no existe");
  const def = kitDefinition.parse(found.definition);
  await withDraft(actor, found.section.quoteId, async (tx) => {
    const instance = await tx.kitInstance.update({ where: { id: instanceId }, data: { quantity: input.quantity, ...clean(def, input) } });
    const missing = await regenerate(tx, actor, found.section.quoteId, instance);
    await logQuote(tx, actor, found.section.quoteId, "update", `Conjunto modificado: ${found.name} × ${input.quantity.replace(".", ",")}${missing.length ? " (incompleto)" : ""}`);
  });
}

const refKey = (r: { conceptId: string } | { categoryId: string }) => ("conceptId" in r ? `concept:${r.conceptId}` : `category:${r.categoryId}`);

/**
 * What survives a change of kit (spec 4): the main choice if both mains have the same reference; for each new material, what
 * was chosen, typed or measured on the first unused old material with the same reference (typed amounts and own measures only
 * with the same kind of formula); data with the same key.
 */
function carryOver(from: KitDefinition, to: KitDefinition, params: Record<string, string>, choices: Record<string, string>) {
  const out = { params: {} as Record<string, string>, choices: {} as Record<string, string> };
  if (refKey(from.main) === refKey(to.main) && choices.main) out.choices.main = choices.main;
  for (const p of to.params) if (params[p.key] !== undefined) out.params[p.key] = params[p.key];
  const used = new Set<string>();
  for (const c of to.components) {
    const o = from.components.find((x) => !used.has(x.slot) && refKey(x.ref) === refKey(c.ref));
    if (!o) continue;
    used.add(o.slot);
    if (choices[o.slot]) out.choices[c.slot] = choices[o.slot];
    if (o.formula.type !== c.formula.type) continue;
    if ("param" in o.formula && "param" in c.formula && params[o.formula.param] !== undefined) out.params[c.formula.param] = params[o.formula.param];
    if (params[overrideKey(o.slot)]) out.params[overrideKey(c.slot)] = params[overrideKey(o.slot)];
  }
  return out;
}

export async function changeKitInstance(actor: CurrentUser, instanceId: string, templateId: string): Promise<void> {
  const found = await prisma.kitInstance.findUnique({ where: { id: instanceId }, include: { section: true } });
  if (!found) throw new NotFoundError("El conjunto no existe");
  const template = await prisma.kitTemplate.findUnique({ where: { id: templateId } });
  if (!template?.active) throw new ValidationError({ templateId: "Elige un conjunto activo" });
  const from = kitDefinition.parse(found.definition);
  const to = kitDefinition.parse(template.definition);
  const kept = carryOver(from, to, found.params as Record<string, string>, found.choices as Record<string, string>);
  await withDraft(actor, found.section.quoteId, async (tx) => {
    const instance = await tx.kitInstance.update({
      where: { id: instanceId },
      data: { templateId: template.id, name: template.name, definition: to as Prisma.InputJsonValue, ...clean(to, kept) },
    });
    await regenerate(tx, actor, found.section.quoteId, instance);
    await logQuote(tx, actor, found.section.quoteId, "update", `Conjunto cambiado: ${found.name} → ${template.name}`);
  });
}

export async function removeKitInstance(actor: CurrentUser, instanceId: string): Promise<void> {
  const found = await prisma.kitInstance.findUnique({ where: { id: instanceId }, include: { section: true } });
  if (!found) throw new NotFoundError("El conjunto no existe");
  await withDraft(actor, found.section.quoteId, async (tx) => {
    await tx.kitInstance.delete({ where: { id: instanceId } });
    await logQuote(tx, actor, found.section.quoteId, "update", `Conjunto eliminado: ${found.name}`);
  });
}

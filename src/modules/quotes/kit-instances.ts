import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validation";
import type { KitInstance, Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/modules/auth/session";
import { Prisma as P } from "@/generated/prisma/browser";
import { decimalField } from "@/lib/decimal-field";
import { allowedTemplates, kitDefinition, kitSlotList, partKey, refConceptId, type KitDefinition, type KitSlot } from "@/modules/kits/definition";
import { expandKit, overrideKey, slotTypeOf, type ConceptForKit } from "@/modules/kits/formulas";
import { kitInstanceInput, type KitInstanceInput } from "./schema";
import { logQuote, withDraft, type Tx } from "./service";

/** Keeps only the data and choices the definition knows about, plus a draft's own measure of a fixed material (never empty). */
function clean(def: KitDefinition, input: { params: Record<string, string>; choices: Record<string, string> }) {
  const params = Object.fromEntries(def.params.filter((p) => input.params[p.key] !== undefined).map((p) => [p.key, input.params[p.key].trim()]));
  // The kit parts, then those of each placed dynamic under its prefix (d1, d1/main, d1/c1...).
  const parts: { key: string; formula?: KitDefinition["components"][number]["formula"] }[] = [{ key: "main" }, ...def.components.map((c) => ({ key: c.slot, formula: c.formula }))];
  for (const d of def.dynamics ?? []) {
    const copy = d.copies?.[input.choices[d.slot]]?.definition;
    if (!copy) continue;
    parts.push({ key: d.slot }, { key: partKey(d.slot, "main") }, ...copy.components.map((c) => ({ key: partKey(d.slot, c.slot), formula: c.formula })));
  }
  for (const { key, formula } of parts) {
    const own = input.params[overrideKey(key)]?.trim();
    if (own && (formula?.type === "FIXED" || formula?.type === "PER_QTY")) params[overrideKey(key)] = own;
  }
  const choices = Object.fromEntries(parts.filter((x) => input.choices[x.key]).map((x) => [x.key, input.choices[x.key]]));
  return { params, choices };
}

/** Which dynamic each part holds: only setKitDynamic changes it, so a form that does not send it keeps it. */
const placements = (def: KitDefinition, choices: Record<string, string>) =>
  Object.fromEntries((def.dynamics ?? []).filter((d) => choices[d.slot]).map((d) => [d.slot, choices[d.slot]]));

/** A fixed, required dynamic is placed from the start. */
const fixedPlacements = (def: KitDefinition) =>
  Object.fromEntries((def.dynamics ?? []).filter((d) => !d.optional && "templateId" in d.choice).map((d) => [d.slot, allowedTemplates(d)[0]]));

/**
 * The instance copy of the definition, with a copy of every allowed dynamic that is active and really dynamic:
 * changing a template later does not alter quotes that already use it.
 */
export async function copyDynamics(tx: Tx, def: KitDefinition): Promise<KitDefinition> {
  if (!def.dynamics?.length) return def;
  const dynamics = [];
  for (const d of def.dynamics) {
    const copies: NonNullable<typeof d.copies> = {};
    for (const id of allowedTemplates(d)) {
      const t = await tx.kitTemplate.findUnique({ where: { id } });
      if (!t?.active) continue;
      const copy = kitDefinition.parse(t.definition);
      if (copy.kind === "dynamic") copies[id] = { name: t.name, definition: copy };
    }
    dynamics.push({ ...d, copies });
  }
  return { ...def, dynamics };
}

/**
 * Re-expands the instance from its own copy of the definition and brings its lines in line.
 * A line that keeps its slot and concept keeps its copied price (and any adjustment); a new concept re-copies from the catalog.
 */
async function regenerate(tx: Tx, actor: CurrentUser, quoteId: string, instance: KitInstance): Promise<string[]> {
  const def = kitDefinition.parse(instance.definition);
  const choices = instance.choices as Record<string, string>;
  const slots = kitSlotList.parse(instance.slots);
  const copies = (def.dynamics ?? []).flatMap((d) => Object.values(d.copies ?? {}).map((c) => c.definition));
  const ids = [def, ...copies].flatMap((d) => [refConceptId(d.main), ...d.components.map((c) => refConceptId(c.ref))])
    .concat(Object.values(choices), slots.map((x) => x.conceptId)).filter((x): x is string => !!x);
  const rows = await tx.concept.findMany({ where: { id: { in: ids } }, include: { unit: true, tax: true } });
  const concepts = new Map<string, ConceptForKit & { code: string; taxName: string }>(rows.map((c) => [c.id, {
    id: c.id, code: c.code, categoryId: c.categoryId, description: c.description, unitName: c.unit.name,
    salePrice: c.salePrice, taxName: c.tax.name, taxRatePct: c.tax.ratePct, active: c.active,
  }]));
  const section = await tx.quoteSection.findUniqueOrThrow({ where: { id: instance.sectionId }, select: { mode: true } });
  const input = { quantity: instance.quantity.toString(), params: instance.params as Record<string, string>, choices, slots };
  const expansion = expandKit(def, input, concepts, section.mode === "GLOBAL");
  if (expansion.missing.length) {
    // Keep copied prices and user edits until the kit is complete again; reads and totals exclude these lines.
    await tx.kitInstance.update({ where: { id: instance.id }, data: { missing: expansion.missing } });
    return expansion.missing;
  }

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
  return withDraft(actor, sub.quoteId, async (tx) => {
    const def = await copyDynamics(tx, kitDefinition.parse(template.definition));
    // A dynamic without a main counts as one unit.
    const quantity = def.main ? input.quantity : "1";
    const max = (await tx.kitInstance.aggregate({ where: { sectionId: sub.id }, _max: { position: true } }))._max.position ?? 0;
    const instance = await tx.kitInstance.create({
      data: {
        sectionId: sub.id, templateId: template.id, name: template.name, definition: def as Prisma.InputJsonValue,
        quantity, ...clean(def, { ...input, choices: { ...input.choices, ...fixedPlacements(def) } }), position: max + 1,
      },
    });
    const missing = await regenerate(tx, actor, sub.quoteId, instance);
    await logQuote(tx, actor, sub.quoteId, "update", `Conjunto añadido: ${template.name} × ${quantity.replace(".", ",")}${missing.length ? " (incompleto)" : ""}`);
    return instance;
  });
}

export async function updateKitInstance(actor: CurrentUser, instanceId: string, raw: KitInstanceInput): Promise<void> {
  const input = parseOrThrow(kitInstanceInput, raw);
  await withInstance(actor, instanceId, async (tx, { found, def }) => {
    const choices = { ...input.choices, ...placements(def, found.choices as Record<string, string>) };
    const instance = await tx.kitInstance.update({ where: { id: instanceId }, data: { quantity: def.main ? input.quantity : "1", ...clean(def, { ...input, choices }) } });
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
  if (from.main && to.main && refKey(from.main) === refKey(to.main) && choices.main) out.choices.main = choices.main;
  // A dynamic part keeps its choice (and those inside it) if the new kit has that part and allows the same dynamic.
  for (const d of to.dynamics ?? []) {
    const chosen = choices[d.slot];
    if (!chosen || !d.copies?.[chosen] || !from.dynamics?.some((x) => x.slot === d.slot)) continue;
    for (const [k, v] of Object.entries(choices)) if (k === d.slot || k.startsWith(`${d.slot}/`)) out.choices[k] = v;
  }
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
  await withInstance(actor, instanceId, async (tx, { found, def: from }) => {
    const template = await tx.kitTemplate.findUnique({ where: { id: templateId } });
    if (!template?.active) throw new ValidationError({ templateId: "Elige un conjunto activo" });
    const to = await copyDynamics(tx, kitDefinition.parse(template.definition));
    const kept = carryOver(from, to, found.params as Record<string, string>, found.choices as Record<string, string>);
    const cleaned = clean(to, { ...kept, choices: { ...fixedPlacements(to), ...kept.choices } });
    // Slots survive when their part holds the same dynamic in both kits and their type still exists there.
    const slots = kitSlotList.parse(found.slots).filter((x) =>
      (x.group === "self" || cleaned.choices[x.group] === (found.choices as Record<string, string>)[x.group]) && slotTypeOf(to, cleaned.choices, x.group, x.type));
    const instance = await tx.kitInstance.update({
      where: { id: instanceId },
      data: { templateId: template.id, name: template.name, definition: to as Prisma.InputJsonValue, ...cleaned, slots, ...(to.main ? {} : { quantity: "1" }) },
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

async function loadInstance(tx: Tx, instanceId: string) {
  const found = await tx.kitInstance.findUnique({ where: { id: instanceId }, include: { section: true } });
  if (!found) throw new NotFoundError("El conjunto no existe");
  return { found, def: kitDefinition.parse(found.definition), choices: found.choices as Record<string, string>, slots: kitSlotList.parse(found.slots) };
}

/** Only the quote id is read before locking; mutations use the instance reloaded inside the lock. */
async function withInstance<T>(actor: CurrentUser, instanceId: string, fn: (tx: Tx, state: Awaited<ReturnType<typeof loadInstance>>) => Promise<T>): Promise<T> {
  const route = await prisma.kitInstance.findUnique({ where: { id: instanceId }, select: { section: { select: { quoteId: true } } } });
  if (!route) throw new NotFoundError("El conjunto no existe");
  return withDraft(actor, route.section.quoteId, async (tx) => fn(tx, await loadInstance(tx, instanceId)));
}

/** Saves the slots (and choices) of an instance in a draft and brings its lines in line. */
async function saveSlots(tx: Tx, actor: CurrentUser, found: KitInstance & { section: { quoteId: string } }, data: { slots: KitSlot[]; choices?: Record<string, string>; params?: Record<string, string> }, summary: string) {
  const instance = await tx.kitInstance.update({ where: { id: found.id }, data });
  await regenerate(tx, actor, found.section.quoteId, instance);
  await logQuote(tx, actor, found.section.quoteId, "update", summary);
}

/** A new empty slot (no variant, quantity 1) of `type` in `group` ("self" or a placed dynamic); returns its id. */
export async function addKitSlot(actor: CurrentUser, instanceId: string, group: string, type: string): Promise<string> {
  return withInstance(actor, instanceId, async (tx, { found, def, choices, slots }) => {
    const t = slotTypeOf(def, choices, group, type);
    if (!t) throw new ValidationError({ _: "Ese tipo de slot no existe" });
    const id = crypto.randomUUID().slice(0, 8);
    await saveSlots(tx, actor, found, { slots: [...slots, { id, group, type, conceptId: null, quantity: "1" }] }, `Slot añadido en ${found.name}: ${t.label}`);
    return id;
  });
}

export async function updateKitSlot(actor: CurrentUser, instanceId: string, slotId: string, patch: { conceptId?: string | null; quantity?: string }): Promise<void> {
  let quantity: string | undefined;
  if (patch.quantity !== undefined) {
    const parsed = decimalField().safeParse(patch.quantity);
    if (!parsed.success || !new P.Decimal(parsed.data).gt(0)) throw new ValidationError({ quantity: "Escribe una cantidad mayor que cero" });
    quantity = parsed.data;
  }
  await withInstance(actor, instanceId, async (tx, { found, def, choices, slots }) => {
    const slot = slots.find((x) => x.id === slotId);
    if (!slot) throw new NotFoundError("El slot no existe");
    const conceptId = patch.conceptId === undefined ? slot.conceptId : patch.conceptId || null;
    const label = slotTypeOf(def, choices, slot.group, slot.type)?.label ?? "slot";
    await saveSlots(tx, actor, found, { slots: slots.map((x) => (x.id === slotId ? { ...x, conceptId, quantity: quantity ?? x.quantity } : x)) }, `Slot modificado en ${found.name}: ${label}`);
  });
}

export async function removeKitSlot(actor: CurrentUser, instanceId: string, slotId: string): Promise<void> {
  await withInstance(actor, instanceId, async (tx, { found, def, choices, slots }) => {
    const slot = slots.find((x) => x.id === slotId);
    if (!slot) throw new NotFoundError("El slot no existe");
    const label = slotTypeOf(def, choices, slot.group, slot.type)?.label ?? "slot";
    await saveSlots(tx, actor, found, { slots: slots.filter((x) => x.id !== slotId) }, `Slot quitado en ${found.name}: ${label}`);
  });
}

/**
 * Places a dynamic in a part, or removes it (null, only if optional). Removing or changing it drops its slots and the choices
 * made inside it: put back, it starts empty.
 */
export async function setKitDynamic(actor: CurrentUser, instanceId: string, group: string, templateId: string | null): Promise<void> {
  await withInstance(actor, instanceId, async (tx, { found, def, choices, slots }) => {
    const d = def.dynamics?.find((x) => x.slot === group);
    if (!d) throw new ValidationError({ _: "Ese conjunto dinámico no existe" });
    if (templateId === null && !d.optional) throw new ValidationError({ templateId: `${d.label} es obligatorio: no se puede quitar` });
    if (templateId !== null && (!allowedTemplates(d).includes(templateId) || !d.copies?.[templateId])) throw new ValidationError({ templateId: "Elige un conjunto dinámico de la lista" });
    if (choices[group] === (templateId ?? undefined)) return;
    const rest = Object.fromEntries(Object.entries(choices).filter(([k]) => k !== group && !k.startsWith(`${group}/`)));
    const params = Object.fromEntries(Object.entries(found.params as Record<string, string>).filter(([k]) => !k.startsWith(overrideKey(`${group}/`))));
    await saveSlots(tx, actor, found, {
      slots: slots.filter((x) => x.group !== group), params,
      choices: templateId ? { ...rest, [group]: templateId } : rest,
    }, templateId ? `${d.label} en ${found.name}: ${d.copies![templateId].name}` : `Se quita ${d.label} de ${found.name}`);
  });
}

import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { kitDefinition, kitSlotList, refConceptId, type KitDefinition } from "@/modules/kits/definition";

type Db = Prisma.TransactionClient | typeof prisma;

function conceptsOf(def: KitDefinition): string[] {
  return [...new Set([
    ...[def.main, ...def.components.map((c) => c.ref)].map(refConceptId).filter((x): x is string => !!x),
    ...(def.slotTypes ?? []).flatMap((t) => "conceptIds" in t.variants ? t.variants.conceptIds : []),
    ...(def.dynamics ?? []).flatMap((d) => Object.values(d.copies ?? {}).flatMap((c) => conceptsOf(c.definition))),
  ])];
}

/** Concepts that quotes, required lists or kits (templates in any state, quote instances) still point to: they are deactivated, not deleted. */
export async function usedConceptIds(tx: Db): Promise<Set<string>> {
  const [lines, required, templates, instances] = await Promise.all([
    tx.quoteLine.findMany({ where: { conceptId: { not: null } }, select: { conceptId: true }, distinct: ["conceptId"] }),
    tx.requiredConcept.findMany(),
    tx.kitTemplate.findMany({ select: { definition: true } }),
    tx.kitInstance.findMany({ select: { definition: true, choices: true, slots: true } }),
  ]);
  const ids = new Set<string>();
  for (const l of lines) if (l.conceptId) ids.add(l.conceptId);
  for (const r of required) ids.add(r.conceptId);
  for (const t of templates) conceptsOf(kitDefinition.parse(t.definition)).forEach((id) => ids.add(id));
  for (const i of instances) {
    conceptsOf(kitDefinition.parse(i.definition)).forEach((id) => ids.add(id));
    Object.values(i.choices as Record<string, string>).forEach((id) => ids.add(id));
    for (const slot of kitSlotList.parse(i.slots)) if (slot.conceptId) ids.add(slot.conceptId);
  }
  return ids;
}

/** Active kit templates that use any of the concepts, with the codes they use. */
export async function kitsUsingConcepts(tx: Db, conceptIds: string[]): Promise<{ name: string; codes: string[] }[]> {
  const [templates, concepts] = await Promise.all([
    tx.kitTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    tx.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, code: true } }),
  ]);
  const code = new Map(concepts.map((c) => [c.id, c.code]));
  return templates
    .map((t) => ({ name: t.name, codes: conceptsOf(kitDefinition.parse(t.definition)).filter((id) => code.has(id)).map((id) => code.get(id)!) }))
    .filter((k) => k.codes.length);
}

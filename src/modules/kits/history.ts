// A kit's versions, from the audit log: each save stores { name, description, definition } (older entries only the definition).
import { prisma } from "@/lib/db";
import { authorLabel } from "@/modules/audit/service";
import { allowedTemplates, kitDefinition, refCategoryId, type KitDefinition } from "./definition";
import { fromDefinition, materialSummary, showsRequired } from "./form";

/** `names`: category and kit names by id, for the slot types and dynamics (getKitHistory fills them). */
export type KitSnapshot = { name?: string; description?: string; definition: KitDefinition; names?: Record<string, string> };
export type KitVersion = { id: string; at: Date; userName: string | null; summary: string; snapshot: KitSnapshot | null };

const asked = (ref: { conceptId: string } | { categoryId: string }) => (refCategoryId(ref) ? " (se elige al presupuestar)" : "");

/** The kit in sentences, one per element; comparing two lists of these is the diff the history shows. */
export function kitLines(s: KitSnapshot): string[] {
  const { materials } = fromDefinition(s.definition);
  const name = (id: string) => s.names?.[id] ?? id;
  return [
    ...(s.name === undefined ? [] : [`Nombre: ${s.name}`, `Descripción: ${s.description || "—"}`]),
    s.definition.main ? `Principal: ${s.definition.main.label}${asked(s.definition.main)}` : "Principal: —",
    ...s.definition.components.map((c, i) => {
      const m = materials[i];
      return `${c.label}${asked(c.ref)}: ${materialSummary(m, "")}${showsRequired(m) && !m.required ? " · opcional" : ""}`;
    }),
    ...(s.definition.slotTypes ?? []).map((t) => `Tipo de slot ${t.abbr} ${t.label}${t.red ? " (rojo)" : ""}: ${"conceptIds" in t.variants
      ? `${t.variants.conceptIds.length} variante${t.variants.conceptIds.length === 1 ? "" : "s"}`
      : `categoría ${name(t.variants.categoryId)}`}`),
    ...(s.definition.dynamics ?? []).map((d) => `Conjunto dinámico ${d.label}: ${allowedTemplates(d).map(name).join(" / ")}${d.optional ? " · opcional" : ""}`),
  ];
}

export function kitChanges(after: KitSnapshot, before: KitSnapshot): { added: string[]; removed: string[] } {
  // Old entries have no name: compare only what both versions recorded.
  const both = after.name !== undefined && before.name !== undefined;
  const keep = (l: string) => both || !(l.startsWith("Nombre: ") || l.startsWith("Descripción: "));
  const a = kitLines(after).filter(keep);
  const b = kitLines(before).filter(keep);
  return { added: a.filter((l) => !b.includes(l)), removed: b.filter((l) => !a.includes(l)) };
}

function snapshotOf(data: unknown): KitSnapshot | null {
  const d = data as { name?: string; description?: string; definition?: unknown } | null;
  const parsed = kitDefinition.safeParse(d?.definition ?? d);
  if (!parsed.success) return null;
  return d?.definition ? { name: d.name, description: d.description, definition: parsed.data } : { definition: parsed.data };
}

export async function getKitHistory(kitId: string): Promise<KitVersion[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: "kit", entityId: kitId },
    include: { user: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const versions = rows.map((r) => ({ id: r.id, at: r.createdAt, userName: authorLabel(r.user, r.userName), summary: r.summary, snapshot: snapshotOf(r.data) }));
  const defs = versions.flatMap((v) => (v.snapshot ? [v.snapshot.definition] : []));
  const categoryIds = defs.flatMap((d) => (d.slotTypes ?? []).flatMap((t) => ("categoryId" in t.variants ? [t.variants.categoryId] : [])));
  const kitIds = defs.flatMap((d) => (d.dynamics ?? []).flatMap(allowedTemplates));
  if (!categoryIds.length && !kitIds.length) return versions;
  const [categories, kits] = await Promise.all([
    prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }),
    prisma.kitTemplate.findMany({ where: { id: { in: kitIds } }, select: { id: true, name: true } }),
  ]);
  const names = Object.fromEntries([...categories, ...kits].map((x) => [x.id, x.name]));
  return versions.map((v) => (v.snapshot ? { ...v, snapshot: { ...v.snapshot, names } } : v));
}

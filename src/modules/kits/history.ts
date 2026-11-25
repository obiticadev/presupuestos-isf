// A kit's versions, from the audit log: each save stores { name, description, definition } (older entries only the definition).
import { prisma } from "@/lib/db";
import { authorLabel } from "@/modules/audit/service";
import { kitDefinition, refCategoryId, type KitDefinition } from "./definition";
import { fromDefinition, materialSummary, showsRequired } from "./form";

export type KitSnapshot = { name?: string; description?: string; definition: KitDefinition };
export type KitVersion = { id: string; at: Date; userName: string | null; summary: string; snapshot: KitSnapshot | null };

const asked = (ref: { conceptId: string } | { categoryId: string }) => (refCategoryId(ref) ? " (se elige al presupuestar)" : "");

/** The kit in sentences, one per element; comparing two lists of these is the diff the history shows. */
export function kitLines(s: KitSnapshot): string[] {
  const { materials } = fromDefinition(s.definition);
  return [
    ...(s.name === undefined ? [] : [`Nombre: ${s.name}`, `Descripción: ${s.description || "—"}`]),
    s.definition.main ? `Principal: ${s.definition.main.label}${asked(s.definition.main)}` : "Principal: —",
    ...s.definition.components.map((c, i) => {
      const m = materials[i];
      return `${c.label}${asked(c.ref)}: ${materialSummary(m, "")}${showsRequired(m) && !m.required ? " · opcional" : ""}`;
    }),
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
  return rows.map((r) => ({ id: r.id, at: r.createdAt, userName: authorLabel(r.user, r.userName), summary: r.summary, snapshot: snapshotOf(r.data) }));
}

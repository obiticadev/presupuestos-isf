import { prisma } from "@/lib/db";
import { formatDecimalEs } from "@/lib/decimal";
import { authorLabel } from "@/modules/audit/service";
import type { ConceptDetail } from "./service";

export type ConceptSnapshot = {
  code: string; description: string; category: string; unit: string; tax: string;
  salePrice: string | null; cost: string | null; listPrice: string | null; discountPct: string | null;
  validated: boolean; active: boolean; notes: string; manufacturer: string; supplier: string; supplierRef: string;
};
export type HistorySource = "manual" | "import" | "import-full";

export function conceptSnapshot(c: ConceptDetail): ConceptSnapshot {
  return {
    code: c.code, description: c.description, category: c.category.name, unit: c.unit.name, tax: c.tax.name,
    salePrice: c.salePrice?.toFixed() ?? null, cost: c.cost?.toFixed() ?? null,
    listPrice: c.listPrice?.toFixed() ?? null, discountPct: c.discountPct?.toFixed() ?? null,
    validated: c.validated, active: c.active, notes: c.notes, manufacturer: c.manufacturer,
    supplier: c.supplier, supplierRef: c.supplierRef,
  };
}

export function historyData(c: ConceptDetail, source: HistorySource): { concept: ConceptSnapshot; source: HistorySource } {
  return { concept: conceptSnapshot(c), source };
}

export type SnapshotChange = { field: keyof ConceptSnapshot; label: string; before: string; after: string };

const LABELS: Record<keyof ConceptSnapshot, string> = {
  code: "Código", description: "Descripción", category: "Categoría", unit: "Unidad", tax: "Impuesto",
  salePrice: "Precio de venta", cost: "Coste", listPrice: "PVP", discountPct: "Descuento (%)",
  validated: "Validado", active: "Activo", notes: "Observaciones", manufacturer: "Fabricante",
  supplier: "Proveedor", supplierRef: "Referencia",
};
const DECIMALS = new Set<keyof ConceptSnapshot>(["salePrice", "cost", "listPrice", "discountPct"]);
export const isAmountField = (f: keyof ConceptSnapshot) => DECIMALS.has(f);

export function show(field: keyof ConceptSnapshot, v: string | boolean | null): string {
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (v === null || v === "") return "vacío";
  return DECIMALS.has(field) ? formatDecimalEs(v, { max: 4 }) : v;
}

export function diffSnapshots(after: ConceptSnapshot, before: ConceptSnapshot): SnapshotChange[] {
  return (Object.keys(LABELS) as (keyof ConceptSnapshot)[])
    .filter((f) => before[f] !== after[f])
    .map((field) => ({ field, label: LABELS[field], before: show(field, before[field]), after: show(field, after[field]) }));
}

export const describeChanges = (changes: SnapshotChange[]): string =>
  changes.map((c) => `${c.label}: ${c.before} → ${c.after}`).join("; ");

export type ConceptVersion = {
  id: string; at: Date; userName: string | null; source: HistorySource | null; summary: string; snapshot: ConceptSnapshot | null;
};

export async function getConceptHistory(conceptId: string): Promise<ConceptVersion[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entity: "concept", entityId: conceptId },
    include: { user: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return rows.map((r) => {
    const data = r.data as { concept?: ConceptSnapshot; source?: HistorySource } | null;
    return {
      id: r.id, at: r.createdAt, userName: authorLabel(r.user, r.userName), source: data?.source ?? null,
      summary: r.summary, snapshot: data?.concept ?? null,
    };
  });
}

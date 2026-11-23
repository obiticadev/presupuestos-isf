import { formatDateEs } from "@/lib/dates";
import { conceptSnapshot, show, type ConceptSnapshot, type ConceptVersion } from "@/modules/catalog/history";
import type { ConceptDetail } from "@/modules/catalog/service";
import { versionChanges } from "./concept-history";

type Key = keyof ConceptSnapshot;
const SUPPLIER: Key[] = ["manufacturer", "supplier", "supplierRef", "listPrice", "discountPct"];

/** Read-only panel with one version of the concept; the fields it changed are amber with their previous value. */
export function ConceptVersionPanel({ version, previous, current, isCurrent }: {
  version: ConceptVersion; previous: ConceptVersion | undefined; current: ConceptDetail; isCurrent: boolean;
}) {
  const s = version.snapshot ?? conceptSnapshot(current); // no snapshot (older entry): current values, nothing highlighted
  const before = new Map((versionChanges(version, previous) ?? []).map((c) => [c.field, c.before]));
  const value = (k: Key) => (s[k] === null || s[k] === "" ? "" : show(k, s[k]));
  const field = (k: Key, label: string, area = false) => (
    <label className={before.has(k) ? "field chg" : "field"}>
      {label}
      {area ? <textarea rows={3} readOnly value={value(k)} /> : <input readOnly value={value(k)} />}
      {before.has(k) && <span className="was">Antes: <s>{before.get(k)}</s></span>}
    </label>
  );

  return (
    <>
      <div className="panelhead"><h2 style={{ margin: 0 }}>Concepto</h2></div>
      <p className="ronly" style={{ marginTop: 12 }}>
        {isCurrent ? "Versión actual" : `Versión del ${formatDateEs(version.at)} · ${version.userName ?? "Sistema"}`}. Solo lectura: cierra el historial (X) para editar.
      </p>
      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {!version.snapshot && (
          <p className="legacy">Este cambio es anterior al historial completo: solo se guardó el resumen «{version.summary}». Los campos muestran la versión actual.</p>
        )}
        <fieldset disabled style={{ padding: 0, margin: 0 }}>
          {field("code", "Código")}
          {field("description", "Descripción")}
          <div className="pair">
            {field("category", "Categoría")}
            {field("unit", "Unidad")}
            {field("cost", "Coste")}
            {field("salePrice", "Precio de venta")}
          </div>
          {field("tax", "Impuesto")}
          <label className={before.has("validated") ? "chkchg" : undefined} style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600, padding: "2px 4px" }}>
            <input type="checkbox" checked={s.validated} readOnly style={{ width: 20, height: 20, accentColor: "#004742" }} />
            Precio validado {before.has("validated") && <span className="was">Antes: <s>{before.get("validated")}</s></span>}
          </label>
          {field("active", "Activo")}
          {field("notes", "Observaciones", true)}
          <details open={SUPPLIER.some((k) => before.has(k))}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Datos de proveedor</summary>
            <div className="pair" style={{ marginTop: 10 }}>
              {field("manufacturer", "Fabricante")}
              {field("supplier", "Proveedor")}
              {field("supplierRef", "Referencia")}
              {field("listPrice", "PVP")}
              {field("discountPct", "Descuento (%)")}
            </div>
          </details>
        </fieldset>
      </div>
    </>
  );
}

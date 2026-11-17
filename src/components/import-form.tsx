"use client";

import Link from "next/link";
import { startTransition, useActionState, useId, useState } from "react";

import type { ImportMode, ImportResult, Removal } from "@/lib/import-result";

export type ImportState =
  | { ok: false; errors: Record<string, string> }
  | ({ ok: true } & ImportResult)
  | null;

const KIND: Record<Removal["kind"], string> = { concept: "Concepto", client: "Cliente sin presupuestos", contact: "Contacto", location: "Instalación" };

/**
 * Review-then-confirm import of an .xlsx (catalog, clients). `step` gets the form with `apply=1` only on «Confirmar».
 * `keyLabel` names the key column; with rows from several sheets a «Hoja» column is added. `canFull` offers the full mode (admins).
 */
export function ImportForm({ step, keyLabel, doneHref, doneLabel, canFull }: {
  step: (prev: ImportState, data: FormData) => Promise<ImportState>; keyLabel: string; doneHref: string; doneLabel: string; canFull: boolean;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState<ImportState, FormData>(step, null);
  const [changed, setChanged] = useState(false);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [reviewed, setReviewed] = useState<ImportMode>("merge");
  const result = state?.ok ? state : null;
  const errors = state && !state.ok ? state.errors : {};
  const rows = result ? result.rows.filter((r) => r.action !== "unchanged" || r.errors.length)
    .sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0)) : []; // stable: file order otherwise
  const bad = rows.filter((r) => r.errors.length > 0).length;
  const sheets = rows.some((r) => r.sheet);
  const full = reviewed === "full" && !!result;
  const decided = new Set(result?.decisions.map((d) => d.id));
  const others = result?.removals.filter((r) => !decided.has(r.id)) ?? [];
  const dels = result?.removals.filter((r) => r.outcome === "delete").length ?? 0;
  const offs = (result?.removals.length ?? 0) - dels;
  const canApply = result && !result.applied && !result.error && bad === 0 && result.rows.length > 0 && !changed;
  const pick = (m: ImportMode) => { setMode(m); setChanged(true); };

  return (
    <>
      <form
        id={formId}
        className="sheet"
        style={{ display: "grid", gap: 14 }}
        // onSubmit keeps the chosen file in the input, so «Confirmar» sends the same file again.
        onSubmit={(ev) => {
          ev.preventDefault();
          const data = new FormData(ev.currentTarget, (ev.nativeEvent as SubmitEvent).submitter);
          // Each client decision is a radio pair; only «Dejar como está» travels, as keep=<id>.
          for (const [k, v] of [...data]) if (k.startsWith("decide-")) { data.delete(k); if (v) data.append("keep", String(v)); }
          setChanged(false);
          setReviewed(mode);
          startTransition(() => action(data));
        }}
      >
        {canFull && (
          <fieldset className="modes">
            <label><input type="radio" name="mode" value="merge" checked={mode === "merge"} onChange={() => pick("merge")} />
              <span><b>Añadir y actualizar</b><small>Lo que no está en el Excel se queda como está.</small></span></label>
            <label className="danger"><input type="radio" name="mode" value="full" checked={mode === "full"} onChange={() => pick("full")} />
              <span><b>Completa: dejar igual que el Excel</b><small>Además, lo que no está en el Excel se borra o se desactiva. Solo administradores.</small></span></label>
          </fieldset>
        )}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field">
            Archivo .xlsx (hasta 2 MB)
            <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={() => setChanged(true)} />
            {errors.file && <span className="msg" role="alert">{errors.file}</span>}
          </label>
          <button className="btn" disabled={pending}>Revisar</button>
          {mode === "full"
            ? <button className="btn danger" name="apply" value="1" disabled={pending || !canApply}>Confirmar importación completa</button>
            : <button className="btn pri" name="apply" value="1" disabled={pending || !canApply}>Confirmar importación</button>}
          {pending && <span className="mut" role="status">Procesando…</span>}
          {errors._ && <span className="err" role="alert">{errors._}</span>}
        </div>
      </form>

      {result?.error && <p className="err" role="alert" style={{ marginTop: 16 }}>{result.error}</p>}
      {result?.applied && (
        <p role="status" style={{ marginTop: 16, fontWeight: 600 }}>
          Importación guardada: {result.created} altas, {result.updated} cambios, {result.unchanged} sin cambios
          {full && `, ${dels} bajas y ${offs} desactivados`}. <Link href={doneHref}>{doneLabel}</Link>
        </p>
      )}
      {result && !result.error && (
        <>
          <h2>Revisión</h2>
          <div className={full ? "counts full" : "counts"}>
            <div><b>{result.created}</b><span>Altas</span></div>
            <div><b>{result.updated}</b><span>Cambios</span></div>
            <div><b>{result.unchanged}</b><span>Sin cambios</span></div>
            {full && <div className="del"><b>{dels}</b><span>Se borrarán</span></div>}
            {full && <div className="off"><b>{offs}</b><span>Se desactivarán</span></div>}
          </div>
          {bad > 0 && <p className="err" style={{ marginBottom: 10 }}>{bad} filas con errores. Corrige el archivo y vuelve a revisarlo: no se importará nada mientras haya errores.</p>}

          <h3>Altas y cambios</h3>
          <div style={{ overflowX: "auto", margin: "8px 0 6px" }}>
            <table>
              <thead><tr>{sheets && <th>Hoja</th>}<th className="n">Fila</th><th>{keyLabel}</th><th>Acción</th><th>Qué cambia</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.sheet}-${r.row}`} style={r.errors.length ? { background: "#fbe8e6" } : undefined}>
                    {sheets && <td>{r.sheet}</td>}
                    <td className="n">{r.row}</td>
                    <td className="code">{r.code || "—"}</td>
                    <td>{r.action === "create" ? "Alta" : r.action === "unchanged" ? "Sin cambios" : "Cambio"}</td>
                    <td>{r.errors.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : <span className="mut">{r.changes.join("; ") || "Nuevo"}</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={sheets ? 5 : 4} className="mut">{result.rows.length ? "Ninguna fila cambia nada." : "El archivo no tiene filas."}</td></tr>}
              </tbody>
            </table>
          </div>
          {result.unchanged > 0 && <p className="mut" style={{ fontSize: 13 }}>{result.unchanged} filas sin cambios: no se escriben ni quedan en el historial.</p>}

          {full && result.removals.length > 0 && (
            <>
              <p className="redbox">Importación completa: lo siguiente no está en el Excel y se quitará de la base al confirmar.</p>
              {result.decisions.length > 0 && (
                <>
                  <h3>Clientes con presupuestos: decide uno a uno</h3>
                  <div style={{ overflowX: "auto", margin: "8px 0 14px" }}>
                    <table>
                      <thead><tr><th>Cliente</th><th>Presupuestos</th><th>Qué hacer</th></tr></thead>
                      <tbody>
                        {result.decisions.map((d) => (
                          <tr key={d.id}>
                            <td><b>{d.label}</b><div className="mut" style={{ fontSize: 12 }}>{d.taxId}</div></td>
                            <td>{d.quotes}{d.drafts > 0 && ` (${d.drafts} ${d.drafts === 1 ? "borrador" : "borradores"})`}</td>
                            <td><div className="choice">
                              <label><input type="radio" form={formId} name={`decide-${d.id}`} value="" defaultChecked />Desactivar</label>
                              <label><input type="radio" form={formId} name={`decide-${d.id}`} value={d.id} />Dejar como está</label>
                            </div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {others.length > 0 && (
                <>
                  <h3>Lo demás se aplica solo</h3>
                  <div style={{ overflowX: "auto", margin: "8px 0 14px" }}>
                    <table>
                      <thead><tr><th>Qué</th><th>Dónde</th><th>Resultado</th></tr></thead>
                      <tbody>
                        {others.map((r) => (
                          <tr key={`${r.kind}-${r.id}`}>
                            <td>{KIND[r.kind]}</td>
                            <td><b>{r.label}</b></td>
                            {r.outcome === "delete"
                              ? <td className="err">Se borra</td>
                              : <td style={{ color: "var(--amber)" }}>Se desactiva ({r.reason.toLowerCase()})</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {result.incompleteKits.length > 0 && (
                <>
                  <h3>Conjuntos que quedarán incompletos</h3>
                  <ul>{result.incompleteKits.map((k) => <li key={k.name}><b>{k.name}</b>: {k.codes.join(", ")}</li>)}</ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { applyImportAction, previewImportAction, type ImportState } from "@/modules/catalog/actions";

// One state for both steps; the clicked button decides whether the file is only checked or also saved.
async function importStep(prev: ImportState, data: FormData): Promise<ImportState> {
  return data.get("apply") === "1" ? applyImportAction(prev, data) : previewImportAction(prev, data);
}

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importStep, null);
  const [changed, setChanged] = useState(false);
  const result = state?.ok ? state : null;
  const errors = state && !state.ok ? state.errors : {};
  const rows = result ? [...result.rows].sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0) || a.row - b.row) : [];
  const bad = rows.filter((r) => r.errors.length > 0).length;
  const canApply = result && !result.applied && !result.error && bad === 0 && rows.length > 0 && !changed;

  return (
    <>
      <form
        className="sheet"
        style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}
        // onSubmit keeps the chosen file in the input, so «Confirmar» sends the same file again.
        onSubmit={(ev) => {
          ev.preventDefault();
          const data = new FormData(ev.currentTarget, (ev.nativeEvent as SubmitEvent).submitter);
          setChanged(false);
          startTransition(() => action(data));
        }}
      >
        <label className="field">
          Archivo .xlsx (hasta 2 MB)
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required onChange={() => setChanged(true)} />
          {errors.file && <span className="msg" role="alert">{errors.file}</span>}
        </label>
        <button className="btn" disabled={pending}>Revisar</button>
        <button className="btn pri" name="apply" value="1" disabled={pending || !canApply}>Confirmar importación</button>
        {pending && <span className="mut" role="status">Procesando…</span>}
        {errors._ && <span className="err" role="alert">{errors._}</span>}
      </form>

      {result?.error && <p className="err" role="alert" style={{ marginTop: 16 }}>{result.error}</p>}
      {result?.applied && (
        <p role="status" style={{ marginTop: 16, fontWeight: 600 }}>
          Importación guardada: {result.created} altas y {result.updated} cambios. <Link href="/catalogo">Ver el catálogo</Link>
        </p>
      )}
      {result && !result.error && (
        <>
          <h2>Revisión</h2>
          <p className={bad ? "err" : "mut"} style={{ marginBottom: 10 }}>
            {result.created} altas, {result.updated} cambios, {bad} filas con errores.
            {bad > 0 && " Corrige el archivo y vuelve a revisarlo: no se importará nada mientras haya errores."}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th className="n">Fila</th><th>Código</th><th>Acción</th><th>Errores</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row} style={r.errors.length ? { background: "#fbe8e6" } : undefined}>
                    <td className="n">{r.row}</td>
                    <td className="code">{r.code || "—"}</td>
                    <td>{r.action === "create" ? "Alta" : "Cambio"}</td>
                    <td>{r.errors.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : <span className="mut">Correcta</span>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4} className="mut">El archivo no tiene filas.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

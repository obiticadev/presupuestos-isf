import Link from "next/link";
import { Fragment } from "react";
import { ActionForm } from "@/components/action-form";
import { Menu } from "@/components/disclosure";
import type { AuditEntry } from "@/modules/audit/service";
import { createExtensionAction, createRevisionAction, duplicateAction, refreshPricesAction, setStatusAction } from "@/modules/quotes/actions";
import { STATUS_CLASS, STATUS_LABEL } from "@/modules/quotes/labels";
import { validityRunOut } from "@/modules/quotes/lifecycle";
import type { QuoteDetail } from "@/modules/quotes/service";

const rev = (n: number) => `R${String(n).padStart(2, "0")}`;
const ext = (n: number) => `A${String(n).padStart(2, "0")}`;
/** R01 in the main line; A02 for a new extension, A01-R01 for its revisions. */
const lineLabel = (r: { extension: number; revision: number }) => (r.extension ? (r.revision ? `${ext(r.extension)}-${rev(r.revision)}` : ext(r.extension)) : rev(r.revision));
type NumberRow = { id: string; extension: number; revision: number; status: keyof typeof STATUS_LABEL; issuedAt: Date | null; owner: { name: string } };

function NewButton({ action, id, label, pri }: { action: typeof createRevisionAction; id: string; label: string; pri?: boolean }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="id" value={id} />
      <button className={pri ? "btn pri" : "btn"} style={{ width: "100%", justifyContent: "center" }}>{label}</button>
    </ActionForm>
  );
}
const fmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });

/**
 * Issued quote: status selector (or «Sustituido por»), new revision or extension, and duplicate.
 * Any extension takes revisions; the main line takes none once it has extensions.
 */
export function IssuedPanel({ q, number }: { q: QuoteDetail; number: NumberRow[] }) {
  const next = q.revisions.find((r) => r.id === q.supersededById);
  // The main line shows any draft of its number (it blocks new extensions); an extension, only its own.
  const draft = number.find((r) => r.status === "DRAFT" && (q.extension === 0 || r.extension === q.extension));
  const later = q.extension === 0 && number.some((r) => r.extension > 0);
  const runOut = validityRunOut(q); // Emitido or Enviado would turn back into Caducado within the hour
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3>Estado</h3>
      {next ? (
        <p className="warnbox">Sustituido por <Link href={`/presupuestos/${next.id}`}>{rev(next.revision)}</Link>: ya no cambia de estado.</p>
      ) : (
        <ActionForm action={setStatusAction} key={q.status}>
          <input type="hidden" name="id" value={q.id} />
          <Menu className="status" summaryClassName="btn" label={<><span className={`st ${STATUS_CLASS[q.status]}`}><i />{STATUS_LABEL[q.status]}</span><span aria-hidden>▾</span></>}>
            {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).filter((s) => s !== "DRAFT").map((s) => (
              <button key={s} name="status" value={s} disabled={s === q.status || ((s === "ISSUED" || s === "SENT") && runOut)}>
                <span className={`st ${STATUS_CLASS[s]}`}><i />{STATUS_LABEL[s]}</span>
                {s === q.status && <small>estado actual</small>}
              </button>
            ))}
          </Menu>
        </ActionForm>
      )}
      {!next && (draft && (!later || draft.extension > q.extension) ? (
        <Link className="btn" href={`/presupuestos/${draft.id}`}>Abrir el borrador {lineLabel(draft)}</Link>
      ) : q.extension === 0 ? (
        later ? (
          <NewButton action={createExtensionAction} id={q.id} label="Nueva ampliación" pri />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <NewButton action={createRevisionAction} id={q.id} label="Nueva revisión" pri />
            <NewButton action={createExtensionAction} id={q.id} label="Nueva ampliación" />
          </div>
        )
      ) : (
        <NewButton action={createRevisionAction} id={q.id} label="Nueva revisión" pri />
      ))}
      {!next && later && <p className="locked">Ya tiene ampliaciones: la principal no admite nuevas revisiones.</p>}
      {!q.issued?.pdfPath && <p className="warnbox" role="status">El PDF se generará al descargarlo.</p>}
      <a className="btn" href={`/api/presupuestos/${q.id}/pdf`} target="_blank" rel="noopener">Descargar PDF</a>
      <DuplicateButton id={q.id} />
    </div>
  );
}

export function DuplicateButton({ id }: { id: string }) {
  return (
    <ActionForm action={duplicateAction}>
      <input type="hidden" name="id" value={id} />
      <button className="btn">Duplicar</button>
    </ActionForm>
  );
}

/** Draft: catalog concepts that changed price or were deactivated since they were copied. */
export function PriceWarnings({ id, warnings }: { id: string; warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <div className="warnbox" style={{ display: "grid", gap: 8 }}>
      <span>El catálogo ha cambiado desde que se copiaron estas líneas:</span>
      <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 400 }}>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      <ActionForm action={refreshPricesAction}>
        <input type="hidden" name="id" value={id} />
        <button className="btn">Actualizar precios desde catálogo</button>
      </ActionForm>
    </div>
  );
}

/**
 * Every revision of this number, newest extension on top and the main line at the bottom, latest revision first in each;
 * each opens its own page (data, PDF, duplicate). Superseded ones are not in the quotes list.
 */
export function Revisions({ current, base, revisions }: { current: string; base: string; revisions: NumberRow[] }) {
  if (revisions.length < 2) return null;
  const grouped = revisions.some((r) => r.extension > 0);
  return (
    <nav className="sheet revs" aria-label="Revisiones y ampliaciones">
      <h3>{grouped ? "Revisiones y ampliaciones" : "Revisiones"}</h3>
      {revisions.map((r, i) => (
        <Fragment key={r.id}>
          {grouped && r.extension !== revisions[i - 1]?.extension && (
            <div className="grp">{r.extension ? <>Ampliación {ext(r.extension)} <code>-{ext(r.extension)}</code></> : <>Principal <code>{base}</code></>}</div>
          )}
        <Link href={`/presupuestos/${r.id}`} aria-current={r.id === current ? "page" : undefined}>
          <b>{rev(r.revision)}</b>
          <span className={`st ${STATUS_CLASS[r.status]}`}><i />{STATUS_LABEL[r.status]}</span>
          <small className="mut">{r.issuedAt ? `${fmt.format(r.issuedAt)} · ${r.owner.name}` : r.owner.name}</small>
        </Link>
        </Fragment>
      ))}
    </nav>
  );
}

/** History of the quote and its revisions (spec 5.9). */
export function QuoteHistory({ entries }: { entries: AuditEntry[] }) {
  return (
    <details style={{ marginTop: 22 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Historial ({entries.length})</summary>
      <table style={{ marginTop: 10 }}>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Resumen</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="mut" style={{ whiteSpace: "nowrap" }}>{fmt.format(e.createdAt)}</td>
              <td>{e.userName ?? <span className="mut">Sistema</span>}</td>
              <td>{e.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

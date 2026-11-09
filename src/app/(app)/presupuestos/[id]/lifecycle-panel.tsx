import Link from "next/link";
import { ActionForm, SubmitOnChange } from "@/components/action-form";
import type { AuditEntry } from "@/modules/audit/service";
import { createRevisionAction, duplicateAction, refreshPricesAction, setStatusAction } from "@/modules/quotes/actions";
import { STATUS_LABEL } from "@/modules/quotes/labels";
import { isExpired } from "@/modules/quotes/lifecycle";
import type { QuoteDetail } from "@/modules/quotes/service";

const rev = (n: number) => `R${String(n).padStart(2, "0")}`;
const fmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });

/** Issued quote: status selector (or «Sustituido por»), validity warning, new revision and duplicate. */
export function IssuedPanel({ q }: { q: QuoteDetail }) {
  const next = q.revisions.find((r) => r.id === q.supersededById);
  const draftRevision = q.revisions.find((r) => r.status === "DRAFT");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h3>Estado</h3>
      {next ? (
        <p className="warnbox">Sustituido por <Link href={`/presupuestos/${next.id}`}>{rev(next.revision)}</Link>: ya no cambia de estado.</p>
      ) : (
        <ActionForm action={setStatusAction} key={q.status}>
          <input type="hidden" name="id" value={q.id} />
          <SubmitOnChange>
            <select name="status" defaultValue={q.status} aria-label="Estado del presupuesto">
              {Object.entries(STATUS_LABEL).filter(([s]) => s !== "DRAFT").map(([s, label]) => <option key={s} value={s}>{label}</option>)}
            </select>
          </SubmitOnChange>
        </ActionForm>
      )}
      {isExpired(q) && <p className="warnbox">Validez vencida: han pasado más de {q.validityDays} días desde la emisión.</p>}
      {!next && (draftRevision ? (
        <Link className="btn" href={`/presupuestos/${draftRevision.id}`}>Abrir el borrador {rev(draftRevision.revision)}</Link>
      ) : (
        <ActionForm action={createRevisionAction}>
          <input type="hidden" name="id" value={q.id} />
          <button className="btn pri">Nueva revisión</button>
        </ActionForm>
      ))}
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

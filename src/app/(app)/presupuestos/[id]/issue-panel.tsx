import { ActionForm, ConfirmButton } from "@/components/action-form";
import { formatDecimalEs } from "@/lib/decimal";
import type { Concept, RequiredConcept } from "@/generated/prisma/client";
import { issueAction, setWaiverAction } from "@/modules/quotes/actions";
import { issueChecks } from "@/modules/quotes/issue";
import type { QuoteDetail } from "@/modules/quotes/service";

/** «Para emitir»: each required concept with its quantity (or «Marcar 0 con motivo»), the other problems and the issue button. */
export function IssuePanel({ q, required, hasSignature }: { q: QuoteDetail; required: (RequiredConcept & { concept: Concept })[]; hasSignature: boolean }) {
  const problems = issueChecks(q, required, hasSignature);
  const others = problems.filter((p) => p.code !== "required");
  const lines = q.sections.flatMap((s) => s.children.flatMap((c) => c.lines));
  return (
    <>
      <div id="obligatorios">
        <h3>Para emitir</h3>
        <ul className="chk">
          {required.filter((r) => r.concept.active).map((r) => {
            const own = lines.filter((l) => l.conceptId === r.conceptId);
            const qty = own.length ? own.slice(1).reduce((sum, l) => sum.plus(l.quantity), own[0].quantity) : null;
            const waiver = q.waivers[r.conceptId];
            const ok = (qty !== null && qty.gt(0)) || waiver !== undefined;
            return (
              <li key={r.conceptId}>
                <i className={`dot${ok ? "" : " h"}`} />
                <div>
                  {r.concept.description}
                  {qty !== null && qty.gt(0) ? (
                    <em>{formatDecimalEs(qty)} {own[0].unitName}</em>
                  ) : waiver !== undefined ? (
                    <ActionForm action={setWaiverAction}>
                      <em>A 0: {waiver}</em>
                      <input type="hidden" name="quoteId" value={q.id} />
                      <input type="hidden" name="conceptId" value={r.conceptId} />
                      <input type="hidden" name="clear" value="1" />
                      <button className="lnk">Quitar el 0</button>
                    </ActionForm>
                  ) : (
                    <details>
                      <summary className="lnk">Marcar 0 con motivo</summary>
                      <ActionForm action={setWaiverAction} close style={{ display: "grid", gap: 6, marginTop: 6 }}>
                        <input type="hidden" name="quoteId" value={q.id} />
                        <input type="hidden" name="conceptId" value={r.conceptId} />
                        <label className="field">Motivo<input name="reason" required maxLength={300} aria-label={`Motivo para no incluir ${r.concept.description}`} /></label>
                        <button className="btn" style={{ justifySelf: "start" }}>Marcar 0</button>
                      </ActionForm>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
          {others.map((p, i) => (
            <li key={`${p.code}-${i}`}>
              <i className="dot h" />
              <div><a href={p.anchor}>{p.message}</a></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="emit">
        <a className="btn" href={`/api/presupuestos/${q.id}/pdf`} target="_blank" rel="noopener">Vista previa (PDF)</a>
        {problems.length > 0 ? (
          <>
            <button className="btn pri" disabled>Emitir presupuesto</button>
            <p>{problems.length === 1 ? "Falta 1 dato" : `Faltan ${problems.length} datos`} para poder emitir.</p>
          </>
        ) : (
          <ActionForm action={issueAction}>
            <input type="hidden" name="id" value={q.id} />
            <ConfirmButton label="Emitir presupuesto" className="btn pri" confirm="Se asigna el número y el presupuesto ya no se podrá editar." />
          </ActionForm>
        )}
      </div>
    </>
  );
}

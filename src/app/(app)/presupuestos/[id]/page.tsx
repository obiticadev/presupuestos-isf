import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { formatDateEs } from "@/lib/dates";
import { formatDecimalEs } from "@/lib/decimal";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { listConceptOptions } from "@/modules/catalog/service";
import { getClient, listClientOptions } from "@/modules/clients/service";
import { listKits } from "@/modules/kits/service";
import { deleteDraftAction, updateHeaderAction } from "@/modules/quotes/actions";
import { STATUS_CLASS, STATUS_LABEL } from "@/modules/quotes/labels";
import { listQuoteHistory, priceWarnings } from "@/modules/quotes/lifecycle";
import { getQuote, listRequiredConcepts, quoteLabel, type QuoteDetail } from "@/modules/quotes/service";
import { getSettings, listTaxes } from "@/modules/settings/service";
import { listActiveUserNames } from "@/modules/users/service";
import { OpenKitFromHash } from "@/components/disclosure";
import { IssuePanel } from "./issue-panel";
import { DuplicateButton, IssuedPanel, PriceWarnings, QuoteHistory } from "./lifecycle-panel";
import { Comment } from "./comment";
import { Subsection, SectionHead, AddSection, type EditorContext } from "./sections";

export const metadata: Metadata = { title: "Presupuesto · ISF Presupuestos" };

const money = (v: { toString(): string }) => `${formatDecimalEs(v)} €`;
const text = (v: string) => (v ? <span style={{ whiteSpace: "pre-wrap" }}>{v}</span> : <span className="mut">—</span>);

export default async function PresupuestoPage({ params }: PageProps<"/presupuestos/[id]">) {
  await requireUser();
  const { id } = await params;
  let q: QuoteDetail;
  try {
    q = await getQuote(id);
  } catch (e) {
    // Right after «Eliminar borrador» (or a stale link) the quote is gone: say so instead of a bare 404.
    if (!(e instanceof NotFoundError)) throw e;
    return (
      <>
        <div className="crumb"><Link href="/">Presupuestos</Link></div>
        <p role="status" style={{ marginTop: 18 }}>Este presupuesto ya no existe: se ha borrado. <Link href="/">Volver a presupuestos</Link></p>
      </>
    );
  }
  const editable = q.status === "DRAFT";
  const [client, clients, users, taxes, concepts, kits, settings, required, history, warnings] = await Promise.all([
    getClient(q.clientId), listClientOptions(), listActiveUserNames(), listTaxes(), listConceptOptions(), listKits(), getSettings(), listRequiredConcepts(),
    listQuoteHistory(q.id), editable ? priceWarnings(prisma, q.id) : [],
  ]);
  const ctx: EditorContext = {
    editable, quoteId: q.id, totals: q.totals,
    taxes: taxes.map((t) => ({ id: t.id, name: t.name })),
    concepts: concepts.filter((c) => c.active),
    kits: kits.map((k) => ({ id: k.id, name: k.name })),
    allConcepts: concepts,
  };
  const title = quoteLabel(q);
  const activeOrCurrent = <T extends { id: string; active: boolean }>(rows: T[], current: string | null) => rows.filter((r) => r.active || r.id === current);

  return (
    <div className="split">
      <div style={{ minWidth: 0 }}>
        <div className="crumb"><Link href="/">Presupuestos</Link> / {title}</div>
        <div className="head">
          <h1>{q.reference ?? (q.seq !== null ? title : "Borrador · sin número")}</h1>
          <span className={`st ${STATUS_CLASS[q.status]}`}><i />{STATUS_LABEL[q.status]}</span>
        </div>
        {q.parent && <p className="mut" style={{ marginTop: 4 }}>Sustituye a <Link href={`/presupuestos/${q.parent.id}`}>R{String(q.parent.revision).padStart(2, "0")}</Link></p>}
        {editable && <div style={{ marginTop: 12 }}><PriceWarnings id={q.id} warnings={warnings} /></div>}

        <section id="cabecera" style={{ marginTop: 16 }}>
          {editable ? (
            <ActionForm action={updateHeaderAction} key={q.updatedAt.getTime()} className="sheet headform">
              <input type="hidden" name="id" value={q.id} />
              <label className="field">Cliente
                <select name="clientId" defaultValue={q.clientId}>
                  {!clients.some((c) => c.id === q.clientId) && <option value={q.clientId}>{q.client.legalName} (desactivado)</option>}
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
                </select>
              </label>
              <label className="field">Ubicación
                <select name="locationId" defaultValue={q.locationId ?? ""}>
                  <option value="">— Sin elegir —</option>
                  {activeOrCurrent(client.locations, q.locationId).map((l) => <option key={l.id} value={l.id}>{l.name}{l.city ? ` · ${l.city}` : ""}</option>)}
                </select>
              </label>
              <label className="field">Contacto
                <select name="contactId" defaultValue={q.contactId ?? ""}>
                  <option value="">— Sin elegir —</option>
                  {activeOrCurrent(client.contacts, q.contactId).map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` · ${c.role}` : ""}</option>)}
                </select>
              </label>
              <label className="field">Responsable
                <select name="ownerId" defaultValue={q.ownerId}>
                  {!users.some((u) => u.id === q.ownerId) && <option value={q.ownerId}>{q.owner.name}</option>}
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="field">Fecha<input type="date" name="date" defaultValue={q.date.toISOString().slice(0, 10)} required /></label>
              <label className="field">Validez (días)<input name="validityDays" defaultValue={q.validityDays} inputMode="numeric" required /></label>
              <label className="field wide">Asunto («…en referencia a…»)<textarea name="subject" defaultValue={q.subject} rows={2} /></label>
              <details className="wide" open={!q.paymentTerms}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Condiciones</summary>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  <label className="field">Forma de pago<textarea name="paymentTerms" defaultValue={q.paymentTerms} rows={2} /></label>
                  <label className="field">Exclusiones<textarea name="exclusions" defaultValue={q.exclusions} rows={3} /></label>
                </div>
              </details>
              <div className="wide"><button className="btn pri">Guardar cabecera</button></div>
            </ActionForm>
          ) : (
            <div className="sheet">
              <dl>
                <dt>Cliente</dt><dd><Link href={`/clientes/${q.clientId}`}>{q.client.legalName}</Link></dd>
                <dt>Ubicación</dt><dd>{q.location ? `${q.location.name}${q.location.city ? ` · ${q.location.city}` : ""}` : "—"}</dd>
                <dt>Contacto</dt><dd>{q.contact?.name ?? "—"}</dd>
                <dt>Responsable</dt><dd>{q.owner.name}</dd>
                <dt>Fecha</dt><dd>{formatDateEs(q.date)}</dd>
                <dt>Asunto</dt><dd>{text(q.subject)}</dd>
                <dt>Forma de pago</dt><dd>{text(q.paymentTerms)}</dd>
                <dt>Exclusiones</dt><dd>{text(q.exclusions)}</dd>
                <dt>Validez</dt><dd>{q.validityDays} días</dd>
              </dl>
            </div>
          )}
        </section>

        <div className="qtable" id="partidas" style={{ marginTop: 22 }}>
          <div className="qrow qhead"><span className="c-code">P</span><span className="c-desc">Denominación</span><span className="n c-qty">Cantidad</span><span className="n c-price">Precio</span><span className="n c-amt">Importe</span></div>
          {q.sections.map((s, i) => (
            <div key={s.id}>
              <SectionHead ctx={ctx} section={s} number={`${i + 1}`} amount={q.totals.sections[s.id]} first={i === 0} last={i === q.sections.length - 1} />
              {s.children.map((sub, j) => (
                <Subsection key={sub.id} ctx={ctx} sub={sub} number={`${i + 1}.${j + 1}`} first={j === 0} last={j === s.children.length - 1} />
              ))}
              <Comment kind="section" id={s.id} text={s.comment} editable={editable} variant="cp" />
            </div>
          ))}
          {q.sections.length === 0 && <p className="mut" style={{ padding: 12 }}>Sin partidas.</p>}
          {editable && <AddSection quoteId={q.id} />}
        </div>
        <OpenKitFromHash />
        <QuoteHistory entries={history} />
      </div>

      <aside className="panel sheet" style={{ display: "grid", gap: 18 }}>
        <div className="tot">
          <h3>Totales</h3>
          <div><span>Base imponible</span><span>{money(q.totals.base)}</span></div>
          {q.totals.taxes.map((t) => <div key={`${t.name}${t.ratePct}`}><span>{t.name}</span><span>{money(t.amount)}</span></div>)}
          <div className="big"><span>Total</span><span>{money(q.totals.total)}</span></div>
          {q.totals.unpricedLineIds.length > 0 && <p className="warnbox">{q.totals.unpricedLineIds.length} líneas sin precio o sin impuesto no cuentan en el total.</p>}
        </div>

        <div>
          <h3>Desplazamiento</h3>
          <p className="mut" style={{ fontSize: 13, margin: "6px 0" }}>
            Pon los km facturables totales{settings.travelOriginText ? ` desde ${settings.travelOriginText}` : ""} (viajes, vehículos e ida y vuelta) en la línea de desplazamiento.
          </p>
          {editable ? (
            <ActionForm action={updateHeaderAction} key={`travel-${q.updatedAt.getTime()}`} style={{ display: "grid", gap: 8 }}>
              <input type="hidden" name="id" value={q.id} />
              <label className="field">Nota sobre el desglose<textarea name="travelNote" defaultValue={q.travelNote} rows={2} placeholder="2 viajes × 2 vehículos × 25 km ida y vuelta" /></label>
              <button className="btn" style={{ justifySelf: "start" }}>Guardar nota</button>
            </ActionForm>
          ) : text(q.travelNote)}
        </div>

        {editable ? <IssuePanel q={q} required={required} /> : <IssuedPanel q={q} />}

        {editable && (
          <ActionForm action={deleteDraftAction}>
            <input type="hidden" name="id" value={q.id} />
            <ConfirmButton label="Eliminar borrador" confirm="Se borra entero y no se puede recuperar." />
          </ActionForm>
        )}
        {editable && <DuplicateButton id={q.id} />}
      </aside>
    </div>
  );
}

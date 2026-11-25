import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { formatDateEs } from "@/lib/dates";
import { formatDecimalEs } from "@/lib/decimal";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getSignature } from "@/modules/account/service";
import { requireUser } from "@/modules/auth/session";
import { listConceptOptions } from "@/modules/catalog/service";
import { listCategories } from "@/modules/catalog/lists";
import { Combobox } from "@/components/combobox";
import { installationLabel } from "@/modules/clients/labels";
import { getClient, listClientOptions } from "@/modules/clients/service";
import { listKits } from "@/modules/kits/service";
import { deleteDraftAction, updateHeaderAction } from "@/modules/quotes/actions";
import { STATUS_CLASS, STATUS_LABEL } from "@/modules/quotes/labels";
import { listQuoteHistory, listRevisions, priceWarnings } from "@/modules/quotes/lifecycle";
import { listNotes } from "@/modules/quotes/notes";
import { getQuote, listRequiredConcepts, quoteLabel, type QuoteDetail } from "@/modules/quotes/service";
import { listTaxes } from "@/modules/settings/service";
import { OpenKitFromHash } from "@/components/disclosure";
import { InstallationFields } from "./installation-fields";
import { formatTypeCode, listQuoteTypes } from "@/modules/quotes/types";
import { baseReference } from "@/modules/quotes/numbering";
import { IssuePanel } from "./issue-panel";
import { DuplicateButton, IssuedPanel, PriceWarnings, QuoteHistory, Revisions } from "./lifecycle-panel";
import { Comment } from "./comment";
import { Notes } from "./notes";
import { Subsection, SectionHead, AddSection, type EditorContext } from "./sections";

export const metadata: Metadata = { title: "Presupuesto · ISF Presupuestos" };

const money = (v: { toString(): string }) => `${formatDecimalEs(v)} €`;
const text = (v: string) => (v ? <span style={{ whiteSpace: "pre-wrap" }}>{v}</span> : <span className="mut">—</span>);

export default async function PresupuestoPage({ params, searchParams }: PageProps<"/presupuestos/[id]">) {
  const me = await requireUser();
  const { id } = await params;
  const precios = Number((await searchParams).precios); // set by «Revisar» when catalog prices were copied in
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
  const [client, clients, taxes, concepts, kits, notes, required, history, warnings, revisions, types, categories] = await Promise.all([
    getClient(q.clientId), listClientOptions(), listTaxes(), listConceptOptions(), listKits(), listNotes(q.id), listRequiredConcepts(),
    listQuoteHistory(q.id), editable ? priceWarnings(prisma, q.id) : [], listRevisions(q.id), listQuoteTypes({ includeInactive: true }), listCategories({ includeInactive: true }),
  ]);
  const ctx: EditorContext = {
    editable, quoteId: q.id, totals: q.totals,
    taxes: taxes.map((t) => ({ id: t.id, name: t.name })),
    concepts: concepts.filter((c) => c.active),
    kits: kits.map((k) => ({ id: k.id, name: k.name, description: k.description, dynamic: k.definition.kind === "dynamic" })),
    allConcepts: concepts,
    categories: Object.fromEntries(categories.map((k) => [k.id, k.name])),
  };
  const title = quoteLabel(q);
  const activeOrCurrent = <T extends { id: string; active: boolean }>(rows: T[], current: string | null) => rows.filter((r) => r.active || r.id === current);

  return (
    <div className="split">
      <div style={{ minWidth: 0 }}>
        <div className="crumb"><Link href="/">Presupuestos</Link> / {title}</div>
        <div className="head">
          <h1>{title}</h1>
          <span className={`st ${STATUS_CLASS[q.status]}`}><i />{STATUS_LABEL[q.status]}</span>
          {q.type && <span className="tiponame">{q.type.name}</span>}
        </div>
        {q.parent && <p className="mut" style={{ marginTop: 4 }}>Sustituye a <Link href={`/presupuestos/${q.parent.id}`}>R{String(q.parent.revision).padStart(2, "0")}</Link></p>}
        {editable && Number.isInteger(precios) && precios > 0 && (
          <p className="warnbox" role="status" style={{ marginTop: 12 }}>Precios actualizados desde el catálogo en {precios} {precios === 1 ? "línea" : "líneas"}.</p>
        )}
        {editable && <div style={{ marginTop: 12 }}><PriceWarnings id={q.id} warnings={warnings} /></div>}

        <section id="cabecera" style={{ marginTop: 16 }}>
          {editable ? (
            <ActionForm action={updateHeaderAction} key={q.updatedAt.getTime()} className="sheet headform">
              <input type="hidden" name="id" value={q.id} />
              <div className="tipocli">
                {q.seq === null ? (
                  <label className="field tipo">Tipo
                    {/* Closed, only the code; open, each code with its name (data-d, as the required concepts). */}
                    <select name="typeId" defaultValue={q.typeId ?? ""}>
                      <option value="">—</option>
                      {activeOrCurrent(types, q.typeId).map((t) => <option key={t.id} value={t.id} data-d={t.name}>{formatTypeCode(t.code)}</option>)}
                    </select>
                  </label>
                ) : (
                  <div className="field tipo">Tipo<output className="box" tabIndex={0}>{q.typeCode ? formatTypeCode(q.typeCode) : "—"}</output></div>
                )}
                {q.extension > 0 ? (
                  <div className="field">Cliente<output className="box" tabIndex={0}>{q.client.legalName}</output></div>
                ) : (
                  <label className="field">Cliente
                    <Combobox name="clientId" value={q.clientId} label="Cliente" placeholder="Razón social, CIF o nombre comercial"
                      items={[...(clients.some((c) => c.id === q.clientId) ? [] : [{ ...q.client, legalName: `${q.client.legalName} (desactivado)` }]), ...clients]
                        .map((c) => ({ id: c.id, code: c.legalName, description: c.taxId, extra: c.tradeName, text: c.legalName }))} />
                  </label>
                )}
              </div>
              {/* An extension keeps the type, client and installation of its quote. */}
              {q.extension > 0 ? (
                <>
                  <div className="field">Nombre<output className="box" tabIndex={0}>{q.location?.name ?? "—"}</output></div>
                  <div className="field">Instalación<output className="box" tabIndex={0}>{installationLabel(q.location)}</output></div>
                </>
              ) : (
                <InstallationFields
                  options={activeOrCurrent(client.locations, q.locationId).map((l) => ({ id: l.id, name: l.name, label: installationLabel(l), installation: l.installation, address: l.address }))}
                  current={q.locationId}
                />
              )}
              <label className="field">Contacto
                <Combobox name="contactId" value={q.contactId ?? ""} label="Contacto" placeholder="Nombre, cargo, email o teléfono"
                  items={activeOrCurrent(client.contacts, q.contactId).map((c) => ({
                    id: c.id, code: c.name, description: c.role, extra: [c.email, c.phone].filter(Boolean).join(" · "), text: c.name,
                  }))} />
              </label>
              {/* Whoever manages the draft; issuing records the issuer. Read-only box, like «Instalación». */}
              <div className="field">Responsable<output className="box" tabIndex={0}>{me.name}</output></div>
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
                {q.typeCode > 0 && <><dt>Tipo</dt><dd>{formatTypeCode(q.typeCode)} · {q.type?.name}</dd></>}
                <dt>Cliente</dt><dd><Link href={`/clientes/${q.clientId}`}>{q.client.legalName}</Link></dd>
                <dt>Nombre</dt><dd>{q.location?.name ?? "—"}</dd>
                <dt>Instalación</dt><dd>{installationLabel(q.location)}</dd>
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

      <div className="panel" style={{ display: "grid", gap: 16 }}>
      <aside className="sheet" style={{ display: "grid", gap: 18 }}>
        <div className="tot">
          <h3>Totales</h3>
          <div><span>Base imponible</span><span>{money(q.totals.base)}</span></div>
          {q.totals.taxes.map((t) => <div key={`${t.name}${t.ratePct}`}><span>{t.name}</span><span>{money(t.amount)}</span></div>)}
          <div className="big"><span>Total</span><span>{money(q.totals.total)}</span></div>
          {q.totals.unpricedLineIds.length > 0 && <p className="warnbox">{q.totals.unpricedLineIds.length} líneas sin precio o sin impuesto no cuentan en el total.</p>}
        </div>

        <Notes groups={notes} meId={me.id} />

        {editable ? <IssuePanel q={q} required={required} hasSignature={(await getSignature(me.id)) !== null} /> : <IssuedPanel q={q} number={revisions} />}

        {editable && (
          <ActionForm action={deleteDraftAction}>
            <input type="hidden" name="id" value={q.id} />
            <ConfirmButton label="Eliminar borrador" confirm="Se borra entero y no se puede recuperar." />
          </ActionForm>
        )}
        {editable && <DuplicateButton id={q.id} />}
      </aside>
      <Revisions current={q.id} revisions={revisions}
        base={q.seq !== null && q.numberPattern ? baseReference(q.numberPattern, { year: q.seqYear!, typeCode: q.typeCode, seq: q.seq }) : ""} />
      </div>
    </div>
  );
}

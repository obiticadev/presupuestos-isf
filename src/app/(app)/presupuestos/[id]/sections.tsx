// Server components for the quote table: partidas, subpartidas, lines and kit blocks.
// Every editable control is a small ActionForm bound to one Server Action; read-only quotes render plain text.
import { ActionForm, ConfirmButton, SubmitOnBlur, SubmitOnChange } from "@/components/action-form";
import type { ReactNode } from "react";
import { CloseButton, CollapseKitButton, Menu, OpenButton } from "@/components/disclosure";
import { Comment, CommentButton } from "./comment";
import { formatDecimalEs } from "@/lib/decimal";
import type { ConceptOption } from "@/modules/catalog/service";
import { kitDefinition, refCategoryId, refConceptId } from "@/modules/kits/definition";
import {
  addCatalogLineAction, addCustomLineAction, addKitAction, addSectionAction, adjustPriceAction, moveLineAction, moveSectionAction,
  removeKitAction, removeLineAction, removeSectionAction, updateKitAction, updateLineAction, updateSectionAction,
} from "@/modules/quotes/actions";
import type { QuoteTotals } from "@/modules/quotes/calculation";
import type { KitInstanceDetail, LineDetail, SectionDetail, SubsectionDetail } from "@/modules/quotes/service";

export type EditorContext = {
  editable: boolean; quoteId: string; totals: QuoteTotals;
  taxes: { id: string; name: string }[];
  /** Active concepts, for new lines and kit choices. */
  concepts: ConceptOption[];
  /** Every concept, to name the current choice of a kit even if it was deactivated. */
  allConcepts: ConceptOption[];
  kits: { id: string; name: string }[];
};

type Dec = { toString(): string };
const money = (v: Dec | null | undefined) => (v == null ? "—" : `${formatDecimalEs(v)} €`);
const price = (v: Dec | null | undefined) => (v == null ? "" : formatDecimalEs(v, { max: 4 }));
const qty = (v: Dec) => formatDecimalEs(v, { min: 0, max: 4 });

function Move({ action, id, first, last }: { action: typeof moveSectionAction; id: string; first: boolean; last: boolean }) {
  return (
    <>
      <ActionForm action={action} className="up"><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value="-1" /><button className="icon" disabled={first} aria-label="Subir">↑</button></ActionForm>
      <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value="1" /><button className="icon" disabled={last} aria-label="Bajar">↓</button></ActionForm>
    </>
  );
}

/** A panel opened by an OpenButton: a <details> whose summary is hidden. */
function Panel({ id, group, children }: { id: string; group?: string; children: ReactNode }) {
  return <details id={id} data-group={group} className="addpanel"><summary tabIndex={-1} aria-hidden /> {children}</details>;
}

/** The band at the foot of the table that adds a partida at the end of the quote. */
export function AddSection({ quoteId }: { quoteId: string }) {
  return (
    <>
      <OpenButton target="nueva-partida" className="addpart">＋ Nueva partida</OpenButton>
      <Panel id="nueva-partida">
        <ActionForm action={addSectionAction} reset close className="addform">
          <span className="ttl">Nueva partida al final del presupuesto</span>
          <input type="hidden" name="quoteId" value={quoteId} />
          <input name="title" className="grow" placeholder="Nombre de la nueva partida" aria-label="Nombre de la nueva partida" />
          <button className="btn pri">Añadir partida</button>
          <CloseButton />
        </ActionForm>
      </Panel>
    </>
  );
}

export function SectionHead({ ctx, section, number, amount, first, last }: {
  ctx: EditorContext; section: SectionDetail; number: string; amount: Dec | undefined; first: boolean; last: boolean;
}) {
  return (
    <>
    <div className="qrow part">
      <span className="c-code">{number}</span>
      {ctx.editable ? (
        <ActionForm action={updateSectionAction} key={section.title} className="inline c-desc">
          <input type="hidden" name="id" value={section.id} />
          <SubmitOnBlur><textarea name="title" defaultValue={section.title} rows={1} placeholder="Nombre de la partida" aria-label={`Nombre de la partida ${number}`} /></SubmitOnBlur>
        </ActionForm>
      ) : <span className="c-desc">{section.title || <span className="mut">Partida {number}</span>}</span>}
      <span className="n c-amt">{money(amount)}</span>
      <span className="acts c-acts">
        {ctx.editable && (
          <>
            <ActionForm action={removeSectionAction}><input type="hidden" name="id" value={section.id} /><ConfirmButton label="Eliminar" className="icon" confirm="¿Eliminar la partida con todo su contenido?" /></ActionForm>
            <Move action={moveSectionAction} id={section.id} first={first} last={last} />
            <Menu className="last" summaryClassName="icon" title="Añadir a la partida" label="＋">
              <OpenButton target={`nueva-subpartida-${section.id}`}>Subpartida<small>nueva subpartida al final de la partida</small></OpenButton>
              <OpenButton target={`comentario-${section.id}`}>Comentario de la partida<small>al pie de la partida</small></OpenButton>
            </Menu>
          </>
        )}
      </span>
    </div>
    {ctx.editable && (
      <Panel id={`nueva-subpartida-${section.id}`} group={section.id}>
        <ActionForm action={addSectionAction} reset close className="addform">
          <span className="ttl">Nueva subpartida en la partida {number}</span>
          <input type="hidden" name="quoteId" value={ctx.quoteId} />
          <input type="hidden" name="parentId" value={section.id} />
          <input name="title" className="grow" placeholder="Nombre de la subpartida" aria-label="Nombre de la subpartida" />
          <button className="btn pri">Añadir subpartida</button>
          <CloseButton />
        </ActionForm>
      </Panel>
    )}
    </>
  );
}

export function Subsection({ ctx, sub, number, first, last }: { ctx: EditorContext; sub: SubsectionDetail; number: string; first: boolean; last: boolean }) {
  const global = sub.mode === "GLOBAL";
  const loose = sub.lines.filter((l) => !l.kitInstanceId);
  const amount = ctx.totals.subsections[sub.id];
  return (
    <div className="subblock" id={`seccion-${sub.id}`}>
      <div className="qrow sub">
        <span className="c-code">{number}</span>
        {ctx.editable ? (
          <ActionForm action={updateSectionAction} key={`${sub.title}-${sub.mode}-${sub.globalQty}-${sub.globalPrice}-${sub.taxName}`} className="inline subform c-desc">
            <input type="hidden" name="id" value={sub.id} />
            <SubmitOnBlur><textarea name="title" defaultValue={sub.title} rows={1} placeholder="Nombre de la subpartida" aria-label={`Nombre de la subpartida ${number}`} /></SubmitOnBlur>
            <SubmitOnChange>
              <select name="mode" defaultValue={sub.mode} aria-label="Modo de la subpartida">
                <option value="SUM">por suma</option>
                <option value="GLOBAL">precio global</option>
              </select>
            </SubmitOnChange>
            {global && (
              <>
                <input name="globalQty" defaultValue={sub.globalQty ? qty(sub.globalQty) : "1"} inputMode="decimal" aria-label="Cantidad" size={4} />
                <input name="globalPrice" defaultValue={price(sub.globalPrice)} inputMode="decimal" placeholder="Precio" aria-label="Precio global" size={9} />
                <select name="taxId" defaultValue={ctx.taxes.find((t) => t.name === sub.taxName)?.id ?? ""} aria-label="Impuesto">
                  <option value="">Impuesto…</option>
                  {ctx.taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="btn">Guardar</button>
              </>
            )}
          </ActionForm>
        ) : (
          <span className="c-desc">{sub.title || <span className="mut">Subpartida {number}</span>} <span className="mut">· {global ? "precio global" : "por suma"}</span></span>
        )}
        {!ctx.editable && global && <span className="n c-qty">{sub.globalQty ? qty(sub.globalQty) : ""}</span>}
        {!ctx.editable && global && <span className="n c-price">{price(sub.globalPrice)}</span>}
        <span className="n c-amt">{money(amount)}</span>
        <span className="acts c-acts">
          {ctx.editable && (
            <>
              <ActionForm action={removeSectionAction}><input type="hidden" name="id" value={sub.id} /><ConfirmButton label="Eliminar" className="icon" confirm="¿Eliminar la subpartida con sus líneas?" /></ActionForm>
              <Move action={moveSectionAction} id={sub.id} first={first} last={last} />
              <CommentButton id={sub.id} has={!!sub.comment} reserve label="Añadir comentario a la subpartida" className="icon bub last" />
            </>
          )}
        </span>
      </div>
      {global && <p className="mut subnote">Las líneas de esta subpartida describen el trabajo: no llevan precio y no suman.</p>}

      {loose.map((l, i) => <LineRow key={l.id} ctx={ctx} line={l} global={global} first={i === 0} last={i === loose.length - 1} />)}
      {sub.kits.map((k) => <KitBlock key={k.id} ctx={ctx} kit={k} lines={sub.lines.filter((l) => l.kitInstanceId === k.id)} />)}
      <Comment kind="section" id={sub.id} text={sub.comment} editable={ctx.editable} variant="cs" />
      {ctx.editable && <AddToSubsection ctx={ctx} sub={sub} />}
    </div>
  );
}

function LineRow({ ctx, line, global, first, last, inKit }: { ctx: EditorContext; line: LineDetail; global: boolean; first?: boolean; last?: boolean; inKit?: boolean }) {
  const amount = ctx.totals.lines[line.id];
  const adjusted = line.adjustments[0];
  const unpriced = ctx.totals.unpricedLineIds.includes(line.id);
  const flags = (
    <>
      {line.concept && !line.concept.validated && <span className="badge amber">Sin validar</span>}
      {line.concept && !line.concept.active && <span className="badge off">Inactivo</span>}
      {adjusted && <span className="badge" title={adjusted.reason}>ajustado · antes {price(adjusted.originalPrice)} €</span>}
      {unpriced && <span className="badge amber">Sin precio</span>}
    </>
  );
  const editableText = ctx.editable && !inKit;
  return (
    <>
    <div id={`linea-${line.id}`} className={`qrow line${line.visible ? "" : " hidden"}`}>
      <span className="mut c-code">{line.concept?.code ?? ""}</span>
      {editableText ? (
        <ActionForm action={updateLineAction} key={`${line.description}-${line.quantity}`} className="lineform">
          <input type="hidden" name="id" value={line.id} />
          <SubmitOnBlur>
            <textarea name="description" defaultValue={line.description} rows={1} aria-label="Descripción" className="c-desc" />
            <span className="c-qty">
              <input name="quantity" defaultValue={qty(line.quantity)} inputMode="decimal" aria-label="Cantidad" className="num" />
              <span className="mut unit">{line.unitName}</span>
            </span>
          </SubmitOnBlur>
        </ActionForm>
      ) : (
        <span className="c-desc">{line.description}</span>
      )}
      {!editableText && <span className="n c-qty">{qty(line.quantity)} {line.unitName}</span>}
      <span className="n c-price">{global ? "" : price(line.unitPrice)}</span>
      <span className="n c-amt">{global ? "" : money(amount)}</span>
      <span className="acts c-acts">
        {ctx.editable && (
          <>
            <ActionForm action={updateLineAction} className="vis">
              <input type="hidden" name="id" value={line.id} />
              <SubmitOnChange>
                <label className="check small" title="Visible en el documento">
                  <input type="checkbox" name="visible" value="1" defaultChecked={line.visible} key={String(line.visible)} />
                  <input type="hidden" name="visible" value="0" />
                  Ver
                </label>
              </SubmitOnChange>
            </ActionForm>
            {!global && line.unitPrice !== null && (
              <details className="confirm">
                <summary className="icon" title="Ajustar precio">€</summary>
                <ActionForm action={adjustPriceAction} close className="confirmbox" style={{ display: "grid", gap: 6 }}>
                  <input type="hidden" name="id" value={line.id} />
                  <label className="field">Nuevo precio<input name="newPrice" defaultValue={price(line.unitPrice)} inputMode="decimal" /></label>
                  <label className="field">Motivo<input name="reason" required maxLength={300} /></label>
                  <button className="btn">Ajustar</button>
                </ActionForm>
              </details>
            )}
            <CommentButton id={line.id} has={!!line.comment} label="Añadir comentario a este producto" />
            {!inKit && (
              <>
                <Move action={moveLineAction} id={line.id} first={!!first} last={!!last} />
                <ActionForm action={removeLineAction} className="last"><input type="hidden" name="id" value={line.id} /><button className="icon" aria-label="Eliminar línea">✕</button></ActionForm>
              </>
            )}
          </>
        )}
      </span>
      <span className="flags">{flags}</span>
    </div>
    <Comment kind="line" id={line.id} text={line.comment} editable={ctx.editable} variant="cl" />
    </>
  );
}

/** The kit's outline in miniature: its first element's two letters and a circle per component, dashed when missing. */
function Silhouette({ main, parts }: { main: string; parts: { label: string; missing: boolean }[] }) {
  return (
    <span className="mini" title={[main, ...parts.map((p) => p.label)].join(" → ")} aria-hidden>
      <i>{main.slice(0, 2).toUpperCase()}</i>
      {parts.map((p, k) => <s key={k} className={p.missing ? "miss" : undefined} />)}
    </span>
  );
}

function KitBlock({ ctx, kit, lines }: { ctx: EditorContext; kit: KitInstanceDetail; lines: LineDetail[] }) {
  const def = kitDefinition.parse(kit.definition);
  const params = kit.params as Record<string, string>;
  const choices = kit.choices as Record<string, string>;
  const missing = kit.missing as string[];
  const n = qty(kit.quantity);
  const name = (id: string | undefined) => ctx.allConcepts.find((c) => c.id === id)?.description;
  const amounts = lines.map((l) => ctx.totals.lines[l.id]).filter((a): a is NonNullable<typeof a> => !!a);
  const amount = amounts.length ? amounts.reduce((a, b) => a.plus(b)) : null;
  const summary = [
    `${n} × ${name(refConceptId(def.main) ?? choices.main) ?? def.main.label}`,
    ...def.params.filter((p) => params[p.key]).map((p) => `${p.label.toLowerCase()} ${params[p.key]} ${p.unit}`.trim()),
  ].join(" · ");
  const parts = def.components.map((c) => {
    const line = lines.find((l) => l.kitSlot === c.slot);
    return { label: line ? (name(line.conceptId ?? undefined) ?? c.label) : `Falta ${c.label.toLowerCase()}`, missing: !line };
  });
  const options = (ref: { conceptId: string } | { categoryId: string }, current: string | undefined) => {
    const cat = refCategoryId(ref);
    return ctx.allConcepts.filter((c) => c.categoryId === cat && ((c.active && c.salePrice !== null) || c.id === current));
  };

  return (
    <details id={`conjunto-${kit.id}`} className={`kit${missing.length ? " inc" : ""}`} open={missing.length > 0}>
      <summary>
        <Silhouette main={def.main.label} parts={parts} />
        <b>Conjunto · {kit.name}</b>
        <span className="sum mut">{summary}</span>
        {missing.length ? <span className="badge amber">Incompleto</span> : <b>{money(amount)}</b>}
      </summary>
      <p className="kitsum">
        {missing.length
          ? <span className="amber">Sin valorar hasta completar: {missing.join(" · ")}</span>
          : <>{lines.map((l) => `${qty(l.quantity)} ${l.unitName} × ${price(l.unitPrice)}`).join(" + ")} = <b>{money(amount)}</b></>}
      </p>
      {lines.map((l) => <LineRow key={l.id} ctx={ctx} line={l} global={false} inKit />)}
      <Comment kind="kit" id={kit.id} text={kit.comment} editable={ctx.editable} variant="ck" />
      {ctx.editable && (
        <>
          <Panel id={`editar-conjunto-${kit.id}`}>
            <ActionForm action={updateKitAction} key={`${kit.quantity}-${JSON.stringify(params)}-${JSON.stringify(choices)}`} className="kitform">
              <input type="hidden" name="id" value={kit.id} />
              <label className="field">{def.main.label}: cantidad (N)<input name="quantity" defaultValue={n} inputMode="decimal" required /></label>
              {refCategoryId(def.main) && (
                <label className="field">{def.main.label}
                  <select name="choice.main" defaultValue={choices.main ?? ""}>
                    <option value="">Elige…</option>
                    {options(def.main, choices.main).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.description}{c.active ? "" : " (desactivado)"}</option>)}
                  </select>
                </label>
              )}
              {def.params.map((p) => (
                <label key={p.key} className="field">{p.label}{p.unit ? ` (${p.unit})` : ""}{p.required ? "" : " · opcional"}
                  <input name={`param.${p.key}`} defaultValue={params[p.key] ?? ""} inputMode="decimal" />
                </label>
              ))}
              {def.components.filter((c) => refCategoryId(c.ref)).map((c) => (
                <label key={c.slot} className="field">{c.label}{c.required ? "" : " · opcional"}
                  <select name={`choice.${c.slot}`} defaultValue={choices[c.slot] ?? ""}>
                    <option value="">{c.required ? "Elige…" : "Ninguno"}</option>
                    {options(c.ref, choices[c.slot]).map((o) => <option key={o.id} value={o.id}>{o.code} · {o.description}{o.active ? "" : " (desactivado)"}</option>)}
                  </select>
                </label>
              ))}
              <span className="kitformacts"><button className="btn pri">Recalcular</button><CloseButton /></span>
            </ActionForm>
          </Panel>
          <div className="kitfoot">
            <div className="kbtns">
              <OpenButton target={`editar-conjunto-${kit.id}`} className={missing.length ? "btn warn" : "btn"} title={missing.length ? "Completar conjunto" : "Editar conjunto"}>
                {missing.length ? "Completar" : "Editar"}
              </OpenButton>
              <ActionForm action={removeKitAction}><input type="hidden" name="id" value={kit.id} /><ConfirmButton label="Quitar" confirm="¿Quitar el conjunto? Se quitan sus líneas." /></ActionForm>
              <CommentButton id={kit.id} has={!!kit.comment} label="Añadir comentario al conjunto" />
            </div>
            <CollapseKitButton />
          </div>
        </>
      )}
    </details>
  );
}

function AddToSubsection({ ctx, sub }: { ctx: EditorContext; sub: SubsectionDetail }) {
  const global = sub.mode === "GLOBAL";
  const concepts = ctx.concepts.filter((c) => global || c.salePrice !== null);
  const kits = !global && ctx.kits.length > 0;
  return (
    <>
      <div className="adders">
        <Menu label="+ Añadir ▾" summaryClassName="btn">
          <OpenButton target={`del-catalogo-${sub.id}`}>Del catálogo<small>concepto con su precio</small></OpenButton>
          <OpenButton target={`linea-especifica-${sub.id}`}>Línea específica<small>texto y precio a mano</small></OpenButton>
          <OpenButton target={`comentario-${sub.id}`}>Comentario de la subpartida<small>al pie de la subpartida</small></OpenButton>
          {kits && <OpenButton target={`nuevo-conjunto-${sub.id}`}>Conjunto<small>varios elementos que se calculan juntos</small></OpenButton>}
        </Menu>
      </div>
      <Panel id={`del-catalogo-${sub.id}`} group={sub.id}>
        <ActionForm action={addCatalogLineAction} reset close className="addform">
          <span className="ttl">Añadir del catálogo</span>
          <input type="hidden" name="subsectionId" value={sub.id} />
          <select name="conceptId" required defaultValue="" aria-label="Concepto">
            <option value="" disabled>Elige un concepto…</option>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.description}{global ? "" : ` · ${formatDecimalEs(c.salePrice!, { max: 4 })} €/${c.unitName}`}</option>)}
          </select>
          <input name="quantity" placeholder="Cantidad" inputMode="decimal" required aria-label="Cantidad" className="num" />
          <button className="btn pri">Añadir</button>
          <CloseButton />
        </ActionForm>
      </Panel>
      <Panel id={`linea-especifica-${sub.id}`} group={sub.id}>
        <ActionForm action={addCustomLineAction} reset close className="addform">
          <span className="ttl">Añadir línea específica</span>
          <input type="hidden" name="subsectionId" value={sub.id} />
          <input name="description" className="grow" placeholder="Descripción" required aria-label="Descripción" />
          <input name="quantity" placeholder="Cantidad" inputMode="decimal" required aria-label="Cantidad" className="num" />
          <input name="unitName" placeholder="Unidad" aria-label="Unidad" size={5} />
          {!global && (
            <>
              <input name="unitPrice" placeholder="Precio" inputMode="decimal" required aria-label="Precio" className="num" />
              <select name="taxId" defaultValue={ctx.taxes[0]?.id} aria-label="Impuesto">
                {ctx.taxes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
          <button className="btn pri">Añadir</button>
          <CloseButton />
        </ActionForm>
      </Panel>
      {kits && (
        <Panel id={`nuevo-conjunto-${sub.id}`} group={sub.id}>
          <ActionForm action={addKitAction} reset close className="addform">
            <span className="ttl">Añadir conjunto</span>
            <input type="hidden" name="subsectionId" value={sub.id} />
            <select name="templateId" required defaultValue="" aria-label="Conjunto">
              <option value="" disabled>Elige un conjunto…</option>
              {ctx.kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <input name="quantity" placeholder="Cantidad (N)" inputMode="decimal" required aria-label="Cantidad" className="num" />
            <button className="btn pri">Añadir</button>
            <CloseButton />
          </ActionForm>
        </Panel>
      )}
    </>
  );
}

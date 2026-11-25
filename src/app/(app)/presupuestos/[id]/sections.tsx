// Server components for the quote table: partidas, subpartidas, lines and kit blocks.
// Every editable control is a small ActionForm bound to one Server Action; read-only quotes render plain text.
import { ActionForm, ConfirmButton, SubmitOnBlur, SubmitOnChange } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import type { ReactNode } from "react";
import { CloseButton, Menu, OpenButton } from "@/components/disclosure";
import { Comment, CommentButton } from "./comment";
import { KitBlock } from "./kit-block";
import { formatDecimalEs } from "@/lib/decimal";
import type { ConceptOption } from "@/modules/catalog/service";
import {
  addCatalogLineAction, addCustomLineAction, addKitAction, addSectionAction, adjustPriceAction, moveLineAction, moveSectionAction,
  removeLineAction, removeSectionAction, updateLineAction, updateSectionAction,
} from "@/modules/quotes/actions";
import type { QuoteTotals } from "@/modules/quotes/calculation";
import type { LineDetail, SectionDetail, SubsectionDetail } from "@/modules/quotes/service";

export type EditorContext = {
  editable: boolean; quoteId: string; totals: QuoteTotals;
  taxes: { id: string; name: string }[];
  /** Active concepts, for new lines and kit choices. */
  concepts: ConceptOption[];
  /** Every concept, to name the current choice of a kit even if it was deactivated. */
  allConcepts: ConceptOption[];
  kits: { id: string; name: string; description: string; dynamic?: boolean }[];
  /** Category names by id, for the third column of the concept search. */
  categories: Record<string, string>;
};

type Dec = { toString(): string };
export const money = (v: Dec | null | undefined) => (v == null ? "—" : `${formatDecimalEs(v)} €`);
export const price = (v: Dec | null | undefined) => (v == null ? "" : formatDecimalEs(v, { max: 4 }));
export const qty = (v: Dec) => formatDecimalEs(v, { min: 0, max: 4 });

function Move({ action, id, first, last }: { action: typeof moveSectionAction; id: string; first: boolean; last: boolean }) {
  return (
    <>
      <ActionForm action={action} className="up"><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value="-1" /><button className="icon" disabled={first} aria-label="Subir">↑</button></ActionForm>
      <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value="1" /><button className="icon" disabled={last} aria-label="Bajar">↓</button></ActionForm>
    </>
  );
}

/** A panel opened by an OpenButton: a <details> whose summary is hidden. */
export function Panel({ id, children }: { id: string; children: ReactNode }) {
  return <details id={id} className="addpanel"><summary tabIndex={-1} aria-hidden /> {children}</details>;
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
      <Panel id={`nueva-subpartida-${section.id}`}>
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
              <ActionForm action={updateSectionAction} className="vis">
                <input type="hidden" name="id" value={sub.id} />
                <SubmitOnChange>
                  <label className="check small" title="Total visible en el documento">
                    <input type="checkbox" name="showTotal" value="1" defaultChecked={sub.showTotal} key={String(sub.showTotal)} />
                    <input type="hidden" name="showTotal" value="0" />
                    Total
                  </label>
                </SubmitOnChange>
              </ActionForm>
              <ActionForm action={removeSectionAction}><input type="hidden" name="id" value={sub.id} /><ConfirmButton label="Eliminar" className="icon" confirm="¿Eliminar la subpartida con sus líneas?" /></ActionForm>
              <Move action={moveSectionAction} id={sub.id} first={first} last={last} />
              <CommentButton id={sub.id} has={!!sub.comment} reserve label="Añadir comentario a la subpartida" className="icon bub last" />
            </>
          )}
        </span>
      </div>
      {global && <p className="mut subnote">Las líneas de esta subpartida describen el trabajo: no llevan precio y no suman.</p>}

      {loose.map((l, i) => <LineRow key={l.id} ctx={ctx} line={l} global={global} first={i === 0} last={i === loose.length - 1} />)}
      {sub.kits.map((k) => <KitBlock key={k.id} ctx={ctx} kit={k} global={global} lines={sub.lines.filter((l) => l.kitInstanceId === k.id)} />)}
      <Comment kind="section" id={sub.id} text={sub.comment} editable={ctx.editable} variant="cs" />
      {ctx.editable && <AddToSubsection ctx={ctx} sub={sub} />}
    </div>
  );
}

export function LineRow({ ctx, line, global, first, last, inKit }: { ctx: EditorContext; line: LineDetail; global: boolean; first?: boolean; last?: boolean; inKit?: boolean }) {
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
                <label className="check small" title="Cantidad visible en el documento">
                  <input type="checkbox" name="showQuantity" value="1" defaultChecked={line.showQuantity} key={String(line.showQuantity)} />
                  <input type="hidden" name="showQuantity" value="0" />
                  Cant.
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

function AddToSubsection({ ctx, sub }: { ctx: EditorContext; sub: SubsectionDetail }) {
  const global = sub.mode === "GLOBAL";
  const concepts = ctx.concepts.filter((c) => global || c.salePrice !== null);
  const kits = ctx.kits.length > 0;
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
      <Panel id={`del-catalogo-${sub.id}`}>
        <ActionForm action={addCatalogLineAction} reset close className="addform">
          <span className="ttl">Añadir del catálogo</span>
          <input type="hidden" name="subsectionId" value={sub.id} />
          <Combobox name="conceptId" value="" label="Concepto" placeholder="Escribe el código, la descripción o la categoría"
            items={concepts.map((c) => ({ id: c.id, code: c.code, extra: ctx.categories[c.categoryId] ?? "",
              description: global ? c.description : `${c.description} · ${formatDecimalEs(c.salePrice!, { max: 4 })} €/${c.unitName}` }))} />
          <input name="quantity" placeholder="Cantidad" inputMode="decimal" required aria-label="Cantidad" className="num" />
          <button className="btn pri">Añadir</button>
          <CloseButton />
        </ActionForm>
      </Panel>
      <Panel id={`linea-especifica-${sub.id}`}>
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
        <Panel id={`nuevo-conjunto-${sub.id}`}>
          <ActionForm action={addKitAction} reset close className="addform">
            <span className="ttl">Añadir conjunto</span>
            <input type="hidden" name="subsectionId" value={sub.id} />
            <Combobox name="templateId" value="" label="Conjunto" placeholder="Escribe el nombre o la descripción del conjunto"
              items={[...ctx.kits].sort((a, b) => Number(!!a.dynamic) - Number(!!b.dynamic))
                .map((k) => ({ id: k.id, code: k.name, description: k.description, text: k.name, extra: k.dynamic ? "Conjunto dinámico" : "" }))} />
            <input name="quantity" placeholder="Cantidad" inputMode="decimal" required aria-label="Cantidad" className="num" />
            <button className="btn pri">Añadir</button>
            <CloseButton />
          </ActionForm>
        </Panel>
      )}
    </>
  );
}

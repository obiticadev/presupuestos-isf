// Server components for the quote table: partidas, subpartidas, lines and kit blocks.
// Every editable control is a small ActionForm bound to one Server Action; read-only quotes render plain text.
import { ActionForm, ConfirmButton, SubmitOnBlur, SubmitOnChange } from "@/components/action-form";
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
      <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value="-1" /><button className="icon" disabled={first} aria-label="Subir">↑</button></ActionForm>
      <ActionForm action={action}><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value="1" /><button className="icon" disabled={last} aria-label="Bajar">↓</button></ActionForm>
    </>
  );
}

export function AddSection({ quoteId }: { quoteId: string }) {
  return (
    <ActionForm action={addSectionAction} reset className="addrow" style={{ marginTop: 10 }}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <input name="title" placeholder="Nombre de la nueva partida" aria-label="Nombre de la nueva partida" />
      <button className="btn">Añadir partida</button>
    </ActionForm>
  );
}

export function SectionHead({ ctx, section, number, amount, first, last }: {
  ctx: EditorContext; section: SectionDetail; number: string; amount: Dec | undefined; first: boolean; last: boolean;
}) {
  return (
    <div className="qrow part">
      <span>{number}</span>
      {ctx.editable ? (
        <ActionForm action={updateSectionAction} key={section.title} className="inline">
          <input type="hidden" name="id" value={section.id} />
          <SubmitOnBlur><input name="title" defaultValue={section.title} placeholder="Nombre de la partida" aria-label={`Nombre de la partida ${number}`} /></SubmitOnBlur>
        </ActionForm>
      ) : <span>{section.title || <span className="mut">Partida {number}</span>}</span>}
      <span /><span />
      <span className="n">{money(amount)}</span>
      <span className="acts">
        {ctx.editable && (
          <>
            <Move action={moveSectionAction} id={section.id} first={first} last={last} />
            <ActionForm action={addSectionAction}><input type="hidden" name="quoteId" value={ctx.quoteId} /><input type="hidden" name="parentId" value={section.id} /><input type="hidden" name="title" value="" /><button className="icon" title="Añadir subpartida" aria-label="Añadir subpartida">＋</button></ActionForm>
            <ActionForm action={removeSectionAction}><input type="hidden" name="id" value={section.id} /><ConfirmButton label="Eliminar" className="icon" confirm="¿Eliminar la partida con todo su contenido?" /></ActionForm>
          </>
        )}
      </span>
    </div>
  );
}

export function Subsection({ ctx, sub, number, first, last }: { ctx: EditorContext; sub: SubsectionDetail; number: string; first: boolean; last: boolean }) {
  const global = sub.mode === "GLOBAL";
  const loose = sub.lines.filter((l) => !l.kitInstanceId);
  const amount = ctx.totals.subsections[sub.id];
  return (
    <div className="subblock">
      <div className="qrow sub">
        <span>{number}</span>
        {ctx.editable ? (
          <ActionForm action={updateSectionAction} key={`${sub.title}-${sub.mode}-${sub.globalQty}-${sub.globalPrice}-${sub.taxName}`} className="inline subform">
            <input type="hidden" name="id" value={sub.id} />
            <SubmitOnBlur><input name="title" defaultValue={sub.title} placeholder="Nombre de la subpartida" aria-label={`Nombre de la subpartida ${number}`} /></SubmitOnBlur>
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
          <span>{sub.title || <span className="mut">Subpartida {number}</span>} <span className="mut">· {global ? "precio global" : "por suma"}</span></span>
        )}
        {!ctx.editable && global ? <span className="n">{sub.globalQty ? qty(sub.globalQty) : ""}</span> : <span />}
        {!ctx.editable && global ? <span className="n">{price(sub.globalPrice)}</span> : <span />}
        <span className="n">{money(amount)}</span>
        <span className="acts">
          {ctx.editable && (
            <>
              <Move action={moveSectionAction} id={sub.id} first={first} last={last} />
              <ActionForm action={removeSectionAction}><input type="hidden" name="id" value={sub.id} /><ConfirmButton label="Eliminar" className="icon" confirm="¿Eliminar la subpartida con sus líneas?" /></ActionForm>
            </>
          )}
        </span>
      </div>
      {global && <p className="mut subnote">Las líneas de esta subpartida describen el trabajo: no llevan precio y no suman.</p>}

      {loose.map((l, i) => <LineRow key={l.id} ctx={ctx} line={l} global={global} first={i === 0} last={i === loose.length - 1} />)}
      {sub.kits.map((k) => <KitBlock key={k.id} ctx={ctx} kit={k} lines={sub.lines.filter((l) => l.kitInstanceId === k.id)} />)}
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
    <div id={`linea-${line.id}`} className={`qrow line${line.visible ? "" : " hidden"}`}>
      <span className="mut">{line.concept?.code ?? ""}</span>
      {editableText ? (
        <ActionForm action={updateLineAction} key={`${line.description}-${line.quantity}`} className="inline lineform">
          <input type="hidden" name="id" value={line.id} />
          <SubmitOnBlur>
            <input name="description" defaultValue={line.description} aria-label="Descripción" />
            <input name="quantity" defaultValue={qty(line.quantity)} inputMode="decimal" aria-label="Cantidad" className="num" />
          </SubmitOnBlur>
          <span className="mut unit">{line.unitName}</span>
          <button className="icon" aria-label="Guardar línea">✓</button>
        </ActionForm>
      ) : (
        <span>{line.description}</span>
      )}
      {!editableText && <span className="n">{qty(line.quantity)} {line.unitName}</span>}
      <span className="n">{global ? "" : price(line.unitPrice)}</span>
      <span className="n">{global ? "" : money(amount)}</span>
      <span className="acts">
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
            {!inKit && (
              <>
                <Move action={moveLineAction} id={line.id} first={!!first} last={!!last} />
                <ActionForm action={removeLineAction}><input type="hidden" name="id" value={line.id} /><button className="icon" aria-label="Eliminar línea">✕</button></ActionForm>
              </>
            )}
          </>
        )}
      </span>
      <span className="flags">{flags}</span>
    </div>
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
  const options = (ref: { conceptId: string } | { categoryId: string }, current: string | undefined) => {
    const cat = refCategoryId(ref);
    return ctx.allConcepts.filter((c) => c.categoryId === cat && ((c.active && c.salePrice !== null) || c.id === current));
  };

  return (
    <div id={`conjunto-${kit.id}`} className="kit">
      <header>
        <span><b>Conjunto · {kit.name}</b> <span className="mut">{summary}</span></span>
        <span>{missing.length ? <span className="badge amber">Incompleto</span> : money(amount)}</span>
      </header>
      <div className="diagram" aria-hidden>
        <span className="node">{def.main.label.slice(0, 2).toUpperCase()}</span>
        {def.components.map((c) => {
          const line = lines.find((l) => l.kitSlot === c.slot);
          return (
            <span key={c.slot} className={`wire${line ? "" : " miss"}`}>
              <label>{line ? `${name(line.conceptId ?? undefined) ?? c.label}` : `Falta ${c.label.toLowerCase()}`}</label>
              {line && <small>{qty(line.quantity)} {line.unitName}</small>}
            </span>
          );
        })}
        <span className="mult">× {n}</span>
      </div>
      <p className="kitsum">
        {missing.length
          ? <span className="amber">Sin valorar hasta completar: {missing.join(" · ")}</span>
          : <>{lines.map((l) => `${qty(l.quantity)} ${l.unitName} × ${price(l.unitPrice)}`).join(" + ")} = <b>{money(amount)}</b></>}
      </p>
      {lines.map((l) => <LineRow key={l.id} ctx={ctx} line={l} global={false} inKit />)}
      {ctx.editable && (
        <div className="kitfoot">
          <details open={missing.length > 0}>
            <summary className={missing.length ? "btn warn" : "btn"}>{missing.length ? "Completar conjunto" : "Editar conjunto"}</summary>
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
              <button className="btn pri">Recalcular</button>
            </ActionForm>
          </details>
          <ActionForm action={removeKitAction}><input type="hidden" name="id" value={kit.id} /><ConfirmButton label="Quitar conjunto" confirm="Se quitan sus líneas." /></ActionForm>
        </div>
      )}
    </div>
  );
}

function AddToSubsection({ ctx, sub }: { ctx: EditorContext; sub: SubsectionDetail }) {
  const global = sub.mode === "GLOBAL";
  const concepts = ctx.concepts.filter((c) => global || c.salePrice !== null);
  return (
    <div className="adders">
      <details>
        <summary className="btn">+ Del catálogo</summary>
        <ActionForm action={addCatalogLineAction} reset className="addrow">
          <input type="hidden" name="subsectionId" value={sub.id} />
          <select name="conceptId" required defaultValue="" aria-label="Concepto">
            <option value="" disabled>Elige un concepto…</option>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.description}{global ? "" : ` · ${formatDecimalEs(c.salePrice!, { max: 4 })} €/${c.unitName}`}</option>)}
          </select>
          <input name="quantity" placeholder="Cantidad" inputMode="decimal" required aria-label="Cantidad" className="num" />
          <button className="btn pri">Añadir</button>
        </ActionForm>
      </details>
      <details>
        <summary className="btn">+ Línea específica</summary>
        <ActionForm action={addCustomLineAction} reset className="addrow">
          <input type="hidden" name="subsectionId" value={sub.id} />
          <input name="description" placeholder="Descripción" required aria-label="Descripción" />
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
        </ActionForm>
      </details>
      {!global && ctx.kits.length > 0 && (
        <details>
          <summary className="btn">+ Conjunto</summary>
          <ActionForm action={addKitAction} reset className="addrow">
            <input type="hidden" name="subsectionId" value={sub.id} />
            <select name="templateId" required defaultValue="" aria-label="Conjunto">
              <option value="" disabled>Elige un conjunto…</option>
              {ctx.kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </select>
            <input name="quantity" placeholder="Cantidad (N)" inputMode="decimal" required aria-label="Cantidad" className="num" />
            <button className="btn pri">Añadir</button>
          </ActionForm>
        </details>
      )}
    </div>
  );
}

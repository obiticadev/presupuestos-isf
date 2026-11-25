// The kit block of the quote table: its summary, its lines and the tree that edits it.
import { ActionForm, ConfirmButton, SubmitOnBlur } from "@/components/action-form";
import { Combobox } from "@/components/combobox";
import { Prisma } from "@/generated/prisma/browser";
import { CloseButton, CollapseKitButton, OpenButton, OpenIfIncomplete } from "@/components/disclosure";
import { Comment, CommentButton } from "./comment";
import { FixedMeasure, KitSwap } from "./kit-fields";
import { formatDecimalEs, parseDecimalEs } from "@/lib/decimal";
import { kitDefinition, kitSlotList, refCategoryId, refConceptId } from "@/modules/kits/definition";
import { DynamicBranch, dynamicTag, KitSideForms, OwnSlots, slotCount } from "./kit-dynamic";
import { overrideKey } from "@/modules/kits/formulas";
import { categoryPrefix, codePrefix } from "@/modules/kits/naming";
import { removeKitAction, updateKitAction } from "@/modules/quotes/actions";
import type { KitInstanceDetail, LineDetail } from "@/modules/quotes/service";
import { LineRow, money, Panel, price, qty, type EditorContext } from "./sections";

/** The kit's outline in miniature: its first element's two letters and a circle per element to fill in, dashed when missing. */
/** A dynamic inside the kit is a ■ ("sq"); a standalone dynamic ends in its dashed slot mark ("dy"). */
function Silhouette({ main, parts }: { main: string; parts: { label: string; missing: boolean; shape?: "sq" | "dy" }[] }) {
  return (
    <span className="mini" title={[main, ...parts.map((p) => p.label)].join(" → ")} aria-hidden>
      <i>{main.slice(0, 2).toUpperCase()}</i>
      {parts.map((p, k) => <s key={k} className={p.missing ? "miss" : p.shape} />)}
    </span>
  );
}

export function KitBlock({ ctx, kit, lines, global }: { ctx: EditorContext; kit: KitInstanceDetail; lines: LineDetail[]; global: boolean }) {
  const def = kitDefinition.parse(kit.definition);
  const params = kit.params as Record<string, string>;
  const choices = kit.choices as Record<string, string>;
  const missing = kit.missing as string[];
  const slots = kitSlotList.parse(kit.slots);
  const dynamics = def.dynamics ?? [];
  const placed = dynamics.filter((d) => d.copies?.[choices[d.slot]]);
  // shortcut: the slot to focus is the last one added while still empty; good enough until addKitSlot's id reaches the page.
  const focusId = slots.at(-1)?.conceptId === null ? slots.at(-1)!.id : undefined;
  const n = qty(kit.quantity);
  const name = (id: string | undefined) => ctx.allConcepts.find((c) => c.id === id)?.description;
  const amounts = lines.map((l) => ctx.totals.lines[l.id]).filter((a): a is NonNullable<typeof a> => !!a);
  const amount = amounts.length ? amounts.reduce((a, b) => a.plus(b)) : null;
  const summary = [
    ...(def.main ? [`${n} × ${name(refConceptId(def.main) ?? choices.main) ?? def.main.label}`] : []),
    ...def.params.filter((p) => params[p.key]).map((p) => `${p.label.toLowerCase()} ${params[p.key]} ${p.unit}`.trim()),
    ...placed.map((d) => `${d.label.toLowerCase()} con ${slotCount(slots.filter((x) => x.group === d.slot))}`),
    ...(def.kind === "dynamic" ? [slotCount(slots.filter((x) => x.group === "self"))] : []),
  ].join(" · ");
  const validDatum = (raw: string | undefined) => { const v = parseDecimalEs(raw ?? ""); return v !== null && !v.startsWith("-"); };
  // The datum a material typed in when quoting (q_…) gets: it is drawn in that material's circle, not in its own.
  const askedOf = (c: (typeof def.components)[number]) => ("param" in c.formula && c.formula.param.startsWith("q_") ? c.formula.param : null);
  // One circle per element of the form (main choice, data, components); optional ones left empty are not drawn.
  // In a global-price subsection the lines are descriptive: a concept without sale price is fine.
  const usable = (id: string | undefined) => ctx.allConcepts.some((c) => c.id === id && c.active && (global || c.salePrice !== null));
  const choice = (label: string, id: string | undefined) => ({ label: usable(id) ? (name(id) ?? label) : `Falta ${label.toLowerCase()}`, missing: !usable(id) });
  const parts = [
    ...(def.main ? [choice(def.main.label, refConceptId(def.main) ?? choices.main)] : []),
    ...def.params.filter((p) => !p.key.startsWith("q_") && (p.required || params[p.key])).map((p) => {
      const ok = validDatum(params[p.key]);
      return { label: ok ? `${p.label} ${params[p.key]} ${p.unit}`.trim() : `Falta ${p.label.toLowerCase()}`, missing: !ok };
    }),
    ...def.components.filter((c) => (c.required || choices[c.slot] || refConceptId(c.ref)) && (!askedOf(c) || c.required || params[askedOf(c)!]))
      .map((c) => {
        const part = choice(c.label, refConceptId(c.ref) ?? choices[c.slot]);
        const q = askedOf(c);
        return q && !part.missing && !validDatum(params[q]) ? { label: `Falta ${c.label.toLowerCase()}: cantidad`, missing: true } : part;
      }),
    // An optional dynamic taken out is not drawn.
    ...dynamics.filter((d) => !d.optional || placed.includes(d)).map((d) => (placed.includes(d)
      ? { label: d.label, missing: false, shape: "sq" as const } : { label: `Falta ${d.label.toLowerCase()}`, missing: true })),
    ...(def.kind === "dynamic" ? [{ label: "slots", missing: false, shape: "dy" as const }] : []),
  ];
  const options = (ref: { conceptId: string } | { categoryId: string }, current: string | undefined) => {
    const cat = refCategoryId(ref);
    return ctx.allConcepts.filter((c) => c.categoryId === cat && ((c.active && (global || c.salePrice !== null)) || c.id === current));
  };
  // The tree (spec 2026-11-24 §2): what each element shows in its three columns.
  const unitOf = (id: string | undefined) => ctx.allConcepts.find((c) => c.id === id)?.unitName ?? "";
  const tagOf = (ref: { conceptId: string } | { categoryId: string }, label: string) => {
    const id = refConceptId(ref);
    const code = id && ctx.allConcepts.find((c) => c.id === id)?.code;
    return (code ? codePrefix(code) : categoryPrefix(label)) || label.slice(0, 3).toUpperCase();
  };
  const picker = (slot: string, ref: { conceptId: string } | { categoryId: string }, label: string, required: boolean) => {
    const current = choices[slot];
    const items = options(ref, current).map((o) => ({ id: o.id, code: o.code, description: `${o.description}${o.active ? "" : " (desactivado)"}` }));
    const empty = `No hay conceptos${global ? "" : " con precio"} en esta categoría`;
    // key: remount with the saved choice after each save
    return <Combobox key={current ?? ""} items={items} value={current ?? ""} name={`choice.${slot}`} submit label={label}
      placeholder={items.length ? (required ? "Elige…" : "Ninguno (opcional)") : empty} />;
  };
  const article = (slot: string, ref: { conceptId: string } | { categoryId: string }, label: string, required: boolean) => {
    const id = refConceptId(ref);
    if (!id) return picker(slot, ref, label, required);
    const c = ctx.allConcepts.find((x) => x.id === id);
    return <span className="kq-ro" title={c ? `${c.code} · ${c.description}` : label}>{c ? `${c.code} · ${c.description}` : label}</span>;
  };
  const dataParams = def.params.filter((p) => !p.key.startsWith("q_"));
  // Dynamics and «Añadir slot» go after the materials: then no material closes the tree.
  const lastRow = dynamics.length || def.kind === "dynamic" ? undefined : def.components.length ? def.components.at(-1)!.slot : dataParams.at(-1)?.key;
  const description = ctx.kits.find((k) => k.id === kit.templateId)?.description;

  return (
    <details id={`conjunto-${kit.id}`} className={`kit${missing.length ? " inc" : ""}`}>
      <OpenIfIncomplete incomplete={missing.length > 0} />
      <summary>
        <Silhouette main={def.main ? def.main.symbol ?? def.main.label : kit.name.slice(0, 2)} parts={parts} />
        <b>Conjunto · {kit.name}</b>
        <span className="sum mut">{summary}</span>
        {missing.length ? <span className="badge amber">Incompleto</span> : !global && <b>{money(amount)}</b>}
      </summary>
      {description && <p className="kitsum mut">{description}</p>}
      {missing.length > 0 && <p className="kitsum"><span className="amber">{global ? "Falta completar" : "Sin valorar hasta completar"}: {missing.join(" · ")}</span></p>}
      {!missing.length && !global && lines.length > 0 && (
        <p className="kitsum">{lines.map((l) => `${qty(l.quantity)} ${l.unitName} × ${price(l.unitPrice)}`).join(" + ")} = <b>{money(amount)}</b></p>
      )}
      {lines.filter((l) => !dynamics.some((d) => l.kitSlot?.startsWith(`${d.slot}/`))).map((l) => <LineRow key={l.id} ctx={ctx} line={l} global={global} inKit />)}
      {placed.filter((d) => lines.some((l) => l.kitSlot?.startsWith(`${d.slot}/`))).map((d) => (
        <div key={d.slot} className="kdg">
          <div className="kdg-t"><span className="kq-tag kq-pe">{dynamicTag(d.copies![choices[d.slot]].name)}</span>{d.label}</div>
          {lines.filter((l) => l.kitSlot?.startsWith(`${d.slot}/`)).map((l) => <LineRow key={l.id} ctx={ctx} line={l} global={global} inKit />)}
        </div>
      ))}
      <Comment kind="kit" id={kit.id} text={kit.comment} editable={ctx.editable} variant="ck" />
      {ctx.editable && (
        <>
          <Panel id={`editar-conjunto-${kit.id}`}>
            {/* Saved on each change, without closing: the circles and the summary follow what is chosen. */}
            <ActionForm action={updateKitAction} className="kq">
              <input type="hidden" name="id" value={kit.id} />
              <div className="kq-tree">
                {/* A dynamic without a main counts as one unit: no main row (plan 2026-11-25, task 2). */}
                {!def.main ? <input type="hidden" name="quantity" value="1" /> : <div className="kq-r kq-main">
                  <div className="kq-n"><b><span className={`kq-tag${refCategoryId(def.main) ? " kq-el" : ""}`}>{tagOf(def.main, def.main.label)}</span>Principal</b></div>
                  <div className="kq-a">{article("main", def.main, def.main.label, true)}</div>
                  <SubmitOnBlur><div className="kq-m">
                    <input name="quantity" defaultValue={n} inputMode="decimal" required aria-label="Cantidad" />
                    <small>{unitOf(refConceptId(def.main) ?? choices.main)}</small>
                  </div></SubmitOnBlur>
                </div>}
                {dataParams.map((p) => (
                  <div key={p.key} className={`kq-r${p.key === lastRow ? " kq-last" : ""}`}>
                    <div className="kq-n"><b><span className="kq-tag">Dato</span><span className="kq-l" title={p.label}>{p.label}</span></b>{!p.required && <em>opcional</em>}</div>
                    <div className="kq-a" />
                    <SubmitOnBlur><div className="kq-m">
                      <input name={`param.${p.key}`} defaultValue={params[p.key] ?? ""} inputMode="decimal" aria-label={p.label} />
                      <small>{p.unit}</small>
                    </div></SubmitOnBlur>
                  </div>
                ))}
                {def.components.map((c) => {
                  const asked = askedOf(c);
                  const per = c.formula.type === "PER_QTY" || c.formula.type === "PER_QTY_AND_PARAM";
                  const fixedId = refConceptId(c.ref);
                  const unit = `${unitOf(fixedId ?? choices[c.slot]) || (asked ? def.params.find((p) => p.key === asked)?.unit ?? "" : "")} ${per ? "× principal" : "en total"}`.trim();
                  const last = c.slot === lastRow;
                  const own = params[overrideKey(c.slot)];
                  const parsed = own ? parseDecimalEs(own) : null;
                  return (
                    <div key={c.slot} className={`kq-r${last ? " kq-last" : ""}`}>
                      <div className="kq-n"><b><span className={`kq-tag${fixedId ? "" : " kq-el"}`}>{tagOf(c.ref, c.label)}</span><span className="kq-l" title={c.label}>{c.label}</span></b>{!c.required && <em>opcional</em>}</div>
                      <div className="kq-a">{article(c.slot, c.ref, c.label, c.required)}</div>
                      {asked ? (
                        <SubmitOnBlur><div className="kq-m">
                          <input name={`param.${asked}`} defaultValue={params[asked] ?? ""} inputMode="decimal" placeholder="0" aria-label={`${c.label}: cantidad`} />
                          <small title={unit}>{unit}</small>
                        </div></SubmitOnBlur>
                      ) : c.formula.type === "PARAM" || c.formula.type === "PER_QTY_AND_PARAM" ? (
                        // an old kit: the amount comes from a datum of its own row
                        <div className="kq-m"><span /><small title={unit}>{unit}</small></div>
                      ) : (
                        <FixedMeasure name={`param.${overrideKey(c.slot)}`} value={own ?? formatDecimalEs(c.formula.k, { min: 0, max: 4 })}
                          original={formatDecimalEs(c.formula.k, { min: 0, max: 4 })} unit={unit} last={last} label={c.label}
                          changed={!!own && (parsed === null || !new Prisma.Decimal(parsed).equals(c.formula.k))} />
                      )}
                    </div>
                  );
                })}
                {def.kind === "dynamic" && <OwnSlots ctx={ctx} kitId={kit.id} def={def} slots={slots} global={global} focusId={focusId} />}
                {dynamics.map((d, i) => (
                  <DynamicBranch key={d.slot} ctx={ctx} kitId={kit.id} d={d} choices={choices} slots={slots} global={global} last={i === dynamics.length - 1}
                    tools={{ article, tagOf, unitOf }} focusId={focusId} />
                ))}
              </div>
              <div className="kq-acts"><CloseButton /></div>
            </ActionForm>
            {(def.kind === "dynamic" || dynamics.length > 0) && <KitSideForms kitId={kit.id} def={def} slots={slots} />}
          </Panel>
          <div className="kitfoot">
            <div className="kbtns">
              <OpenButton target={`editar-conjunto-${kit.id}`} className={missing.length ? "btn warn" : "btn"} title={missing.length ? "Completar conjunto" : "Editar conjunto"}>
                {missing.length ? "Completar" : "Editar"}
              </OpenButton>
              <ActionForm action={removeKitAction}><input type="hidden" name="id" value={kit.id} /><ConfirmButton label="Quitar" confirm="¿Quitar el conjunto? Se quitan sus líneas." /></ActionForm>
              <KitSwap kitId={kit.id} kits={ctx.kits.filter((k) => k.id !== kit.templateId)} />
              <CommentButton id={kit.id} has={!!kit.comment} label="Añadir comentario al conjunto" />
            </div>
            <CollapseKitButton />
          </div>
        </>
      )}
    </details>
  );
}

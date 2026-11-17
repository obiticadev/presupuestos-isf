import type { Metadata } from "next";
import Link from "next/link";
import { formatDecimalEs } from "@/lib/decimal";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { listCategories, listUnits } from "@/modules/catalog/lists";
import { CONCEPTS_PAGE_SIZE, getConcept, listConcepts, type ConceptDetail } from "@/modules/catalog/service";
import { getSettings, listTaxes } from "@/modules/settings/service";
import { ConceptForm, type ConceptValues } from "./forms";

export const metadata: Metadata = { title: "Catálogo · ISF Presupuestos" };

const STATUS = { activos: "active", inactivos: "inactive", todos: "all" } as const;
const VALIDATED = { si: "yes", no: "no", todos: "all" } as const;
type Dec = { toString(): string } | null;
const money = (v: Dec) => (v === null ? "—" : `${formatDecimalEs(v, { max: 4 })} €`);
const asInput = (v: Dec) => (v === null ? "" : formatDecimalEs(v, { max: 4 }));
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

function values(c: ConceptDetail): ConceptValues {
  return {
    id: c.id, code: c.code, description: c.description,
    categoryId: c.categoryId, unitId: c.unitId, taxId: c.taxId,
    salePrice: asInput(c.salePrice), cost: asInput(c.cost), listPrice: asInput(c.listPrice), discountPct: asInput(c.discountPct),
    validated: c.validated, active: c.active, notes: c.notes,
    manufacturer: c.manufacturer, supplierRef: c.supplierRef, supplier: c.supplier,
  };
}

export default async function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  await requireUser();
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const categoria = one(sp.categoria) ?? "";
  const estado = one(sp.estado) ?? "activos";
  const validacion = one(sp.validacion) ?? "todos";
  const page = Math.max(1, Number(one(sp.pagina)) || 1);
  const conceptId = one(sp.concepto);
  const creating = one(sp.nuevo) === "1";

  const [{ items, total }, categories, units, taxes, settings] = await Promise.all([
    listConcepts({
      q, categoryId: categoria || undefined, page,
      status: STATUS[estado as keyof typeof STATUS] ?? "active",
      validated: VALIDATED[validacion as keyof typeof VALIDATED] ?? "all",
    }),
    listCategories({ includeInactive: true }),
    listUnits({ includeInactive: true }),
    listTaxes({ includeInactive: true }),
    getSettings(),
  ]);
  let selected: ConceptDetail | null = null;
  if (conceptId) {
    try {
      selected = await getConcept(conceptId);
    } catch (e) {
      // A concept that no longer exists (just deleted, or a stale link) simply leaves the panel closed.
      if (!(e instanceof NotFoundError)) throw e;
    }
  }

  const filters: Record<string, string> = {
    ...(q && { q }), ...(categoria && { categoria }),
    ...(estado !== "activos" && { estado }), ...(validacion !== "todos" && { validacion }),
  };
  const href = (extra: Record<string, string>) => `/catalogo?${new URLSearchParams({ ...filters, ...extra })}`;
  const pages = Math.max(1, Math.ceil(total / CONCEPTS_PAGE_SIZE));
  const opt = (rows: { id: string; name: string; active: boolean }[]) => rows.map(({ id, name, active }) => ({ id, name, active }));
  const panelOpen = selected !== null || creating;

  return (
    <>
      <div className="head">
        <h1>Catálogo</h1>
        <div className="actions">
          <Link className="btn" href="/catalogo/importar">Importar Excel</Link>
          <a className="btn" href="/api/catalogo/exportar">Exportar</a>
          <Link className="btn pri" href={`${href({ nuevo: "1" })}#panel`}>Nuevo concepto</Link>
        </div>
      </div>
      <form className="filters" method="get">
        <label className="field grow">Buscar<input name="q" defaultValue={q} placeholder="Código o descripción" /></label>
        <label className="field">
          Categoría
          <select name="categoria" defaultValue={categoria}>
            <option value="">Todas</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">
          Estado
          <select name="estado" defaultValue={estado}>
            <option value="activos">Activos</option>
            <option value="inactivos">Desactivados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="field">
          Validación
          <select name="validacion" defaultValue={validacion}>
            <option value="todos">Todos</option>
            <option value="si">Validados</option>
            <option value="no">Sin validar</option>
          </select>
        </label>
        <button className="btn" style={{ alignSelf: "flex-end" }}>Filtrar</button>
      </form>
      {conceptId && !selected && <p className="mut" role="status" style={{ marginBottom: 12 }}>El concepto ya no existe: se ha borrado.</p>}
      <div className={panelOpen ? "split" : undefined}>
        <div style={{ minWidth: 0, overflowX: "auto" }}>
          <table>
            <thead>
              <tr><th>Código</th><th>Descripción</th><th>Categoría</th><th>Unidad</th><th className="n">Coste</th><th className="n">Venta</th><th>IVA</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className={c.active ? undefined : "mut"} style={c.id === selected?.id ? { background: "var(--band)" } : undefined}>
                  <td className="code"><Link href={`${href({ concepto: c.id })}#panel`}>{c.code}</Link></td>
                  <td>{c.description}</td>
                  <td>{c.category.name}</td>
                  <td>{c.unit.name}</td>
                  <td className="n mut">{money(c.cost)}</td>
                  <td className="n">{money(c.salePrice)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDecimalEs(c.tax.ratePct, { min: 0 })} %</td>
                  <td>
                    {!c.active ? <span className="badge off">Desactivado</span> : !c.validated && <span className="badge amber">Sin validar</span>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="mut">No hay conceptos con estos filtros.</td></tr>}
            </tbody>
          </table>
          <div className="sumbar">
            <span className="mut">{total} resultados · página {page} de {pages}. Los conceptos desactivados siguen apareciendo en los presupuestos que ya los usan.</span>
            <span style={{ display: "flex", gap: 10 }}>
              {page > 1 && <Link className="btn" href={href({ pagina: String(page - 1) })}>Anterior</Link>}
              {page < pages && <Link className="btn" href={href({ pagina: String(page + 1) })}>Siguiente</Link>}
            </span>
          </div>
        </div>
        {panelOpen && (
          <aside id="panel" className="sheet panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>{selected ? "Concepto" : "Nuevo concepto"}</h2>
              <Link className="mut" href={href({})}>Cerrar</Link>
            </div>
            <ConceptForm
              key={selected ? `${selected.id}-${selected.updatedAt.getTime()}` : "nuevo"}
              concept={selected ? values(selected) : null}
              categories={opt(categories)}
              units={opt(units)}
              taxes={opt(taxes)}
              marginPct={formatDecimalEs(settings.defaultMarginPct, { min: 0 })}
              listHref={href({})}
            />
          </aside>
        )}
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AUDIT_PAGE_SIZE, listAudit, listAuditUserNames, SYSTEM } from "@/modules/audit/service";
import { requireUser } from "@/modules/auth/session";
import { AutoSubmit, SearchBox } from "./auto-submit";

export const metadata: Metadata = { title: "Historial · ISF Presupuestos" };

const ENTITIES: Record<string, string> = {
  user: "Usuarios", settings: "Configuración", tax: "Impuestos",
  concept: "Catálogo", category: "Categorías", unit: "Unidades", client: "Clientes", kit: "Conjuntos", quote: "Presupuestos",
};
const ACTIONS: Record<string, string> = {
  create: "Alta",
  update: "Cambio",
  role: "Cambio de rol",
  deactivate: "Desactivación",
  reactivate: "Reactivación",
  password: "Contraseña",
  logo: "Logo",
  delete: "Baja",
  import: "Importación",
  issue: "Emisión",
  status: "Cambio de estado",
  revision: "Revisión",
  adjust: "Ajuste de precio",
  duplicate: "Duplicado",
  download: "Descarga",
  pdf: "PDF",
  signature: "Firma",
};

const fmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
const PATH = "/admin/historial";
const FILTERS = { entidad: "Entidad", usuario: "Usuario", accion: "Acción", desde: "Desde", hasta: "Hasta" } as const;
const dateEs = (iso: string) => iso.split("-").reverse().join("/");

export default async function HistorialPage({ searchParams }: PageProps<"/admin/historial">) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const iso = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(str(k)) ? str(k) : "");
  const f = {
    q: str("q"),
    entidad: str("entidad") in ENTITIES ? str("entidad") : "",
    usuario: str("usuario"),
    accion: str("accion") in ACTIONS ? str("accion") : "",
    desde: iso("desde"),
    hasta: iso("hasta"),
  };
  const page = Math.max(1, Number(sp.pagina) || 1);
  const [{ items, total }, names] = await Promise.all([
    listAudit(user, { q: f.q, entity: f.entidad, userName: f.usuario, action: f.accion, from: f.desde, to: f.hasta, page }),
    listAuditUserNames(),
  ]);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const href = (over: Record<string, string>) =>
    `${PATH}?${new URLSearchParams(Object.entries({ ...f, ...over }).filter(([, v]) => v))}`;
  const label: Record<keyof typeof FILTERS, (v: string) => string> = {
    entidad: (v) => ENTITIES[v], usuario: (v) => v, accion: (v) => ACTIONS[v], desde: dateEs, hasta: dateEs,
  };
  const active = (Object.keys(FILTERS) as (keyof typeof FILTERS)[]).filter((k) => f[k]);

  return (
    <>
      <div className="crumb">Administración</div>
      <div className="head"><h1>Historial</h1></div>
      {/* key on each filter control: a mounted select never re-reads defaultValue after a chip removes it */}
      <Form action={PATH} replace scroll={false}>
        <AutoSubmit>
          <div className="searchrow">
            <label className="field">
              Buscar en el historial
              <SearchBox value={f.q} />
            </label>
          </div>
          <details className="more" open={active.length > 0}>
            <summary>Más filtros{active.length > 0 && ` (${active.length} ${active.length === 1 ? "activo" : "activos"})`}</summary>
            <div className="filters">
              <label className="field">
                Entidad
                <select key={f.entidad} name="entidad" defaultValue={f.entidad}>
                  <option value="">Todas</option>
                  {Object.entries(ENTITIES).map(([value, l]) => <option key={value} value={value}>{l}</option>)}
                </select>
              </label>
              <label className="field">
                Usuario
                <select key={f.usuario} name="usuario" defaultValue={f.usuario}>
                  <option value="">Todos</option>
                  {names.map((n) => <option key={n} value={n}>{n}</option>)}
                  <option value={SYSTEM}>{SYSTEM}</option>
                </select>
              </label>
              <label className="field">
                Acción
                <select key={f.accion} name="accion" defaultValue={f.accion}>
                  <option value="">Todas</option>
                  {Object.entries(ACTIONS).map(([value, l]) => <option key={value} value={value}>{l}</option>)}
                </select>
              </label>
              <label className="field">Desde<input key={f.desde} type="date" name="desde" defaultValue={f.desde} /></label>
              <label className="field">Hasta<input key={f.hasta} type="date" name="hasta" defaultValue={f.hasta} /></label>
            </div>
          </details>
        </AutoSubmit>
      </Form>
      <div className="chips">
        {active.map((k) => (
          <Link key={k} className="chip" href={href({ [k]: "" })} replace scroll={false} aria-label={`Quitar ${FILTERS[k]}`}>
            {FILTERS[k]}: {label[k](f[k])} ×
          </Link>
        ))}
        {(active.length > 0 || f.q) && <Link className="mut" href={PATH} replace scroll={false}>Quitar filtros</Link>}
      </div>
      <table>
        <thead>
          <tr><th>Fecha</th><th>Usuario</th><th>Entidad</th><th>Acción</th><th>Resumen</th></tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td className="mut" style={{ whiteSpace: "nowrap" }}>{fmt.format(e.createdAt)}</td>
              <td>{e.userName ?? <span className="mut">{SYSTEM}</span>}</td>
              <td>{ENTITIES[e.entity] ?? e.entity}</td>
              <td>{ACTIONS[e.action] ?? e.action}</td>
              <td>{e.summary}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="mut">No hay acciones que coincidan.</td></tr>
          )}
        </tbody>
      </table>
      <div className="sumbar">
        <span className="mut">{total} acciones · página {page} de {pages}</span>
        <span style={{ display: "flex", gap: 10 }}>
          {page > 1 && <Link className="btn" href={href({ pagina: String(page - 1) })}>Anterior</Link>}
          {page < pages && <Link className="btn" href={href({ pagina: String(page + 1) })}>Siguiente</Link>}
        </span>
      </div>
    </>
  );
}

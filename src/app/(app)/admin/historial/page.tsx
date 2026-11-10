import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_PAGE_SIZE, listAudit } from "@/modules/audit/service";
import { requireUser } from "@/modules/auth/session";

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
};

const fmt = new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });

export default async function HistorialPage({ searchParams }: PageProps<"/admin/historial">) {
  const user = await requireUser();
  const sp = await searchParams;
  const entity = typeof sp.entidad === "string" && sp.entidad in ENTITIES ? sp.entidad : undefined;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const { items, total } = await listAudit(user, { entity, page });
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const href = (p: number) => `/admin/historial?${new URLSearchParams({ ...(entity && { entidad: entity }), pagina: String(p) })}`;

  return (
    <>
      <div className="crumb">Administración</div>
      <div className="head"><h1>Historial</h1></div>
      <form className="filters" method="get">
        <label className="field">
          Entidad
          <select name="entidad" defaultValue={entity ?? ""}>
            <option value="">Todas</option>
            {Object.entries(ENTITIES).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button className="btn" style={{ alignSelf: "flex-end" }}>Filtrar</button>
      </form>
      <table>
        <thead>
          <tr><th>Fecha</th><th>Usuario</th><th>Entidad</th><th>Acción</th><th>Resumen</th></tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id}>
              <td className="mut" style={{ whiteSpace: "nowrap" }}>{fmt.format(e.createdAt)}</td>
              <td>{e.userName ?? <span className="mut">Sistema</span>}</td>
              <td>{ENTITIES[e.entity] ?? e.entity}</td>
              <td>{ACTIONS[e.action] ?? e.action}</td>
              <td>{e.summary}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} className="mut">No hay acciones registradas.</td></tr>
          )}
        </tbody>
      </table>
      <div className="sumbar">
        <span className="mut">{total} acciones · página {page} de {pages}</span>
        <span style={{ display: "flex", gap: 10 }}>
          {page > 1 && <Link className="btn" href={href(page - 1)}>Anterior</Link>}
          {page < pages && <Link className="btn" href={href(page + 1)}>Siguiente</Link>}
        </span>
      </div>
    </>
  );
}

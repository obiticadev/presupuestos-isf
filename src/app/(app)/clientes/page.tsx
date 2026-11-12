import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { CLIENTS_PAGE_SIZE, listClients } from "@/modules/clients/service";

export const metadata: Metadata = { title: "Clientes · ISF Presupuestos" };

const STATUS = { activos: "active", inactivos: "inactive", todos: "all" } as const;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  await requireUser();
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const estado = one(sp.estado) ?? "activos";
  const page = Math.max(1, Number(one(sp.pagina)) || 1);
  const { items, total } = await listClients({ q, status: STATUS[estado as keyof typeof STATUS] ?? "active", page });
  const pages = Math.max(1, Math.ceil(total / CLIENTS_PAGE_SIZE));
  const href = (p: number) => `/clientes?${new URLSearchParams({ ...(q && { q }), ...(estado !== "activos" && { estado }), pagina: String(p) })}`;

  return (
    <>
      <div className="head">
        <h1>Clientes</h1>
        <div className="actions"><Link className="btn pri" href="/clientes/nuevo">Nuevo cliente</Link></div>
      </div>
      <form className="filters" method="get">
        <label className="field grow">Buscar<input name="q" defaultValue={q} placeholder="Razón social, nombre comercial o CIF" /></label>
        <label className="field">
          Estado
          <select name="estado" defaultValue={estado}>
            <option value="activos">Activos</option>
            <option value="inactivos">Desactivados</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <button className="btn" style={{ alignSelf: "flex-end" }}>Filtrar</button>
      </form>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Razón social</th><th>Nombre comercial</th><th>CIF/NIF</th><th className="n">Instalaciones</th><th></th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className={c.active ? undefined : "mut"}>
                <td><Link href={`/clientes/${c.id}`} style={{ fontWeight: 600 }}>{c.legalName}</Link></td>
                <td>{c.tradeName || <span className="mut">—</span>}</td>
                <td className="code">{c.taxId}</td>
                <td className="n">{c._count.locations}</td>
                <td>{!c.active && <span className="badge off">Desactivado</span>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="mut">No hay clientes con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="sumbar">
        <span className="mut">{total} clientes · página {page} de {pages}</span>
        <span style={{ display: "flex", gap: 10 }}>
          {page > 1 && <Link className="btn" href={href(page - 1)}>Anterior</Link>}
          {page < pages && <Link className="btn" href={href(page + 1)}>Siguiente</Link>}
        </span>
      </div>
    </>
  );
}

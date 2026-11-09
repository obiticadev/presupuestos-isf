import type { Metadata } from "next";
import Link from "next/link";
import { formatDateEs, todayMadrid } from "@/lib/dates";
import { formatDecimalEs } from "@/lib/decimal";
import type { QuoteStatus } from "@/generated/prisma/client";
import { requireUser } from "@/modules/auth/session";
import { listClientOptions } from "@/modules/clients/service";
import { STATUS_CLASS, STATUS_LABEL } from "@/modules/quotes/labels";
import { isExpired, listQuotes, QUOTES_PAGE_SIZE } from "@/modules/quotes/lifecycle";
import { quoteLabel } from "@/modules/quotes/service";
import { listActiveUserNames } from "@/modules/users/service";

export const metadata: Metadata = { title: "Presupuestos · ISF Presupuestos" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthName = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
/** «estado» in the URL is the Spanish slug (enviado, aceptado…). */
const BY_SLUG = Object.fromEntries(Object.entries(STATUS_CLASS).map(([k, v]) => [v, k as QuoteStatus]));

/** First and last day (UTC dates) of the Madrid month that is `offset` months from today. */
function month(offset: number) {
  const t = todayMadrid();
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));
  return { first, last: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)) };
}

export default async function PresupuestosPage({ searchParams }: PageProps<"/">) {
  await requireUser();
  const sp = await searchParams;
  const q = one(sp.q), cliente = one(sp.cliente), responsable = one(sp.responsable);
  const isoDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : ""); // a hand-typed URL may carry anything
  const desde = isoDate(one(sp.desde)), hasta = isoDate(one(sp.hasta));
  const mes = desde || hasta ? "" : one(sp.mes) || "este"; // own dates win over the month shortcut
  const status = BY_SLUG[one(sp.estado)];
  const page = Math.max(1, Number(one(sp.pagina)) || 1);

  const range = mes === "este" ? month(0) : mes === "anterior" ? month(-1) : null;
  const from = range ? iso(range.first) : desde;
  const to = range ? iso(range.last) : hasta;
  const [{ items, total, sum, counts }, clients, users] = await Promise.all([
    listQuotes({ q, clientId: cliente || undefined, ownerId: responsable || undefined, status: status ?? "all", from, to, page }),
    listClientOptions(), listActiveUserNames(),
  ]);
  const pages = Math.max(1, Math.ceil(total / QUOTES_PAGE_SIZE));
  const all = Object.values(counts).reduce((a, b) => a + b, 0);

  const params = { q, cliente, responsable, desde, hasta, ...(!desde && !hasta && mes !== "este" && { mes }) };
  const href = (over: Record<string, string>) => {
    const p = Object.fromEntries(Object.entries({ ...params, estado: status ? STATUS_CLASS[status] : "", ...over }).filter(([, v]) => v));
    return `/?${new URLSearchParams(p)}`;
  };
  const title = range ? ` · ${monthName.format(range.first)}` : from || to ? ` · ${from ? formatDateEs(new Date(from)) : "…"} – ${to ? formatDateEs(new Date(to)) : "…"}` : "";
  const now = new Date();

  return (
    <>
      <div className="head">
        <h1>Presupuestos{title}</h1>
        <div className="actions"><Link className="btn pri" href="/presupuestos/nuevo">Nuevo presupuesto</Link></div>
      </div>

      <nav className="strip" aria-label="Estado">
        <Link href={href({ estado: "", pagina: "" })} className={status ? undefined : "on"} aria-current={status ? undefined : "page"}><span>Todos</span><b>{all}</b></Link>
        {(Object.keys(STATUS_LABEL) as QuoteStatus[]).map((s) => (
          <Link key={s} href={href({ estado: STATUS_CLASS[s], pagina: "" })} className={status === s ? "on" : undefined} aria-current={status === s ? "page" : undefined}>
            <span>{STATUS_LABEL[s]}</span><b>{counts[s]}</b>
          </Link>
        ))}
      </nav>

      <form className="filters" method="get">
        {status && <input type="hidden" name="estado" value={STATUS_CLASS[status]} />}
        <label className="field grow">Buscar<input name="q" defaultValue={q} placeholder="Referencia, cliente o asunto" /></label>
        <label className="field">Mes
          <select name="mes" defaultValue={mes}>
            <option value="este">Este mes</option>
            <option value="anterior">Mes anterior</option>
            <option value="todos">Todas las fechas</option>
            {!mes && <option value="">Desde/hasta</option>}
          </select>
        </label>
        <label className="field">Desde<input type="date" name="desde" defaultValue={desde} /></label>
        <label className="field">Hasta<input type="date" name="hasta" defaultValue={hasta} /></label>
        <label className="field">Cliente
          <select name="cliente" defaultValue={cliente}>
            <option value="">Todos</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
          </select>
        </label>
        <label className="field">Responsable
          <select name="responsable" defaultValue={responsable}>
            <option value="">Todos</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <button className="btn" style={{ alignSelf: "flex-end" }}>Filtrar</button>
      </form>
      {(desde || hasta) && <p className="mut" style={{ fontSize: 12, marginTop: 6 }}>Con «Desde» o «Hasta» se ignora el mes. <Link href={href({ desde: "", hasta: "" })}>Quitar fechas</Link></p>}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Referencia</th><th>Cliente</th><th>Asunto</th><th>Responsable</th><th>Fecha</th><th>Estado</th><th className="n">Total</th></tr></thead>
          <tbody>
            {items.map((r) => {
              const expired = isExpired(r, now);
              const days = r.status === "SENT" && r.issuedAt ? Math.floor((now.getTime() - r.issuedAt.getTime()) / 86_400_000) : null;
              return (
                <tr key={r.id}>
                  <td className="code"><Link href={`/presupuestos/${r.id}`} style={{ fontWeight: 600 }}>{quoteLabel(r)}</Link></td>
                  <td>{r.client.legalName}</td>
                  <td>
                    {r.subject || <span className="mut">—</span>}
                    {r.parent && <><br /><span className="mut">Sustituye a R{String(r.parent.revision).padStart(2, "0")}</span></>}
                  </td>
                  <td>{r.owner.name}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateEs(r.date)}</td>
                  <td>
                    <span className={`st ${expired ? "alerta" : STATUS_CLASS[r.status]}`}><i />{STATUS_LABEL[r.status]}{days !== null && ` · ${days} días`}</span>
                    {expired && <><br /><span className="badge amber">Validez vencida</span></>}
                  </td>
                  <td className="n" style={{ whiteSpace: "nowrap" }}>{formatDecimalEs(r.total)} €</td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={7} className="mut">No hay presupuestos con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="sumbar">
        <span>{total} resultado{total === 1 ? "" : "s"}{pages > 1 && ` · página ${page} de ${pages}`}</span>
        <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {page > 1 && <Link className="btn" href={href({ pagina: String(page - 1) })}>Anterior</Link>}
          {page < pages && <Link className="btn" href={href({ pagina: String(page + 1) })}>Siguiente</Link>}
          <span>Total filtrado <b>{formatDecimalEs(sum)} €</b></span>
        </span>
      </div>
    </>
  );
}

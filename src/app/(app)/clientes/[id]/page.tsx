import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { getClient, type ClientDetail } from "@/modules/clients/service";
import { formatDateEs } from "@/lib/dates";
import { formatDecimalEs } from "@/lib/decimal";
import { STATUS_CLASS, STATUS_LABEL } from "@/modules/quotes/labels";
import { listClientQuotes, quoteLabel } from "@/modules/quotes/service";
import { getSettings } from "@/modules/settings/service";
import { ClientDangerZone, ClientForm, EditableRows, type ClientValues } from "../forms";

export const metadata: Metadata = { title: "Cliente · ISF Presupuestos" };

const values = (c: ClientDetail): ClientValues => ({
  id: c.id, legalName: c.legalName, taxId: c.taxId, tradeName: c.tradeName, fiscalAddress: c.fiscalAddress,
  notes: c.notes, paymentTerms: c.paymentTerms, exclusions: c.exclusions,
  offerValidityDays: c.offerValidityDays === null ? "" : String(c.offerValidityDays), active: c.active,
});

const text = (v: string) => (v ? <span style={{ whiteSpace: "pre-wrap" }}>{v}</span> : <span className="mut">—</span>);

export default async function ClientePage({ params, searchParams }: PageProps<"/clientes/[id]">) {
  await requireUser();
  const { id } = await params;
  const editing = (await searchParams).editar === "1";
  let client: ClientDetail;
  try {
    client = await getClient(id);
  } catch (e) {
    // Right after «Eliminar cliente» the page re-renders without the client: say so instead of a bare 404.
    if (!(e instanceof NotFoundError)) throw e;
    return (
      <>
        <div className="crumb"><Link href="/clientes">Clientes</Link></div>
        <p role="status" style={{ marginTop: 18 }}>El cliente ya no existe: se ha borrado. <Link href="/clientes">Volver a clientes</Link></p>
      </>
    );
  }
  const [settings, quotes] = await Promise.all([getSettings(), listClientQuotes(id)]);
  const v = values(client);

  return (
    <>
      <div className="crumb"><Link href="/clientes">Clientes</Link> / {client.legalName}</div>
      <div className="head">
        <h1>{client.legalName}</h1>
        <span className="mut">CIF {client.taxId}</span>
        {!client.active && <span className="badge off">Desactivado</span>}
        <div className="actions">
          {!editing && <Link className="btn" href={`/clientes/${id}?editar=1`}>Editar</Link>}
          {client.active && <Link className="btn pri" href={`/presupuestos/nuevo?cliente=${id}`}>Nuevo presupuesto</Link>}
        </div>
      </div>

      {editing ? (
        <ClientForm client={v} cancelHref={`/clientes/${id}`} defaultValidity={settings.offerValidityDays} />
      ) : (
        <div className="grid2" style={{ marginTop: 22 }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Datos fiscales</h2>
            <div className="sheet">
              <dl>
                <dt>Nombre comercial</dt><dd>{text(client.tradeName)}</dd>
                <dt>Dirección fiscal</dt><dd>{text(client.fiscalAddress)}</dd>
                <dt>Observaciones</dt><dd>{text(client.notes)}</dd>
              </dl>
            </div>
          </div>
          <div>
            <h2 style={{ marginTop: 0 }}>Condiciones habituales</h2>
            <div className="sheet">
              <dl>
                <dt>Forma de pago</dt><dd>{text(client.paymentTerms)}</dd>
                <dt>Exclusiones</dt><dd>{text(client.exclusions)}</dd>
                <dt>Validez de oferta</dt>
                <dd>{client.offerValidityDays ?? settings.offerValidityDays} días{client.offerValidityDays === null && <span className="mut"> (por defecto)</span>}</dd>
              </dl>
            </div>
          </div>
        </div>
      )}

      <h2>Contactos</h2>
      <EditableRows kind="contact" clientId={id} rows={client.contacts} />
      <h2>Instalaciones</h2>
      <EditableRows kind="location" clientId={id} rows={client.locations} />

      <h2>Presupuestos</h2>
      {quotes.length === 0 ? (
        <p className="mut">Todavía no tiene presupuestos.</p>
      ) : (
        <table>
          <thead><tr><th>Referencia</th><th>Asunto</th><th>Fecha</th><th>Estado</th><th className="n">Total</th></tr></thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td><Link className="code" href={`/presupuestos/${q.id}`}>{quoteLabel(q)}</Link>{q.status !== "DRAFT" && <> <a href={`/api/presupuestos/${q.id}/pdf`} target="_blank" rel="noopener">PDF</a></>}</td>
                <td>{q.subject || <span className="mut">—</span>}</td>
                <td>{formatDateEs(q.date)}</td>
                <td>
                  <span className={`st ${STATUS_CLASS[q.status]}`}><i />{STATUS_LABEL[q.status]}</span>
                  {q.supersededById && <span className="mut"> · sustituido</span>}
                </td>
                <td className="n">{formatDecimalEs(q.total)} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
        <ClientDangerZone client={v} />
        <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>«Eliminar cliente» lo borra con sus contactos e instalaciones si no tiene presupuestos; si los tiene, lo desactiva.</p>
      </div>
    </>
  );
}

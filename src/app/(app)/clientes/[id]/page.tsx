import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { getClient, type ClientDetail } from "@/modules/clients/service";
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
  const settings = await getSettings();
  const v = values(client);

  return (
    <>
      <div className="crumb"><Link href="/clientes">Clientes</Link> / {client.legalName}</div>
      <div className="head">
        <h1>{client.legalName}</h1>
        <span className="mut">CIF {client.taxId}</span>
        {!client.active && <span className="badge off">Desactivado</span>}
        <div className="actions">{!editing && <Link className="btn" href={`/clientes/${id}?editar=1`}>Editar</Link>}</div>
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
      <h2>Ubicaciones de trabajo</h2>
      <EditableRows kind="location" clientId={id} rows={client.locations} />

      <h2>Presupuestos</h2>
      <p className="mut">Los presupuestos de este cliente aparecerán aquí.</p>

      <div style={{ marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
        <ClientDangerZone client={v} />
        <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>«Eliminar cliente» lo borra con sus contactos y ubicaciones si no tiene presupuestos; si los tiene, lo desactiva.</p>
      </div>
    </>
  );
}

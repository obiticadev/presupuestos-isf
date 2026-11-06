import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requireUser } from "@/modules/auth/session";
import { listClientOptions } from "@/modules/clients/service";
import { createDraftAction } from "@/modules/quotes/actions";

export const metadata: Metadata = { title: "Nuevo presupuesto · ISF Presupuestos" };

// The draft is created by a POST (Server Action), never by visiting a URL: a prefetch must not create quotes.
export default async function NuevoPresupuestoPage({ searchParams }: PageProps<"/presupuestos/nuevo">) {
  await requireUser();
  const cliente = (await searchParams).cliente;
  const clients = await listClientOptions();
  return (
    <>
      <div className="crumb"><Link href="/">Presupuestos</Link> / Nuevo</div>
      <div className="head"><h1>Nuevo presupuesto</h1></div>
      {clients.length === 0 ? (
        <p style={{ marginTop: 18 }}>Primero crea un cliente. <Link href="/clientes/nuevo">Nuevo cliente</Link></p>
      ) : (
        <ActionForm action={createDraftAction} className="sheet" style={{ display: "grid", gap: 12, maxWidth: 560, marginTop: 18 }}>
          <label className="field">Cliente
            <select name="clientId" required defaultValue={typeof cliente === "string" ? cliente : ""}>
              <option value="" disabled>Elige el cliente…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.legalName} · {c.taxId}</option>)}
            </select>
          </label>
          <p className="mut" style={{ fontSize: 13 }}>Se crea un borrador sin número con las condiciones habituales del cliente.</p>
          <button className="btn pri" style={{ justifySelf: "start" }}>Crear borrador</button>
        </ActionForm>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { requireUser } from "@/modules/auth/session";
import { importClientsAction } from "@/modules/clients/actions";

export const metadata: Metadata = { title: "Importar clientes · ISF Presupuestos" };

export default async function ImportarClientesPage() {
  const user = await requireUser();
  return (
    <>
      <div className="crumb"><Link href="/clientes">Clientes</Link> / Importar</div>
      <div className="head"><h1>Importar clientes</h1></div>
      <ol className="mut" style={{ margin: "14px 0 18px", paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Descarga la <a href="/api/clientes/plantilla">plantilla</a> o <a href="/api/clientes/exportar">exporta los clientes actuales</a> y edítalos en Excel: una hoja de clientes, otra de contactos y otra de instalaciones. En contactos e instalaciones, el CIF se elige de la lista.</li>
        <li>Súbelo y pulsa «Revisar»: verás qué filas son altas, cuáles cambian datos existentes y qué errores hay. Con «Añadir y actualizar», lo que no esté en el Excel no se toca; con «Completa» (solo administradores), se borra o se desactiva.</li>
        <li>Si no hay errores, «Confirmar importación» lo guarda todo de una vez; las filas sin cambios no se tocan. Si hay alguno, no se guarda nada.</li>
      </ol>
      <ImportForm step={importClientsAction} keyLabel="CIF · nombre" doneHref="/clientes" doneLabel="Ver los clientes" canFull={user.role === "admin"} />
    </>
  );
}

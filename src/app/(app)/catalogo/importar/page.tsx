import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { ImportForm } from "@/components/import-form";
import { importCatalogAction } from "@/modules/catalog/actions";

export const metadata: Metadata = { title: "Importar catálogo · ISF Presupuestos" };

export default async function ImportarPage() {
  const user = await requireUser();
  return (
    <>
      <div className="crumb"><Link href="/catalogo">Catálogo</Link> / Importar</div>
      <div className="head"><h1>Importar catálogo</h1></div>
      <ol className="mut" style={{ margin: "14px 0 18px", paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Descarga la <a href="/api/catalogo/plantilla">plantilla</a> o <a href="/api/catalogo/exportar">exporta el catálogo actual</a> y edítalo en Excel.</li>
        <li>Súbelo y pulsa «Revisar»: verás qué filas son altas, cuáles cambian conceptos existentes (y qué cambia) y qué errores hay. Con «Completa» (solo administradores), lo que no esté en el Excel se borra o, si está en uso, se desactiva.</li>
        <li>Si no hay errores, «Confirmar importación» lo guarda todo de una vez; las filas sin cambios no se tocan. Si hay alguno, no se guarda nada.</li>
      </ol>
      <ImportForm step={importCatalogAction} keyLabel="Código" doneHref="/catalogo" doneLabel="Ver el catálogo" canFull={user.role === "admin"} />
    </>
  );
}

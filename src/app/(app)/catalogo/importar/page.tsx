import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ImportForm } from "./forms";

export const metadata: Metadata = { title: "Importar catálogo · ISF Presupuestos" };

export default async function ImportarPage() {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return (
    <>
      <div className="crumb"><Link href="/catalogo">Catálogo</Link> / Importar</div>
      <div className="head"><h1>Importar catálogo</h1></div>
      <ol className="mut" style={{ margin: "14px 0 18px", paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Descarga la <a href="/api/catalogo/plantilla">plantilla</a> o <a href="/api/catalogo/exportar">exporta el catálogo actual</a> y edítalo en Excel.</li>
        <li>Súbelo y pulsa «Revisar»: verás qué filas son altas, cuáles cambian conceptos existentes y qué errores hay.</li>
        <li>Si no hay errores, «Confirmar importación» lo guarda todo de una vez. Si hay alguno, no se guarda nada.</li>
      </ol>
      <ImportForm />
    </>
  );
}

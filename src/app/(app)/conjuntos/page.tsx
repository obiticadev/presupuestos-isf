import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { listKits } from "@/modules/kits/service";

export const metadata: Metadata = { title: "Conjuntos · ISF Presupuestos" };

export default async function ConjuntosPage() {
  const user = await requireUser();
  const kits = await listKits({ includeInactive: true });

  return (
    <>
      <div className="head">
        <h1>Conjuntos</h1>
        <div className="actions">{user.role === "admin" && <Link className="btn pri" href="/conjuntos/nuevo">Nuevo conjunto</Link>}</div>
      </div>
      <p className="mut" style={{ marginTop: 8, maxWidth: 720 }}>
        Un conjunto calcula solo las cantidades de lo que acompaña a un concepto principal: por ejemplo, los metros de manguera de cada bomba según su distancia al cuadro.
      </p>
      <table style={{ marginTop: 18 }}>
        <thead><tr><th>Nombre</th><th>Descripción</th><th className="n">Componentes</th><th>Estado</th></tr></thead>
        <tbody>
          {kits.map((k) => (
            <tr key={k.id} style={k.active ? undefined : { opacity: 0.6 }}>
              <td><Link className="code" href={`/conjuntos/${k.id}`}>{k.name}</Link></td>
              <td>{k.description || <span className="mut">—</span>}</td>
              <td className="n">{k.definition.components.length}</td>
              <td>{k.active ? "Activo" : <span className="badge off">Desactivado</span>}</td>
            </tr>
          ))}
          {kits.length === 0 && <tr><td colSpan={4} className="mut">Todavía no hay conjuntos.</td></tr>}
        </tbody>
      </table>
    </>
  );
}

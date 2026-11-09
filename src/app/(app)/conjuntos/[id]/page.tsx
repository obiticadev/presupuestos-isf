import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/lists";
import { listConceptOptions } from "@/modules/catalog/service";
import { describeFormula, refCategoryId, refConceptId, type KitDefinition } from "@/modules/kits/definition";
import { getKit, type Kit } from "@/modules/kits/service";
import { KitActiveToggle, KitForm } from "../forms";

export const metadata: Metadata = { title: "Conjunto · ISF Presupuestos" };

export default async function ConjuntoPage({ params }: PageProps<"/conjuntos/[id]">) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const creating = id === "nuevo";
  if (creating && !isAdmin) notFound();

  let kit: Kit | null = null;
  if (!creating) {
    try {
      kit = await getKit(id);
    } catch (e) {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }
  }
  const [concepts, categories] = await Promise.all([listConceptOptions(), listCategories({ includeInactive: true })]);
  const conceptOptions = concepts.map((c) => ({ id: c.id, name: `${c.code} · ${c.description}`, active: c.active }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, active: c.active }));
  const refName = (r: KitDefinition["main"] | KitDefinition["components"][number]["ref"]) => {
    const cid = refConceptId(r);
    if (cid) return conceptOptions.find((c) => c.id === cid)?.name ?? "(concepto borrado)";
    return `elegir de ${categoryOptions.find((c) => c.id === refCategoryId(r))?.name ?? "(categoría borrada)"}`;
  };

  return (
    <>
      <div className="crumb"><Link href="/conjuntos">Conjuntos</Link> / {kit?.name ?? "Nuevo"}</div>
      <div className="head">
        <h1>{kit?.name ?? "Nuevo conjunto"}</h1>
        {kit && !kit.active && <span className="badge off">Desactivado</span>}
      </div>

      {isAdmin ? (
        <>
          <KitForm kit={kit} concepts={conceptOptions} categories={categoryOptions} />
          {kit && <KitActiveToggle id={kit.id} active={kit.active} />}
        </>
      ) : kit && (
        <div className="sheet" style={{ marginTop: 18, maxWidth: 760 }}>
          <dl>
            <dt>Descripción</dt><dd>{kit.description || <span className="mut">—</span>}</dd>
            <dt>Principal (N)</dt><dd>{kit.definition.main.label}: {refName(kit.definition.main)}</dd>
            <dt>Datos</dt>
            <dd>{kit.definition.params.map((p) => `${p.label} (${p.unit})${p.required ? "" : ", opcional"}`).join(" · ") || "—"}</dd>
            {kit.definition.components.map((c) => (
              <div key={c.slot} style={{ display: "contents" }}>
                <dt>{c.label}{c.required ? "" : " (opcional)"}</dt>
                <dd>{refName(c.ref)} · cantidad = {describeFormula(c.formula, kit.definition.params)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}

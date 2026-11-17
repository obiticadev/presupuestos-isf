import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/lists";
import { listConceptOptions } from "@/modules/catalog/service";
import { getKit, type Kit } from "@/modules/kits/service";
import { KitActiveToggle, KitForm } from "../forms";

export const metadata: Metadata = { title: "Conjunto · ISF Presupuestos" };

export default async function ConjuntoPage({ params }: PageProps<"/conjuntos/[id]">) {
  await requireUser();
  const { id } = await params;
  const creating = id === "nuevo";

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

  return (
    <>
      <div className="crumb"><Link href="/conjuntos">Conjuntos</Link> / {kit?.name ?? "Nuevo"}</div>
      <div className="head">
        <h1>{kit?.name ?? "Nuevo conjunto"}</h1>
        {kit && !kit.active && <span className="badge off">Desactivado</span>}
      </div>

      <KitForm kit={kit} concepts={conceptOptions} categories={categoryOptions} />
      {kit && <KitActiveToggle id={kit.id} active={kit.active} />}
    </>
  );
}

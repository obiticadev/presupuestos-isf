import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { listCategories } from "@/modules/catalog/lists";
import { listConceptOptions } from "@/modules/catalog/service";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { removeKitAction } from "@/modules/kits/actions";
import { getKit, kitIssues, kitUses, listKits, type Kit } from "@/modules/kits/service";
import { getKitHistory } from "@/modules/kits/history";
import { KitActiveToggle, KitForm } from "../forms";
import { KitHistory } from "../kit-history";

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
  const issues = kit ? await kitIssues(prisma, kit) : [];
  const uses = kit ? await kitUses(kit.id) : 0;
  const history = kit ? await getKitHistory(kit.id) : [];
  const [concepts, categories, kits] = await Promise.all([listConceptOptions(), listCategories({ includeInactive: true }), listKits({ includeInactive: true })]);
  const conceptOptions = concepts.map((c) => ({ id: c.id, code: c.code, description: c.description, unitName: c.unitName, active: c.active }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, active: c.active }));
  const taken = kits.filter((k) => k.id !== kit?.id).map((k) => k.name);

  return (
    <>
      <div className="crumb"><Link href="/conjuntos">Conjuntos</Link> / {kit?.name ?? "Nuevo"}</div>
      {kit && !kit.active && <span className="badge off">Desactivado</span>}

      {issues.map((m) => <p key={m} className="warnbox" style={{ marginBottom: 8 }}>{m}</p>)}
      <KitForm kit={kit} concepts={conceptOptions} categories={categoryOptions} taken={taken} />
      {kit && <KitActiveToggle id={kit.id} active={kit.active} />}
      {kit && (uses === 0 ? (
        <ActionForm action={removeKitAction} style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <input type="hidden" name="id" value={kit.id} />
          <ConfirmButton label="Eliminar" confirm="¿Eliminar el conjunto? No se ha usado en ningún presupuesto." />
          <span className="mut" style={{ fontSize: 12 }}>No se ha usado en ningún presupuesto: se puede eliminar.</span>
        </ActionForm>
      ) : (
        <p className="mut" style={{ marginTop: 12, fontSize: 12 }}>Se usa en {uses} presupuesto{uses === 1 ? "" : "s"}: no se puede eliminar, solo desactivar.</p>
      ))}
      {history.length > 0 && <KitHistory versions={history} />}
    </>
  );
}

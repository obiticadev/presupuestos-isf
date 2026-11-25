import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { allowedTemplates, isDynamic } from "@/modules/kits/definition";
import { kitIssues, listKits } from "@/modules/kits/service";

export const metadata: Metadata = { title: "Conjuntos · ISF Presupuestos" };

export default async function ConjuntosPage({ searchParams }: PageProps<"/conjuntos">) {
  await requireUser();
  const dyn = (await searchParams).tipo === "dinamicos";
  const all = await listKits({ includeInactive: true });
  const kits = all.filter((k) => isDynamic(k.definition) === dyn);
  const nDyn = all.length - all.filter((k) => !isDynamic(k.definition)).length;
  const incomplete = await Promise.all(kits.map(async (k) => k.active && (await kitIssues(prisma, k)).length > 0));
  const nameOf = new Map(all.map((k) => [k.id, k.name]));
  const loose = dyn
    ? new Set((await prisma.kitInstance.findMany({ where: { templateId: { in: kits.map((k) => k.id) } }, select: { templateId: true }, distinct: ["templateId"] })).map((r) => r.templateId))
    : new Set();
  const usedBy = (id: string) => all.filter((k) => k.definition.dynamics?.some((d) => allowedTemplates(d).includes(id))).map((k) => k.name);

  const main = (k: (typeof kits)[number]) => (
    <td data-l={dyn ? "Principal → materiales fijos" : "Principal → lo que lleva"}><b>{k.definition.main?.label ?? (dyn ? "— sin principal —" : "—")}</b>{k.definition.components.length > 0 && <> → {k.definition.components.map((c) => c.label).join(", ")}</>}</td>
  );
  const state = (k: (typeof kits)[number], i: number) => (
    <td data-l="Estado">{k.active ? "Activo" : <span className="badge off">Desactivado</span>}{incomplete[i] && <> <span className="badge amber">Incompleto</span></>}</td>
  );
  const name = (k: (typeof kits)[number]) => (
    <td>
      <Link className="code" href={`/conjuntos/${k.id}`}>{k.name}</Link>
      {k.description && <div className="mut" style={{ fontSize: 12 }}>{k.description}</div>}
    </td>
  );

  return (
    <>
      <div className="head">
        <h1>Conjuntos</h1>
        <div className="actions">
          <Link className="btn pri" href={dyn ? "/conjuntos/nuevo?tipo=dinamico" : "/conjuntos/nuevo"}>{dyn ? "Nuevo conjunto dinámico" : "Nuevo conjunto"}</Link>
        </div>
      </div>
      <p className="mut" style={{ marginTop: 8, maxWidth: 720 }}>
        Un conjunto agrupa los materiales que dependen de un material principal: al presupuestar se elige el principal y su cantidad, y la app añade y calcula el resto.
      </p>
      <nav className="ltabs" aria-label="Tipo de conjunto">
        <Link href="/conjuntos" aria-current={dyn ? undefined : "page"}>Conjuntos <small>{all.length - nDyn}</small></Link>
        <Link href="/conjuntos?tipo=dinamicos" aria-current={dyn ? "page" : undefined}>Conjuntos dinámicos <small>{nDyn}</small></Link>
      </nav>
        {dyn ? (
          <table className="klist">
            <thead><tr><th>Conjunto dinámico</th><th>Principal → materiales fijos</th><th>Tipos de slot</th><th>Lo usan</th><th>Estado</th></tr></thead>
            <tbody>
              {kits.map((k, i) => {
                const users = [...usedBy(k.id), ...(loose.has(k.id) ? ["suelto en presupuestos"] : [])];
                return (
                  <tr key={k.id} style={k.active ? undefined : { opacity: 0.6 }}>
                    {name(k)}{main(k)}
                    <td data-l="Tipos de slot"><div className="chips">{(k.definition.slotTypes ?? []).map((t) => <abbr key={t.key} className={t.red ? "tt red" : "tt"} title={t.label}>{t.abbr}</abbr>)}</div></td>
                    <td data-l="Lo usan" className={users.length ? undefined : "mut"}>{users.join(", ") || "—"}</td>
                    {state(k, i)}
                  </tr>
                );
              })}
              {kits.length === 0 && <tr><td colSpan={5} className="mut">Todavía no hay conjuntos dinámicos.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="klist">
            <thead><tr><th>Conjunto</th><th>Principal → lo que lleva</th><th>Conjuntos dinámicos</th><th className="n">Materiales</th><th>Estado</th></tr></thead>
            <tbody>
              {kits.map((k, i) => (
                <tr key={k.id} style={k.active ? undefined : { opacity: 0.6 }}>
                  {name(k)}{main(k)}
                  <td data-l="Conjuntos dinámicos">
                    {k.definition.dynamics?.length ? (
                      <div className="chips">
                        {k.definition.dynamics.map((d) => {
                          const ids = allowedTemplates(d);
                          const text = "templateIds" in d.choice ? `se elige: ${ids.map((id) => nameOf.get(id) ?? id).join(" / ")}` : nameOf.get(ids[0]) ?? ids[0];
                          return (
                            <span key={d.slot} className={d.optional ? "dyn opt" : "dyn"}>
                              <span className="mini" aria-hidden><i>{text.replace("se elige: ", "").slice(0, 2)}</i></span>{text}{d.optional && " · opcional"}
                            </span>
                          );
                        })}
                      </div>
                    ) : <span className="mut">—</span>}
                  </td>
                  <td className="n" data-l="Materiales">{k.definition.components.length}</td>
                  {state(k, i)}
                </tr>
              ))}
              {kits.length === 0 && <tr><td colSpan={5} className="mut">Todavía no hay conjuntos.</td></tr>}
            </tbody>
          </table>
        )}
    </>
  );
}

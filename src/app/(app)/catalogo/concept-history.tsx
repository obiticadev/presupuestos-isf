import Link from "next/link";
import { formatDateEs } from "@/lib/dates";
import { diffSnapshots, isAmountField, type ConceptVersion, type SnapshotChange } from "@/modules/catalog/history";
import { HistoryLine } from "./history-line";

const time = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const who = (v: ConceptVersion) => v.userName ?? "Sistema";

/** What a version changed against the one before it; null when there is nothing to compare with. */
export function versionChanges(v: ConceptVersion, previous: ConceptVersion | undefined): SnapshotChange[] | null {
  return v.snapshot && previous?.snapshot ? diffSnapshots(v.snapshot, previous.snapshot) : null;
}

function Imp({ v }: { v: ConceptVersion }) {
  return v.source?.startsWith("import") ? <span className="imp">Importación</span> : null;
}

/** Line summary: amounts with their values, texts with the field name only. */
function summary(v: ConceptVersion, previous: ConceptVersion | undefined) {
  if (!v.snapshot) return <span className="mut">{v.summary}</span>;
  if (!previous) return "Alta";
  const changes = versionChanges(v, previous);
  if (!changes) return <span className="mut">Primera foto completa</span>;
  return changes.map((c, i) => (
    <span key={c.field}>{i > 0 && " · "}{isAmountField(c.field) ? <>{c.label}: {c.before} → <b>{c.after}</b></> : c.label}</span>
  ));
}

/** History column: vertical line (> 900 px), horizontal line with arrows (601–900 px) and step by step (≤ 600 px); CSS picks one. */
export function ConceptHistory({ code, versions, selectedId, href }: {
  code: string; versions: ConceptVersion[]; selectedId: string; href: (extra: Record<string, string>) => string;
}) {
  const sel = Math.max(0, versions.findIndex((v) => v.id === selectedId));
  const v = versions[sel];
  const link = (i: number) => href({ historial: "1", version: versions[i].id });
  const changes = versionChanges(v, versions[sel + 1]);
  const legacyItem = { borderColor: "var(--rule)", background: "var(--band)", color: "var(--mut)" };

  return (
    <section className="hcol sheet" aria-label="Historial del concepto">
      <div className="hhead">
        <div><h2>Historial · {code}</h2><p>{versions.length} versiones. Elige una para verla en el panel.</p></div>
        <Link className="x" href={href({})} aria-label="Cerrar el historial">×</Link>
      </div>

      <div className="hline">
        <HistoryLine>
          {versions.map((x, i) => (
            <Link key={x.id} href={link(i)} className={x.snapshot ? undefined : "leg"} aria-current={i === sel ? "true" : undefined}>
              <span className="t">
                <span className="d" style={{ display: "block" }}>{formatDateEs(x.at)}{i === 0 && " · actual"}</span>
                <span className="who" style={{ display: "block" }}>{time(x.at)} · {who(x)}<Imp v={x} /></span>
                <span className="s">{summary(x, versions[i + 1])}</span>
              </span>
            </Link>
          ))}
        </HistoryLine>
        <p className="who" style={{ marginTop: 8 }}>Círculo discontinuo: cambio antiguo, solo con resumen.</p>
      </div>

      <div className="hstep">
        <div className="stepper">
          {sel < versions.length - 1
            ? <Link className="btn" href={link(sel + 1)} aria-label="Más antigua">‹ Antes</Link>
            : <span className="btn" aria-disabled="true">‹ Antes</span>}
          <div className="mid">
            <b>{formatDateEs(v.at)}</b><span className="who">{time(v.at)} · {who(v)}<Imp v={v} /></span>
            <div className="dots">{versions.map((x, i) => <i key={x.id} className={i === sel ? "on" : undefined} />).reverse()}</div>
          </div>
          {sel > 0
            ? <Link className="btn" href={link(sel - 1)} aria-label="Más reciente">Después ›</Link>
            : <span className="btn" aria-disabled="true">Después ›</span>}
        </div>
        <h3 style={{ marginTop: 16 }}>{sel === 0 ? "Versión actual" : `Versión ${versions.length - sel} de ${versions.length}`}: qué cambió</h3>
        <ul className="whatchg">
          {!v.snapshot ? <li style={legacyItem}>{v.summary} (solo resumen)</li>
            : !versions[sel + 1] ? <li>Alta del concepto</li>
            : !changes ? <li style={legacyItem}>Primera foto completa</li>
            : changes.map((c) => <li key={c.field}>{c.label}: <s>{c.before}</s> → {c.after}</li>)}
        </ul>
      </div>
    </section>
  );
}

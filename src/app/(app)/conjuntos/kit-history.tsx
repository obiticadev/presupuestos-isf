import { formatDateEs } from "@/lib/dates";
import { kitChanges, type KitVersion } from "@/modules/kits/history";

const time = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

/** Versions newest first; each save lists what it added (+) and removed (−) against the previous saved version. */
export function KitHistory({ versions }: { versions: KitVersion[] }) {
  return (
    <details className="sheet kt-hist">
      <summary>Historial ({versions.length})</summary>
      <ol>
        {versions.map((v, i) => {
          const prev = versions.slice(i + 1).find((x) => x.snapshot);
          const ch = v.snapshot && prev?.snapshot ? kitChanges(v.snapshot, prev.snapshot) : null;
          return (
            <li key={v.id}>
              <span className="mut">{formatDateEs(v.at)} · {time(v.at)} · {v.userName ?? "Sistema"}</span>
              <b>{v.summary}</b>
              {ch && (ch.added.length + ch.removed.length > 0 ? (
                <ul>
                  {ch.removed.map((l) => <li key={`-${l}`} className="del">− {l}</li>)}
                  {ch.added.map((l) => <li key={`+${l}`} className="add">+ {l}</li>)}
                </ul>
              ) : <span className="mut"> · sin cambios en el contenido</span>)}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

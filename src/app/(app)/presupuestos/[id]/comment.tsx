// The italic comment of a line, a kit or a partida/subpartida (spec 1.6), with its edit panel and its add button.
import { ActionForm } from "@/components/action-form";
import { CloseButton, OpenButton } from "@/components/disclosure";
import { setCommentAction } from "@/modules/quotes/actions";

type Kind = "line" | "kit" | "section";
/** Where it shows: under a line, at the foot of a kit, of a subpartida or of a partida. */
type Variant = "cl" | "ck" | "cs" | "cp";

const panelId = (id: string) => `comentario-${id}`;

/** The speech-bubble button that opens the comment of `id`; `reserve` keeps its place (hidden) once there is one. */
export function CommentButton({ id, has, label, reserve, className = "icon bub" }: {
  id: string; has: boolean; label: string; reserve?: boolean; className?: string;
}) {
  if (has && !reserve) return null;
  return (
    <OpenButton target={panelId(id)} className={`${className}${has ? " keep" : ""}`} title={label}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M2 3h12v8H7l-3 3v-3H2z" /></svg>
    </OpenButton>
  );
}

/** The comment itself (✎ edits, ✕ removes) and, in a draft, its edit panel. */
export function Comment({ kind, id, text, editable, variant }: { kind: Kind; id: string; text: string; editable: boolean; variant: Variant }) {
  const hidden = (comment?: string) => (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {comment !== undefined && <input type="hidden" name="comment" value={comment} />}
    </>
  );
  return (
    <>
      {text && (
        <div className={`comment ${variant}`}>
          {variant === "ck" && <span className="lab">Comentario del conjunto</span>}
          <p>{text}</p>
          {editable && (
            <span className="acts">
              <OpenButton target={panelId(id)} className="icon" title="Editar comentario">✎</OpenButton>
              <ActionForm action={setCommentAction}>{hidden("")}<button className="icon" title="Quitar comentario" aria-label="Quitar comentario">✕</button></ActionForm>
            </span>
          )}
        </div>
      )}
      {editable && (
        <details id={panelId(id)} className="addpanel">
          <summary tabIndex={-1} aria-hidden />
          <ActionForm action={setCommentAction} close className={`comment editing ${variant}`}>
            {hidden()}
            <textarea name="comment" defaultValue={text} maxLength={2000} aria-label="Comentario" placeholder="Comentario: se verá en cursiva justo aquí, en el editor y en el PDF" />
            <button className="btn pri">Guardar</button>
            <CloseButton />
          </ActionForm>
        </details>
      )}
    </>
  );
}

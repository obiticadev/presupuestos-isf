"use client";
// Internal notes of the quote (spec 2026-11-17, model C): the last note opens a floating chat. Right click (or a long
// press on touch screens) on a note of the current draft offers Editar, Ver versiones anteriores and Eliminar.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { addNoteAction, deleteNoteAction, editNoteAction } from "@/modules/quotes/actions";
import type { NoteGroup, NoteView } from "@/modules/quotes/notes";

const WHEN = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const when = (d: Date) => WHEN.format(d).replace(",", "");
const DAY = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Madrid" });
const rev = (n: number) => `R${String(n).padStart(2, "0")}`;

type At = { note: NoteView; x: number; y: number };

export function Notes({ groups, meId }: { groups: NoteGroup[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<At | null>(null);
  const [versions, setVersions] = useState<At | null>(null);
  const [editing, setEditing] = useState<NoteView | null>(null);
  const chat = useRef<HTMLDivElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);

  const all = groups.flatMap((g) => g.notes);
  const last = all.at(-1);
  const current = groups.at(-1);
  const canWrite = !!current?.editable;

  // A save or a delete refreshes the notes: leave the edit mode and close the menu and the versions card
  // (state adjusted while rendering, as React recommends).
  const [seen, setSeen] = useState(groups);
  if (seen !== groups) { setSeen(groups); setEditing(null); setMenu(null); setVersions(null); }
  useEffect(() => {
    if (open && chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [open, groups]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menu) setMenu(null);
      else if (versions) setVersions(null);
      else setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".note-menu, .note-versions")) { setMenu(null); setVersions(null); }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, [open, menu, versions]);

  const showMenu = (note: NoteView, x: number, y: number) => { setVersions(null); setMenu({ note, x, y }); };
  const cancelPress = () => { if (press.current) clearTimeout(press.current); press.current = null; };
  const at = (a: At) => ({ "--x": `${Math.min(a.x, window.innerWidth - 290)}px`, "--y": `${Math.min(a.y, window.innerHeight - 200)}px` }) as CSSProperties;

  return (
    <div className="notes">
      <h3>Notas</h3>
      {last && (
        <button type="button" className="lastnote" onClick={() => setOpen(true)}>
          <span className="top"><span>{last.authorName} · {when(last.updatedAt)}</span><span className="count">{all.length}</span></span>
          <span className="txt">{last.text}</span>
          <span className="go">Ver {all.length === 1 ? "la nota" : `las ${all.length} notas`} →</span>
        </button>
      )}
      {canWrite && (
        <ActionForm action={addNoteAction} reset className="notes-add">
          <input type="hidden" name="quoteId" value={current.quoteId} />
          <textarea name="text" rows={2} maxLength={1000} required aria-label="Nueva nota" placeholder="Escribe una nota interna (no sale en el PDF)…" />
          <button className="btn pri sm">Guardar nota</button>
        </ActionForm>
      )}

      {open && (
        <section className="notes-win" role="dialog" aria-label="Notas del presupuesto">
          <header><b>Notas · {all.length}</b><button type="button" className="x" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button></header>
          <div className="notes-chat" ref={chat}>
            {groups.map((g) => (
              <div key={g.quoteId} className="notes-group">
                {groups.length > 1 && <div className="sep">{rev(g.revision)} · {g.editable ? "borrador" : g.issuedAt ? `emitida ${DAY.format(g.issuedAt)}` : "sin emitir"}</div>}
                {g.notes.map((n) => (
                  <div
                    key={n.id}
                    className={`msg${n.authorId === meId ? " me" : ""}${g.editable ? "" : " locked"}${menu?.note.id === n.id || editing?.id === n.id ? " hl" : ""}`}
                    tabIndex={g.editable ? 0 : undefined}
                    aria-haspopup={g.editable ? "menu" : undefined}
                    onContextMenu={g.editable ? (e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); showMenu(n, e.clientX || r.left + 12, e.clientY || r.bottom); } : undefined}
                    onPointerDown={g.editable ? (e) => {
                      if (e.pointerType !== "touch") return;
                      const { clientX, clientY } = e;
                      press.current = setTimeout(() => showMenu(n, clientX, clientY), 500);
                    } : undefined}
                    onPointerUp={cancelPress} onPointerMove={cancelPress} onPointerCancel={cancelPress}
                  >
                    <div className="who">{n.authorId === meId ? "Tú" : n.authorName}</div>
                    <p>{n.text}</p>
                    <div className="meta">{!g.editable && "🔒 "}{when(n.updatedAt)}{n.edited && <span className="ed">editado</span>}</div>
                  </div>
                ))}
              </div>
            ))}
            {all.length === 0 && <p className="mut">Todavía no hay notas.</p>}
          </div>
          {canWrite && (editing ? (
            <ActionForm key={editing.id} action={editNoteAction} className="notes-comp">
              <p className="editing">{editing.authorId === meId ? "Editando tu nota. Al guardar se actualizan la fecha y la hora." : `Editando nota de ${editing.authorName}. Al guardar quedará a tu nombre con la fecha y hora actuales.`}</p>
              <input type="hidden" name="id" value={editing.id} />
              <textarea name="text" rows={2} maxLength={1000} required defaultValue={editing.text} aria-label="Nota" autoFocus />
              <div className="row"><button type="button" className="btn sm" onClick={() => setEditing(null)}>Cancelar</button><button className="btn pri sm">Guardar cambios</button></div>
            </ActionForm>
          ) : (
            <ActionForm action={addNoteAction} reset className="notes-comp">
              <input type="hidden" name="quoteId" value={current.quoteId} />
              <textarea name="text" rows={2} maxLength={1000} required aria-label="Nueva nota" placeholder="Escribe una nota…" />
              <div className="row"><button className="btn pri sm">Guardar nota</button></div>
            </ActionForm>
          ))}

          {versions && (
            <div className="note-versions" style={at(versions)} role="dialog" aria-label="Versiones anteriores">
              <header><button type="button" className="back" onClick={() => setVersions(null)}>← Notas</button><b>Versiones anteriores</b></header>
              <ol>
                {versions.note.versions.map((v, i) => <li key={i}>{v.text}<small>{v.authorName} · {when(v.createdAt)}</small></li>)}
                <li className="now">{versions.note.text}<small>{versions.note.authorName} · {when(versions.note.updatedAt)} · actual</small></li>
              </ol>
            </div>
          )}
        </section>
      )}

      {open && menu && (
        <>
          <div className="note-scrim" onClick={() => setMenu(null)} />
          <div className="note-menu" role="menu" style={at(menu)}>
            <p className="prev">«{menu.note.text.slice(0, 60)}{menu.note.text.length > 60 ? "…" : ""}»</p>
            <button type="button" role="menuitem" autoFocus onClick={() => { setEditing(menu.note); setMenu(null); }}>Editar</button>
            {menu.note.edited && <button type="button" role="menuitem" onClick={() => { setVersions(menu); setMenu(null); }}>Ver versiones anteriores</button>}
            <ActionForm action={deleteNoteAction}>
              <input type="hidden" name="id" value={menu.note.id} />
              <ConfirmButton label="Eliminar" confirm="Se borra con sus versiones anteriores." className="del" />
            </ActionForm>
          </div>
        </>
      )}
    </div>
  );
}

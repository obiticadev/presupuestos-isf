"use client";

import { useId, useRef, useState } from "react";
import { markParts, matchItems, type ComboItem } from "@/lib/combo-match";

const textOf = (i: ComboItem | undefined) => (i ? `${i.code} · ${i.description}` : "");

function Marked({ text, q }: { text: string; q: string }) {
  const [a, m, b] = markParts(text, q);
  return m === undefined ? <>{a}</> : <>{a}<mark>{m}</mark>{b}</>;
}

/**
 * A search box over a list (spec 2026-11-24 §1): filters by code, description and `extra` while typing, ↑ ↓ Enter Tab Esc,
 * a ✕ that empties it and reopens the list. Leaving it with text that is not an item puts back the current choice; an
 * exact code typed by hand counts as chosen; leaving it empty clears the choice. With `name` the choice travels in a hidden
 * field; with `submit` the form is sent after each choice. Remount it (key) to show a value changed from outside.
 */
export function Combobox({ items, value, onPick, name, placeholder, submit, invalid, label }: {
  items: ComboItem[]; value: string; onPick?: (id: string) => void; name?: string; placeholder?: string;
  submit?: boolean; invalid?: boolean; label?: string;
}) {
  const [text, setText] = useState(() => textOf(items.find((i) => i.id === value)));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const chosen = useRef(value); // read by blur right after a pick, before React re-renders
  const moved = useRef(false); // arrows used since the list opened
  const field = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const id = useId();
  const list = matchItems(items, query);
  const columns = items.some((i) => i.extra);

  const pick = (item: ComboItem | undefined) => {
    const next = item?.id ?? "";
    setText(textOf(item)); setQuery(""); setOpen(false);
    if (next === chosen.current) return;
    chosen.current = next;
    if (hidden.current) hidden.current.value = next;
    onPick?.(next);
    if (submit) hidden.current?.form?.requestSubmit();
  };
  const reopen = () => { setQuery(""); setActive(0); setOpen(true); moved.current = false; };

  return (
    <div className={`cb${text ? " filled" : ""}`}>
      <input
        ref={field} role="combobox" aria-expanded={open} aria-controls={`${id}-l`} aria-autocomplete="list" aria-label={label}
        aria-activedescendant={open && list[active] ? `${id}-${active}` : undefined} aria-invalid={invalid || undefined}
        autoComplete="off" value={text} placeholder={placeholder}
        onFocus={(e) => { e.currentTarget.select(); reopen(); }}
        onChange={(e) => { setText(e.target.value); setQuery(e.target.value); setActive(0); setOpen(true); }}
        onBlur={() => {
          setOpen(false);
          const t = text.trim();
          if (!t) return pick(undefined);
          const exact = items.find((i) => i.code.toUpperCase() === t.toUpperCase());
          pick(exact ?? items.find((i) => i.id === chosen.current));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) reopen(); else { moved.current = true; setActive(Math.min(active + 1, list.length - 1)); } }
          else if (e.key === "ArrowUp") { e.preventDefault(); moved.current = true; setActive(Math.max(active - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); if (open && list[active]) pick(list[active]); }
          // Tab takes the highlighted option and lets the focus move on (user, 2026-11-24); just passing through picks nothing
          else if (e.key === "Tab" && open && (query.trim() || moved.current) && list[active]) pick(list[active]);
          else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); setText(textOf(items.find((i) => i.id === chosen.current))); setQuery(""); }
        }}
      />
      <button type="button" className="clr" aria-label="Borrar" tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); setText(""); reopen(); field.current?.focus(); }}>✕</button>
      {name && <input ref={hidden} type="hidden" name={name} defaultValue={value} />}
      {open && (
        <ul role="listbox" id={`${id}-l`} className={columns ? "cols" : undefined}>
          {query.trim() && <li className="hint" aria-hidden>{list.length} de {items.length}</li>}
          {list.length ? list.map((i, k) => (
            <li key={i.id} id={`${id}-${k}`} role="option" aria-selected={k === active}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setActive(k)}>
              <b><Marked text={i.code} q={query} /></b><span><Marked text={i.description} q={query} /></span>
              {columns && <small><Marked text={i.extra ?? ""} q={query} /></small>}
            </li>
          )) : <li className="none">Nada coincide con «{query.trim()}»</li>}
        </ul>
      )}
    </div>
  );
}

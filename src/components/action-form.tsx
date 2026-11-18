"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";

type Action = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/**
 * A form for a Server Action that keeps what was typed when the server rejects it (onSubmit instead of `action`)
 * and shows the errors at its end. `reset` empties it after a success (add-forms); `close` also closes the
 * <details> it sits in (pop-up forms). `saved` shows «Guardado» for 2 s after each success; `onSaved` runs after it.
 */
export function ActionForm({ action, children, className, style, reset, close, id, saved, onSaved }: {
  action: Action; children: ReactNode; className?: string; style?: CSSProperties; reset?: boolean; close?: boolean; id?: string;
  saved?: boolean; onSaved?: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<ActionResult | null, FormData>(action, null);
  // «Guardado» shows for a result until its 2 s are up; each new result shows it again.
  const [expired, setExpired] = useState<ActionResult | null>(null);
  const showSaved = saved && state?.ok && expired !== state;
  useEffect(() => {
    if (!state?.ok) return;
    if (reset || close) ref.current?.reset();
    if (close) ref.current?.closest("details")?.removeAttribute("open");
    onSaved?.();
    if (!saved) return;
    const t = setTimeout(() => setExpired(state), 2000);
    return () => clearTimeout(t);
    // onSaved is left out: a new closure on each render must not re-run this for the same result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, close, saved, state]);
  const errors = state && !state.ok ? Object.values(state.errors) : [];
  return (
    <form
      ref={ref} id={id} className={className} style={style} aria-busy={pending}
      onSubmit={(ev) => {
        ev.preventDefault();
        const data = new FormData(ev.currentTarget, (ev.nativeEvent as SubmitEvent).submitter);
        startTransition(() => run(data));
      }}
    >
      {children}
      {errors.length > 0 && <span className="err formerr" role="alert">{errors.join(" · ")}</span>}
      {showSaved && <span role="status" className="saved">Guardado</span>}
    </form>
  );
}

/** Submits the enclosing form when a select or checkbox inside it changes. */
export function SubmitOnChange({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: "contents" }} onChange={(e) => (e.target as HTMLInputElement).form?.requestSubmit()}>
      {children}
    </span>
  );
}

/** A destructive button that asks once more on the page itself (no browser dialog). */
export function ConfirmButton({ label, confirm, className = "btn" }: { label: string; confirm: string; className?: string }) {
  return (
    <details className="confirm">
      <summary className={className}>{label}</summary>
      <div className="confirmbox">
        <span>{confirm}</span>
        <button className="btn warn">Sí, {label.toLowerCase()}</button>
      </div>
    </details>
  );
}

/**
 * Submits the enclosing form when a text field inside it loses focus with a changed value.
 * In a textarea, Enter (without Shift) saves instead of adding a line break.
 */
export function SubmitOnBlur({ children }: { children: ReactNode }) {
  return (
    <span
      style={{ display: "contents" }}
      onBlur={(e) => {
        const t = e.target as HTMLInputElement | HTMLTextAreaElement;
        if ((t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && t.type !== "hidden")) && t.value !== t.defaultValue) t.form?.requestSubmit();
      }}
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "TEXTAREA" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); t.blur(); }
      }}
    >
      {children}
    </span>
  );
}

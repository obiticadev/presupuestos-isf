"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Small client helpers around <details>: everything else in the editor stays a Server Component.

/** True when the open menu does not fit below its button in the window and there is more room above. */
function opensUp(d: HTMLDetailsElement): boolean {
  const menu = d.querySelector<HTMLElement>(".menu");
  if (!d.open || !menu || getComputedStyle(menu).position !== "absolute") return false;
  const { top, bottom } = d.getBoundingClientRect();
  const below = window.innerHeight - bottom;
  return menu.offsetHeight + 8 > below && top > below;
}

/** A pop-up menu that closes when clicking outside it or choosing one of its buttons, and opens upwards if it does not fit below. */
export function Menu({ label, title, className = "", summaryClassName, children }: {
  label: ReactNode; title?: string; className?: string; summaryClassName: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // In state, not set on the element by hand, so a re-render while the menu is open keeps it upwards.
  const [up, setUp] = useState(false);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ref.current?.open) return;
      ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  return (
    <details ref={ref} className={`dd ${className}${up ? " up" : ""}`} onToggle={(e) => setUp(opensUp(e.currentTarget))}>
      <summary className={summaryClassName} title={title} aria-label={title}>{label}</summary>
      <div className="menu" onClick={(e) => { if ((e.target as HTMLElement).closest("button") && ref.current) ref.current.open = false; }}>
        {children}
      </div>
    </details>
  );
}

/**
 * Opens the <details id={target}> panel, closes every other open panel of the page (one form open at a time;
 * what was typed in them stays), opens the folded kit it may sit in and focuses its first field.
 */
export function OpenButton({ target, className, title, children }: { target: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button
      type="button" className={className} title={title} aria-label={title} aria-controls={target}
      onClick={() => {
        const d = document.getElementById(target) as HTMLDetailsElement | null;
        if (!d) return;
        document.querySelectorAll<HTMLDetailsElement>("details.addpanel[open]").forEach((x) => { if (x !== d) x.open = false; });
        d.parentElement?.closest<HTMLDetailsElement>("details.kit")?.setAttribute("open", "");
        d.open = true;
        d.querySelector<HTMLElement>("textarea, select, input:not([type=hidden])")?.focus();
      }}
    >
      {children}
    </button>
  );
}

/** Cancels: empties the form of the panel it sits in and closes the panel. */
export function CloseButton({ className = "icon cancel", title = "Cancelar" }: { className?: string; title?: string }) {
  return (
    <button
      type="button" className={className} title={title} aria-label={title}
      onClick={(e) => {
        const d = e.currentTarget.closest("details");
        d?.querySelector("form")?.reset();
        if (d) d.open = false;
      }}
    >
      ✕
    </button>
  );
}

/** The green ✓ at the foot of an open kit: folds it and keeps its title in view. */
export function CollapseKitButton() {
  return (
    <button
      type="button" className="btn pri done" title="Listo: recoger el conjunto" aria-label="Listo: recoger el conjunto"
      onClick={(e) => {
        const kit = e.currentTarget.closest<HTMLDetailsElement>("details.kit");
        if (!kit) return;
        kit.open = false;
        kit.querySelector("summary")?.scrollIntoView({ block: "nearest" });
      }}
    >
      ✓
    </button>
  );
}

/**
 * Inside a kit: opens it when it appears (on load or just added) if it is incomplete. Not an `open` prop on the kit:
 * React would fold it again the moment it is completed, and the one just edited must stay open.
 */
export function OpenIfIncomplete({ incomplete }: { incomplete: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Only on mount: completing the kit later must not fold or unfold it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (incomplete) ref.current?.closest("details")?.setAttribute("open", ""); }, []);
  return <span ref={ref} hidden />;
}

/** Opens the folded kit a link points to (#conjunto-…), on load and when the hash changes. */
export function OpenKitFromHash() {
  useEffect(() => {
    const open = () => {
      if (!location.hash.startsWith("#conjunto-")) return;
      const d = document.getElementById(location.hash.slice(1));
      if (d instanceof HTMLDetailsElement) { d.open = true; d.scrollIntoView({ block: "start" }); }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

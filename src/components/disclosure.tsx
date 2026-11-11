"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Small client helpers around <details>: everything else in the editor stays a Server Component.

/** A pop-up menu that closes when clicking outside it or choosing one of its buttons. */
export function Menu({ label, title, className = "", summaryClassName, children }: {
  label: ReactNode; title?: string; className?: string; summaryClassName: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details ref={ref} className={`dd ${className}`}>
      <summary className={summaryClassName} title={title} aria-label={title}>{label}</summary>
      <div className="menu" onClick={(e) => { if ((e.target as HTMLElement).closest("button") && ref.current) ref.current.open = false; }}>
        {children}
      </div>
    </details>
  );
}

/**
 * Opens the <details id={target}> panel, closes the other panels of its data-group (one form open at a time),
 * opens the folded kit it may sit in and focuses its first field.
 */
export function OpenButton({ target, className, title, children }: { target: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button
      type="button" className={className} title={title} aria-label={title}
      onClick={() => {
        const d = document.getElementById(target) as HTMLDetailsElement | null;
        if (!d) return;
        const group = d.dataset.group;
        if (group) document.querySelectorAll<HTMLDetailsElement>(`details[data-group="${group}"]`).forEach((x) => { if (x !== d) x.open = false; });
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

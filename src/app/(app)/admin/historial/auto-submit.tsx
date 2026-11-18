"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Submits the enclosing GET form: selects and dates on change, the search box 300 ms after the last keystroke. */
export function AutoSubmit({ children }: { children: ReactNode }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <div
      style={{ display: "contents" }}
      onChange={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.type !== "search") t.form?.requestSubmit();
      }}
      onInput={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.type !== "search") return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => t.form?.requestSubmit(), 300);
      }}
    >
      {children}
    </div>
  );
}

/** Search box that follows the URL (e.g. «Quitar filtros») except while the user is typing in it. */
export function SearchBox({ value }: { value: string }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = value;
  }, [value]);
  return <input ref={input} type="search" name="q" defaultValue={value} placeholder="Referencia, concepto, cliente…" />;
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Horizontal version line (601–900 px): ‹ › scroll it and switch off at each end. Wider screens hide the arrows by CSS. */
export function HistoryLine({ children }: { children: ReactNode }) {
  const line = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  useEffect(() => {
    const w = line.current!;
    const update = () => setEnds({ start: w.scrollLeft <= 1, end: w.scrollLeft + w.clientWidth >= w.scrollWidth - 1 });
    const current = w.querySelector<HTMLElement>("[aria-current]");
    if (current) w.scrollLeft = current.offsetLeft - w.clientWidth / 2 + current.offsetWidth / 2;
    update();
    w.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => { w.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);

  const go = (dir: number) => line.current!.scrollBy({ left: dir * line.current!.clientWidth * 0.8 });
  return (
    <div className="wirewrap">
      <button type="button" className="nav" onClick={() => go(-1)} disabled={ends.start} aria-label="Versiones más recientes">‹</button>
      <div className="wireline" ref={line}>{children}</div>
      <button type="button" className="nav" onClick={() => go(1)} disabled={ends.end} aria-label="Versiones más antiguas">›</button>
    </div>
  );
}

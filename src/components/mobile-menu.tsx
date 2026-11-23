"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** The «Menú» button of the mobile top bar: opens and closes the links of the rail, and closes them on navigation. */
export function MobileMenuButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const set = (open: boolean) => {
    ref.current?.closest("nav")?.classList.toggle("open", open);
    ref.current?.setAttribute("aria-expanded", String(open));
  };
  useEffect(() => set(false), [pathname]);
  return (
    <button ref={ref} type="button" className="menubtn" aria-controls="rail-links" aria-expanded="false"
      onClick={() => set(!ref.current?.closest("nav")?.classList.contains("open"))}>
      Menú
    </button>
  );
}

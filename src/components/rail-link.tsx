"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function RailLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const on = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link href={href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
      {children}
    </Link>
  );
}

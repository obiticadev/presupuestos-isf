/** «instalación · país» of a client installation (spec 2.1): no separator if one is missing, «—» if there is none. */
export function installationLabel(l: { installation: string; country: string } | null | undefined): string {
  return [l?.installation.trim(), l?.country.trim()].filter(Boolean).join(" · ") || "—";
}

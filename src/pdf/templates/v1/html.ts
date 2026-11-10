export type SafeHtml = { readonly __html: string };

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const isSafe = (v: unknown): v is SafeHtml => typeof v === "object" && v !== null && "__html" in v;
const piece = (v: unknown): string =>
  isSafe(v) ? v.__html
  : Array.isArray(v) && v.every(isSafe) ? v.map((x) => x.__html).join("")
  : String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const safe = (s: string): SafeHtml => ({ __html: s });

/** Template literal that escapes every value unless it is already SafeHtml (or an array of it). */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  return safe(strings.reduce((out, s, i) => out + s + (i < values.length ? piece(values[i]) : ""), ""));
}

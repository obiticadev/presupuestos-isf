// Search for the Combobox: case and accent insensitive, over code, description and an extra column (category).
export type ComboItem = { id: string; code: string; description: string; extra?: string };

// Folded letter by letter, so a position in the folded text is the same position in the original.
const fold = (s: string) => [...s].map((c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] ?? c).join("");

export function matchItems<T extends ComboItem>(items: T[], q: string): T[] {
  const needle = fold(q.trim());
  return needle ? items.filter((i) => fold(`${i.code} ${i.description} ${i.extra ?? ""}`).includes(needle)) : items;
}

/** [before, match, after] around the first match of `q` in `text`, or [text] when there is none. */
export function markParts(text: string, q: string): string[] {
  const needle = fold(q.trim());
  const at = needle ? fold(text).indexOf(needle) : -1;
  return at < 0 ? [text] : [text.slice(0, at), text.slice(at, at + needle.length), text.slice(at + needle.length)];
}

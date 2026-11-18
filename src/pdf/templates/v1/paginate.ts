/**
 * Splits the line-items table of the single `.sheet` into sheets of `sheetHeightPx`, each with its own
 * copy of the thead, and leaves the closing block at the foot of the last one (design 5.3.1).
 * Self-contained: it is serialized for `page.evaluate`, so it must not use anything from outside.
 */
export function paginate(sheetHeightPx: number): void {
  const first = document.querySelector<HTMLElement>(".sheet");
  if (!first) return;
  const thead = first.querySelector("thead")!;
  const close = first.querySelector(".close")!;
  const rows = [...first.querySelectorAll("tbody > tr")];
  close.remove();

  const over = (s: HTMLElement) => s.scrollHeight > s.clientHeight + 0.5;
  const is = (r: Element, kind: string) => r.classList.contains(kind);
  // A heading must not be split from what it introduces: a part from its sub or first line, a sub from its first line.
  // A sub without lines (hidden lines, a GLOBAL subsection) introduces nothing and may end a sheet.
  // A note (comment) never opens a sheet: it goes with the row it comments.
  const leads = (a: Element, b: Element) => (is(a, "part") && (is(b, "sub") || is(b, "line"))) || (is(a, "sub") && is(b, "line")) || is(b, "note");
  const newSheet = (after: HTMLElement) => {
    const s = document.createElement("section");
    s.className = "sheet";
    s.style.height = `${sheetHeightPx}px`;
    const table = document.createElement("table");
    table.append(thead.cloneNode(true), document.createElement("tbody"));
    s.append(table);
    after.after(s);
    return s;
  };

  // A closing block taller than a sheet (very long conditions): the sheet grows and Chromium continues it on the next page.
  const flow = (s: HTMLElement) => {
    if (!over(s)) return;
    s.style.height = "auto";
    s.style.overflow = "visible";
    close.style.breakInside = "auto";
  };

  first.style.height = `${sheetHeightPx}px`;
  let sheet = first;
  let tbody = first.querySelector("tbody")!;
  tbody.replaceChildren();
  for (const r of rows) {
    tbody.append(r);
    if (!over(sheet)) continue;
    // The row does not fit: it opens a sheet, and a part or sub row never ends one (it goes with what it introduces).
    const moved = [r];
    for (let p = r.previousElementSibling; p && leads(p, moved[0]); p = p.previousElementSibling) moved.unshift(p);
    if (moved.length === tbody.children.length) continue; // shortcut: a row taller than a whole sheet stays and is cut; not seen in practice
    sheet = newSheet(sheet);
    tbody = sheet.querySelector("tbody")!;
    tbody.append(...moved);
  }

  sheet.append(close);
  if (!over(sheet)) return;
  // The closing block does not fit: it moves to a new sheet with the last sub (and its part if just before),
  // so the total is never alone. Rows are carried from the end only while they still fit with the closing block.
  const rs = [...tbody.children];
  if (rs.length < 2) return flow(sheet);
  let from = rs.map((x) => x.classList.contains("sub")).lastIndexOf(true);
  while (from > 0 && leads(rs[from - 1], rs[from])) from--;
  if (from <= 0) {
    // The last sub fills this whole sheet (or started on an earlier one): carry its last lines, keeping heads with a line.
    from = 1;
    while (from < rs.length - 1 && leads(rs[from - 1], rs[from])) from++;
  }
  sheet = newSheet(sheet);
  const target = sheet.querySelector("tbody")!;
  sheet.append(close);
  // Carried in blocks (a row with the heads before it and its note), so no heading or note is left apart from its row.
  for (let i = rs.length - 1; i >= from; ) {
    let j = i;
    while (j > from && leads(rs[j - 1], rs[j])) j--;
    const block = rs.slice(j, i + 1);
    const firstBlock = target.children.length === 0;
    target.prepend(...block);
    if (!firstBlock && over(sheet)) {
      tbody.append(...block); // it fitted there before the closing block was added
      break;
    }
    i = j - 1;
  }
  flow(sheet);
}

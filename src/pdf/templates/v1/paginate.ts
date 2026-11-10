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
  const isHead = (r: Element | null) => !!r && (r.classList.contains("part") || r.classList.contains("sub"));
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

  first.style.height = `${sheetHeightPx}px`;
  let sheet = first;
  let tbody = first.querySelector("tbody")!;
  tbody.replaceChildren();
  for (const r of rows) {
    tbody.append(r);
    if (!over(sheet)) continue;
    // The row does not fit: it opens a sheet, and a part or sub row never ends one (it goes with its first line).
    const moved = [r];
    for (let p = r.previousElementSibling; isHead(p); p = p!.previousElementSibling) moved.unshift(p!);
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
  if (rs.length < 2) return; // shortcut: a sheet of a single row cannot give one away; not seen in practice
  let from = rs.map((x) => x.classList.contains("sub")).lastIndexOf(true);
  while (from > 0 && isHead(rs[from - 1])) from--;
  if (from <= 0) {
    // The last sub fills this whole sheet (or started on an earlier one): carry its last lines, keeping heads with a line.
    from = 1;
    while (from < rs.length - 1 && isHead(rs[from - 1])) from++;
  }
  sheet = newSheet(sheet);
  const target = sheet.querySelector("tbody")!;
  sheet.append(close);
  for (let i = rs.length - 1; i >= from; i--) {
    target.prepend(rs[i]);
    if (i < rs.length - 1 && over(sheet)) { tbody.append(rs[i]); break; }
  }
}

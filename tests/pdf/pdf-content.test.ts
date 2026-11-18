import { extractText, getDocumentProxy } from "unpdf";
import { buildDocument, type PdfSource } from "@/pdf/document";
import { closeBrowser, withPage } from "@/pdf/browser";
import { TEMPLATES, renderDocument } from "@/pdf/templates";
import { SHEET_PX } from "@/pdf/templates/v1";
import { paginate } from "@/pdf/templates/v1/paginate";
import { exampleParts, longParts, pdfSource, withParts } from "./fixture";

vi.setConfig({ testTimeout: 60_000 });
afterAll(closeBrowser);

// Case- and space-insensitive: CSS uppercases part rows and the thead, letter-spacing splits their letters and long lines wrap.
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const pages = async (src: PdfSource, draft = false) => {
  const pdf = await renderDocument("v1", buildDocument(src, { draft }), null);
  return (await extractText(await getDocumentProxy(pdf), { mergePages: false })).text.map(norm);
};
const has = (page: string, s: string) => page.includes(norm(s));

/** The body after paginate(), measured: for each sheet, the class of its last row and the gap from .close to its foot. */
const sheets = (src: PdfSource) => withPage(async (page) => {
  await page.setContent(TEMPLATES.v1.body(buildDocument(src, { draft: false })));
  await page.evaluate(paginate, SHEET_PX);
  return page.evaluate(() => [...document.querySelectorAll(".sheet")].map((s) => {
    const close = s.querySelector(".close");
    return {
      lastRow: s.querySelector("tbody")?.lastElementChild?.className ?? "",
      closeGap: close ? Math.abs(s.getBoundingClientRect().bottom - close.getBoundingClientRect().bottom) : null,
    };
  }));
});

test("PDF corto: todo el texto visible aparece y nada oculto", async () => {
  const src = pdfSource();
  const doc = buildDocument(src, { draft: false });
  const all = (await pages(src)).join(" ");
  for (const r of doc.rows) expect(all).toContain(norm("text" in r ? r.text : r.title));
  for (const s of ["1.474,99 €", "Transferencia a 60 días", "Asunto: PR-2026000002-R00"]) expect(all).toContain(norm(s));
  expect(all).not.toContain(norm("Línea oculta"));
});

test("PDF largo: 45 líneas con descripciones largas, ninguna se pierde y hay al menos 3 páginas", async () => {
  const src = withParts(longParts());
  const p = await pages(src);
  const all = p.join(" ");
  expect(p.length).toBeGreaterThanOrEqual(3);
  for (const r of buildDocument(src, { draft: false }).rows) expect(all).toContain(norm("text" in r ? r.text : r.title));
  p.slice(1).forEach((page) => expect(has(page, "Denominación")).toBe(true));
});

test("cierre: con una partida de 6 líneas sale en 2 páginas y el cierre queda al pie de la 2", async () => {
  const lines = Array.from({ length: 6 }, (_, i): [string, string, string] => [`Material número ${i + 1}`, "1", "ud"]);
  const src = withParts([["Grupo de bombeo", [["Equipos", lines]]]]);
  const p = await pages(src);
  expect(p.length).toBe(2);
  expect(has(p[1], "Firma y sello")).toBe(true);
  expect(has(p[1], "1.474,99 €")).toBe(true);
  const s = await sheets(src);
  expect(s).toHaveLength(1);
  expect(s[0].closeGap).toBeLessThanOrEqual(1);
});

test("cierre: el ejemplo de pdf-densidades (4 partidas, 19 líneas) sale en 3 páginas y el cierre se lleva la última subpartida", async () => {
  const src = withParts(exampleParts(), { base: "8039", tax: "1688.19", total: "9727.19" });
  const p = await pages(src);
  expect(p.length).toBe(3);
  for (const s of ["Documentación", "Manual de operación", "9.727,19 €"]) expect(has(p[2], s)).toBe(true);
  expect(has(p[1], "9.727,19 €")).toBe(false);
  const s = await sheets(src);
  expect(s.map((x) => x.lastRow)).toEqual(["line", "line"]);
  expect(s[1].closeGap).toBeLessThanOrEqual(1);
});

test("paginación: el largo de 45 líneas no pierde nada, repite la cabecera y ninguna hoja acaba en una partida o subpartida", async () => {
  const src = withParts(longParts());
  const p = await pages(src);
  const all = p.join(" ");
  expect(p.length).toBeGreaterThanOrEqual(3);
  for (const r of buildDocument(src, { draft: false }).rows) if (r.kind === "line") expect(all).toContain(norm(r.text));
  p.slice(1).forEach((page) => expect(has(page, "Cantidad")).toBe(true));
  const s = await sheets(src);
  expect(s.length).toBeGreaterThanOrEqual(2);
  s.forEach((x) => expect(x.lastRow).toBe("line"));
  expect(s.at(-1)!.closeGap).toBeLessThanOrEqual(1);
});

test("paginación: 60 subpartidas sin líneas (GLOBAL u ocultas) no se pierden y el cierre sale al pie", async () => {
  const src = withParts(Array.from({ length: 6 }, (_, p) => [`Partida ${p + 1}`, Array.from({ length: 10 }, (_, s): [string, [string, string, string][]] => [`Subpartida global ${p + 1}.${s + 1}`, []])]));
  const p = await pages(src);
  const all = p.join(" ");
  expect(p.length).toBeGreaterThanOrEqual(3);
  for (const r of buildDocument(src, { draft: false }).rows) if (r.kind === "part" || r.kind === "sub") expect(all).toContain(norm(`${r.number}${r.title}`));
  for (const s of ["1.474,99 €", "Firma y sello"]) expect(has(p.at(-1)!, s)).toBe(true);
  const s = await sheets(src);
  expect(s.length).toBeGreaterThanOrEqual(2);
  expect(s.at(-1)!.closeGap).toBeLessThanOrEqual(1);
});

test("borrador: BORRADOR en la cabecera y como marca de agua", async () => {
  const p = await pages(withParts(longParts()), true);
  p.forEach((page) => expect(page.match(/borrador/g)?.length ?? 0).toBeGreaterThanOrEqual(2));
});

test("paginación: con un comentario en cada línea, ninguna hoja empieza por un comentario, sea cual sea el alto de la hoja", async () => {
  const src = withParts(longParts());
  for (const s of src.quote.sections) for (const c of s.children) c.lines.forEach((l, i) => { l.comment = `Comentario ${c.id}-${i}: tendido por bandeja existente.`; });
  const body = TEMPLATES.v1.body(buildDocument(src, { draft: false }));
  // Many sheet heights, so that some cut falls right before a comment.
  const firsts = await withPage(async (page) => {
    const out: string[] = [];
    for (let h = SHEET_PX - 300; h <= SHEET_PX; h += 6) {
      await page.setContent(body);
      await page.evaluate(paginate, h);
      out.push(...await page.evaluate(() => [...document.querySelectorAll(".sheet tbody")].slice(1).map((t) => t.firstElementChild?.className ?? "")));
    }
    return out;
  });
  expect(firsts.length).toBeGreaterThan(50);
  expect(firsts.filter((c) => c === "note")).toEqual([]);
});

test("paginación: al recolocar el cierre, ninguna hoja acaba en partida o subpartida ni empieza por una nota, sea cual sea el alto", async () => {
  const src = withParts(exampleParts());
  for (const s of src.quote.sections) for (const c of s.children) c.lines.forEach((l, i) => { l.comment = `Comentario ${c.id}-${i}: tendido por bandeja existente.`; });
  const body = TEMPLATES.v1.body(buildDocument(src, { draft: false }));
  const edges = await withPage(async (page) => {
    const out: { h: number; firstIsNote: boolean; lastIsHead: boolean }[] = [];
    // From very short sheets up: the orphan heading only shows where the close barely fits.
    for (let h = 300; h <= SHEET_PX; h += 3) {
      await page.setContent(body);
      await page.evaluate(paginate, h);
      out.push(...(await page.evaluate(() => [...document.querySelectorAll(".sheet tbody")].map((t, i) => ({
        firstIsNote: i > 0 && !!t.firstElementChild?.classList.contains("note"),
        lastIsHead: ["part", "sub"].some((k) => t.lastElementChild?.classList.contains(k)),
      })))).map((e) => ({ h, ...e })));
    }
    return out;
  });
  expect(edges.filter((e) => e.lastIsHead)).toEqual([]);
  expect(edges.filter((e) => e.firstIsNote)).toEqual([]);
});

test("cierre más alto que una hoja: las exclusiones de 8.000 caracteres siguen en la página siguiente sin perder texto", async () => {
  const src = pdfSource();
  const phrases = Array.from({ length: 110 }, (_, i) => `Exclusión ${String(i + 1).padStart(3, "0")}: obra civil y ayudas de albañilería en la zona de bombeo.`);
  src.quote.exclusions = phrases.join(" ");
  expect(src.quote.exclusions.length).toBeGreaterThan(7500);
  const p = await pages(src);
  // The text runs over page breaks, where the footer and the totals column interleave: count the phrases instead.
  const all = p.join("");
  expect(p.length).toBeGreaterThanOrEqual(5);
  expect(all.match(/exclusión/g)?.length).toBe(phrases.length);
  expect(all).toContain(norm(phrases.at(-1)!));
  expect(all).toContain(norm("Transferencia a 60 días."));
  for (const s of ["Total presupuesto", "1.474,99 €", "Firma y sello"]) expect(all).toContain(norm(s));
  const s = await sheets(src);
  expect(s.at(-1)!.closeGap).not.toBeNull();
});

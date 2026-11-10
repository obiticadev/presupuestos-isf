import { extractText, getDocumentProxy } from "unpdf";
import { closeBrowser } from "@/pdf/browser";
import { renderPdf } from "@/pdf/render";

vi.setConfig({ testTimeout: 60_000 });
afterAll(closeBrowser);
const text = async (pdf: Uint8Array) => (await extractText(await getDocumentProxy(pdf), { mergePages: false })).text;
const rows = (n: number) => Array.from({ length: n }, (_, i) => `<tr><td>Fila número ${i + 1}</td></tr>`).join("");
const page = (b: string) => `<!doctype html><html><body><table><thead><tr><th>Cabecera</th></tr></thead><tbody>${b}</tbody></table></body></html>`;

test("renderPdf pagina una tabla larga, repite la cabecera y numera las páginas", async () => {
  const pages = await text(await renderPdf({ body: page(rows(120)), header: "<span style='font-size:8px'>CAB</span>", footer: "<span style='font-size:8px'>Página <span class='pageNumber'></span> de <span class='totalPages'></span></span>" }));
  expect(pages.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i <= 120; i++) expect(pages.join(" ")).toContain(`Fila número ${i}`);
  pages.forEach((p, i) => { expect(p).toContain("Cabecera"); expect(p).toContain("CAB"); expect(p).toContain(`Página ${i + 1} de ${pages.length}`); });
});

test("renderPdf no hace peticiones de red ni ejecuta scripts", async () => {
  const t0 = Date.now();
  const pages = await text(await renderPdf({ body: page(`<tr><td><img src="http://192.0.2.1/x.png">Hola<script>document.body.innerHTML="ROTO"</script></td></tr>`), header: "<span></span>", footer: "<span></span>" }));
  expect(pages.join(" ")).toContain("Hola");
  expect(pages.join(" ")).not.toContain("ROTO");
  expect(Date.now() - t0).toBeLessThan(10_000);
});

test("tres PDF a la vez terminan todos", async () => {
  const r = await Promise.all([1, 2, 3].map((n) => renderPdf({ body: page(rows(n)), header: "<span></span>", footer: "<span></span>" })));
  expect(r.every((pdf) => pdf.byteLength > 1000)).toBe(true);
});

test("beforePrint puede modificar la página con evaluate()", async () => {
  const pages = await text(await renderPdf({
    body: page(rows(1)), header: "<span></span>", footer: "<span></span>",
    beforePrint: (p) => p.evaluate(() => { const el = document.createElement("p"); el.textContent = "AÑADIDO"; document.body.append(el); }),
  }));
  expect(pages.join(" ")).toContain("AÑADIDO");
});

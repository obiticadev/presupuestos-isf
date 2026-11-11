import { buildDocument } from "@/pdf/document";
import { TEMPLATES, renderDocument } from "@/pdf/templates";
import { html, safe } from "@/pdf/templates/v1/html";
import { pdfSource } from "./fixture";

const doc = (draft = false) => buildDocument(pdfSource(), { draft });

test("html escapa los valores salvo SafeHtml", () => {
  expect(html`<p>${`<a href="x">'&'</a>`}</p>`.__html).toBe("<p>&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;</p>");
  expect(html`${safe("<b>")}${[safe("<i>"), safe("</i>")]}${null}`.__html).toBe("<b><i></i>");
});

test("el cuerpo escapa el asunto y lleva thead y break-inside: avoid", () => {
  const d = { ...doc(), title: '<script>alert(1)</script> & "x"' };
  const body = TEMPLATES.v1.body(d);
  expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;");
  expect(body).not.toContain("<script>");
  expect(body).toContain("<thead>");
  expect(body).toContain("break-inside:avoid");
});

test("una nota sale escapada, en su propia fila, en cursiva y conserva sus saltos de línea", () => {
  const d = { ...doc(), rows: [{ kind: "note" as const, of: "line" as const, text: "<b>Medida</b> en obra" }] };
  const body = TEMPLATES.v1.body(d);
  expect(body).toContain('<tr class="note line"><td></td><td colspan="3">&lt;b&gt;Medida&lt;/b&gt; en obra</td></tr>');
  expect(body).toMatch(/tr\.note td\{[^}]*font-style:italic/);
  expect(body).toMatch(/tr\.note td\{[^}]*white-space:pre-line/);
});

test("la nota de la partida lleva fondo de banda y la de la subpartida no lleva sangría de línea", () => {
  const body = TEMPLATES.v1.body(doc());
  expect(body).toMatch(/tr\.note\.part td\{[^}]*background:var\(--band\)/);
  expect(body).toMatch(/tr\.note\.line td:nth-child\(2\),tr\.note\.kit td:nth-child\(2\)\{padding-left:6mm\}/);
});

test("la marca de agua solo en el borrador", () => {
  expect(TEMPLATES.v1.body(doc(false))).not.toContain('class="wm"');
  expect(TEMPLATES.v1.body(doc(true))).toContain('class="wm"');
});

test("cabecera y pie", () => {
  const d = doc();
  const header = TEMPLATES.v1.header(d, null);
  expect(header).toContain("INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL");
  expect(header).toContain("PR-2026000002-R00");
  expect(header).not.toContain("<img");
  expect(TEMPLATES.v1.header(d, { mime: "image/png", base64: "AAAA" })).toContain('src="data:image/png;base64,AAAA"');
  const footer = TEMPLATES.v1.footer(d);
  for (const s of ['class="pageNumber"', 'class="totalPages"', d.company.registryText, d.company.taxId]) expect(footer).toContain(s);
});

test("los datos de empresa vacíos no dejan rótulos ni separadores sueltos", () => {
  const d = doc();
  d.company = { ...d.company, taxId: "", address: "", phone: " ", email: "", registryText: "" };
  const from = TEMPLATES.v1.body(d).match(/<div class="from">(.*?)<\/div>/)![1];
  expect(from).toBe(`<b>${d.company.legalName}</b>`);
  d.company.email = "a@b.c";
  expect(TEMPLATES.v1.body(d)).toContain(`<div class="from"><b>${d.company.legalName}</b><br>a@b.c</div>`);
  const registry = TEMPLATES.v1.footer({ ...d, company: { ...d.company, email: "" } }).match(/<span style="flex:1">(.*?)<\/span>/)![1];
  expect(registry).toBe("");
  for (const s of [from, registry]) { expect(s).not.toContain("CIF"); expect(s).not.toMatch(/·\s*·|^\s*·|·\s*$/); }
  expect(TEMPLATES.v1.footer({ ...d, company: { ...d.company, taxId: "B1" } })).toContain('<span style="flex:1">CIF B1</span>');
});

test("plantilla desconocida", async () => {
  await expect(renderDocument("v9", doc(), null)).rejects.toThrow("Plantilla desconocida: v9");
  await expect(renderDocument("toString", doc(), null)).rejects.toThrow("Plantilla desconocida: toString");
});

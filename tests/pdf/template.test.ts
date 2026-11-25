import { buildDocument } from "@/pdf/document";
import { TEMPLATES, renderDocument } from "@/pdf/templates";
import { html, safe } from "@/pdf/templates/v1/html";
import { stampHtml } from "@/pdf/templates/v1";
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

test("las filas de un conjunto con nota llevan la clase k; su nota, en cursiva, cierra el bloque con raya punteada", () => {
  const d = { ...doc(), rows: [
    { kind: "line" as const, text: "Armario", quantity: "1 ud", kit: true as const },
    { kind: "note" as const, of: "kit" as const, text: "Pruebas", kit: true as const },
  ] };
  const body = TEMPLATES.v1.body(d);
  expect(body).toContain('<tr class="line k">');
  expect(body).toContain('<tr class="note kit k">');
  // A green tint, so it does not look like a partida's grey band; the kit's note stays italic and line-sized.
  expect(body).toMatch(/tr\.k td:not\(:first-child\)\{[^}]*background:#edf5f2/);
  expect(body).toMatch(/tr\.note\.kit td:not\(:first-child\)\{[^}]*dashed/);
  expect(body).not.toMatch(/tr\.note\.kit td:not\(:first-child\)\{[^}]*(font-style|font-size)/);
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
  const registry = TEMPLATES.v1.footer({ ...d, company: { ...d.company, email: "" } }).match(/<span style="flex:1;text-align:center">(.*?)<\/span>/)![1];
  expect(registry).toBe("");
  for (const s of [from, registry]) { expect(s).not.toContain("CIF"); expect(s).not.toMatch(/·\s*·|^\s*·|·\s*$/); }
  expect(TEMPLATES.v1.footer({ ...d, company: { ...d.company, taxId: "B1" } })).toContain('<span style="flex:1;text-align:center">CIF B1</span>');
});

test("la razón social del emisor respeta sus saltos de línea", () => {
  const d = doc();
  d.company = { ...d.company, legalName: "ISF Instalaciones,\r\n Servicios y Formación, S.L. " };
  expect(TEMPLATES.v1.body(d)).toContain("<b>ISF Instalaciones,<br>Servicios y Formación, S.L.</b>");
});

test("la dirección del emisor sale línea a línea y el pie del registro va centrado", () => {
  const d = doc();
  d.company = { ...d.company, address: "C/ Mayor 1\r\n  Madrid " };
  expect(TEMPLATES.v1.body(d)).toContain(`<b>${d.company.legalName}</b><br>C/ Mayor 1<br>Madrid<br>`);
  expect(TEMPLATES.v1.footer(d)).toContain('<span style="flex:1;text-align:center">');
});

test("plantilla desconocida", async () => {
  await expect(renderDocument("v9", doc(), null)).rejects.toThrow("Plantilla desconocida: v9");
  await expect(renderDocument("toString", doc(), null)).rejects.toThrow("Plantilla desconocida: toString");
});

test("stampHtml: sin firmante, el recuadro vacío; con firmante, sello, firma y «Fdo.: nombre» escapado", () => {
  expect(stampHtml(null)).toContain("Firma y sello");
  const s = stampHtml({ name: "Lucía <b>Pardo</b>", signature: "AAAA" });
  expect(s).toContain("data:image/svg+xml;base64,");
  expect(s).toContain("data:image/png;base64,AAAA");
  expect(s).toContain("Fdo.: Lucía &lt;b&gt;Pardo&lt;/b&gt;");
  expect(s).not.toContain("Firma y sello");
});

test("el cuerpo del PDF lleva el bloque de firma del documento", () => {
  expect(TEMPLATES.v1.body({ ...doc(), signer: { name: "Ana", signature: "AAAA" } })).toContain("Fdo.: Ana");
  expect(TEMPLATES.v1.body({ ...doc(), signer: null })).toContain("Firma y sello");
});

test("fila de grupo y líneas agrupadas en el HTML", () => {
  const d = { ...doc(), rows: [
    { kind: "group" as const, title: "Periferia <ET>" },
    { kind: "line" as const, text: "Cabecera", quantity: "1 ud", grouped: true as const },
    { kind: "line" as const, text: "DI 16", quantity: "3 ud", grouped: true as const, last: true as const },
  ] };
  const body = TEMPLATES.v1.body(d);
  expect(body).toContain('<tr class="ghd"><td></td><td colspan="3"><span class="gt">Periferia &lt;ET&gt;</span></td></tr>');
  expect(body).toContain('<tr class="line in"><td></td><td>Cabecera</td>');
  expect(body).toContain('<tr class="line in lst"><td></td><td>DI 16</td>');
  expect(body).toMatch(/tr\.ghd \.gt\{[^}]*text-transform:uppercase/);
});

# Plan 4 · PDF, despliegue y copias de seguridad — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el presupuestador descargue el PDF corporativo de un presupuesto (el mismo siempre para un emitido, con marca de agua para un borrador) y que la aplicación quede desplegada en Dokploy en `http://192.168.105.83:3100`, con copias diarias en el propio servidor y una restauración probada (diseño 5.11).

**Architecture:** El PDF se genera con Chromium (`playwright-core`) a partir de una plantilla HTML/CSS versionada (`src/pdf/templates/v1`) y de un modelo plano ya formateado (`buildDocument`), construido desde la instantánea del emitido o desde los datos vivos del borrador. El PDF del emitido se genera justo después de emitir, se guarda en `DATA_DIR/pdf` con su SHA-256 y se regenera desde la instantánea si falta. El despliegue usa el `compose.yaml` actual con Chromium en la imagen, y la documentación de operación cubre Dokploy, HTTPS, copias y restauración.

**Tech Stack:** el de los planes 1 a 3, más `playwright-core` 1.64.1 y `@fontsource-variable/archivo` 5.3.0 (producción), y `unpdf` 1.9.1 (solo pruebas).

**Spec:** `docs/superpowers/specs/2026-11-10-plan-4-pdf-despliegue-design.md` (diseño de este plan) y `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md` (secciones 5.7, 5.9, 5.12 y 6). Maqueta: `docs/diseno/maquetas/pdf.html`.

**Rama:** `plan-4-pdf-despliegue`, desde `master` con los planes 1 a 3 fusionados.

## Global Constraints

- **Siguen vigentes las reglas de los planes 1 a 3:**
  - versiones exactas;
  - código en inglés e interfaz en español;
  - permisos en el servidor;
  - importes con `Decimal` y `formatDecimalEs`;
  - historial con `logAction` en la misma transacción;
  - pruebas con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`;
  - pruebas de interfaz con Claude in Chrome antes de cerrar una tarea con interfaz.
- **Dependencias nuevas, y ninguna más:** `playwright-core@1.64.1` y `@fontsource-variable/archivo@5.3.0` en `dependencies`; `unpdf@1.9.1` en `devDependencies`.
- **Navegador en desarrollo:** `pnpm exec playwright-core install chromium-headless-shell`. Las pruebas que lo necesitan fallan con un mensaje que lo dice; no se saltan.
- **Documento (spec 5.7):**
  - A4;
  - cabecera con logo, «INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL» y la referencia;
  - pie con fecha, datos registrales, CIF y «Página X de Y»;
  - letra fija de 10 pt, sin encoger nunca;
  - hoja de partidas en la variante B (diseño 5.3.1): paginación propia, `thead` repetido en cada hoja y ninguna fila partida;
  - cierre (condiciones, fecha, totales y hueco de firma y sello) pegado al pie de la última hoja, y nunca solo en una hoja;
  - importes «21.628,62 €»;
  - los borradores llevan la marca de agua «BORRADOR» y «BORRADOR» en lugar de la referencia;
  - sin firma digital: solo el hueco en blanco «Firma y sello» para firmar y sellar a mano.
- **Inmutabilidad:** el PDF de un emitido sale solo de `IssuedDocument.snapshot` y de la plantilla de su `templateVersion`. Nunca de `getQuote()` ni de `getSettings()` de hoy, salvo el logo cuando el de la instantánea ya no existe.
- **Chromium:**
  - un navegador por proceso;
  - un contexto por PDF con `javaScriptEnabled: false` y toda la red abortada;
  - como mucho 2 PDF a la vez;
  - 30 s de tiempo máximo.
- **Archivos:** `DATA_DIR/pdf/<año>/<referencia>.pdf`, escritos con un temporal y `rename`. Logos en `DATA_DIR/uploads/logo-<12 hex del sha256>.<png|jpg>`.
- **Historial:**
  - entidad `quote`;
  - acción nueva `download` «Descarga» («Descarga de PR-…»);
  - acción nueva `pdf` «PDF» («PDF regenerado desde la instantánea»).

## Review Focus

1. **Un emitido cuyo archivo PDF ha desaparecido** (volumen perdido o restauración solo de la base de datos): la descarga lo regenera desde la instantánea, igual en contenido, y lo anota → prueba en la Tarea 5.
2. **Dos descargas simultáneas del mismo emitido sin PDF aún, o un archivo cuyo hash ya no coincide** (copias de base de datos y de volumen de horas distintas): las dos descargas reciben un PDF válido, en la base queda un `sha256` igual al del archivo final y un archivo que no coincide se regenera desde la instantánea, sin error → pruebas en la Tarea 5.
3. **Un asunto, una descripción o un nombre de cliente con `<`, `&` o comillas** (o con `<img src="http://…">`): sale como texto literal en el PDF y Chromium no hace ninguna petición de red → pruebas en las Tareas 1 y 3.
4. **Un presupuesto largo (45 líneas o más, con descripciones de varias líneas):** ninguna fila se pierde ni se parte, y la cabecera de tabla se repite → prueba en la Tarea 3.
5. **El logo cambia después de emitir:** el PDF de lo ya emitido (regenerado o no) sigue con el logo de su día → prueba en la Tarea 4.

---

## Estructura de archivos

```
src/pdf/browser.ts                  withPage(): navegador único, semáforo de 2, contexto sin JS ni red
src/pdf/render.ts                   renderPdf({ body, header, footer, beforePrint? }): Uint8Array
src/pdf/document.ts                 PdfSource, PdfDocument, buildDocument(): puro
src/pdf/fonts.ts                    archivoFontFace(): @font-face con la fuente en base64 (leída una vez)
src/pdf/templates/index.ts          TEMPLATES, renderTemplate(version, doc, logo)
src/pdf/templates/v1/html.ts        html`…`, safe(), escapeHtml()
src/pdf/templates/v1/styles.ts      CSS de impresión
src/pdf/templates/v1/index.ts       v1: { body(doc), header(doc, logo), footer(doc) }
src/modules/quotes/pdf.ts           ensureIssuedPdf(), draftPdf(), pdfResponse(), pdfFileName()
src/modules/settings/service.ts     saveLogo() por contenido; readLogo(path)
src/app/api/presupuestos/[id]/pdf/route.ts
src/app/(app)/presupuestos/[id]/lifecycle-panel.tsx, issue-panel.tsx   botones de PDF
src/app/(app)/page.tsx, clientes/[id]/page.tsx                         enlace «PDF» por fila
src/app/(app)/admin/historial/page.tsx                                 acciones download y pdf
Dockerfile, compose.yaml (puerto 3100 y servicio backup), scripts/backup.sh y scripts/restore.sh (nuevos)
docs/despliegue.md (nuevo), docs/operacion.md, README.md, AGENTS.md, docs/superpowers/progreso.md
tests/pdf/*.test.ts, tests/quotes/pdf.test.ts, tests/settings/logo.test.ts
```

---

### Task 1: Chromium y renderizado básico

**Files:**
- Create: `src/pdf/browser.ts`, `src/pdf/render.ts`
- Modify: `package.json` (dependencias de Global Constraints), `README.md` y `docs/operacion.md` (instalar el navegador en desarrollo)
- Test: `tests/pdf/render.test.ts`

**Interfaces:**
- Produces:
  - `withPage<T>(fn: (page: import("playwright-core").Page) => Promise<T>): Promise<T>`: abre un contexto nuevo (`javaScriptEnabled: false`, `context.route("**", r => r.abort())`), cede la página y cierra el contexto en `finally`. Como mucho 2 a la vez, y espera si hay más. Si el navegador se desconecta, el siguiente uso lanza otro. Si el ejecutable no está, lanza `Error("Falta el navegador del PDF: ejecuta «pnpm exec playwright-core install chromium-headless-shell»")`.
  - `renderPdf(input: { body: string; header: string; footer: string; beforePrint?: (page: Page) => Promise<void> }): Promise<Uint8Array>`: `page.setContent(body, { waitUntil: "load" })`, después `beforePrint?.(page)` (la paginación propia de la Tarea 3) y después `page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: header, footerTemplate: footer, margin: { top: "22mm", bottom: "15mm", left: "18mm", right: "18mm" } })`. Los márgenes son los de la cabecera baja de la variante B (diseño 5.3.1): 18 + 4 mm arriba y 11 + 4 mm abajo. Tiempo máximo de 30 s, y si se pasa, `Error("No se pudo generar el PDF")`.
  - `closeBrowser(): Promise<void>`, para las pruebas (`afterAll`).

- [ ] **Step 1: Instalar las dependencias y el navegador.** Run: `pnpm add playwright-core@1.64.1 @fontsource-variable/archivo@5.3.0 && pnpm add -D unpdf@1.9.1 && pnpm exec playwright-core install chromium-headless-shell`. Expected: `package.json` con las tres versiones exactas y el navegador en `~/.cache/ms-playwright`. Si 1.64.1 no admite `chromium-headless-shell`, usar `install --only-shell chromium` y anotarlo en la Tarea 7.
- [ ] **Step 2: Escribir las pruebas que fallan**

```ts
import { extractText, getDocumentProxy } from "unpdf";
import { closeBrowser } from "@/pdf/browser";
import { renderPdf } from "@/pdf/render";

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
```

- [ ] **Step 3: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/pdf/render.test.ts`. Expected: FAIL (`@/pdf/render` no existe).
- [ ] **Step 4: Implementar `browser.ts` y `render.ts`** con las firmas de Interfaces. Lanzar con `chromium.launch({ headless: true })` de `playwright-core`; el semáforo es un contador con una cola de promesas.
- [ ] **Step 5: Ejecutar y comprobar que pasan.** Run: `pnpm test tests/pdf/render.test.ts`. Expected: PASS.
- [ ] **Step 6a: Comprobar que `page.evaluate()` funciona con `javaScriptEnabled: false`** (riesgo del diseño, 5.3.1): una prueba con `beforePrint` que añade un `<p>` por `evaluate` y lo encuentra en el texto del PDF. Si no funciona, el contexto activa JavaScript y la prueba de «no ejecuta scripts» pasa a comprobar solo que no hay red. Anotarlo en el commit.
- [ ] **Step 6: Comprobar la fuente de la cabecera (riesgo del diseño, 5.3).** Generar un PDF cuyo cuerpo declare un `@font-face` de prueba y abrirlo. Si la cabecera no usa esa fuente, la Tarea 3 incrusta el `@font-face` también en `header` y `footer`. Anotar el resultado en el mensaje del commit.
- [ ] **Step 7: Documentar** en `README.md` (Requisitos) y `docs/operacion.md` (Arranque local) la orden para instalar el navegador.
- [ ] **Step 8: Commit** — `git commit -m "feat(pdf): Chromium compartido sin red ni JavaScript y renderizado A4 con cabecera y pie"`

---

### Task 2: Modelo del documento

**Files:**
- Create: `src/pdf/document.ts`
- Test: `tests/pdf/document.test.ts`

**Interfaces:**
- Consumes: la forma de `IssuedDocument.snapshot` (plan 3, `issueQuote`): `{ company: CompanySettings sin id ni updatedAt; quote: QuoteDetail & Quote }` pasado por `JSON.parse(JSON.stringify(...))`, con importes como texto y fechas ISO.
- Produces:
  - `type PdfSource = { company: { legalName: string; taxId: string; address: string; phone: string; email: string; registryText: string; logoPath: string | null; letterGreeting: string; letterIntro: string; letterClosing: string; letterPlace: string }; quote: SnapshotQuote }`. `SnapshotQuote` declara solo los campos que se leen: `reference`, `date`, `subject`, `paymentTerms`, `exclusions`, `validityDays`, `client { legalName, fiscalAddress }`, `location { name, address, city, province } | null`, `contact { name } | null`, `sections[] { id, title, children[] { id, title, mode, lines[] { description, quantity, unitName, visible } } }` y `totals { sections, subsections, base, total, taxes[] { name, ratePct, amount } }`.
  - `type PdfRow = { kind: "part" | "sub"; number: string; title: string; total: string } | { kind: "line"; text: string; quantity: string }`.
  - `type PdfDocument = { draft: boolean; reference: string; shortDate: string; longDate: string; company: PdfSource["company"]; recipient: { name: string; place: string; address: string[]; attention: string | null }; letter: { place: string; greeting: string; intro: string; closing: string[] }; clientName: string; title: string; rows: PdfRow[]; totals: { base: string; taxes: { label: string; amount: string }[]; total: string }; conditions: { exclusions: string; paymentTerms: string; validity: string }; place: string }`.
  - `buildDocument(source: PdfSource, opts: { draft: boolean }): PdfDocument`, pura.
  - `toPdfSource(company: unknown, quote: unknown): PdfSource`: JSON round-trip, para el borrador en vivo.

- [ ] **Step 1: Escribir las pruebas que fallan.** Usan un `PdfSource` fijo escrito en la prueba (sin BD). Casos:
  - `buildDocument(src, { draft: false })` con:
    - una subpartida «por suma» de 2 líneas visibles y 1 oculta;
    - una subpartida «precio global».

    Esperado:
    - `rows` = `[part "1" «Grupo de bombeo» "639,00 €", sub "1.1" … "604,00 €", line «Bomba…» "2 ud", line «Manguera…» "40 m", sub "1.2" … "35,00 €"]`: la línea oculta no aparece;
    - `totals` = `{ base: "1.219,00 €", taxes: [{ label: "IVA 21 %", amount: "255,99 €" }], total: "1.474,99 €" }` a partir de `"1219"`, `"255.99"` y `"1474.99"`;
    - cantidad `"1.5"` con unidad `"h"` → `"1,5 h"`; con unidad vacía → `"1,5"`.
  - Destinatario:
    - con ubicación con dirección → `address` = `["Ctra. de Toledo, km 4", "28300 Aranjuez (Madrid)"]`, usando ciudad y provincia;
    - sin dirección → las líneas de `client.fiscalAddress`;
    - con contacto → `attention` = `"A la atención de Ana López"`.
  - Fechas: `date` `"2026-11-09T00:00:00.000Z"` → `shortDate` `"9/11/2026"`, `longDate` `"9 de noviembre de 2026"`, `place` `"Alcalá de Henares a 9 de noviembre de 2026"`.
  - Carta: `intro` termina en `" ampliación del grupo de bombeo."` (la introducción + `subject` + punto); `closing` parte `letterClosing` por líneas en blanco.
  - Validez: `"30 días"`.
  - Borrador: `draft: true` → `reference` `"BORRADOR"`.
  - Partida sin título → `title` `"Sin título"`.
- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/pdf/document.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `document.ts`.**
  - Números de partida `"${i+1}"` y de subpartida `"${i+1}.${j+1}"`, como el editor.
  - Importes con `formatDecimalEs(x)` + `" €"`; cantidades con `formatDecimalEs(q, { min: 0, max: 4 })`.
  - Etiqueta de impuesto: `"${name} ${formatDecimalEs(ratePct, { min: 0, max: 2 })} %"`.
  - Fecha larga con `Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })`: la fecha del presupuesto es una fecha sin hora guardada a medianoche UTC.
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test tests/pdf/document.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(pdf): modelo del documento desde la instantánea, con importes y fechas ya formateados"`

---

### Task 3: Plantilla v1

**Files:**
- Create: `src/pdf/fonts.ts`, `src/pdf/templates/index.ts`, `src/pdf/templates/v1/{html,styles,index,paginate}.ts`
- Test: `tests/pdf/template.test.ts`, `tests/pdf/pdf-content.test.ts`

**Interfaces:**
- Consumes: `PdfDocument` (Tarea 2) y `renderPdf` (Tarea 1).
- Produces:
  - `html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml`: escapa cada valor (`& < > " '`) salvo que sea `SafeHtml` o un array de `SafeHtml`.
  - `safe(s: string): SafeHtml`.
  - `type SafeHtml = { readonly __html: string }`.
  - `archivoFontFace(): string`: un `@font-face { font-family: Archivo; src: url(data:font/woff2;base64,…) }` leído una vez de `@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2`. Si ese nombre de archivo no existe en 5.3.0, se usa el `latin` variable que traiga el paquete.
  - `type Template = { body(doc: PdfDocument): string; header(doc: PdfDocument, logo: { mime: string; base64: string } | null): string; footer(doc: PdfDocument): string }`.
  - `TEMPLATES: Record<"v1", Template>`.
  - `renderDocument(version: string, doc: PdfDocument, logo: { mime: string; base64: string } | null): Promise<Uint8Array>`: lanza `Error("Plantilla desconocida: …")` si la versión no existe.
- La maqueta `docs/diseno/maquetas/pdf.html` es la referencia visual: márgenes, filetes, banda de partida, marca de agua al 7 % y en diagonal.
- **Hoja de partidas (diseño 5.3.1, elegida por el usuario):** solo la variante B de `docs/diseno/maquetas/pdf-densidades.html`, que es su referencia visual y ya hace este mismo reparto en el navegador. No hay variantes ni `Density`.
  - `paginate(sheetHeightPx: number): void` en `v1/paginate.ts` es autocontenida, porque se serializa para `page.evaluate`. Reparte las filas del `tbody` en hojas `.sheet` de esa altura, cada una con su `thead` copiado.
  - Reglas de `paginate`: una fila que no cabe abre hoja; una partida o subpartida al final de una hoja pasa a la siguiente con su primera línea; el cierre va con `margin-top: auto` en la última hoja, y si no cabe pasa a una hoja nueva con la última subpartida (y su partida si va justo antes).
  - `renderDocument` llama a `renderPdf` con `beforePrint: (p) => p.evaluate(paginate, mmToPx(297 - 22 - 15))`.
  - Cierre: izquierda, condiciones y debajo lugar y fecha; derecha, totales y debajo el recuadro «Firma y sello» de unos 22 mm de alto. Sin total junto al título.

- [ ] **Step 1: Escribir las pruebas de la plantilla (texto, sin Chromium)**
  - `TEMPLATES.v1.body(doc)` con `title` `'<script>alert(1)</script> & "x"'` contiene `&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;` y no `<script>`.
  - Contiene `<thead>` y `break-inside: avoid`.
  - Con `draft: false` no contiene `class="wm"`; con `draft: true`, sí.
  - `header(doc, null)` contiene `INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL` y la referencia.
  - `footer(doc)` contiene `class="pageNumber"`, `class="totalPages"`, `doc.company.registryText` y `doc.company.taxId`.
- [ ] **Step 2: Escribir las pruebas del contenido del PDF real (spec 6)**

```ts
test("PDF corto: todo el texto visible aparece y nada oculto", async () => { /* doc de la Tarea 2 → renderDocument("v1", doc, null) → extractText: contiene cada row.text y row.title, "1.474,99 €", "Transferencia a 60 días", "Asunto: PR-2026000002-R00"; no contiene la descripción oculta */ });
test("PDF largo: 45 líneas con descripciones largas, ninguna se pierde y hay al menos 3 páginas", async () => { /* 3 partidas × 15 líneas «Línea 01 … texto de 120 caracteres» → todas presentes; pages >= 3; "Denominación" en cada página a partir de la 2 */ });
test("cierre: con una partida de 6 líneas sale en 2 páginas y el cierre queda al pie de la 2", async () => { /* pages === 2; la página 2 contiene "Firma y sello" y el total; en el DOM tras paginate, |bottom(.close) - bottom(.sheet)| <= 1 px */ });
test("cierre: el ejemplo de pdf-densidades (4 partidas, 19 líneas) sale en 3 páginas y el cierre se lleva la última subpartida", async () => { /* pages === 3; la página 3 contiene "Documentación", "Manual de operación" y "9.727,19 €"; la 2 no contiene "9.727,19 €" */ });
test("paginación: el largo de 45 líneas no pierde nada, repite la cabecera y ninguna hoja acaba en una partida o subpartida", async () => { /* pages >= 3; todas las líneas presentes; "Cantidad" en cada página desde la 2; en el DOM, el último tr de cada .sheet es una línea */ });
test("borrador: BORRADOR en la cabecera y como marca de agua", async () => { /* draft: true → el texto contiene "BORRADOR" al menos una vez por página */ });
```

- [ ] **Step 3: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/pdf/template.test.ts tests/pdf/pdf-content.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implementar `html.ts`, `fonts.ts`, `styles.ts`, `v1/index.ts` y `templates/index.ts`.** Hoja 1, la carta, con `break-after: page`. Hoja 2 y siguientes como la variante B de `pdf-densidades.html`, con `paginate`, la cabecera baja y sus márgenes en todo el documento. Cabecera y pie con estilos en línea y tamaños explícitos, como exige Chromium. Si la Tarea 1, Step 6, vio que la fuente no llega a la cabecera, se repite `archivoFontFace()` dentro de `header` y `footer`.
- [ ] **Step 5: Ejecutar y comprobar que pasan.** Run: `pnpm test tests/pdf`. Expected: PASS.
- [ ] **Step 6: Revisión visual.** Guardar el PDF corto y el largo en `.superpowers/` y compararlos con la maqueta en Chrome: logo, lema en una línea, banda de partidas, cabecera de tabla repetida y ninguna fila cortada.
- [ ] **Step 7: Commit** — `git commit -m "feat(pdf): plantilla v1 con carta, partidas, totales y condiciones, fuente incrustada y marca de agua"`

---

### Task 4: Logo por contenido

**Files:**
- Modify: `src/modules/settings/service.ts` (`saveLogo`, nueva `readLogo`)
- Test: `tests/settings/logo.test.ts` (nuevo, o el archivo de settings que ya pruebe `saveLogo`)

**Interfaces:**
- Produces:
  - `saveLogo(...)` guarda en `uploads/logo-${sha256(bytes).slice(0, 12)}.${kind}` y no borra nada. La firma no cambia.
  - `readLogo(logoPath: string | null): Promise<{ mime: string; base64: string } | null>`: lee `DATA_DIR/<logoPath>`. Si no existe, lee el `logoPath` actual de la configuración y escribe `console.warn("pdf: falta el logo …; se usa el actual")`. Si tampoco hay, devuelve `null`.

- [ ] **Step 1: Escribir las pruebas que fallan** (con `process.env.DATA_DIR` apuntando a un directorio temporal en `beforeEach`):
  - guardar el logo A y después el B → existen los dos archivos, `logoPath` apunta al de B y los nombres coinciden con `/^uploads\/logo-[0-9a-f]{12}\.(png|jpg)$/`;
  - `readLogo(rutaDeA)` devuelve los bytes de A en base64;
  - con la ruta borrada, `readLogo(rutaDeA)` devuelve los bytes del logo actual (B);
  - `readLogo(null)` sin logo configurado → `null`.
- [ ] **Step 2: Ejecutar y comprobar que fallan.**
- [ ] **Step 3: Implementar.** El hash con `node:crypto`. `/api/logo` sigue igual.
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test tests/settings`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(settings): el logo se guarda por contenido y no se sobrescribe, para que el PDF de un emitido conserve el suyo"`

---

### Task 5: PDF del emitido y del borrador

**Files:**
- Create: `src/modules/quotes/pdf.ts`
- Modify: `src/modules/quotes/actions.ts` (`issueAction`)
- Test: `tests/quotes/pdf.test.ts`

**Interfaces:**
- Consumes:
  - `buildDocument` y `toPdfSource` (Tarea 2);
  - `renderDocument` (Tarea 3);
  - `readLogo` (Tarea 4);
  - `issueQuote` y `IssuedDocument` (plan 3);
  - `getQuote` y `getSettings`.
- Produces:
  - `ensureIssuedPdf(actor: CurrentUser | null, quoteId: string): Promise<{ path: string; sha256: string; bytes: Uint8Array }>`, dentro de `prisma.$transaction(fn, { timeout: 60_000 })` que empieza con `SELECT id FROM "IssuedDocument" WHERE "quoteId" = $1 FOR UPDATE`, para que dos llamadas del mismo presupuesto se pongan en cola:
    - si el presupuesto es un borrador, `ValidationError({ _: "Un borrador no tiene PDF emitido" })`;
    - si el archivo existe y su SHA-256 es igual al de la base, lo devuelve sin regenerar;
    - si falta o no coincide, lo genera desde `snapshot` + `templateVersion` + `readLogo(snapshot.company.logoPath)`, lo escribe con un temporal y `rename`, y guarda `pdfPath` y `sha256`;
    - si `pdfPath` ya estaba, registra `logAction` acción `pdf`, «PDF regenerado desde la instantánea: faltaba el archivo» o «…: el archivo no coincidía», con `userId` del actor o `null`.
  - `readIssuedPdf(actor: CurrentUser, quoteId: string): Promise<Uint8Array>`: `ensureIssuedPdf` y registra `download` «Descarga de PR-…».
  - `draftPdf(quoteId: string): Promise<Uint8Array>`: desde `getSettings()` + `getQuote()` vía `toPdfSource`, con `draft: true` y la plantilla `TEMPLATE_VERSION`. No guarda nada.
  - `pdfFileName(q: { reference: string | null; client: { legalName: string } }): string`: `"PR-2026000002-R00.pdf"`, o `"BORRADOR-Conservas-Ribera-S-A.pdf"` (solo `[A-Za-z0-9-]`, sin acentos).
  - `pdfResponse(user: CurrentUser | null, quoteId: string): Promise<Response>`:
    - 401 sin usuario y 404 si no existe;
    - emitido → `readIssuedPdf`; borrador → `draftPdf`;
    - cabeceras `content-type: application/pdf`, `content-disposition: inline; filename="…"` y `cache-control: private, no-store`;
    - un error de generación → 500 con «No se pudo generar el PDF».
- `issueAction` pasa a: `const q = await issueQuote(actor, id); await ensureIssuedPdf(actor, q.id).catch((e) => console.error("pdf: …", e));`. La emisión no falla aunque falle el PDF.

- [ ] **Step 1: Escribir las pruebas que fallan** (`DATA_DIR` temporal; `completeDraft` + `issueQuote` del plan 3):
  - `ensureIssuedPdf` tras emitir:
    - el archivo existe en `pdf/<año>/PR-<año>000001-R00.pdf`;
    - `sha256` en la base = SHA-256 del archivo;
    - una segunda llamada devuelve el mismo `sha256` y no escribe (la fecha de modificación no cambia).
  - Borrar el archivo y llamar otra vez → se regenera, `extractText` contiene las mismas descripciones de línea y el historial tiene una entrada `pdf`.
  - Dos `ensureIssuedPdf` a la vez sin archivo previo → los dos resuelven, el segundo no regenera (una sola escritura) y `sha256` de la base = SHA-256 del archivo final.
  - Cambiar el precio del catálogo y la razón social de la empresa después de emitir, borrar el PDF y regenerar → el texto sigue con el precio y la razón social de la instantánea.
  - `readIssuedPdf` → el historial tiene `download` «Descarga de PR-…».
  - Con el archivo alterado (un byte añadido), `readIssuedPdf` devuelve un PDF válido regenerado. `sha256` de la base = SHA-256 del archivo nuevo, y el historial tiene `pdf` «…: el archivo no coincidía».
  - `pdfResponse(null, id)` → 401; `pdfResponse(user, "no-existe")` → 404.
  - `pdfResponse(user, borrador)` → 200 con `application/pdf`, el texto contiene «BORRADOR» y no se crea ningún archivo en `DATA_DIR/pdf`.
  - `pdfFileName` con «Conservas Ribera, S.A.» → `"BORRADOR-Conservas-Ribera-S-A.pdf"`.
- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/quotes/pdf.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `pdf.ts` y el cambio en `issueAction`.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test`. Expected: PASS, todas.
- [ ] **Step 5: Commit** — `git commit -m "feat(quotes): PDF del emitido generado una vez desde la instantánea, con hash, regeneración y vista previa del borrador"`

---

### Task 6: Descarga e interfaz

**Files:**
- Create: `src/app/api/presupuestos/[id]/pdf/route.ts`
- Modify:
  - `src/app/(app)/presupuestos/[id]/lifecycle-panel.tsx` («Descargar PDF» en `IssuedPanel`);
  - `src/app/(app)/presupuestos/[id]/issue-panel.tsx` («Vista previa (PDF)» encima de «Emitir»);
  - `src/app/(app)/page.tsx` (enlace «PDF» en la columna de referencia de los emitidos);
  - `src/app/(app)/clientes/[id]/page.tsx` (lo mismo en la lista de presupuestos);
  - `src/app/(app)/admin/historial/page.tsx` (`download: "Descarga"` y `pdf: "PDF"`).
- Test: Chrome (interfaz); la lógica ya la prueba la Tarea 5.

**Interfaces:**
- Consumes: `pdfResponse` (Tarea 5) y `getCurrentUser` (`@/modules/auth/session`).
- Produces: `GET /api/presupuestos/[id]/pdf`, con `export const dynamic = "force-dynamic"` y el cuerpo `return pdfResponse(await getCurrentUser(), (await params).id)`.

- [ ] **Step 1: Implementar la ruta y los enlaces.** Los enlaces son `<a className="btn" href="/api/presupuestos/<id>/pdf" target="_blank" rel="noopener">`: no son acciones de servidor, porque solo leen.
- [ ] **Step 2: Comprobar tipos y lint.** Run: `pnpm exec tsc --noEmit && pnpm lint`. Expected: sin errores.
- [ ] **Step 3: Prueba en Chrome** con `pnpm dev`:
  1. **Borrador:** «Vista previa (PDF)» abre un PDF con «BORRADOR» y la marca de agua.
  2. **Emitir:** «Descargar PDF» abre el PDF con la referencia, y el historial muestra la descarga.
  3. **Logo:** cambiar el logo y volver a descargar el emitido → sale el mismo PDF (mismo SHA-256 en la base).
  4. **Listado y ficha del cliente:** el enlace «PDF» funciona.
  5. **Sin sesión:** en una ventana privada, la URL da 401.
- [ ] **Step 4: Commit** — `git commit -m "feat(quotes): descarga del PDF y vista previa del borrador desde el editor, el listado y la ficha del cliente"`

---

### Task 7: Imagen Docker con Chromium y Compose para Dokploy

**Files:**
- Modify: `Dockerfile` (etapa `runtime`), `compose.yaml` (`app` publica `${APP_PORT:-3100}:3000`; servicio `backup` nuevo; `mem_limit` comentado)
- Create: `scripts/backup.sh`, `scripts/restore.sh`
- Test: prueba manual de la imagen y de una copia con restauración en local

**Interfaces:**
- Produces:
  - imagen `runtime` con `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` y el *headless shell* de Chromium 1.64.1 instalado con `--with-deps`, como root y antes de `USER node`, con permisos de lectura para `node`;
  - servicio `backup` (diseño 5.11): `image: postgres:17`, `TZ=Europe/Madrid`, `PGHOST=db` y la contraseña de la base de datos por variable, `appdata` montado en `/data:ro`, `${BACKUP_DIR:-/srv/presupuestos-backups}` en `/backups`, los dos scripts montados o copiados y `command: /scripts/backup.sh loop`;
  - `backup.sh loop|now`: en modo `loop`, espera hasta las 02:00 y repite cada día. Cada copia escribe `db/presupuestos-AAAAMMDD-HHMM.dump` (`pg_dump -Fc`) y `appdata/appdata-AAAAMMDD-HHMM.tar.gz`, primero en un archivo `.tmp` y después con `mv`, para que nunca quede una copia a medias con nombre válido. Conserva las 30 más recientes de cada tipo. Con `set -eu`, y un fallo se escribe en el log del contenedor sin pararlo;
  - `restore.sh <AAAAMMDD-HHMM>`: exige que `app` esté parada, hace `pg_restore --clean --if-exists` y vacía y extrae `appdata`.

- [ ] **Step 1: Cambiar el `Dockerfile` y `compose.yaml`, y escribir los dos scripts.** Comprobar que `.next/standalone/node_modules` incluye `playwright-core`. Si no, copiarlo en la etapa `runtime` desde la `build`.
- [ ] **Step 2: Construir y arrancar.** Run: `BACKUP_DIR=./.backups docker compose up -d --build`. Expected: `migrate` termina con «Exited (0)», `app` queda «healthy», `backup` está «running» y `curl localhost:3100/api/health` devuelve `{"status":"ok"}`.
- [ ] **Step 3: PDF dentro del contenedor.** Crear un administrador con `docker compose exec -e ADMIN_PASSWORD=… app node scripts/admin.mjs create …`. En Chrome, emitir un presupuesto y descargar su PDF. Comprobar que `docker compose exec app ls /data/pdf/<año>` lo muestra.
- [ ] **Step 4: Persistencia.** Ejecutar `docker compose down` (sin `-v`), volver a levantarlo y comprobar que el presupuesto y su PDF siguen. Después, un `up -d --build` de nuevo, que simula un redespliegue, y la misma comprobación.
- [ ] **Step 5: Copia y restauración en local.**
  - `docker compose exec backup /scripts/backup.sh now` deja un `.dump` y un `.tar.gz` en `./.backups`.
  - Emitir otro presupuesto, parar `app` y ejecutar `docker compose run --rm backup /scripts/restore.sh <fecha>`.
  - Arrancar `app` y comprobar que el segundo presupuesto ya no está y que el primero descarga su PDF con el mismo SHA-256.
  - Con 31 copias falsas en `./.backups/db`, una copia más deja 30.
- [ ] **Step 6: Comprobar los puertos:** `docker compose config` publica solo `3100:3000` en `app`; `db` y `backup` no publican nada.
- [ ] **Step 7: Commit** — `git commit -m "build: Chromium en la imagen, app en el puerto 3100 y contenedor de copias diarias con restauración"`

---

### Task 8: Despliegue, copias, restauración y cierre

**Files:**
- Create: `docs/despliegue.md`
- Modify: `docs/operacion.md`, `README.md`, `AGENTS.md`, `docs/superpowers/progreso.md`

**Alcance (decidido por el usuario, diseño 5.11):** el agente **despliega de verdad** con la API de Dokploy, después de fusionar el PR en `master`.

Pasos en el servidor, todos por la API (`x-api-key` desde `~/.dokploy-token`):
1. `compose.update` del servicio `F5SwbOFCyMb7tDSn0xQZk`: `composePath: "./compose.yaml"` y las variables `POSTGRES_PASSWORD` y `BETTER_AUTH_SECRET` (aleatorias, generadas en el momento y que no se escriben en ningún archivo del repositorio), `BETTER_AUTH_URL=http://192.168.105.83:3100` y `BACKUP_DIR=/srv/presupuestos-backups`.
2. `compose.deploy` y seguir el despliegue hasta que termine. `curl http://192.168.105.83:3100/api/health` devuelve `{"status":"ok"}`.
3. Primer administrador. Con SSH: `docker exec` en el contenedor `app`. Sin SSH: una tarea puntual en la pestaña Schedules de Dokploy. Se le da al usuario la contraseña inicial y se le pide que la cambie.
4. Emisión de prueba en Chrome, desde un equipo de la oficina, y descarga del PDF.
5. Reinicio del servicio y redespliegue sin pérdida de datos.
6. Copia en el momento y **prueba de restauración** en un proyecto aparte, «presupuestos-restore». Necesita SSH al servidor, con la clave `~/.ssh/isf_dokploy` autorizada. Sin SSH, este paso queda pendiente y se dice así al cerrar.

**Contenido de `docs/despliegue.md`**, según el diseño, sección 5.8 a 5.10, en este orden y con órdenes copiables:

1. **Requisitos del servidor:** Dokploy 0.22 o posterior, y unos 2 GB de RAM libres para la app con Chromium.
2. **Aplicación Compose** desde GitHub: `master` y `compose.yaml`.
3. **Variables:** `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://192.168.105.83:3100`, `BACKUP_DIR` y, si hace falta, `APP_PORT`.
4. **Acceso** por `http://192.168.105.83:3100`, sin dominio. Cómo pasar más adelante a un dominio con HTTPS (CA interna o Let's Encrypt DNS-01), quitando el puerto publicado.
5. **Primer administrador** dentro del contenedor.
6. **Copias:** el contenedor `backup`, dónde quedan (`/srv/presupuestos-backups/{db,appdata}`), cómo hacer una copia en el momento y la retención de 30. El riesgo de tenerlas en el mismo disco, y cómo copiar la carpeta a un NAS o a un disco externo.
8. **Restauración paso a paso** (base de datos, después volumen, después comprobación del SHA-256 del último PDF) y **prueba de restauración** en un proyecto aparte, con una tabla para apuntar fecha, copia usada y resultado.
9. **Comprobaciones de aceptación** (spec 6): reinicio del servidor, redespliegue, restauración y comparación del PDF con `PR-2026001029-R00.pdf`.

**`docs/operacion.md`:** actualizar la versión; copia manual antes de una actualización con migraciones; revertir (desplegar el commit anterior **no** revierte la base de datos: se restaura la copia de antes); instalar el navegador en desarrollo.

- [ ] **Step 1: Escribir `docs/despliegue.md` y actualizar `docs/operacion.md`.**
- [ ] **Step 2: Verificación completa.** Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`. Expected: todo limpio.
- [ ] **Step 3: Revisión final de la rama** con un revisor independiente (superpowers:requesting-code-review). Corregir lo crítico y lo importante.
- [ ] **Step 4: Actualizar** `README.md` (estado, estructura `src/pdf/` y enlace a `docs/despliegue.md`), `AGENTS.md` y `progreso.md`.
- [ ] **Step 5: Commit, push y PR** contra `master` — `git commit -m "docs: despliegue en Dokploy, copias, restauración y cierre del plan 4"`
- [ ] **Step 6: Con el PR fusionado y el visto bueno del usuario, desplegar** siguiendo los pasos del Alcance y apuntar el resultado (y lo que quede pendiente, como la comparación con el PDF real) en `progreso.md`.

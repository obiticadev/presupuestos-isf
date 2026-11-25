# Ajustes del borrador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arreglar «Actualizar precios», pasar cinco desplegables al `Combobox` y poder ocultar en el PDF la cantidad de una línea y el total de una subpartida.

**Architecture:** Se reutiliza `src/components/combobox.tsx` (ya se encaja en la ventana), al que se añade un `text` opcional y el vaciado al reiniciar el formulario. Para ocultar, dos booleanos nuevos en Prisma que viajan solos en la copia (duplicar, revisión) y en la instantánea de emisión, porque ambas copian la fila entera.

**Tech Stack:** Next.js 16, React 19, Prisma 7, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-ajustes-borrador-design.md`

## Global Constraints

- Código en inglés; interfaz y documentación en español.
- Cada tarea sube el parche de `package.json`: 1.9.16, 1.9.17, 1.9.18 y 1.9.19.
- Commit y push a `mejoras-uso-real` al cerrar cada tarea.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`. No se borran pruebas existentes.
- Toda escritura del borrador pasa por `withDraft()`.
- La interfaz se prueba con Claude in Chrome a 1280, 820 y 390 px: lista sin solaparse y sin barra horizontal.

## Review Focus

- Instantáneas emitidas antes de esta versión no tienen `showQuantity`/`showTotal`: el PDF debe mostrar la cantidad y el total (se lee `!== false`). Lo prueba la Tarea 4.
- Tras «Añadir» (formulario con `reset`), el buscador debe quedar vacío y no reenviar el concepto anterior. Lo cubre la Tarea 2, comprobado en Chrome.
- Si se vacía «Cliente» y se guarda la cabecera, el servidor rechaza el cambio y el formulario conserva lo escrito (validación existente).
- Si cambia la plantilla del conjunto, las líneas regeneradas conservan `showQuantity` (`regenerate` solo actualiza la cantidad y la posición). Es código existente.
- Una subpartida con el total oculto sigue sumando en la partida. Lo prueba la Tarea 4 (solo cambia el texto de la fila).

---

### Task 1: el aviso de precios aplica la regla del botón (1.9.16)

**Files:**
- Modify: `src/modules/quotes/lifecycle.ts` (`priceWarnings`, `refreshLines`)
- Test: `tests/quotes/lifecycle.test.ts`

- [ ] **Step 1: prueba que falla**, `test("no avisa de líneas que refrescar no toca: subpartida en precio global")`. Partiendo de `completeDraft()` se añade `concept-man-4x25` a `sub`, se sube su precio en el catálogo (como en la prueba de duplicar) y se pasa `sub` a `GLOBAL` con `updateSection(actor, sub.id, { mode: "GLOBAL" })`. Se espera que `priceWarnings(prisma, quote.id)` no contenga `MAN-4X25`. Después se vuelve a `SUM` y se espera el aviso y que `refreshPricesFromCatalog` devuelva `1`.
- [ ] **Step 2:** al ejecutarla, falla porque hoy se avisa también en GLOBAL.
- [ ] **Step 3:** se extrae `const skipped = (l) => !l.concept!.salePrice || l.adjustments.length > 0 || l.section.mode === "GLOBAL"` y se usa en los dos sitios. El aviso de «desactivado» se mantiene salvo en GLOBAL.
- [ ] **Step 4:** pasan las pruebas de `tests/quotes/lifecycle.test.ts`.
- [ ] **Step 5:** versión 1.9.16, commit `fix(presupuestos): el aviso de precios no cuenta las líneas que el botón no actualiza; 1.9.16` y push.

### Task 2: buscador en «Añadir del catálogo» y «Añadir conjunto» (1.9.17)

**Files:**
- Modify: `src/lib/combo-match.ts` (`ComboItem.text?: string`)
- Modify: `src/components/combobox.tsx`
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx` (`AddToSubsection`, `EditorContext.categories`)
- Modify: `src/app/(app)/presupuestos/[id]/page.tsx` (pasa `listCategories()` al contexto)
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `ComboItem = { id; code; description; extra?; text? }`. `text` es lo que queda en la casilla al elegir; por defecto, `code · description`.

- [ ] **Step 1:** `textOf` usa `i.text ?? \`${i.code} · ${i.description}\``.
- [ ] **Step 2:** `Combobox` escucha el evento `reset` de su `form` (`field.current?.form`, en un `useEffect`) y vuelve a `value`: texto, `current`, `chosen.current` y el campo oculto.
- [ ] **Step 3:** en «Añadir del catálogo», `<Combobox name="conceptId" items={...} value="" placeholder="Escribe el código, la descripción o la categoría" label="Concepto" />` con `code`, `description` (más ` · {precio} €/{unidad}` si no es GLOBAL) y `extra` = nombre de la categoría. En «Añadir conjunto», `name="templateId"`, `code` = nombre y `description` = descripción.
- [ ] **Step 4:** CSS:
  - `.addform .cb{flex:1 1 260px}`, cuidando que `.addform input` no le cambie el relleno a `.cb input`;
  - `@media (max-width:600px){.cb ul.cols{grid-template-columns:fit-content(45%) minmax(0,1fr)} .cb ul.cols small{grid-column:2;text-align:left}}`.
- [ ] **Step 5:** `pnpm exec tsc --noEmit` y las pruebas pasan. En Chrome, a los tres anchos:
  - filtrar, ↑ ↓ y Tab, Añadir;
  - la casilla queda vacía y la lista no se sale de la ventana.
- [ ] **Step 6:** versión 1.9.17, commit `feat(presupuestos): buscador en añadir del catálogo y añadir conjunto; 1.9.17` y push.

### Task 3: buscador en Cliente, Nombre y Contacto (1.9.18)

**Files:**
- Modify: `src/modules/clients/service.ts` (`listClientOptions` también devuelve `tradeName`)
- Modify: `src/app/(app)/presupuestos/[id]/page.tsx` (Cliente y Contacto)
- Modify: `src/app/(app)/presupuestos/[id]/installation-fields.tsx` (Nombre)

**Interfaces:**
- Consumes: `ComboItem.text` (Tarea 2).

- [ ] **Step 1:** `listClientOptions(): { id; legalName; taxId; tradeName }[]`.
- [ ] **Step 2:** Cliente: `<Combobox name="clientId" value={q.clientId} label="Cliente" items={clients→{code: legalName, description: taxId, extra: tradeName, text: legalName}} />`. Si el cliente actual está desactivado, entra como un elemento más con « (desactivado)».
- [ ] **Step 3:** Nombre: `InstallationOption` añade `address` e `installation`. Los elementos son `{code: name, description: installation, extra: address, text: name}`, con `onPick={setId}` y `name="locationId"`.
- [ ] **Step 4:** Contacto: `{code: name, description: role, extra: [email, phone].filter(Boolean).join(" · "), text: name}`, con `name="contactId"`. Con la ✕ y la casilla vacía queda «sin elegir».
- [ ] **Step 5:** `tsc`, las pruebas y Chrome a los tres anchos:
  - Guardar cabecera con cliente, nombre y contacto cambiados;
  - el recuadro «Instalación» se actualiza al elegir.
- [ ] **Step 6:** versión 1.9.18, commit `feat(presupuestos): buscador en cliente, nombre y contacto; 1.9.18` y push.

### Task 4: ocultar la cantidad de una línea y el total de una subpartida (1.9.19)

**Files:**
- Modify: `prisma/schema.prisma`, con la migración `ocultar_cantidad_total`:
  - `QuoteLine.showQuantity Boolean @default(true)`;
  - `QuoteSection.showTotal Boolean @default(true)`.
- Modify: `src/modules/quotes/schema.ts`:
  - `lineUpdateInput.showQuantity: z.boolean().optional()`;
  - `sectionInput.showTotal: z.boolean().optional()`.
- Modify: `src/modules/quotes/service.ts` (`updateLine`; `updateSection`, solo en subpartidas)
- Modify: `src/modules/quotes/actions.ts` (`updateLineAction` lee `showQuantity` como `visible`; `updateSectionAction` lee `showTotal` con el mismo patrón `"1"`/`"0"`)
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx`:
  - casilla «Cant.» junto a «Ver», en todas las líneas, también las de conjunto;
  - casilla «Total» en la fila de la subpartida, en su propio `ActionForm` + `SubmitOnChange`.
- Modify: `src/pdf/document.ts`:
  - `SnapshotQuote`: `showQuantity?: boolean` en la línea y `showTotal?: boolean` en la subpartida;
  - `buildDocument` pone `quantity: ""` y `total: ""` cuando valen `false`.
- Test: `tests/quotes/service.test.ts`, `tests/pdf/document.test.ts`

- [ ] **Step 1: pruebas que fallan.**
  - `document.test.ts`, `it("hides a line's quantity and a subsection's total when told to")`: con `showQuantity: false` en «Bomba» y `showTotal: false` en `c1`, las filas quedan `{ kind: "line", text: "Bomba", quantity: "" }` y `{ kind: "sub", number: "1.1", title: "Equipos", total: "" }`, y la partida sigue en `"639,00 €"`.
  - `service.test.ts`: `updateLine(actor, l.id, { showQuantity: false })` y `updateSection(actor, sub.id, { showTotal: false })` se guardan, y la base del presupuesto no cambia.
- [ ] **Step 2:** las pruebas fallan.
- [ ] **Step 3:** el esquema y la migración: `pnpm exec prisma migrate dev --name ocultar_cantidad_total`, después `pnpm exec prisma generate` y reiniciar `pnpm dev`.
- [ ] **Step 4:** el servicio, las acciones, la interfaz y el PDF, según los archivos de arriba.
- [ ] **Step 5:** pasan las pruebas completas y `tsc`. En Chrome:
  - desmarcar «Cant.» en una línea de horas y «Total» en una subpartida;
  - la vista previa del PDF muestra la línea sin «2 h» y la subpartida sin importe, y el total de la partida no cambia;
  - en un PDF de varias hojas se ve bien;
  - las casillas caben a 820 y 390 px.
- [ ] **Step 6:** versión 1.9.19, commit `feat(presupuestos): ocultar en el PDF la cantidad de una línea y el total de una subpartida; 1.9.19` y push.

### Cierre

- [ ] Renumerar el plan `2026-11-25-conjuntos-dinamicos.md` para que empiece en 1.9.20.
- [ ] Actualizar `docs/superpowers/progreso.md` y `AGENTS.md` (CRLF).
- [ ] Commit y push.

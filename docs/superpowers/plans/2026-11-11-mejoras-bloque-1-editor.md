# Mejoras · Bloque 1: editor y móvil — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El editor del borrador deja de cortar textos a cualquier ancho, agrupa sus botones, admite un comentario en cada línea, conjunto, subpartida y partida (también en el PDF), pliega los conjuntos y en móvil tiene una barra superior con menú.

**Architecture:** Un campo `comment` nuevo en `QuoteLine`, `KitInstance` y `QuoteSection`, con un único servicio `setComment` que pasa por `withDraft`. El PDF añade filas `note` al documento. La interfaz sigue siendo de Server Components con `ActionForm`; lo interactivo (abrir/cerrar formularios, plegar el conjunto, el menú móvil) son tres componentes cliente pequeños que solo tocan `<details>` y clases. El diseño de las filas pasa a CSS Grid con áreas y consultas de contenedor.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Prisma 7 (PostgreSQL 17), Zod 4, Vitest. CSS propio en `src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-11-11-mejoras-uso-real-design.md`, Bloque 1 (1.1–1.7). **Referencia visual obligatoria:** `docs/diseno/maquetas/editor-filas-v2.html` (si el texto y la maqueta discrepan, manda la maqueta; ábrela en Chrome y cópiale tamaños, orden y estilos).

## Global Constraints

- Código en inglés; interfaz y documentación en español.
- Toda escritura de un borrador pasa por `withDraft()`; lo emitido no se modifica (`LOCKED`).
- Formularios con `ActionForm` (`src/components/action-form.tsx`).
- Migraciones que no pierden datos: solo `ADD COLUMN … DEFAULT ''`.
- Los snapshots emitidos no se migran: `buildDocument` sigue leyendo los antiguos (sin comentarios).
- Sin librerías nuevas.
- Comentario: texto, por defecto `""`, máximo 2000 caracteres; vacío = sin comentario (no se pinta).
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" mise x -- pnpm test`. Tras migrar: `mise x -- pnpm exec prisma generate` y reiniciar `pnpm dev`. Para matar el servidor: `pkill -f '[n]ext dev'`.
- Toda la interfaz se revisa con Claude in Chrome en la app real (`http://localhost:3000`, admin de pruebas de `.superpowers/test-admin.env`) a 1920, 1600 y 1440 px con el panel, y a ancho de móvil (iframe de 390 px, ver `progreso.md`).
- Commit y push a `mejoras-uso-real` al cerrar cada tarea. Nunca a `master`.

## Review Focus

1. Un comentario en un borrador que luego se emite debe salir en el PDF y quedar congelado; editar el borrador de la revisión siguiente no cambia el PDF emitido → prueba en Tarea 1 (snapshot) y Tarea 2 (documento).
2. Recalcular un conjunto cambiando el concepto de un hueco conserva el comentario de esa línea; quitar el hueco (componente opcional a «Ninguno») lo pierde con la línea → Tarea 1.
3. Intentar comentar algo de un presupuesto emitido (por la acción, sin la interfaz) se rechaza con `LOCKED` → Tarea 1.
4. Un comentario de 2001 caracteres o solo de espacios: el primero se rechaza, el segundo se guarda como vacío → Tarea 1.
5. Un comentario largo al pie de una hoja del PDF no se queda solo en la hoja siguiente separado de su línea → Tarea 2 (regla de `paginate`).

---

### Task 1: Comentarios en datos y servicio

**Files:**
- Create: `prisma/migrations/<timestamp>_comments/migration.sql` (con `pnpm exec prisma migrate dev --name comments`)
- Modify: `prisma/schema.prisma` (modelos `QuoteSection`, `QuoteLine`, `KitInstance`)
- Modify: `src/modules/quotes/schema.ts`, `src/modules/quotes/service.ts`, `src/modules/quotes/actions.ts`
- Test: `tests/quotes/comments.test.ts`

**Interfaces:**
- Produces:
  - Columnas `comment String @default("") @db.Text` en los tres modelos.
  - `commentInput = z.object({ kind: z.enum(["line", "kit", "section"]), id: z.string().min(1), comment: text(2000) })` y `type CommentInput = z.input<typeof commentInput>` en `schema.ts`.
  - `setComment(actor: CurrentUser, raw: CommentInput): Promise<void>` en `service.ts`.
  - `setCommentAction: Action` en `actions.ts`, que lee `kind`, `id` y `comment` del formulario.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/quotes/comments.test.ts` (usa `makeDraft`, `completeDraft`, `addKitInstance` con el `bombas` de `kit-instances.test.ts`, `issueQuote`, `createRevision`, `duplicateQuote`):
  - `"comentar una línea, la subpartida, la partida y un conjunto los guarda y getQuote los devuelve"`: tras `setComment` para cada `kind`, `getQuote` trae `section.comment`, `sub.comment`, `lines[0].comment` y `kits[0].comment` con el texto recortado (`"  Ver plano  "` → `"Ver plano"`), y hay entradas de historial `Comentario` del presupuesto.
  - `"un comentario vacío o de espacios lo quita"`: `"   "` → `comment === ""`.
  - `"más de 2000 caracteres se rechaza"`: `"x".repeat(2001)` → `rejects.toThrow(ValidationError)`.
  - `"en un presupuesto emitido se rechaza"`: tras `issueQuote` → `rejects.toThrow(LOCKED)` para `kind: "line"`.
  - `"una id que no es de ese tipo da NotFound"`: `kind: "kit"` con la id de una línea → `rejects.toThrow(NotFoundError)`.
  - `"recalcular el conjunto conserva el comentario de la línea del hueco"`: comentar la línea `c1`, `updateKitInstance` con `quantity: "3"` y luego con `choices.c1: "concept-man-12x075"` (otra manguera de la misma categoría) → la línea del hueco `c1` mantiene el comentario.
  - `"revisión y duplicado copian los comentarios"`: comentarios en los cuatro tipos, `issueQuote`, `createRevision` y `duplicateQuote` → los cuatro comentarios están en ambas copias.
  - `"el snapshot emitido lleva los comentarios"`: tras `issueQuote`, `issuedDocument.snapshot.quote.sections[0].comment` y el de la línea están presentes.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" mise x -- pnpm vitest run tests/quotes/comments.test.ts`
Expected: FAIL (`setComment` no existe).

- [ ] **Step 3: Migración.** Añadir `comment String @default("") @db.Text` a los tres modelos y ejecutar `mise x -- pnpm exec prisma migrate dev --name comments` contra la BD de desarrollo (5433). Comprobar que el SQL generado son tres `ALTER TABLE … ADD COLUMN "comment" TEXT NOT NULL DEFAULT ''` y nada más. `mise x -- pnpm exec prisma generate`.

- [ ] **Step 4: Implementar `setComment`** en `service.ts`: `parseOrThrow(commentInput, raw)`; busca el elemento según `kind` (`quoteLine` / `kitInstance` / `quoteSection`, con su `section` para sacar `quoteId`; si no existe → `NotFoundError("El elemento no existe")`); `withDraft(quoteId, …)` actualiza `comment` y registra con `logQuote(tx, actor, quoteId, "update", …)` el texto `Comentario ${quitado|guardado} en ${la línea «desc» | el conjunto «nombre» | la subpartida «título» | la partida «título»}`. `copyContent` y el snapshot ya copian todos los campos escalares: no se tocan (las pruebas lo confirman). `regenerate` de `kit-instances.ts` actualiza la línea del hueco sin borrarla: tampoco se toca.

- [ ] **Step 5: Añadir `setCommentAction`** en `actions.ts` con el mismo patrón `action((actor, f) => quotes.setComment(actor, { kind: str(f, "kind") as …, id: str(f, "id"), comment: str(f, "comment") }))`.

- [ ] **Step 6: Ejecutar las pruebas del archivo y la suite completa**

Run: el comando de pruebas global.
Expected: PASS, todas (la suite tenía 217).

- [ ] **Step 7: Commit y push**

```bash
git add prisma src/modules/quotes tests/quotes/comments.test.ts
git commit -m "feat(quotes): comentario en líneas, conjuntos, subpartidas y partidas"
git push
```

---

### Task 2: Comentarios en el PDF

**Files:**
- Modify: `src/pdf/document.ts`, `src/pdf/templates/v1/index.ts`, `src/pdf/templates/v1/styles.ts`, `src/pdf/templates/v1/paginate.ts`
- Test: `tests/pdf/document.test.ts`, `tests/pdf/template.test.ts`, `tests/pdf/render.test.ts` (si ya prueba la paginación con Chromium, añadir ahí el caso de la nota)

**Interfaces:**
- Consumes: el snapshot de la Tarea 1 (`comment` en secciones, líneas y `kits[]` de cada subpartida; las líneas llevan `kitInstanceId`).
- Produces: `PdfRow` gana `| { kind: "note"; text: string }`. `SnapshotQuote` gana campos **opcionales** (`comment?: string` en partida, subpartida y línea; `kitInstanceId?: string | null` en línea; `kits?: { id: string; comment?: string }[]` en subpartida).

- [ ] **Step 1: Pruebas que fallan** en `document.test.ts`:
  - `"los comentarios salen como notas detrás de su elemento"`: con comentario en la partida, la subpartida `c1`, la línea «Bomba», y dos líneas de un conjunto `k1` (`kitInstanceId: "k1"`, `kits: [{ id: "k1", comment: "Del cliente" }]`), las filas son, en orden: part, sub, line Bomba, note (Bomba), …, las líneas del conjunto, note «Del cliente» tras la última línea de `k1`, note de la subpartida tras todas sus líneas, sub 1.2, …, note de la partida tras su última subpartida.
  - `"un comentario de una línea oculta no sale; uno vacío tampoco"`.
  - `"un snapshot antiguo sin comentarios da las mismas filas que antes"`: el `src()` actual sin cambios → `rows` igual que la prueba existente.
  - En `template.test.ts`: `"la nota sale escapada y en cursiva"`: un `note` con `<b>` → el cuerpo contiene `class="note"` y `&lt;b&gt;`.

- [ ] **Step 2: Ejecutar y ver que fallan** (`mise x -- pnpm vitest run tests/pdf`).

- [ ] **Step 3: Implementar** en `buildDocument`: tras cada línea visible con comentario, `note`; al terminar el grupo de líneas de un conjunto (la siguiente línea tiene otro `kitInstanceId` o se acaban), la nota del conjunto si tiene comentario (aunque sus líneas estén ocultas, si el conjunto tiene alguna línea visible); al final de la subpartida, su nota; al final de la partida, la suya. Se mantiene el orden de líneas del snapshot.
  - Plantilla: `note` → `<tr class="note"><td></td><td colspan="3">texto</td></tr>`. Estilo: `tr.note td{font-style:italic;color:var(--mut);border-bottom:none;padding-top:0}` y `tr.note td:nth-child(2){padding-left:6mm}`; quitar el borde inferior de la fila anterior a una nota no hace falta.
  - `paginate`: una nota nunca abre hoja sola: en `leads(a, b)` añadir `|| is(b, "note")`.

- [ ] **Step 4: Ejecutar las pruebas del PDF y la suite completa** → PASS.

- [ ] **Step 5: Commit y push** (`feat(pdf): comentarios en cursiva detrás de su elemento`).

---

### Task 3: Filas del editor que no se cortan y botones ordenados (1.1 y 1.3)

**Files:**
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx`, `src/app/(app)/presupuestos/[id]/page.tsx` (cabecera de la tabla), `src/app/globals.css` (bloque «Editor de presupuestos»), `src/components/action-form.tsx` (`SubmitOnBlur`)

**Interfaces:**
- Produces: clases de celda `c-code`, `c-desc`, `c-qty`, `c-price`, `c-amt`, `c-acts`, `flags` sobre `.qrow` (las Tareas 4 y 5 las usan); `.qtable` con `container: ed / inline-size`.

- [ ] **Step 1: Reestructurar las filas** a la rejilla de la maqueta (`.vA .r`): `grid-template-areas: "code desc qty price amt acts"` con columnas `84px minmax(0,1fr) 128px 84px 104px 214px` (la de acciones, fija). Por debajo de 980 px de contenedor: `"code desc desc desc desc" ". qty price amt acts"`; por debajo de 480 px: `"desc desc" "code amt" "qty price" "acts acts"`. Cada celda lleva su clase `c-…`; `.flags` va en una fila propia bajo la descripción. El `ActionForm` de la línea (descripción + cantidad) usa `display:contents` para que sus campos sean celdas de la rejilla; se quita el botón ✓ «Guardar línea».
- [ ] **Step 2: La descripción de la línea es un `<textarea rows={1}>`** con `field-sizing: content; resize: none`. `SubmitOnBlur` acepta también `TEXTAREA`, y en un textarea con `Enter` (sin Mayús) envía el formulario en vez de saltar de línea.
- [ ] **Step 3: Orden y tamaño de botones** (spec 1.3): línea `Ver · € · [comentario, Tarea 5] · ↑ · ↓ · ✕`; partida `Eliminar · ↑ · ↓ · [＋ ▾, Tarea 4]`; subpartida `Eliminar · ↑ · ↓ · [comentario]`. Reserva el último hueco aunque esté vacío (30 px) para que las flechas queden en la misma vertical que las de las líneas. En móvil (≤ 480 px de contenedor): botones de 38 px, la fila de acciones a todo el ancho, `↑` con `margin-left:auto` y el último (✕, ＋ o comentario) con `margin-left:14px`; «Eliminar» a la izquierda. `.icon[disabled]{color:var(--mut);background:var(--band);border-color:var(--rule)}`.
- [ ] **Step 4: Verificar en Chrome** con un borrador real con partida y línea de nombres largos (como `progreso.md`, «Pendiente tras el despliegue», punto 1): a 1920, 1600, 1440 y móvil, ningún texto cortado, nada se sale de la tabla (comprobar con `getBoundingClientRect` como en la maqueta), las flechas de partida, subpartida y línea alineadas, y desactivadas en gris en los extremos. Editar una descripción y salir del campo la guarda; `Enter` la guarda.
- [ ] **Step 5: `pnpm lint`, `pnpm exec tsc --noEmit` y la suite** → sin errores. Commit y push (`feat(editor): filas a dos pisos sin textos cortados y botones ordenados`).

---

### Task 4: «+ Añadir ▾», cancelar, nueva partida y conjunto plegable (1.4, 1.5, 1.7)

**Files:**
- Create: `src/components/disclosure.tsx` (componentes cliente)
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx`, `src/app/(app)/presupuestos/[id]/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces (en `src/components/disclosure.tsx`, `"use client"`):
  - `Menu({ label, className, children }: { label: ReactNode; className?: string; children: ReactNode })`: un `<details className="dd">` con `<summary>` y `.menu`, que se cierra al pulsar fuera (`pointerdown` en `document`) y al elegir una opción.
  - `OpenButton({ target, children, className, title }: { target: string; … })`: abre el `<details id={target}>`, cierra los demás `details[data-group]` del mismo `data-group`, enfoca su primer campo y cierra el `Menu` en que esté.
  - `CloseButton({ className, title, children })`: cierra el `<details>` que lo contiene y hace `reset()` del formulario que haya dentro.
  - `CollapseKitButton()`: el ✓ verde; cierra el `<details>` del conjunto y hace `scrollIntoView({ block: "nearest" })` de su `summary`.

- [ ] **Step 1: «+ Añadir ▾» de la subpartida** con `Menu`; opciones (texto y ayuda exactos de la spec 1.4): *Del catálogo* «concepto con su precio» · *Línea específica* «texto y precio a mano» · *Comentario de la subpartida* «al pie de la subpartida» (abre el comentario de la subpartida, Tarea 5) · *Conjunto* «varios elementos que se calculan juntos» (solo «por suma» y si hay conjuntos). Cada formulario vive en un `<details id=… data-group={sub.id}>` con el `summary` oculto, y lleva al final un ✕ `CloseButton` de 40 × 40 px con borde de tinta 1,5 px (`.addform .cancel`). Los `ActionForm` mantienen `reset` y añaden `close`.
- [ ] **Step 2: «＋ ▾» de la partida**: `Menu` con *Subpartida* «nueva subpartida al final de la partida» (formulario con nombre, «Añadir subpartida» y ✕) y *Comentario de la partida* «al pie de la partida». Sustituye al botón ＋ suelto.
- [ ] **Step 3: Nueva partida**: `AddSection` pasa a ser la banda `.addpart` «＋ NUEVA PARTIDA» (aspecto de fila de partida, verde, a todo el ancho, al final de `.qtable`) que abre nombre + «Añadir partida» + ✕. Va dentro de `.qtable`, no debajo.
- [ ] **Step 4: Conjunto plegable**: `KitBlock` pasa a `<details id="conjunto-{id}">` abierto si está incompleto o si la URL apunta a su ancla (un `useEffect` en un componente cliente pequeño o el `OpenButton` existente al cargar con `location.hash`). `summary`: ▸, silueta (cuadrado con `def.main.label.slice(0, 2).toUpperCase()` y un círculo por componente; discontinuo ámbar si `missing` incluye su etiqueta; `title` con los nombres), «Conjunto · nombre», resumen e importe o «Incompleto». Dentro: `kitsum`, líneas, comentario (Tarea 5) y pie con filete superior: «Editar» o «Completar» (ámbar) · «Quitar» · [comentario] … `CollapseKitButton` a la derecha; los tres en una línea también en móvil. Se elimina el `.diagram` grande. El conjunto ocupa todo el ancho (margen 8 px), sin la sangría de 104 px.
- [ ] **Step 5: Verificar en Chrome** en los cuatro anchos: el menú se abre y se cierra al elegir o al pulsar fuera; solo un formulario abierto; ✕ lo cierra vacío; añadir del catálogo, línea, conjunto, subpartida y partida funciona y el formulario se cierra al guardar; un error del servidor deja lo escrito; el ✓ pliega el conjunto y deja su título a la vista; el incompleto sale abierto; el enlace «Para emitir» de un conjunto incompleto lo abre.
- [ ] **Step 6: lint, tipos y suite**; commit y push (`feat(editor): menú de añadir, nueva partida y conjunto plegable`).

---

### Task 5: Comentarios en el editor (1.6)

**Files:**
- Create: `src/app/(app)/presupuestos/[id]/comment.tsx` (Server Component)
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `setCommentAction` (Tarea 1), `OpenButton` / `CloseButton` (Tarea 4).
- Produces: `Comment({ kind, id, text, editable, variant }: { kind: "line" | "kit" | "section"; id: string; text: string; editable: boolean; variant: "line" | "kit" | "sub" | "part" })` que pinta el comentario y su `<details id="comentario-{id}">` de edición; `CommentButton({ id, has }: { id: string; has: boolean })`, el bocadillo (SVG de la maqueta, `title`/`aria-label` «Añadir comentario a …»), `visibility:hidden` cuando `has` para reservar el hueco.

- [ ] **Step 1: `Comment`** pinta, si hay texto, `.comment.{variant}` en cursiva sin marcas, con ✎ (abre su `details` con el texto) y ✕ (envía `comment=""`); si no, nada salvo el `details` cerrado. El formulario: `textarea` (máx. 2000) + «Guardar» `.btn.pri` + ✕ de 40 px a su lado.
- [ ] **Step 2: Colocarlos** según la spec: bajo cada línea (también las de conjunto), alineado con la descripción (padding izquierdo 100 px; 8 px en móvil); el del conjunto tras sus líneas y antes del pie; el de la subpartida al pie de la subpartida (antes de «+ Añadir»); el de la partida al pie de la partida, con fondo `--band`. Los botones ✎ ✕ de los comentarios de un conjunto quedan en la vertical del ✓ (padding derecho 12 px). Bocadillos: en la línea tras «€», en el pie del conjunto tras «Quitar» (40 px con borde de tinta), en la subpartida en el último hueco; la partida usa la opción del menú «＋ ▾».
- [ ] **Step 3: Vista de solo lectura** (presupuesto emitido): los comentarios se ven, sin botones.
- [ ] **Step 4: Verificar en Chrome**: añadir, editar y quitar un comentario en una línea, una línea de conjunto plegado (se abre el conjunto), un conjunto, la subpartida y la partida; el bocadillo desaparece y vuelve; subir una línea con comentario lo lleva con ella; emitir y descargar el PDF: los comentarios salen en cursiva bajo su elemento; los cuatro anchos sin desbordes.
- [ ] **Step 5: lint, tipos y suite**; commit y push (`feat(editor): comentarios en cada elemento`).

---

### Task 6: Barra superior con menú en móvil (1.2)

**Files:**
- Create: `src/components/mobile-menu.tsx` (`"use client"`)
- Modify: `src/app/(app)/layout.tsx`, `src/app/globals.css` (bloque «Móvil: el rail…»)

**Interfaces:**
- Produces: `MobileMenuButton()`: botón «Menú» (`aria-expanded`, `aria-controls="rail-links"`) que alterna la clase `open` en `nav.rail` y la quita al cambiar de ruta (`usePathname`).

- [ ] **Step 1:** En el layout, los enlaces y el bloque `.me` van en `<div id="rail-links">`; el botón va junto a la marca. Escritorio: el botón no se ve y todo queda como hoy.
- [ ] **Step 2: CSS ≤ 900 px**: barra superior fija con «ISF PRESUPUESTOS» a la izquierda y el botón a la derecha; `#rail-links` oculto salvo con `nav.rail.open`, y entonces en columna a todo el ancho, con «Cerrar sesión» al final.
- [ ] **Step 3: Verificar en Chrome** en el iframe de 390 px: la barra no tapa el contenido, el menú se abre y se cierra, navegar lo cierra, y a 1440 px el rail lateral sigue igual.
- [ ] **Step 4: lint, tipos y suite**; commit y push (`feat(layout): barra superior con menú en móvil`).

---

### Task 7: Cierre del bloque

**Files:**
- Modify: `docs/superpowers/progreso.md`, `AGENTS.md` (CRLF: conservarlo), `docs/diseno/README.md` si cambia algo

- [ ] **Step 1:** Suite completa, `pnpm lint`, `pnpm exec tsc --noEmit` y `pnpm build` (con `next dev` parado) → todo en verde; anotar el número de pruebas.
- [ ] **Step 2:** Revisión final en Chrome del recorrido completo: crear borrador, partidas, líneas largas, conjunto, comentarios en todo, emitir, descargar PDF, crear revisión (comentarios copiados); en los cuatro anchos.
- [ ] **Step 3:** Revisión del código de todo el bloque con un revisor nuevo (`superpowers:requesting-code-review`) y corregir lo que confirme.
- [ ] **Step 4:** Actualizar `progreso.md` (Bloque 1 hecho, decisiones tomadas por el camino) y el estado de `AGENTS.md`; nota en claude-mem; commit y push.

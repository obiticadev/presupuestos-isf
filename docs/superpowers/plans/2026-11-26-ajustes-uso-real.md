# Ajustes tras el uso real: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** corregir los fallos visuales de la beta 1.9.29, unificar el conjunto del borrador en un solo árbol (B3), pulir el PDF A1, permitir notas e historial de estados en lo emitido y añadir «Eliminar» (✕) con consecuencias visibles y confirmadas en borradores y conjuntos.

**Architecture:** A, B y C son presentación (CSS y componentes de `src/app/(app)/presupuestos/[id]`, `conjuntos`, `src/pdf/templates/v1`). D y E tocan servicios de `src/modules/quotes`. F añade borrado lógico de conceptos y clientes, una tabla `DraftNotice` con lo pendiente de confirmar en cada borrador, y un bloqueo en `withDraft`/`issueQuote` mientras haya avisos.

**Tech Stack:** Node 24, pnpm, Next.js 16 (leer `node_modules/next/dist/docs/` antes de escribir código Next), React 19, TypeScript 5.9, Prisma 7 + PostgreSQL 17, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-26-ajustes-uso-real-design.md`. Maqueta elegida: variante **B3** de `docs/diseno/maquetas/conjunto-dinamico-pdf-arbol.html`.

## Global Constraints

- Rama `mejoras-uso-real`. Cada tarea termina con commit y push (autodespliegue en `:3101`). **No** se fusiona en `master` ni se despliega producción sin el visto bueno del usuario. El objetivo final es fusionar en `master`, así que la suite, el lint y el build tienen que quedar en verde.
- Código en `D:\dev\presupuestos-isf` (sin `#`). BD de desarrollo en el puerto 5433.
- Versión: cada tarea sube el parche de `package.json` desde 1.9.29: Tarea 1 → 1.9.30 … Tarea 12 → 1.9.41.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`. **No se borran ni se debilitan pruebas existentes.** Si una prueba existente contradice este plan, se para y se pregunta al usuario.
- Tras `prisma migrate dev`: `pnpm exec prisma generate` y reiniciar `pnpm dev` (`pkill -f '[n]ext dev'`).
- Código en inglés; interfaz, mensajes y documentación en español, sin jerga. Importes con `Prisma.Decimal`, nunca float. Permisos y bloqueos siempre en el servidor.
- Formularios con `ActionForm`. Toda escritura de un borrador pasa por `withDraft()` (salvo las notas, tarea 4). Lo emitido no se modifica.
- `AGENTS.md` y `docs/superpowers/progreso.md` son CRLF: en Git Bash, `sed -b -i` o Python con `newline=''`.
- Pruebas de interfaz con Claude in Chrome contra `pnpm dev`. Usuarios `admin@isf.test` y `user@isf.test`.
- Los textos de los avisos que fija este plan van tal cual. El resto, en el mismo tono.

## Review Focus

1. **Lo emitido no cambia.** Ningún borrado toca líneas, `KitInstance` ni el PDF de un presupuesto no borrador, y no se puede eliminar nada que aparezca en uno emitido. Prueba en la tarea 8.
2. **Borrado con el borrador abierto en otra pestaña.** La siguiente acción del otro usuario se rechaza con «Hay cambios del catálogo por confirmar en este borrador», sin perder nada y sin error 500. Prueba en la tarea 8 (`withDraft` con aviso pendiente).
3. **Reutilizar el código de un concepto borrado.** Crear un concepto nuevo con el mismo código funciona, y el borrador con la línea naranja del antiguo no se mezcla con el nuevo. Prueba en la tarea 8.
4. **Quitar y añadir elementos en la misma edición de un conjunto.** Una clave (`c3`, `d2`) nunca se reutiliza dentro del mismo guardado. Si no, un elemento nuevo podría borrarse en los borradores al confirmar. Pruebas en la tarea 9 (`nextKey`, `removedParts`).
5. **Borrador bloqueado que se duplica o se elimina.** «Eliminar borrador» sigue funcionando. «Duplicar» se rechaza con «Confirma los avisos antes de duplicar», para no copiar líneas de un producto borrado. Prueba en la tarea 8.

---

## Mapa de archivos

| Archivo | Responsabilidad | Tareas |
|---|---|---|
| `src/app/globals.css` | estilos de A, C, F | 1, 2, 6, 7, 10–12 |
| `src/app/(app)/conjuntos/forms.tsx` | clase renombrada, chevrons fuera | 1 |
| `src/pdf/templates/v1/styles.ts`, `src/pdf/document.ts` | filetes A1 | 3 |
| `src/modules/quotes/notes.ts`, `presupuestos/[id]/notes.tsx` | notas en lo emitido | 4 |
| `src/modules/quotes/lifecycle.ts`, `presupuestos/[id]/lifecycle-panel.tsx` | historial de estados | 5 |
| `presupuestos/[id]/kit-block.tsx`, `kit-dynamic.tsx`, `kit-fields.tsx`, `sections.tsx` | árbol B3 y menú «⋯» | 6, 7 |
| `prisma/schema.prisma` + migración `ajustes_eliminar` | `deletedAt`, `DraftNotice` | 8 |
| `src/modules/deletion/service.ts` (nuevo) | impacto, `deleteConcept`, `deleteClient`, `deleteKit` | 8 |
| `src/modules/deletion/notices.ts` (nuevo) | listar y confirmar avisos | 8 |
| `src/modules/kits/refs.ts` (nuevo) | funciones puras: referencias y partes quitadas | 8, 9 |
| `src/modules/quotes/service.ts`, `issue.ts`, `lifecycle.ts`, `kit-instances.ts` | bloqueo y aplicación de avisos | 8, 9 |
| `src/modules/kits/form.ts`, `src/modules/kits/service.ts` | `nextKey`, diferencias al guardar, «!» | 9, 12 |
| `src/components/delete-button.tsx` (nuevo) | ✕ con aviso de impacto | 10 |
| páginas `catalogo`, `clientes`, `conjuntos` | ✕ en listas y fichas | 10 |
| `presupuestos/[id]/page.tsx` + `pending.tsx` (nuevo) | avisos amarillos y naranja | 11 |
| `src/app/(app)/layout.tsx`, `src/components/rail-link.tsx` | «!» en el menú | 12 |

---

### Task 1: Estado, flechas, error y textos largos (A1–A4) · 1.9.30

**Files:**
- Modify: `src/app/globals.css:740-752` (`.st`, `.st-add` y `.st…` del editor de slots), `:575` (`.kt-chev`), `:580` (`.kt-rgrid`), `.kt-panel`, `.kt-dep`
- Modify: `src/app/(app)/conjuntos/forms.tsx` (usos de `className="st…"` del editor de tipos de slot; quitar el `<span className="kt-chev">`)

- [ ] **Step 1: Renombrar la clase de las filas de tipo de slot** de `.st` a `.slt` (y `.st-add` → `.slt-add`) en `globals.css` y en `conjuntos/forms.tsx`. `.st` queda solo para el estado (`globals.css:66-74`). Comprueba con `grep -n "\.st[ .{:\[]" src/app/globals.css` que solo quedan las líneas 66-74.
- [ ] **Step 2: Quitar `.kt-chev`** (CSS y JSX), y el `1.2rem` de su columna en `.kt-dep` (`grid-template-columns:minmax(0,1fr) auto`).
- [ ] **Step 3: `.kt-rgrid`** pasa a `align-items:start`. La caja «Cantidad» (`.kt-fixed`/input) debe quedar a la altura del select con y sin el mensaje «Elige una categoría».
- [ ] **Step 4: Textos largos.** `.kt-panel{min-width:0;overflow-wrap:anywhere}`, `.kt-layout>*{min-width:0}`. En `.kt-dep` y `.slt`, el nombre con `overflow:hidden;text-overflow:ellipsis;white-space:nowrap` y su celda con `min-width:0`. El título del panel («Conjunto dinámico: …», «Tipo de slot: …») parte con `overflow-wrap:anywhere`.
- [ ] **Step 5: Verificar en Chrome** (`pnpm dev`, 1500 px):
  - el listado `/` muestra el estado como icono y texto, sin caja;
  - la cabecera de un borrador tiene «□ Borrador» y el tipo en la línea del título;
  - en un conjunto, un nombre de dinámico y un tipo de slot de 120 caracteres sin espacios no crean scroll horizontal (`document.documentElement.scrollWidth === clientWidth`);
  - el error de categoría no mueve «Cantidad».
- [ ] **Step 6: Subir la versión a 1.9.30, ejecutar la suite y hacer commit y push**

```bash
git add src/app/globals.css "src/app/(app)/conjuntos/forms.tsx" package.json
git commit -m "fix(ui): estado sin caja, editor de conjuntos sin flechas y sin desbordes; 1.9.30"
git push
```

### Task 2: Anchos de 1007 a 1360 px (A5) · 1.9.31

**Files:**
- Modify: `src/app/globals.css:588` (`@media (max-width:1000px)` → `1360px` para `.kt-layout,.kt-rgrid`), `.tipocli`/`.headform` (`:148`, `:520`), estilos de `/admin/usuarios` y `/cuenta`
- Modify: `src/app/(app)/admin/usuarios/*` (envolver la tabla en un contenedor con scroll horizontal propio, como en el listado de presupuestos)

- [ ] **Step 1: Medir antes.** En Chrome, en una página de la app, ejecuta este script (sin commit) y guarda la salida:

```js
const pages=['/','/clientes','/catalogo','/conjuntos','/cuenta','/admin/usuarios','/admin/configuracion','/admin/historial','/presupuestos/nuevo',/* + un borrador, un cliente y un conjunto con dinámico */];
const out=[];
for (const w of [1007,1080,1145,1280,1360]) for (const p of pages){
  const f=Object.assign(document.createElement('iframe'),{src:p}); f.style.cssText=`width:${w}px;height:918px;position:fixed;left:0;top:0;opacity:0`;
  document.body.append(f); await new Promise(r=>f.onload=r); await new Promise(r=>setTimeout(r,800));
  const d=f.contentDocument, bad=[...d.querySelectorAll('main *')].filter(e=>getComputedStyle(e).overflowX==='visible'&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&!/^(INPUT|TEXTAREA|SELECT|TABLE|TBODY|THEAD|TR)$/.test(e.tagName));
  out.push(`${w} ${p}: doc=${d.documentElement.scrollWidth-d.documentElement.clientWidth} overflow=${bad.length}`); f.remove();
}
out.join('\n')
```

  Valores medidos el 2026-11-26 a 1007 px: conjunto `+145`, cabecera del borrador `tipocli +53`, `/admin/usuarios doc=428`, `/cuenta .signed +28`.
- [ ] **Step 2: Corregir.**
  - Editor de conjuntos: una columna hasta 1360 px.
  - Cabecera: `.tipocli` con `flex-wrap:wrap` y el combobox de cliente con `min-width:0`; un nombre de cliente largo se corta con puntos suspensivos en lugar de crecer en alto y pisar «Nombre».
  - Usuarios: tabla dentro de un `div` con `overflow-x:auto`.
  - `/cuenta`: la firma `.signed` con `max-width:100%`.
- [ ] **Step 3: Medir después.** El script da `doc=0` y `overflow=0` en todas las páginas a los cinco anchos (salvo los contenedores con scroll propio). Haz una captura de cada página corregida a 1080 px.
- [ ] **Step 4: Subir la versión a 1.9.31, ejecutar la suite y hacer commit y push** (`fix(ui): sin desbordes entre 1007 y 1360 px; 1.9.31`).

### Task 3: Filetes del PDF A1 (B) · 1.9.32

**Files:**
- Modify: `src/pdf/document.ts:77-95` (las notas de línea de una fila agrupada heredan el grupo)
- Modify: `src/pdf/templates/v1/styles.ts` (`tr.in`, `tr.note`, `tr.k`)
- Modify: `src/pdf/templates/v1/html.ts` (clase de la fila de nota agrupada)
- Test: `tests/pdf/document.test.ts`

**Interfaces:**
- Produces: `PdfRow` de tipo `note` con `grouped?: true` y `last?: true` cuando la nota sigue a una línea agrupada.

- [ ] **Step 1: Escribir la prueba que falla.** Test `"a line note inside a dynamic group keeps the group"`. Un conjunto con un dinámico de dos líneas, comentario en la primera. Las filas generadas son `group`, `line{grouped}`, `note{grouped}`, `line{grouped,last}`. La nota no lleva `last` y la segunda línea sí.
- [ ] **Step 2: Ejecutarla** (`pnpm test tests/pdf/document.test.ts`): falla.
- [ ] **Step 3: Implementarlo.** En `document.ts`, `note(rows, "line", …)` recibe si la línea está agrupada, y `last` pasa a la última fila del grupo, sea línea o nota. En `html.ts`, la nota agrupada lleva las clases `in`/`lst` como las líneas. En `styles.ts`:
  - `tr.note.in td:nth-child(2)` con la misma sangría (10 mm) y el filete verde `::before`;
  - en `tr.k` (conjunto resaltado) el fondo y los filetes `border-bottom` también en la primera celda (`td`, no `td:not(:first-child)`), para que el filete llegue de lado a lado;
  - el cierre `tr.note.kit` conserva su filete discontinuo entero.
- [ ] **Step 4: Ejecutar** `pnpm test tests/pdf`: pasa.
- [ ] **Step 5: Comprobación visual.** En un borrador de prueba, un conjunto con comentario de conjunto y un dinámico con un comentario de línea. Abre la «Vista previa (PDF)» y compárala con la captura del usuario (filete vertical continuo, filetes horizontales enteros).
- [ ] **Step 6: Subir la versión a 1.9.32 y hacer commit y push** (`fix(pdf): filetes continuos en dinámicos y conjuntos resaltados; 1.9.32`).

### Task 4: Notas en lo emitido (D) · 1.9.33

**Files:**
- Modify: `src/modules/quotes/notes.ts`
- Modify: `src/app/(app)/presupuestos/[id]/notes.tsx`, `page.tsx` (el compositor de notas sale en cualquier estado)
- Test: `tests/quotes/notes.test.ts`

**Interfaces:**
- Produces: `NoteView.editable: boolean` (por nota). `NoteGroup.canAdd: boolean` sustituye a `NoteGroup.editable`. `withQuoteForNotes<T>(quoteId, fn: (tx, quote) => Promise<T>): Promise<T>` (privada; bloquea la fila con `FOR UPDATE` como `withDraft`, sin exigir borrador).

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/quotes/notes.test.ts`:
  - `"adds a note to an issued quote"`: emitido, `addNote` funciona.
  - `"notes written before issuing are locked"`: nota en borrador, emitir; `editNote` y `deleteNote` lanzan `ValidationError` y `listNotes` da `editable:false`.
  - `"notes added after issuing stay editable until the next revision is issued"`: nota tras emitir R00, editable. Se crea el borrador R01 y la nota de R00 sigue editable. Se emite R01 y la nota de R00 ya no es editable.
  - `"only the viewed quote accepts notes"`: `listNotes(R01)` da `canAdd:false` en el grupo de R00 y `canAdd:true` en el de R01.
  - `"an extension starts without notes"`: `listNotes(ampliación)` tiene un solo grupo, vacío.
- [ ] **Step 2: Ejecutarlas**: fallan.
- [ ] **Step 3: Implementarlo.** `addNote`, `editNote` y `deleteNote` usan `withQuoteForNotes` en lugar de `withDraft`.
  - Una nota es editable si su presupuesto es el visto **y** (está en borrador **o** `note.createdAt > quote.issuedAt`) **y** no hay revisión hija emitida (`quote.supersededById` es null o apunta a un borrador).
  - Si no lo es, `ValidationError({ _: "Esta nota ya no se puede cambiar: se emitió después" })`.
  - Cualquier usuario puede añadir. Editar y borrar siguen las reglas actuales de autor.
- [ ] **Step 4: Interfaz.** `notes.tsx` muestra el compositor cuando `canAdd` y bloquea por nota (`editable`), con el mismo estilo `.msg.locked`. En `page.tsx`, el bloque «Notas internas» sale también en lo emitido.
- [ ] **Step 5: Ejecutar** `pnpm test tests/quotes/notes.test.ts`: pasa, y la suite completa también.
- [ ] **Step 6: Comprobar en Chrome**: en un emitido se añade una nota y se edita; las anteriores salen con el candado.
- [ ] **Step 7: Subir la versión a 1.9.33 y hacer commit y push** (`feat(notas): añadir notas en presupuestos emitidos; 1.9.33`).

### Task 5: Historial de estados por revisión (E) · 1.9.34

**Files:**
- Modify: `src/modules/quotes/lifecycle.ts` (función nueva junto a `listRevisions`)
- Modify: `src/app/(app)/presupuestos/[id]/lifecycle-panel.tsx` (`Revisions`), `page.tsx`, `globals.css` (`.revs`)
- Test: `tests/quotes/lifecycle.test.ts`

**Interfaces:**
- Produces: `type StatusEvent = { status: QuoteStatus; at: Date; by: string | null }`. `listStatusHistory(quoteIds: string[]): Promise<Record<string, StatusEvent[]>>`: por revisión, en orden cronológico; la emisión es el primer evento (`ISSUED`); `by` es null en el caducado automático.

- [ ] **Step 1: Escribir la prueba que falla** `"status history lists issue and status changes in order"`. Emitir, pasar a «Enviado» y a «Aceptado», y ejecutar `expireQuotes` sobre otro presupuesto vencido.
  - Esperado para el primero: `[ISSUED, SENT, ACCEPTED]` con el nombre del usuario.
  - Para el vencido: el último evento es `EXPIRED` con `by: null`.
- [ ] **Step 2: Ejecutarla**: falla.
- [ ] **Step 3: Implementar** `listStatusHistory`. Lee `AuditLog` con `entity:"quote"`, `entityId in ids` y `action in ["issue","status"]`. Comprueba con `grep -n "logQuote(.*\"issue\"" src/modules/quotes/issue.ts` el nombre real de la acción de emisión. El estado de destino sale del texto `«… → X»` comparándolo con `STATUS_LABEL`. Desde esta tarea, `setStatus` y `expireQuotes` guardan también `data: { to: status }`, y se lee `data.to` cuando exista.
- [ ] **Step 4: Interfaz.**
  - Cada fila de `Revisions` conserva su enlace y gana un botón de desplegar al final (`aria-expanded`, objetivo táctil de 32 px como mínimo). Debajo, la lista `Emitido · 25/11/26 14:32 · admin → Aceptado · …`, con «automático» cuando `by` es null.
  - El panel se muestra también con una sola revisión si ya se emitió (hoy `revisions.length < 2` lo oculta).
  - La fila del presupuesto visto empieza desplegada.
- [ ] **Step 5: Ejecutar la suite y comprobar en Chrome** el panel de la captura 16 (A01 con R00, R01 y R02, y la principal).
- [ ] **Step 6: Subir la versión a 1.9.34 y hacer commit y push** (`feat(estados): historial de estados por revisión; 1.9.34`).

### Task 6: Árbol B3, columnas e importes · 1.9.35

**Files:**
- Modify: `src/app/(app)/presupuestos/[id]/kit-block.tsx`, `kit-dynamic.tsx`, `kit-fields.tsx`
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx` (extraer el menú de línea de `LineRow`)
- Modify: `src/app/globals.css` (`.kq-tree` y nuevas `.kq-pr`, `.kq-im`, `.kq-dt`)

**Interfaces:**
- Produces:
  - `LineMenu({ ctx, line, global, removeSlot? }: { ctx: EditorContext; line: LineDetail; global: boolean; removeSlot?: ReactNode })`, en `sections.tsx`. Es un `Menu` (`src/components/disclosure.tsx`) con «⋯» que contiene «Ver en el PDF», «Mostrar cantidad», «Cambiar precio» (solo si `!global && line.unitPrice !== null`), «Comentario» y lo que reciba en `removeSlot`. Los formularios son los mismos que hoy (`updateLineAction`, `adjustPriceAction`, `CommentButton`).
  - `lineOf(lines: LineDetail[], kitSlot: string): LineDetail | undefined`, en `kit-block.tsx`.

- [ ] **Step 1: Mapear filas y líneas.** Cada fila del árbol tiene su clave de `kitSlot`: `main`, `cN`, `dN/main`, `dN/cN` o el id de cada slot. Comprueba las claves reales en `src/modules/quotes/kit-instances.ts:63-110` (`regenerate`) antes de escribir `lineOf`. Las filas de dato (`Dato`) no tienen línea.
- [ ] **Step 2: Columnas.**
  - `.kq-tree` pasa a `190px minmax(0,1fr) 9.5rem 74px 96px 36px` (elemento, artículo, cantidad, precio, importe, ⋯), con cabecera como la de B3.
  - Cada fila pinta `price(line.unitPrice)`, `money(ctx.totals.lines[line.id])` y `<LineMenu>`.
  - Las filas de dinámico (`.kq-dy`) llevan el subtotal del grupo (suma de los importes de sus líneas) en verde.
  - En subpartidas de precio global (`global`), precio e importe van vacíos.
  - El lápiz de «Cambiar la medida» (`FixedMeasure`) pasa al menú, como «Cambiar la medida (solo aquí)». «Quitar slot» también pasa al menú (`removeSlot`).
- [ ] **Step 3: Quitar lo repetido.** Fuera de `kit-block.tsx`:
  - la lista de `LineRow` del conjunto;
  - los bloques `.kdg`;
  - la línea de la fórmula (`.kitsum` con `… = total`).

  Se conservan la descripción, el aviso «Sin valorar hasta completar» y el comentario del conjunto. El comentario de cada línea se pinta debajo de su fila (`.kq-r.kq-wn` con el texto).
- [ ] **Step 4: Indicadores que antes iban en `LineRow`.** «Sin validar», «Inactivo», «ajustado · antes …» y «Sin precio» se pintan junto al importe de la fila (los mismos `badge`). Una línea con `visible=false` se pinta atenuada, como hoy `.qrow.hidden`.
- [ ] **Step 5: Verificar en Chrome** contra la maqueta B3:
  - un conjunto normal, uno con dos dinámicos (con y sin principal) y uno en subpartida global;
  - todas las acciones de cada fila funcionan desde «⋯», y el total del conjunto coincide con la suma de los importes;
  - la suite pasa.
- [ ] **Step 6: Subir la versión a 1.9.35 y hacer commit y push** (`feat(borrador): un solo árbol por conjunto con importes y menú ⋯; 1.9.35`).

### Task 7: Árbol B3, vista y edición sin saltos · 1.9.36

**Files:**
- Modify: `src/app/(app)/presupuestos/[id]/kit-block.tsx`, `src/components/disclosure.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `LineMenu`, `lineOf` (tarea 6).
- Produces: `KitTreeMode({ panelId, children })` en `disclosure.tsx`. Es un cliente que envuelve el árbol en `<fieldset disabled={!editing} className={editing ? "kq-edit" : "kq-view"}>`; `editing` sigue la apertura de `Panel id={panelId}` (los mismos `OpenButton`/`CloseButton`).

- [ ] **Step 1: El árbol se pinta siempre**, también con el conjunto en vista y en presupuestos no editables (`ctx.editable=false`), dentro de `KitTreeMode`.
  - En vista (`.kq-view`): los inputs y combobox sin borde ni fondo (como `.b3:not(.ed)` de la maqueta), sin la ✕ de los campos y sin «Añadir slot». La rama termina en la última fila visible (`.kq-r:has(+ .edrow)`).
  - En emitidos, el menú «⋯» no aparece y los comentarios se ven debajo de su fila.
- [ ] **Step 2: Ninguna columna cambia de ancho ni de sitio entre vista y edición.** Comprobación en Chrome: `getBoundingClientRect().left` de la columna de importe es igual en los dos modos (diferencia 0 px).
- [ ] **Step 3: Anchos estrechos.** El apilado actual por container query (`globals.css:659-684`) se mantiene. Precio e importe van en la línea de la cantidad y el «⋯» a la derecha. Captura a 390, 768 y 1280 px.
- [ ] **Step 4: Subir la versión a 1.9.36, ejecutar la suite y hacer commit y push** (`feat(borrador): vista y edición del conjunto en el mismo árbol; 1.9.36`).

### Task 8: Borrado de conceptos, clientes y conjuntos con avisos (F, servicios) · 1.9.37

**Files:**
- Modify: `prisma/schema.prisma`. Crear migración `pnpm exec prisma migrate dev --name ajustes_eliminar`.
- Create: `src/modules/deletion/service.ts`, `src/modules/deletion/notices.ts`, `src/modules/kits/refs.ts`
- Modify: `src/modules/quotes/service.ts` (`withDraft`, `updateHeader`), `src/modules/quotes/issue.ts` (`issueInTx`), `src/modules/quotes/lifecycle.ts` (`duplicateQuote`), `src/modules/quotes/kit-instances.ts` (exportar `applyKitRemoval`)
- Comprobar sin cambiar: `src/modules/catalog/import.ts` (la importación completa deja en paz lo inactivo en uso, y los borrados son inactivos; su código cambiado a `~id` no choca con filas del Excel). Añadir el caso a `"deleted concepts and clients are hidden from lists, options and exports"`.
- Modify: listados que deben ocultar lo borrado: `src/modules/catalog/service.ts` (`listConcepts`, `listConceptOptions`, `exportConcepts`), `src/modules/clients/service.ts` (`listClients`, `listClientOptions`, `exportClients`)
- Test: `tests/deletion/service.test.ts` (nuevo), `tests/kits/refs.test.ts` (nuevo)

**Esquema:**

```prisma
model Concept { … deletedAt DateTime? }
model Client  { … deletedAt DateTime? }
model Quote   { … notices DraftNotice[] }
/// Lo que un borrado dejó por confirmar en un borrador; mientras exista, el borrador no se puede modificar.
model DraftNotice {
  id            String   @id @default(cuid())
  quoteId       String
  quote         Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  kind          String   // "concept" | "client" | "kit" | "kitPart"
  label         String   // «MAN-4X25 · Manguera 4 hilos x 2,5 mm²», nombre del cliente o del conjunto
  lineIds       String[] @default([])
  kitInstanceId String?
  parts         String[] @default([])
  createdAt     DateTime @default(now())
  @@index([quoteId])
}
```

**Interfaces:**
- Produces (en `src/modules/kits/refs.ts`, funciones puras):
  - `instanceRefs(def: KitDefinition, choices: Record<string,string>, slots: KitSlot[], conceptId: string): string[]`: las claves de la instancia que apuntan al concepto. Son `main`, `cN` (ref fija o `choices[cN]`), el id de cada slot con ese `conceptId` y, dentro de cada dinámico colocado, `dN/<clave>`.
- Produces (en `src/modules/deletion/service.ts`):
  - `type Impact = { blocked: string | null; drafts: { id: string; label: string }[]; kits: { id: string; name: string }[]; required: boolean }`.
  - `deletionImpact(kind: "concept"|"client"|"kit", id: string): Promise<Impact>`.
  - `deleteConcept(actor, id): Promise<void>`, `deleteClient(actor, id): Promise<void>`, `deleteKit(actor, id): Promise<void>`.
  - `issuedUse(kind): Promise<Set<string>>`: los ids usados en presupuestos no borrador, para deshabilitar la ✕ en las listas.
- Produces (en `src/modules/deletion/notices.ts`):
  - `listNotices(quoteId): Promise<DraftNotice[]>`.
  - `confirmNotice(actor, noticeId): Promise<void>`.
  - `PENDING = "Hay cambios del catálogo por confirmar en este borrador"`.
- Produces (en `kit-instances.ts`): `applyKitRemoval(tx, actor, instanceId, parts: string[]): Promise<void>`.
- Cambia: `withDraft(actor, quoteId, fn, opts?: { allowPending?: boolean })`.

Reglas que fijan las pruebas:
- **Bloqueo** (`blocked`): concepto con alguna `QuoteLine` cuyo presupuesto no es `DRAFT`; cliente con algún presupuesto no `DRAFT`; conjunto con alguna `KitInstance` en un presupuesto no `DRAFT`. Mensaje: `"Emitido en N presupuesto(s): solo se puede desactivar"`. Las funciones `delete*` lanzan `ValidationError({ _: blocked })`.
- **`deleteConcept`**:
  - si `usedConceptIds` no lo incluye, borrado físico, como hoy;
  - si lo incluye: `active:false`, `deletedAt:now`, `code: "~" + id`, y se borra su fila de `RequiredConcept`;
  - un aviso `concept` por cada borrador con líneas sueltas de ese concepto (`lineIds`);
  - un aviso `kitPart` por cada `KitInstance` de borrador con `instanceRefs(…).length > 0` (`parts`);
  - se registra en el historial.
- **`deleteClient`**: sin presupuestos, borrado físico como hoy. Con borradores: `active:false`, `deletedAt:now`, `taxId: "~" + id` y un aviso `client` por borrador.
- **`deleteKit`**: un aviso `kit` (`kitInstanceId`, `label` = nombre) por cada instancia en un borrador; después, borrado físico de la plantilla (las instancias de borrador quedan con `templateId` null, que ya hace `SetNull`).
- **`withDraft`**: tras comprobar el estado, si hay `DraftNotice` del presupuesto y no se pasa `allowPending`, lanza `ValidationError({ _: PENDING })`. `issueInTx` hace la misma comprobación. `duplicateQuote` lanza `"Confirma los avisos antes de duplicar"`. `deleteDraft` no cambia.
- **`confirmNotice`**: usa `withDraft(…, { allowPending: true })`.
  - `concept`: borra las `lineIds` que aún existan.
  - `kit`: quita la instancia, como `removeKitInstance`.
  - `kitPart`: `applyKitRemoval`.
  - `client`: no se confirma; lanza `"Elige otro cliente"`.

  Después borra el aviso y recalcula.
- **`applyKitRemoval`**:
  - `cN`: se quita de `definition.components`, junto con su `q_cN` y su `choices[cN]`;
  - `main` de categoría: se borra `choices.main`, y el conjunto queda incompleto como hoy;
  - `main` fijo: se quita la instancia entera;
  - id de slot: se quita de `slots`;
  - `dN/…`: las mismas reglas dentro de la copia del dinámico, y `dN/main` fijo quita el dinámico colocado.

  Después llama a `regenerate`.
- **`updateHeader`**: con avisos, solo se admite si todos son `client` y el nuevo `clientId` es distinto del borrado. Al guardar se borran esos avisos y se vacían contacto e instalación si eran del cliente borrado.

- [ ] **Step 1: Escribir las pruebas que fallan.** En `tests/kits/refs.test.ts`:
  - `"instanceRefs finds main, components, choices, slots and keys inside dynamics"`.

  En `tests/deletion/service.test.ts`:
  - `"cannot delete a concept used in an issued quote"` (Review Focus 1: además, el emitido conserva sus líneas y su total);
  - `"deleting a concept used only in drafts leaves a concept notice and blocks the draft"` (Review Focus 2: `addCatalogLine` en ese borrador lanza `PENDING`, `issueQuote` también, `deleteDraft` funciona);
  - `"confirming a concept notice removes its lines and unblocks"`;
  - `"deleting a concept frees its code"` (Review Focus 3: `createConcept` con el mismo código funciona, y la línea naranja del borrador sigue apuntando al concepto borrado);
  - `"deleting a concept used in a kit instance leaves a kitPart notice; confirming refreshes the kit without it"` (componente fijo, slot de dinámico y `main` de categoría);
  - `"deleting a client with drafts keeps them, blocks them, and choosing another client unblocks"`;
  - `"deleting a kit used in drafts leaves a kit notice; confirming removes the instance"`;
  - `"cannot duplicate a draft with notices"` (Review Focus 5);
  - `"deleted concepts and clients are hidden from lists, options and exports"`;
  - `"deletionImpact lists affected drafts and kits"`.
- [ ] **Step 2: Ejecutarlas**: fallan.
- [ ] **Step 3: Esquema y migración.** Migración, `pnpm exec prisma generate` y reiniciar `pnpm dev`.
- [ ] **Step 4: Implementar** `refs.ts`, `deletion/service.ts`, `deletion/notices.ts`, los cambios de `withDraft`, `issueInTx`, `duplicateQuote`, `updateHeader` y `applyKitRemoval`, y los filtros `deletedAt: null` de los listados. Las funciones antiguas `removeConcept`, `removeClient` y `removeKit` siguen existiendo hasta la tarea 10, que cambia sus llamadas; sus pruebas no se tocan.
- [ ] **Step 5: Ejecutar la suite completa**: pasa (pruebas nuevas y antiguas).
- [ ] **Step 6: Subir la versión a 1.9.37 y hacer commit y push** (`feat(eliminar): borrado con avisos en borradores; 1.9.37`).

### Task 9: Quitar elementos de un conjunto llega a los borradores (F7) · 1.9.38

**Files:**
- Modify: `src/modules/kits/form.ts` (`nextKey`), `src/app/(app)/conjuntos/forms.tsx` (llamadas a `nextKey` con las claves iniciales)
- Modify: `src/modules/kits/refs.ts` (función nueva), `src/modules/kits/service.ts` (`saveKit`)
- Test: `tests/kits/form.test.ts`, `tests/kits/refs.test.ts`, `tests/kits/service.test.ts`

**Interfaces:**
- Cambia: `nextKey(prefix: string, taken: string[]): string` devuelve el **máximo + 1**, nunca un hueco. `conjuntos/forms.tsx` le pasa las claves iniciales de la definición guardada más las actuales.
- Produces: `removedParts(before: KitDefinition, after: KitDefinition): { components: string[]; slotTypes: string[]; variants: Record<string, string[]>; dynamics: string[]; dynamicTemplates: Record<string, string[]> }`. Por clave: lo que había antes y ya no está. `variants` son los `conceptIds` quitados de un tipo; `dynamicTemplates`, los `templateIds` quitados de un dinámico.
- Produces: `partsInInstance(removed, def, choices, slots): string[]`, que traduce lo anterior a claves de la instancia (`cN`; ids de slot del tipo o de la variante quitados; `dN` si se quitó el dinámico o su plantilla elegida).

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `"nextKey never reuses a gap"`: `nextKey("c", ["c1","c3"]) === "c4"`.
  - `"removedParts detects removed components, slot types, variants and dynamics"`.
  - `"partsInInstance maps them to slot ids and keys"`.
  - `"saving a kit without an element leaves kitPart notices in drafts that use it, not in issued quotes"`.
  - `"removing and adding an element in the same save only notifies the removed one"` (Review Focus 4).
  - `"other edits (price, quantity, formula) leave no notice"`.
- [ ] **Step 2: Ejecutarlas**: fallan.
- [ ] **Step 3: Implementarlo.** En `saveKit`, dentro de la misma transacción: se lee la definición anterior, se calcula `removedParts` y, por cada `KitInstance` de borrador con `templateId` del conjunto y `partsInInstance` no vacío, se crea un aviso `kitPart` con `label` = `"<nombre del conjunto>: se quitó <etiquetas>"`. La confirmación ya la cubre `applyKitRemoval` (tarea 8).
- [ ] **Step 4: Ejecutar la suite**: pasa.
- [ ] **Step 5: Subir la versión a 1.9.38 y hacer commit y push** (`feat(conjuntos): quitar elementos avisa en los borradores; 1.9.38`).

### Task 10: ✕ en las listas y en las fichas, con aviso de impacto (F1–F3) · 1.9.39

**Files:**
- Create: `src/components/delete-button.tsx`
- Modify: `src/modules/catalog/actions.ts`, `src/modules/clients/actions.ts`, `src/modules/kits/actions.ts` (o donde estén sus acciones: `grep -rn "removeKit\b" src/modules`). Acciones nuevas: `deletionImpactAction` y `deleteAction` por tipo.
- Modify: `src/app/(app)/catalogo/page.tsx`, `catalogo/forms.tsx:120-132`, `clientes/page.tsx`, `clientes/forms.tsx:86`, `clientes/[id]/page.tsx:114`, `conjuntos/page.tsx`, `conjuntos/[id]/page.tsx:54`
- Test: `tests/deletion/service.test.ts` (acciones: permisos)

**Interfaces:**
- Consumes: `deletionImpact`, `deleteConcept`, `deleteClient`, `deleteKit`, `issuedUse` (tarea 8).
- Produces: `DeleteButton({ kind, id, name, blocked }: { kind: "concept"|"client"|"kit"; id: string; name: string; blocked: string | null })`, un cliente.
  - Con `blocked`: ✕ deshabilitada con `title` y `aria-label` = motivo.
  - Si no: al pulsar pide `deletionImpactAction` y abre la confirmación en la propia fila (como `ConfirmButton`, sin modal). Texto: «¿Eliminar «nombre»?», seguido de las listas «Conjuntos que lo usan», «Borradores afectados» (enlazados) y «Está en la lista de obligatorios», y los botones «Eliminar» y «Cancelar».

- [ ] **Step 1: Escribir la prueba que falla** `"any signed-in user can delete; the action re-checks the issued rule on the server"`. Con `user@isf.test`, eliminar un concepto sin uso emitido funciona; con uso emitido, la acción devuelve el error aunque el cliente no deshabilite la ✕.
- [ ] **Step 2: Implementarlo.**
  - Una ✕ al final de cada fila de las tres listas. `issuedUse` se calcula una vez por página.
  - Los botones «Eliminar» de las fichas usan el mismo `DeleteButton` y las mismas acciones: dejan de desactivar en silencio. «Desactivar» no cambia.
  - Se quitan las llamadas a `removeConcept`, `removeClient` y `removeKit` desde la interfaz. Las funciones y sus pruebas se quedan si otras pruebas las usan; si quedan sin uso fuera de las pruebas, se dejan con un comentario `shortcut:` y se avisa al usuario en el informe final, sin borrar pruebas.
- [ ] **Step 3: Ejecutar la suite y comprobar en Chrome** con `user@isf.test`:
  - un concepto sin uso se elimina;
  - uno usado en un borrador y en un conjunto enseña las dos listas y se elimina;
  - uno emitido tiene la ✕ deshabilitada con el motivo.
- [ ] **Step 4: Subir la versión a 1.9.39 y hacer commit y push** (`feat(eliminar): ✕ en catálogo, clientes y conjuntos; 1.9.39`).

### Task 11: Avisos en el borrador y líneas en naranja (F4, F6, F7) · 1.9.40

**Files:**
- Create: `src/app/(app)/presupuestos/[id]/pending.tsx`
- Modify: `src/modules/deletion/actions.ts` (nuevo, `confirmNoticeAction`), `presupuestos/[id]/page.tsx`, `kit-block.tsx`, `sections.tsx` (`EditorContext.pending`), `globals.css` (`.pend`, en ámbar)

**Interfaces:**
- Consumes: `listNotices`, `confirmNotice` (tarea 8).
- Produces: `EditorContext.pending: { lines: Set<string>; kits: Map<string, string[] | "all">; client: boolean }`. `PendingNotices({ notices })` pinta un `.warnbox` por aviso con su botón.
  - `concept`: «El producto «label» se ha borrado del catálogo. Al confirmar se quita del borrador.» + «Confirmar».
  - `kit`: «El conjunto «label» se ha borrado. Al confirmar se quita del borrador.» + «Confirmar».
  - `kitPart`: «label. Al confirmar, el conjunto se actualiza.» + «Confirmar».
  - `client`: «El cliente «label» se ha borrado: elige otro.» Sin botón; el campo Cliente queda en naranja.

- [ ] **Step 1: Implementarlo.**
  - Los avisos van arriba del borrador, donde hoy sale `PriceWarnings`.
  - Las líneas sueltas con aviso, la instancia entera (`kit`) o sus filas (`kitPart`, por clave) llevan `.pend`: fondo `--amber-bg` y borde `--amber-line`. El conjunto afectado se abre solo (como `OpenIfIncomplete`).
  - Mientras haya avisos, los controles de edición del borrador salen deshabilitados (`fieldset disabled` alrededor de la tabla y de la cabecera, salvo el campo Cliente cuando el aviso es `client`), y «Emitir» sale deshabilitado con el motivo `PENDING`. El servidor ya lo rechaza (tarea 8); esto es solo para que se vea.
- [ ] **Step 2: Comprobar en Chrome**, con dos pestañas:
  1. en una, se borra un concepto usado en un borrador abierto en la otra;
  2. en la otra, el siguiente cambio da el error `PENDING`;
  3. tras recargar, se ven el aviso y la línea naranja;
  4. «Confirmar» quita la línea y desbloquea.

  Repetir con un conjunto borrado, un elemento quitado de un conjunto y un cliente borrado.
- [ ] **Step 3: Subir la versión a 1.9.40, ejecutar la suite y hacer commit y push** (`feat(borrador): avisos de borrado por confirmar; 1.9.40`).

### Task 12: «!» en conjuntos y en el menú; conjuntos con problemas no se insertan (F5) · 1.9.41

**Files:**
- Modify: `src/modules/kits/service.ts:37-68` (`refIssues`: concepto con `deletedAt` → `"<descripción> se ha borrado del catálogo: cámbialo por otro"`, antes de la comprobación de `active`)
- Modify: `src/modules/quotes/kit-instances.ts:115` (`addKitInstance` lanza `ValidationError({ _: "Este conjunto tiene problemas: revísalo en Conjuntos" })` si `kitIssues(...).length > 0`; lo mismo `changeKitInstance` y `setKitDynamic` hacia una plantilla con problemas)
- Modify: `src/app/(app)/conjuntos/page.tsx:16-27` («!» junto a «Incompleto»), `src/app/(app)/layout.tsx`, `src/components/rail-link.tsx` (prop `alert?: string`), `presupuestos/[id]/page.tsx` (los conjuntos con problemas, deshabilitados en el buscador con el motivo)
- Test: `tests/kits/service.test.ts`, `tests/quotes/kit-instances.test.ts`

**Interfaces:**
- Produces: `kitsWithIssues(): Promise<Set<string>>` en `src/modules/kits/service.ts` (`// shortcut: recorre todas las plantillas activas en cada página; vale para decenas, cachear si llegan a cientos`).

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `"a kit using a deleted concept reports it as an issue"`.
  - `"a kit with issues cannot be added to a draft"`.

  Antes de escribirlas, ejecuta `grep -rn "incomplet" tests/quotes/kit-instances.test.ts tests/kits/service.test.ts`. Si alguna prueba existente espera que un conjunto incompleto **se pueda** insertar, para y pregunta al usuario (contradice la regla F5 que aceptó).
- [ ] **Step 2: Ejecutarlas**: fallan.
- [ ] **Step 3: Implementarlo.**
  - «!» (`<span class="alert" aria-label="Conjuntos con problemas">!</span>`, en ámbar) en la fila de la lista y en «Conjuntos» del menú lateral mientras `kitsWithIssues().size > 0`. En móvil también, dentro del menú desplegado.
  - En el buscador de conjuntos del borrador, la opción sale deshabilitada con el motivo.
  - La sección Presupuestos **no** se bloquea.
- [ ] **Step 4: Ejecutar la suite**: pasa.
- [ ] **Step 5: Subir la versión a 1.9.41 y hacer commit y push** (`feat(conjuntos): aviso ! y sin insertar conjuntos con problemas; 1.9.41`).

### Task 13: Cierre y preparación para `master`

- [ ] **Step 1: Comprobar todo:**
  - suite completa (pegar el resumen de Vitest);
  - `pnpm lint` sin errores;
  - `pnpm build` correcto;
  - `:3101` en 1.9.41 tras el autodespliegue, con la migración aplicada (contenedor `migrate` con `Exited (0)`).
- [ ] **Step 2: Recorrido completo en `:3101`** con `user@isf.test`:
  1. borrar un concepto usado en un borrador y en un conjunto;
  2. ver el «!» en el menú y en la lista;
  3. confirmar en el borrador;
  4. arreglar el conjunto;
  5. emitir;
  6. añadir una nota al emitido;
  7. ver su historial de estados;
  8. revisar el PDF.

  Los anchos de la tarea 2 se comprueban otra vez con el script.
- [ ] **Step 3: Documentación.** En `docs/superpowers/progreso.md` (CRLF): sección nueva con lo hecho, decisiones y pendientes. En `AGENTS.md` (CRLF), «Estado actual»: rama, versión 1.9.41, la regla nueva de borrado y el enlace a esta spec y este plan. Hacer commit y push.
- [ ] **Step 4: Avisar al usuario** con el resumen y la propuesta de PR `mejoras-uso-real` → `master`. No se fusiona ni se despliega producción sin su visto bueno.

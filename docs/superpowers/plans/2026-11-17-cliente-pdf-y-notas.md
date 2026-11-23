# Cliente en el PDF, notas internas, responsable y nota del conjunto · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** el PDF muestra cliente, dirección fiscal y contacto; las notas internas del presupuesto pasan a ser un chat con historial; cualquier cambio del borrador (salvo las notas) deja como responsable a quien lo hace; la nota de un conjunto se distingue de la de su última línea.

**Architecture:** los cambios del PDF se limitan a `buildDocument` y la plantilla v1. Las notas son dos tablas nuevas (`QuoteNote`, `QuoteNoteVersion`). Se leen recorriendo la cadena `parentId` y se escriben con `withDraft()`. Quedan fuera de `getQuote()` y, por tanto, de la instantánea emitida y del PDF. `withDraft()` recibe al actor y fija `ownerId`; las notas le pasan `null`.

**Tech Stack:** Next.js 16, React 19, Prisma 7 y PostgreSQL 17, Zod 4 y Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-cliente-pdf-y-notas-design.md`. Maquetas: `docs/diseno/maquetas/notas-presupuesto.html` y `docs/diseno/maquetas/nota-conjunto-pdf.html`.

## Global Constraints

- Se trabaja en `D:\dev\presupuestos-isf`, rama `mejoras-uso-real`. No se fusiona en `master` ni se despliega en producción.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test [archivo]`.
- Tras `prisma migrate dev`: `pnpm exec prisma generate` y reiniciar `pnpm dev`.
- Código en inglés; interfaz y textos en español con tildes.
- Las notas internas **nunca** llegan al PDF ni a la instantánea emitida.
- Las notas no cambian `ownerId`. Cualquier otra escritura en un borrador lo fija al actor.
- Texto de una nota: se recorta y no puede quedar vacío («Escribe la nota»); máximo 1000 caracteres (`Máximo 1000 caracteres`).
- Solo se modifican notas cuyo `quoteId` es un borrador. Lo emitido se rechaza con `LOCKED` (`withDraft`).
- Formularios con `ActionForm`. Los permisos se comprueban en el servidor.
- `AGENTS.md` y `progreso.md` usan saltos de línea CRLF.

## Review Focus

1. Guardar una nota editada con el mismo texto no debe crear una versión ni cambiar autor ni fecha. → prueba en la Tarea 5.
2. Duplicar un presupuesto (que no es crear una revisión) no arrastra notas, porque `duplicateQuote` no fija `parentId`. → prueba en la Tarea 5.
3. Borrar un borrador con notas editadas no debe fallar por claves foráneas: cascada nota → versiones → presupuesto. → prueba en la Tarea 5.
4. Una dirección fiscal con líneas en blanco o espacios de sobra no deja huecos en el PDF. → prueba en la Tarea 1.
5. El menú de un mensaje se abre también con teclado: el mensaje admite foco y la tecla de menú contextual lanza `contextmenu`; Esc cierra. → comprobación en la Tarea 6.

---

### Task 1: Destinatario del PDF = cliente, dirección fiscal y contacto

**Files:**
- Modify: `src/pdf/document.ts` (tipo `PdfDocument.recipient`; en `buildDocument`, se quitan `address`/`cityLine` y se deja `where`, que sigue usándose en `letter.intro`)
- Modify: `src/pdf/templates/v1/index.ts:36`
- Test: `tests/pdf/document.test.ts`, `tests/pdf/template.test.ts` si alguna aserción usa `place`

**Interfaces:**
- Produces: `recipient: { name: string; address: string[]; attention: string | null }` (sin `place`).

- [ ] **Step 1: Ajustar y añadir pruebas en `tests/pdf/document.test.ts`**
  - Las aserciones existentes sobre `recipient.address` pasan a esperar `textLines(client.fiscalAddress)` del fixture, y se eliminan las de `recipient.place` (líneas ~144, 159 y 162).
  - Prueba nueva: `"el destinatario es razón social, dirección fiscal línea a línea y contacto"`, con `fiscalAddress: "Calle de Ejemplo, 1.\r\n\n  Dirección ficticia.  \n"` y una ubicación con dirección propia:
    ```ts
    expect(d.recipient).toEqual({ name: "<legalName>", address: ["Calle de Ejemplo, 1.", "Dirección ficticia."], attention: "A la atención de Ana López" });
    expect(d.letter.intro).toContain(" en ");   // la ubicación sigue en la carta
    ```
- [ ] **Step 2:** ejecuta `pnpm test tests/pdf`. Debe fallar.
- [ ] **Step 3:** en `buildDocument`, `recipient = { name: q.client.legalName, address: textLines(q.client.fiscalAddress), attention }`; en la plantilla, `${[...d.recipient.address, d.recipient.attention ?? ""]...}`.
- [ ] **Step 4:** ejecuta `pnpm test tests/pdf` y `pnpm exec tsc --noEmit`. Debe pasar.
- [ ] **Step 5: Commit** `fix(pdf): destinatario con dirección fiscal del cliente`

### Task 2: Resaltar en el PDF los conjuntos con nota

**Files:**
- Modify: `src/pdf/document.ts` (`PdfRow`, bucle de filas)
- Modify: `src/pdf/templates/v1/index.ts` (`row`), `src/pdf/templates/v1/styles.ts`
- Test: `tests/pdf/document.test.ts`, `tests/pdf/template.test.ts`

**Interfaces:**
- Produces: `PdfRow` de tipo `line` y `note` con `kit?: true`. Solo se marca en las filas (líneas visibles, sus notas y la nota del conjunto) de un conjunto cuyo `comment.trim()` no está vacío.

- [ ] **Step 1: Pruebas**
  - document: `"las filas de un conjunto con nota van marcadas; las de uno sin nota, no"`: el fixture tiene dos conjuntos, uno con nota y otro sin ella. `rows.filter(r => r.kit)` debe contener exactamente las líneas del primero, la nota de su última línea y la nota del conjunto, con la nota del conjunto (`of: "kit"`) como última fila marcada.
  - template: una fila `{ kind: "line", kit: true, ... }` produce `<tr class="line k">`. Una fila `{ kind: "note", of: "kit", kit: true }` produce `<tr class="note kit k">`. Una nota sin `kit` sigue produciendo exactamente `<tr class="note line">`, como en la prueba actual. El CSS contiene `tr.k td:not(:first-child){background:` y `tr.note.kit td:not(:first-child){font-style:normal` con `border-top:` `dashed`.
- [ ] **Step 2:** ejecuta `pnpm test tests/pdf`. Debe fallar.
- [ ] **Step 3: Implementar.** En el bucle, `const marked = !!kit?.comment.trim()` por conjunto, y las filas de ese conjunto llevan `kit: true`. En la plantilla, la clase es `${r.kind}${r.kind === "note" ? " " + r.of : ""}${r.kit ? " k" : ""}`. Estilos con los valores de la maqueta `nota-conjunto-pdf.html` traducidos a pt/mm:
  - fondo `#f3f5f3` en `tr.k td:not(:first-child)`;
  - `tr.note.kit` sin cursiva, a 9pt, con `border-top:.5pt dashed var(--mut)` y `padding-left:6mm`.
  
  La regla de `paginate.ts` no cambia.
- [ ] **Step 4:** ejecuta `pnpm test tests/pdf`. Debe pasar.
- [ ] **Step 5: Commit** `feat(pdf): resaltar el bloque de un conjunto con nota`

### Task 3: Pie del conjunto en el editor (E2)

**Files:**
- Modify: `src/app/(app)/presupuestos/[id]/comment.tsx` (cuando `variant === "ck"`, añadir `<span className="lab">Comentario del conjunto</span>` delante de `<p>`)
- Modify: `src/app/globals.css:228` (`.comment.ck`)

- [ ] **Step 1:** cambia `.comment.ck` a `background:var(--band);border-top:1.5px solid var(--ink)` y añade `.comment .lab{font-style:normal;font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;color:var(--mut);flex:none;padding-top:2px}`.
- [ ] **Step 2: Verificar con Claude in Chrome.** Abre un borrador con un conjunto comentado y una línea comentada: se ve el pie gris con la etiqueta, como en la opción E2, y la nota de la línea no cambia.
- [ ] **Step 3: Commit** `feat(editor): pie del conjunto para su comentario`

### Task 4: Responsable = quien modifica el borrador

**Files:**
- Modify: `src/modules/quotes/service.ts` (`withDraft`, `recalc` y sus 13 llamadas), `src/modules/quotes/kit-instances.ts` (3 llamadas), `src/modules/quotes/lifecycle.ts:133`
- Test: `tests/quotes/service.test.ts`

**Interfaces:**
- Produces: `withDraft<T>(actor: CurrentUser | null, quoteId: string, fn: (tx: Tx, quote: Quote) => Promise<T>): Promise<T>`. Con un actor, la actualización de totales de `recalc` incluye `ownerId: actor.id`. Con `null`, no toca `ownerId`.

- [ ] **Step 1: Prueba** `"cualquier cambio en el borrador deja como responsable a quien lo hace"`: `makeDraft()` y un segundo usuario `other = await makeUser("presupuestador")`. Después de `addCustomLine(other, sub.id, …)`, `getQuote(...).ownerId === other.id`. Después de `updateSection(d.actor, …)`, `ownerId === d.actor.id`.
- [ ] **Step 2:** ejecuta `pnpm test tests/quotes/service.test.ts`. Debe fallar.
- [ ] **Step 3:** cambia la firma y pasa `actor` en todas las llamadas (`grep -rn "withDraft(" src` debe mostrar 17 usos, todos con el primer argumento). Se mantiene `ownerId: actor.id` en `updateHeaderAction`.
- [ ] **Step 4:** ejecuta `pnpm test tests/quotes` y `pnpm exec tsc --noEmit`. Debe pasar.
- [ ] **Step 5: Commit** `feat(presupuestos): quien modifica el borrador pasa a ser su responsable`

### Task 5: Modelo y servicio de notas; retirar `travelNote`

**Files:**
- Modify: `prisma/schema.prisma` (modelos del spec; relaciones `Quote.notes`, `User.notesAuthored` y `User.noteVersionsAuthored` con `onDelete: Restrict`; cascada de `QuoteNote` → `Quote` y de `QuoteNoteVersion` → `QuoteNote`; índice `@@index([quoteId])`)
- Create: `prisma/migrations/<timestamp>_quote_notes/migration.sql` (con `prisma migrate dev --create-only` y después se edita)
- Create: `src/modules/quotes/notes.ts`
- Modify: `src/modules/quotes/schema.ts` (quitar `travelNote`; añadir `noteInput`), `actions.ts:49` (quitar `"travelNote"`; añadir 3 acciones), `lifecycle.ts:71` (quitar de `HEADER`)
- Test: `tests/quotes/notes.test.ts`

**Interfaces:**
- Consumes: `withDraft(null, …)` de la Tarea 4 y `logQuote`.
- Produces:
  ```ts
  export const noteInput = z.object({ text: z.string().trim().min(1, "Escribe la nota").max(1000, "Máximo 1000 caracteres") });
  export type NoteView = { id: string; text: string; authorId: string; authorName: string; updatedAt: Date; edited: boolean;
    versions: { text: string; authorName: string; createdAt: Date }[] };          // versiones, de la más antigua a la más reciente
  export type NoteGroup = { quoteId: string; revision: number; issuedAt: Date | null; editable: boolean; notes: NoteView[] }; // notas por updatedAt ascendente
  export async function listNotes(quoteId: string): Promise<NoteGroup[]>;          // cadena parentId, de R0 a la actual; editable = actual && DRAFT
  export async function addNote(actor: CurrentUser, quoteId: string, raw: { text: string }): Promise<QuoteNote>;
  export async function editNote(actor: CurrentUser, noteId: string, raw: { text: string }): Promise<void>;
  export async function deleteNote(actor: CurrentUser, noteId: string): Promise<void>;
  // actions.ts
  export const addNoteAction: Action;    // form: quoteId, text
  export const editNoteAction: Action;   // form: id, text
  export const deleteNoteAction: Action; // form: id
  ```

- [ ] **Step 1: Pruebas en `tests/quotes/notes.test.ts`** (con `makeDraft`, `completeDraft`, `issueQuote`, `createRevision`, `duplicateQuote` y `deleteDraft`):
  - `añadir una nota la guarda con autor y fecha, sin cambiar el responsable`: con `other`, `addNote(other, …)`; `listNotes` → un grupo editable con `authorId === other.id`; `ownerId` no cambia. Queda en el historial una entrada `note.create`.
  - `editar una nota ajena la pasa al editor, guarda la versión anterior y la marca editada`: A escribe «uno» y B la edita a «dos» → `authorId === B`, `edited`, `versions` = `[{ text: "uno", authorName: A.name }]`, `updatedAt` mayor que antes. Si después A la edita a «tres», `versions` tiene `["uno", "dos"]` en ese orden.
  - `editar con el mismo texto no crea versión ni cambia autor ni fecha`.
  - `texto vacío o de más de 1000 caracteres se rechaza`: lanza `ValidationError`.
  - `borrar una nota borra sus versiones`: `prisma.quoteNoteVersion.count({ where: { noteId } }) === 0`.
  - `una nota emitida no se edita ni se borra; la revisión la muestra en solo lectura`: completa, añade la nota, emite y crea la revisión. `listNotes(rev.id)` devuelve dos grupos, `[R0 no editable con la nota, R1 editable vacío]`. `editNote` y `deleteNote` sobre esa nota lanzan `ValidationError` (`LOCKED`). `addNote(rev.id)` funciona.
  - `duplicar no arrastra notas`: `listNotes(dup.id)` → un grupo vacío.
  - `borrar un borrador con notas editadas funciona`.
  - `las notas nunca llegan a la instantánea ni al PDF`: con una nota «SECRETO-INTERNO», después de emitir, `JSON.stringify(issuedDocument.snapshot)` no contiene ese texto, y `TEMPLATES.v1.body(buildDocument(toPdfSource({...}, await getQuote(id)), { draft: true }))` tampoco.
- [ ] **Step 2:** ejecuta `pnpm test tests/quotes/notes.test.ts`. Debe fallar.
- [ ] **Step 3: Esquema y migración.** Ejecuta `pnpm exec prisma migrate dev --create-only --name quote_notes` y edita el SQL para que, antes del `DROP COLUMN "travelNote"`, haga:
  ```sql
  INSERT INTO "QuoteNote" (id, "quoteId", "authorId", text, edited, "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, id, "ownerId", btrim("travelNote"), false, "updatedAt", "updatedAt"
  FROM "Quote" WHERE btrim("travelNote") <> '';
  ```
  Después ejecuta `pnpm exec prisma migrate dev`, `pnpm exec prisma generate` y reinicia `pnpm dev`.
- [ ] **Step 4: Implementar `notes.ts`.**
  - `listNotes` sube por `parentId` con `findUnique` hasta la raíz, invierte el orden y hace una sola consulta `quoteNote.findMany({ where: { quoteId: { in } }, include: { author, versions: { include: { author }, orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "asc" } })`.
  - `editNote`: si el texto no cambia, retorna sin hacer nada. Si cambia, crea la versión `{ authorId, text, createdAt: note.updatedAt }` y actualiza `{ authorId: actor.id, text, edited: true, updatedAt: new Date() }`.
  - Las tres escrituras pasan por `withDraft(null, note.quoteId, …)` y registran con `logQuote(tx, actor, quoteId, "note.create" | "note.update" | "note.delete", "Nota añadida a|editada en|borrada de " + quoteLabel(quote))`.
  - Las acciones usan el patrón `action((actor, f) => …)` de `actions.ts`.
- [ ] **Step 5:** ejecuta `pnpm test` completo y `pnpm exec tsc --noEmit`. Debe pasar. `grep -rn travelNote src tests` solo puede aparecer en `src/generated` y en las migraciones.
- [ ] **Step 6: Commit** `feat(presupuestos): notas internas con autor e historial de versiones`

### Task 6: Bloque y ventana de notas en el editor

**Files:**
- Create: `src/app/(app)/presupuestos/[id]/notes.tsx` (`"use client"`)
- Modify: `src/app/(app)/presupuestos/[id]/page.tsx:152-164` (sustituir el bloque «Desplazamiento» por `<Notes groups={await listNotes(q.id)} meId={me.id} />`)
- Modify: `src/app/globals.css` (bloque `/* Notas */`)

**Interfaces:**
- Consumes: `listNotes`, `NoteGroup` y las tres acciones de la Tarea 5. `ActionForm` (`src/components/action-form.tsx`).
- Produces: `export function Notes({ groups, meId }: { groups: NoteGroup[]; meId: string })`.

Comportamiento (copiado del spec; la maqueta manda en lo visual):
- Bloque `h3` «Notas»:
  - si hay notas, la última es un botón (`.lastnote`) con autor · `dd/mm hh:mm`, el contador total y «Ver las N notas →», que abre la ventana;
  - si el grupo actual es editable, hay un `ActionForm addNoteAction` con un `textarea name="text" maxLength={1000}` y el botón «Guardar nota».
- Ventana (`.notes-win`): flotante abajo a la derecha (`position:fixed`), con la cabecera verde «Notas · N» y la × (`aria-label="Cerrar"`, también Esc).
  - Separadores por grupo: «R00 · emitida dd/mm/aaaa» o «R01 · borrador».
  - Los mensajes propios (`authorId === meId`) van a la derecha y los ajenos a la izquierda, con nombre, fecha, hora y la marca «editado».
  - Los grupos no editables van en gris, con borde punteado y 🔒, y sin menú.
  - Al abrir la ventana, el chat se desplaza al final.
- Menú (`role="menu"`) con «Editar», «Ver versiones anteriores» (solo si `edited`) y «Eliminar». Se abre con `onContextMenu` (que cubre el clic derecho y la tecla de menú, porque el mensaje tiene `tabIndex={0}`) o con una pulsación táctil mantenida de 500 ms (`pointerType === "touch"`, que se cancela al mover o al levantar). Se cierra con un clic fuera o con Esc.
- Editar: la caja de la ventana pasa a `editNoteAction` con `id` oculto y el texto cargado. Aparece el aviso «Editando nota de X · quedará a tu nombre» (o «Editando tu nota» si es propia) y los botones «Cancelar» y «Guardar cambios».
- Eliminar: `deleteNoteAction`, con `ConfirmButton` si encaja en el menú.
- Versiones: de la más antigua a la actual, que va abajo y marcada «actual».
- Tamaños (las media queries de `globals.css`: 1360px y 900px):
  - escritorio: las versiones salen en una ficha flotante junto al mensaje;
  - `max-width:1360px`: la ventana se ensancha (`left:60px`) y las versiones sustituyen al chat con «← Notas»;
  - `max-width:900px`: la ventana ocupa toda la pantalla, el menú es una hoja inferior con fondo oscuro y las versiones ocupan la pantalla completa.

- [ ] **Step 1:** implementa `notes.tsx`, la sustitución en `page.tsx` y el CSS.
- [ ] **Step 2:** ejecuta `pnpm exec tsc --noEmit`, `pnpm lint` y `pnpm test`. Deben pasar.
- [ ] **Step 3: Verificar con Claude in Chrome** a 1440, 1024 y 390 px, con dos usuarios:
  - escribir una nota;
  - abrir la ventana desde la última nota;
  - editar una nota ajena (pasa a la derecha, con «editado» y mi nombre);
  - ver las versiones (orden de antigua a actual);
  - cancelar una edición;
  - borrar una nota;
  - emitir y crear una revisión (las notas de R0 salen en gris y sin menú);
  - abrir el menú con teclado (Tab y la tecla de menú) y cerrarlo con Esc;
  - comprobar que el PDF borrador no contiene las notas.
- [ ] **Step 4: Commit** `feat(editor): ventana de notas del presupuesto`

### Task 7: Documentación de estado

**Files:**
- Modify: `docs/superpowers/progreso.md`, `AGENTS.md` (los dos en CRLF)

- [ ] **Step 1:** añade a la cronología de `progreso.md` el trabajo hecho y la migración `quote_notes`. En la sección «Estado actual» de `AGENTS.md`, apunta el spec y el plan. Comprueba los saltos de línea con `file AGENTS.md docs/superpowers/progreso.md`, que debe indicar «with CRLF line terminators».
- [ ] **Step 2: Commit** `docs: cliente en PDF, notas internas, responsable y nota del conjunto`

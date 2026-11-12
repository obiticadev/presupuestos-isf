# Mejoras · Bloque 2: clientes e instalaciones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las «Ubicaciones de trabajo» pasan a ser «Instalaciones» (Nombre, Dirección, Instalación, País) sin perder datos; la cabecera del borrador muestra el selector «Nombre» y, a su derecha, «Instalación» (`instalación · país`); las filas editables del cliente cuadran; y los clientes se exportan, se descargan en plantilla y se importan por Excel (tres hojas, CIF como clave).

**Architecture:** `ClientLocation` sigue siendo la entidad; una migración escrita a mano renombra `city` → `installation` y `province` → `country`. Una función pura `installationLabel` da el texto `instalación · país` a la cabecera, la vista de solo lectura y el selector. `buildDocument` lee los dos nombres de campo para que los snapshots antiguos se regeneren igual. El Excel de clientes copia el patrón del catálogo (`exceljs`, vista previa y confirmación, todo o nada); las utilidades de lectura de celdas se mueven a `src/lib/excel.ts` para compartirlas, y el formulario de importación pasa a `src/components/import-form.tsx` para servir a los dos.

**Tech Stack:** Next.js 16 (App Router, Server Actions, Route Handlers), React 19, Prisma 7 (PostgreSQL 17), Zod 4, exceljs, Vitest. CSS propio en `src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-11-11-mejoras-uso-real-design.md`, Bloque 2 (2.1, 2.2, 2.3) y la tabla «Datos y migraciones».

## Global Constraints

- Código en inglés; interfaz y documentación en español.
- Migración que no pierde datos: `ALTER TABLE "ClientLocation" RENAME COLUMN "city" TO "installation"` y `RENAME COLUMN "province" TO "country"`. Nunca `DROP`/`ADD`. Se crea con `--create-only` y se edita a mano.
- Los snapshots emitidos no se migran: `buildDocument` lee `installation ?? city` y `country ?? province`.
- Permisos en el servidor: exportar y plantilla, cualquier usuario con sesión; **importar, solo administradores** (decisión del usuario, 2026-11-12, igual que el catálogo).
- «Instalación» se refresca **al momento** al cambiar el selector «Nombre», sin guardar (decisión del usuario, 2026-11-12); se guarda con «Guardar cabecera», como hoy.
- Formularios con `ActionForm` o con el patrón `keep` de `clientes/forms.tsx` (conserva lo escrito si el servidor da error).
- Sin librerías nuevas.
- Conservar CRLF en los archivos que ya lo tienen (`src/app/globals.css`, `src/modules/clients/service.ts`, `AGENTS.md`, `progreso.md`). Comprobar con `file <ruta>` antes de hacer commit.
- No se borran pruebas: solo se añaden. Las existentes que usan `city`/`province` se adaptan al nombre nuevo (mismos valores, mismas aserciones).
- Al tocar la interfaz no se mueve lo que no se pide (tamaño y posición de botones): medir antes y después en Chrome.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test` desde `D:\dev\presupuestos-isf`. Tras migrar: `pnpm exec prisma generate` y reiniciar `pnpm dev` (en Windows, matar también el `node` que queda: `taskkill /PID … /T /F`).
- Commit y push a `mejoras-uso-real` al cerrar cada tarea. Nunca a `master` ni a Dokploy.

**Fuera de este bloque (Bloque 3):** el modo de importación *Completa* (bajas de lo que no está en el Excel, 3.2) y el «Sin cambios» con su contador (3.1), también para clientes. Aquí la importación de clientes es solo *Añadir y actualizar*: lo que no aparece en el Excel no se toca.

## Review Focus

1. Exportar los clientes y volver a importar el mismo archivo sin tocarlo da 0 altas, todo «Cambio», 0 errores, y los datos quedan idénticos → Tarea 5.
2. Un CIF escrito distinto en las hojas («a-28 000.000» en *Contactos* y «A28000000» en *Clientes* o en la base) casa con el mismo cliente → Tarea 5.
3. Un contacto o una instalación cuyo CIF no está ni en la hoja *Clientes* ni en la base es un error de esa fila, y no se guarda nada de ninguna hoja → Tarea 5.
4. Un PDF emitido antes de la migración (snapshot con `city`/`province`) se regenera con la misma dirección `instalación (país)` → Tarea 3.
5. Una instalación desactivada por la importación (`Activo` = NO) que ya usa un borrador sigue saliendo en su selector («Nombre») y «Para emitir» avisa de que ya no está activa → Tarea 5 (servicio) y Tarea 2 (`activeOrCurrent`, ya existente).

---

### Task 1: Migración y renombrado de la instalación

**Files:**
- Create: `prisma/migrations/20261112xxxxxx_installation/migration.sql` (con `pnpm exec prisma migrate dev --create-only --name installation`, editado a mano)
- Modify: `prisma/schema.prisma:222-223`
- Modify: `src/modules/clients/schema.ts` (`locationInput`), `src/modules/clients/actions.ts` (`saveLocationAction`), `src/modules/clients/service.ts` (textos «ubicación» → «instalación»)
- Modify: `src/app/(app)/clientes/forms.tsx` (`LocationValues`, `ROW.location`, texto vacío), `src/app/(app)/clientes/[id]/page.tsx:86,114`, `src/app/(app)/clientes/page.tsx:41`
- Modify (adaptar, sin borrar): `tests/clients/service.test.ts:52,63`, `tests/helpers/quotes.ts:11`
- Test: `tests/clients/service.test.ts`

**Interfaces:**
- Produces:
  - `ClientLocation.installation String @default("")` y `ClientLocation.country String @default("")` (mismas columnas, nombre nuevo).
  - `locationInput` con `installation: text(100).optional().default("")` y `country: text(100).optional().default("")` en lugar de `city`/`province`.
  - `LocationValues = { id; name; address; installation; country; active }`.

- [ ] **Step 1: Prueba que falla** en `tests/clients/service.test.ts`: `"una instalación guarda nombre, dirección, instalación y país"`: `saveLocation(p, c.id, { name: "Nave 3", address: "C/ Forja 2", installation: "EDAR Sur", country: "España" })` → `getClient(c.id).locations[0]` tiene `installation === "EDAR Sur"` y `country === "España"`, y el historial del cliente contiene `"instalación Nave 3 añadida"`. Adaptar las líneas 52 y 63 y `tests/helpers/quotes.ts:11` a `installation`/`country` con los mismos valores.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm vitest run tests/clients/service.test.ts`
Expected: FAIL (tipos y columna `installation` no existen).

- [ ] **Step 3: Migración.** Antes, en la BD de desarrollo (5433): `SELECT count(*) FILTER (WHERE city <> ''), count(*) FILTER (WHERE province <> '') FROM "ClientLocation";` y anotar los dos números. Cambiar el esquema, `pnpm exec prisma migrate dev --create-only --name installation`, sustituir el SQL generado por los dos `ALTER TABLE "ClientLocation" RENAME COLUMN …` y nada más, `pnpm exec prisma migrate dev` (aplica), `pnpm exec prisma generate`. Repetir la consulta con `installation`/`country`: los dos números deben coincidir.

- [ ] **Step 4: Renombrar en código.** Esquema Zod, acción (`installation: s(form, "installation"), country: s(form, "country")`), `ROW.location.fields = [["name","Nombre"],["address","Dirección"],["installation","Instalación"],["country","País"]]`, `title: "instalación"`, «Sin instalaciones todavía.», `<h2>Instalaciones</h2>`, la nota de «Eliminar cliente» («…con sus contactos e instalaciones…»), la columna «Instalaciones» del listado, y en `service.ts` los mensajes «La instalación no existe» y `instalación ${name} añadida|modificada|eliminada|desactivada porque la usan presupuestos`. `pnpm exec tsc --noEmit` debe quedar limpio salvo lo que corrigen las tareas 2 y 3 (`presupuestos/[id]/page.tsx` y `pdf/document.ts`); si se ejecuta esta tarea sola, cambiar ya allí `city` por `installation` para que compile.

- [ ] **Step 5: Ejecutar la suite completa**

Run: el comando de pruebas global.
Expected: PASS, todas (240 de antes + las nuevas).

- [ ] **Step 6: Commit y push** (`git add prisma src/modules/clients src/app/(app)/clientes tests`; comprobar CRLF de `service.ts`). Mensaje: `feat(clientes): las ubicaciones pasan a instalaciones (installation, country) sin perder datos`.

---

### Task 2: Cabecera del borrador con «Nombre» e «Instalación»

**Files:**
- Create: `src/modules/clients/labels.ts`
- Create: `src/app/(app)/presupuestos/[id]/installation-fields.tsx` (componente cliente)
- Modify: `src/app/(app)/presupuestos/[id]/page.tsx:81-86,115`
- Modify: `src/modules/quotes/issue.ts:18,20`, `src/modules/quotes/service.ts:206`
- Test: `tests/clients/labels.test.ts`, `tests/quotes/issue.test.ts`

**Interfaces:**
- Consumes: `installation`, `country` (Tarea 1).
- Produces:
  - `installationLabel(l: { installation: string; country: string } | null | undefined): string` en `labels.ts`: `installation · country`, sin el separador si falta uno, `"—"` si no hay instalación elegida o las dos están vacías.
  - `InstallationFields({ options, current }: { options: { id: string; name: string; label: string }[]; current: string | null })`: renderiza dos `.field` hermanos: «Nombre» (`<select name="locationId">` con «— Sin elegir —» y una opción por instalación, texto = solo `name`) y «Instalación» (`<output>` o `<input readOnly>` con el `label` de la elegida, `"—"` sin elegir). Estado local con `useState(current)`; al cambiar el selector se actualiza el texto al momento.

- [ ] **Step 1: Pruebas que fallan.**
  - `tests/clients/labels.test.ts`: `installationLabel({ installation: "EDAR Sur", country: "España" })` → `"EDAR Sur · España"`; solo instalación → `"EDAR Sur"`; solo país → `"España"`; `{ "", "" }` → `"—"`; `null` → `"—"`; espacios alrededor se recortan (`"  EDAR  "` → `"EDAR"`).
  - `tests/quotes/issue.test.ts`: en las pruebas existentes de `code: "location"`, añadir una prueba nueva `"los avisos hablan de la instalación"`: sin `locationId` el mensaje es `"Falta la instalación"`; con la instalación desactivada, `"La instalación ya no está activa en el cliente: elige otra"`.

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm vitest run tests/clients/labels.test.ts tests/quotes/issue.test.ts`
Expected: FAIL (`installationLabel` no existe; mensajes antiguos).

- [ ] **Step 3: Implementar** `installationLabel`, los dos mensajes de `issue.ts` y el de `service.ts:206` («Elige una instalación de este cliente»).

- [ ] **Step 4: Cabecera.** En `page.tsx`, sustituir la `label` «Ubicación» por `<InstallationFields options={activeOrCurrent(client.locations, q.locationId).map((l) => ({ id: l.id, name: l.name, label: installationLabel(l) }))} current={q.locationId} />`. Quedan en la primera fila de `.headform` (rejilla de 3): Cliente · Nombre · Instalación. En la vista de solo lectura, `<dt>Ubicación</dt>` pasa a `<dt>Nombre</dt><dd>{q.location?.name ?? "—"}</dd><dt>Instalación</dt><dd>{installationLabel(q.location)}</dd>`. El `key` del `ActionForm` (`q.updatedAt`) ya reinicia el estado local al guardar.

- [ ] **Step 5: Suite completa y lint**

Run: el comando de pruebas global; `pnpm lint`.
Expected: PASS, todas; lint sin errores.

- [ ] **Step 6: Revisión en Chrome** (`http://localhost:3000`, el borrador de pruebas `cmw9urhye0012djm6hdo8szw4`): a 1440 px y a 390 px, cambiar «Nombre» y ver que «Instalación» cambia sin guardar; «Guardar cabecera» lo conserva; «— Sin elegir —» muestra «—»; en un emitido salen «Nombre» e «Instalación»; «Para emitir» dice «Falta la instalación». Medir antes y después la posición de «Guardar cabecera»: no se mueve más allá de lo que añade la fila.

- [ ] **Step 7: Commit y push.** Mensaje: `feat(editor): cabecera con «Nombre» e «Instalación» (instalación · país)`.

---

### Task 3: El PDF lee instalaciones nuevas y antiguas

**Files:**
- Modify: `src/pdf/document.ts:7,55-57`
- Modify: `tests/pdf/fixture.ts:32` (pasa a `installation`/`country`)
- Test: `tests/pdf/document.test.ts`

**Interfaces:**
- Produces: `SnapshotQuote.location: { name: string; address: string; installation?: string; country?: string; city?: string; province?: string } | null` (los dos últimos, solo en snapshots anteriores a 2026-11-12; comentario de una línea que lo diga).

- [ ] **Step 1: Pruebas que fallan** en `tests/pdf/document.test.ts`:
  - `"la dirección lleva la instalación y el país"`: snapshot con `{ name: "Planta", address: "Ctra. de Toledo, km 4", installation: "28300 Aranjuez", country: "España" }` → `recipient.address` es `["Ctra. de Toledo, km 4", "28300 Aranjuez (España)"]`.
  - `"un snapshot antiguo con city y province se regenera igual"`: `{ name: "Planta", address: "Ctra. de Toledo, km 4", city: "28300 Aranjuez", province: "Madrid" }` → `["Ctra. de Toledo, km 4", "28300 Aranjuez (Madrid)"]`, igual que antes del cambio.
  - Dejar la prueba existente de la línea 14 con `city`/`province` tal cual (ya es un snapshot antiguo).

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm vitest run tests/pdf/document.test.ts`
Expected: FAIL en la primera (lee `city`).

- [ ] **Step 3: Implementar** en `buildDocument`: `const installation = loc?.installation ?? loc?.city ?? ""` y `const country = loc?.country ?? loc?.province ?? ""`, y la misma línea `cityLine` con esos dos valores.

- [ ] **Step 4: Suite completa.** Expected: PASS, todas. Emitir en local un borrador de prueba y abrir su PDF: la dirección sale con `instalación (país)`.

- [ ] **Step 5: Commit y push.** Mensaje: `feat(pdf): dirección con instalación y país; los snapshots antiguos se leen igual`.

---

### Task 4: Filas editables alineadas (`.rowform`)

**Files:**
- Modify: `src/app/globals.css:102,105` (CRLF)
- Modify: `src/app/(app)/clientes/forms.tsx` (el `<span>` de botones pasa a `className="acts"` sin cambiar su `style` de botones)

**Interfaces:** ninguna.

- [ ] **Step 1: Medir antes.** En Chrome, `http://localhost:3000/clientes/<id>` de un cliente con contactos e instalaciones, a 1440 px: con `getBoundingClientRect()` anotar el `left` y `width` de cada `input` de las filas guardadas y de la fila «Añadir», y el ancho del bloque «Guardar» + «Eliminar». Hoy deben diferir entre la fila nueva y las guardadas.

- [ ] **Step 2: Implementar.** La última columna de `.rowform` y `.rowhead` pasa de `auto` a un ancho fijo igual al de «Guardar» + «Eliminar» medido (en `rem`, redondeado hacia arriba); `.rowform .acts{display:flex;gap:6px;justify-content:flex-end}`. El `@media (max-width:900px)` (dos columnas, cabecera oculta) no cambia.

- [ ] **Step 3: Medir después.** Los `left` y `width` de cada columna coinciden en la cabecera, las filas guardadas y la fila «Añadir», en contactos e instalaciones; los botones conservan su tamaño (mismo `width`/`height` que antes). A 390 px la vista no cambia respecto a antes.

- [ ] **Step 4: Suite completa y lint.** Expected: PASS, todas; lint sin errores.

- [ ] **Step 5: Commit y push** (comprobar CRLF de `globals.css`). Mensaje: `fix(clientes): las filas de contactos e instalaciones cuadran con la fila de añadir`.

---

### Task 5: Excel de clientes (exportar, plantilla e importar en el servicio)

**Files:**
- Create: `src/lib/excel.ts` (movido de `src/modules/catalog/excel.ts`: `cellText`, `cellError`, `loadWorkbook`, `readSheetRows`)
- Modify: `src/modules/catalog/excel.ts` (usa `src/lib/excel.ts`; mismo comportamiento)
- Create: `src/modules/clients/excel.ts`, `src/modules/clients/import.ts`
- Modify: `src/modules/clients/service.ts` (`exportClients`)
- Test: `tests/clients/excel.test.ts`; `tests/catalog/excel.test.ts` sigue igual y en verde

**Interfaces:**
- Produces:
  - `src/lib/excel.ts`: `cellText(value: ExcelJS.CellValue): string`, `cellError(value: ExcelJS.CellValue): string | null`, `loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook | null>` (null = no es un .xlsx), `readSheetRows<C extends string>(ws: ExcelJS.Worksheet, columns: readonly C[], maxRows: number): { rows: { row: number; values: Record<C, string>; cellErrors: string[] }[] } | { error: string }` (el bucle actual de `readCatalogSheet`: falta de columna, filas vacías saltadas, límite de filas). Lo que ya hay en `catalog/excel.ts` (`MAX_IMPORT_ROWS`, `MAX_IMPORT_BYTES`, `XLSX_TYPE`) se queda allí y se importa desde clientes.
  - `src/modules/clients/excel.ts`:
    - `CLIENT_COLUMNS = ["CIF","Razon_social","Nombre_comercial","Direccion_fiscal","Forma_pago","Exclusiones","Validez_dias","Observaciones","Activo"]`
    - `CONTACT_COLUMNS = ["CIF","Nombre","Cargo","Email","Telefono","Activo"]`
    - `LOCATION_COLUMNS = ["CIF","Nombre","Direccion","Instalacion","Pais","Activo"]`
    - Hojas `"Clientes"`, `"Contactos"`, `"Instalaciones"` e `"Instrucciones"` (qué admite cada columna; «El CIF es la clave: los contactos e instalaciones se casan por CIF + nombre»; «Todo o nada»).
    - `writeClientsBook(rows: ClientDetail[]): Promise<Uint8Array<ArrayBuffer>>` (vacío = plantilla); `Validez_dias` vacío si `offerValidityDays` es null; `Activo` en `SI`/`NO`.
    - `readClientsBook(bytes: Uint8Array): Promise<{ clients: RawRow[]; contacts: RawRow[]; locations: RawRow[] } | { error: string }>`; falta una hoja → `Falta la hoja Contactos`; falta una columna → `Falta la columna Pais en la hoja Instalaciones`; más de `MAX_IMPORT_ROWS` filas sumando las tres hojas → error.
  - `exportClients(): Promise<ClientDetail[]>` en `service.ts`: todos los clientes, activos e inactivos, con `DETAIL`, por `legalName`.
  - `src/modules/clients/import.ts`:
    - `type ClientImportRow = { sheet: "Clientes" | "Contactos" | "Instalaciones"; row: number; code: string; action: "create" | "update"; errors: string[] }` (`code` = CIF en *Clientes*; `CIF · nombre` en las otras).
    - `type ClientImportResult = { error?: string; rows: ClientImportRow[]; created: number; updated: number; applied: boolean }`.
    - `importClients(actor: CurrentUser, bytes: Uint8Array, opts: { apply: boolean }): Promise<ClientImportResult>`: `assertAdmin(actor)` lo primero.
  - Reglas de `importClients` (todo o nada, igual que `importConcepts`):
    - *Clientes*: valida con `clientInput` (el CIF se normaliza como en el alta); `Activo` SI/NO (vacío = SI); CIF repetido en la hoja → `CIF repetido en la fila N`; existe en la base → `update`, si no → `create`.
    - *Contactos* e *Instalaciones*: el CIF se normaliza igual y debe estar en la hoja *Clientes* o en la base; si no → `El CIF X no está en la hoja Clientes ni en la base`. Validan con `contactInput` / `locationInput`. Clave `CIF + nombre` (nombre recortado, sin distinguir mayúsculas): repetida en la hoja → `Repetido en la fila N`; si en la base hay dos o más con ese nombre en el cliente → `Hay varios contactos (o instalaciones) con ese nombre en el cliente: renómbralos antes`. Uno → `update`; ninguno → `create`. `Activo` SI/NO.
    - Errores de columna con el prefijo de la columna del Excel (`Email: Email no válido`), como en el catálogo.
    - Con `apply` y sin errores: una transacción (timeout 60 s); primero los clientes, luego contactos e instalaciones; historial por elemento como los servicios (sufijo ` (importación)`) y una entrada final `entity: "client", entityId: "import", action: "import"`, `Importación de clientes: N altas, M cambios`. Un CIF repetido por carrera con otro alta se traduce como en `uniqueTaxId`.

- [ ] **Step 1: Mover las utilidades** a `src/lib/excel.ts` y hacer que `readCatalogSheet` use `loadWorkbook` + `readSheetRows`. Ejecutar `pnpm vitest run tests/catalog/excel.test.ts`: PASS sin tocar esa prueba.

- [ ] **Step 2: Pruebas que fallan** en `tests/clients/excel.test.ts` (helper `book({ Clientes: [...], Contactos: [...], Instalaciones: [...] })` que crea las tres hojas con sus cabeceras; `makeUser("admin")`, `makeUser("presupuestador")` y `makeClient` de `tests/helpers/quotes.ts`):
  - `"exportar e importar sin cambios da 0 altas y todo cambios, sin errores"`: dos clientes con un contacto y una instalación cada uno, uno desactivado y uno con `offerValidityDays: 30` → `importClients(admin, await writeClientsBook(await exportClients()), { apply: true })` da `created === 0`, `updated === 6`, sin errores; `exportClients()` antes y después son iguales en todos los campos guardados.
  - `"la plantilla tiene las cuatro hojas con sus cabeceras y sin filas"`.
  - `"un alta crea el cliente con su contacto y su instalación"`: CIF `"b-12 345.678"` en *Clientes* y `"B12345678"` en las otras → un cliente `B12345678`, con `contacts[0].email` y `locations[0].installation`/`country`.
  - `"un contacto de un cliente que solo está en la base casa por CIF + nombre y lo actualiza"`: «ana lópez» en el Excel con el cargo cambiado actualiza a «Ana López» existente (no crea otro).
  - `"un CIF que no está ni en Clientes ni en la base es un error y no se guarda nada"`: también hay un alta válida en *Clientes* → `applied === false`, error en la fila de *Contactos*, y el alta no existe en la base.
  - `"filas repetidas: CIF en Clientes y CIF + nombre en Instalaciones"` → errores `CIF repetido en la fila 2` y `Repetido en la fila 2`.
  - `"validez, email y Activo mal escritos dan error de su columna"`: `Validez_dias: "400"`, `Email: "no"`, `Activo: "quizá"`.
  - `"Activo NO desactiva una instalación usada por un borrador; el borrador avisa"`: `makeDraft` + `completeDraft`, importar su instalación con `Activo: "NO"` → `location.active === false` e `issueChecks` del borrador incluye `code: "location"`.
  - `"falta una hoja o una columna"` → `error` `Falta la hoja Contactos` y `Falta la columna Pais en la hoja Instalaciones`.
  - `"solo un administrador puede importar"`: `makeUser("presupuestador")` → `rejects.toThrow(ForbiddenError)`.
  - `"la importación queda en el historial"`: entrada `Importación de clientes: 1 altas, 0 cambios`.

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm vitest run tests/clients/excel.test.ts`
Expected: FAIL (módulos no existen).

- [ ] **Step 4: Implementar** `exportClients`, `src/modules/clients/excel.ts` e `importClients` según las interfaces y reglas de arriba.

- [ ] **Step 5: Suite completa.** Expected: PASS, todas.

- [ ] **Step 6: Commit y push.** Mensaje: `feat(clientes): exportar, plantilla e importar clientes por Excel (servicio)`.

---

### Task 6: Pantallas y descargas del Excel de clientes

**Files:**
- Create: `src/app/api/clientes/exportar/route.ts`, `src/app/api/clientes/plantilla/route.ts` (copias de las del catálogo con `writeClientsBook`; nombres `clientes-AAAA-MM-DD.xlsx` y `plantilla-clientes.xlsx`)
- Create: `src/components/import-form.tsx` (movido de `src/app/(app)/catalogo/importar/forms.tsx`, generalizado)
- Delete: `src/app/(app)/catalogo/importar/forms.tsx` (su contenido pasa al componente; la página del catálogo lo importa de ahí)
- Create: `src/app/(app)/clientes/importar/page.tsx`
- Modify: `src/modules/clients/actions.ts` (`importClientsAction`), `src/app/(app)/catalogo/importar/page.tsx`, `src/app/(app)/clientes/page.tsx` (enlaces)
- Test: `tests/api/clients-excel.test.ts`

**Interfaces:**
- Consumes: `writeClientsBook`, `exportClients`, `importClients`, `ClientImportResult` (Tarea 5).
- Produces:
  - `ImportForm({ step, keyLabel, doneHref, doneLabel }: { step: (prev: ImportState, data: FormData) => Promise<ImportState>; keyLabel: string; doneHref: string; doneLabel: string })`, con `ImportState = { ok: false; errors: Record<string, string> } | ({ ok: true } & { error?: string; created: number; updated: number; applied: boolean; rows: { sheet?: string; row: number; code: string; action: "create" | "update"; errors: string[] }[] }) | null`. Si alguna fila trae `sheet`, la tabla añade la columna «Hoja». El catálogo pasa su `importStep` actual (`keyLabel: "Código"`, `doneHref: "/catalogo"`, «Ver el catálogo») y se ve igual que hoy.
  - `importClientsAction(prev: ImportState, form: FormData): Promise<ImportState>`: misma comprobación de archivo que `runImport` del catálogo (vacío, más de 2 MB); `apply` = `form.get("apply") === "1"`; `revalidatePath("/clientes")` si se aplicó.

- [ ] **Step 1: Pruebas que fallan** en `tests/api/clients-excel.test.ts` (llaman al `GET` de cada ruta, como `tests/api/health.test.ts`; la sesión se simula con `vi.mock("@/modules/auth/session", …)` devolviendo un usuario de `makeUser` o `null`, al estilo del `vi.mock` de `tests/quotes/pdf.test.ts`):
  - `"exportar sin sesión da 401"`.
  - `"exportar con sesión devuelve un .xlsx con las hojas Clientes, Contactos e Instalaciones"` (content-type `XLSX_TYPE`, `content-disposition` con `clientes-`).
  - `"la plantilla se descarga con sesión"`.

- [ ] **Step 2: Ejecutar y ver que fallan.** Expected: FAIL (rutas no existen).

- [ ] **Step 3: Implementar** rutas, `ImportForm` genérico, `importClientsAction` y la página `/clientes/importar` (solo admin: `notFound()` si no lo es, como la del catálogo; mismos tres pasos explicativos, con «exporta los clientes actuales» y la nota «Lo que no esté en el Excel no se toca»). En `/clientes`, junto a «Nuevo cliente», enlaces «Exportar Excel» (`/api/clientes/exportar`, para todos) e «Importar» (`/clientes/importar`, solo admin), con la clase `btn` y sin mover «Nuevo cliente» de su sitio.

- [ ] **Step 4: Suite completa y lint.** Expected: PASS, todas; lint sin errores.

- [ ] **Step 5: Revisión en Chrome** con `admin@isf.test`: exportar, abrir el .xlsx (comprobar con `readClientsBook` desde un script si no hay Excel a mano), cambiar un cargo y añadir una instalación, «Revisar» (la tabla muestra «Hoja»), «Confirmar importación» y ver el cambio en la ficha del cliente; un archivo con un error no guarda nada. `/catalogo/importar` se ve y funciona igual que antes. Con `p@isf.test`: «Exportar Excel» sí, «Importar» no aparece y `/clientes/importar` da 404. Medir la posición de «Nuevo cliente» antes y después.

- [ ] **Step 6: Commit y push.** Mensaje: `feat(clientes): pantalla de importación y descargas del Excel de clientes`.

---

### Task 7: Cierre del bloque

- [ ] **Step 1:** Suite completa, `pnpm lint` y `pnpm build`: todo en verde. Anotar el número de pruebas.
- [ ] **Step 2:** Dejar `pnpm dev` en `http://localhost:3000` con datos de prueba (un cliente con dos instalaciones con país, el borrador de pruebas apuntando a una) para la revisión del usuario.
- [ ] **Step 3:** Tras el visto bueno del usuario: actualizar `docs/superpowers/progreso.md` (sección «Mejoras tras el uso real», Bloque 2 cerrado, migración nueva `…_installation` en «Al retomar») y `AGENTS.md` («Estado actual»), conservando CRLF; commit y push a `mejoras-uso-real`.

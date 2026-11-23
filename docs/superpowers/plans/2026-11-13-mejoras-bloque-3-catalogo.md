# Bloque 3 — catálogo, importaciones, historial y permisos: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importaciones con «Sin cambios» e importación completa, revisiones con precios al día, historial con versiones de cada concepto y catálogo/conjuntos abiertos a todos los usuarios.

**Architecture:** Servicios en `src/modules/*` (toda la lógica y los permisos), páginas de servidor en `src/app/(app)/*` que leen el estado de la URL y componentes cliente mínimos. Las versiones de un concepto son fotos en `AuditLog.data` (sin migración). La importación sigue siendo «todo o nada» en una transacción; lo «usado» se calcula antes de escribir.

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar páginas o acciones), React 19, TypeScript 5.9, Prisma 7 + PostgreSQL 17, Zod 4, Vitest, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-11-13-mejoras-bloque-3-design.md` (amplía la sección «Bloque 3» de `docs/superpowers/specs/2026-11-11-mejoras-uso-real-design.md`). Maquetas: `docs/diseno/maquetas/historial-concepto.html` (C escritorio/iPad, D móvil, E y F importación).

## Antes de empezar (contexto de trabajo)

- Código en `D:\dev\presupuestos-isf` (worktree sin `#`), rama `mejoras-uso-real`. **No tocar `master` ni el servidor.** Commit y push a `mejoras-uso-real` al final de cada tarea.
- BD de desarrollo en el puerto 5433 (`docker compose up -d db` si está parada). Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test` (solo reinicia `presupuestos_test`). Una sola prueba: añadir `-- tests/ruta.test.ts -t "nombre"`.
- Comprobaciones: `pnpm exec tsc --noEmit` y `pnpm lint` (0 errores).
- Semilla de pruebas: categoría `cat-material`, unidad `unit-ud`, impuesto `iva-21`, conceptos `concept-ser-prog`, `concept-ser-despl`… (seis, ver `tests/catalog/service.test.ts`). Usuarios con `makeUser("admin" | "presupuestador")` de `tests/helpers/users.ts`; presupuestos con `makeDraft()`/`completeDraft()` de `tests/helpers/quotes.ts`.
- Al cambiar `AGENTS.md` o `progreso.md`, conservar CRLF (no usar `sed -i` en Git Bash).
- Para matar el servidor: `pkill -f '[n]ext dev'`. Si una Server Action da `undefined` tras cambios, reiniciar `pnpm dev`.

## Global Constraints

- Código en inglés; interfaz y documentación en español.
- Importes con decimales exactos (`Prisma.Decimal`), nunca `float`. Mostrar con `formatDecimalEs(v, { max: 4 })` (da «10,00»).
- Permisos siempre en el servidor. Solo `importConcepts`/`importClients` con `mode: "full"` exigen `assertAdmin`.
- Ninguna migración de Prisma en este bloque.
- Las pruebas no se borran. Las que afirmaban que un presupuestador no puede editar o importar se reescriben para afirmar lo nuevo.
- Escrituras de borradores por `withDraft()`; lo emitido no se modifica.
- Textos de interfaz exactos del diseño: «Sin cambios», «Añadir y actualizar», «Completa: dejar igual que el Excel», «Confirmar importación», «Confirmar importación completa», «Se borrarán», «Se desactivarán», «Desactivar», «Dejar como está», «Historial (N)», «Antes:», «Solo lectura: cierra el historial (X) para editar.», «Incompleto».

## Review Focus

1. **Excel de la importación completa con menos filas de las esperadas** (alguien sube un archivo filtrado): la revisión debe mostrar en rojo cuántas bajas habrá antes de confirmar, y una hoja sin filas debe dar error. → prueba en la tarea 6.
2. **Algo pasa a estar usado entre «Revisar» y «Confirmar»**: debe desactivarse, nunca borrarse, ni perder el «todo o nada». → prueba en la tarea 6 (concepto añadido a un borrador entre las dos llamadas).
3. **Volver a guardar el concepto sin tocar nada**: no debe crear una versión vacía en el historial. → prueba en la tarea 2.
4. **Concepto con historial anterior a este bloque** (entradas sin foto): la pantalla no debe fallar; muestra la frase. → prueba en la tarea 2 (`getConceptHistory` con una entrada sin `data`).
5. **Decimales con distinta forma** («16,75» del Excel frente a `16.7500` de la BD): deben salir «Sin cambios». → prueba en la tarea 3.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/modules/catalog/history.ts` (nuevo) | Foto del concepto, diferencias entre fotos, lectura del historial |
| `src/modules/catalog/usage.ts` (nuevo) | Qué conceptos están usados y en qué plantillas de conjunto |
| `src/lib/import-result.ts` (nuevo) | Tipos comunes de la revisión de importaciones (servicios y formulario) |
| `src/modules/catalog/service.ts` | Permisos abiertos, fotos al escribir, «sin cambios» manual, `removeConcept` con `usage` |
| `src/modules/catalog/import.ts`, `src/modules/clients/import.ts` | «Sin cambios», cambios descritos, modo completo |
| `src/lib/import-file.ts`, `src/components/import-form.tsx` | Modo, decisiones y nueva revisión |
| `src/modules/kits/service.ts`, `src/app/(app)/conjuntos/**` | Permisos abiertos, avisos de conjunto incompleto |
| `src/modules/quotes/lifecycle.ts`, `src/modules/quotes/actions.ts`, `src/app/(app)/presupuestos/[id]/page.tsx` | Revisión con precios al día |
| `src/app/(app)/catalogo/page.tsx`, `src/app/(app)/catalogo/concept-history.tsx` (nuevo), `src/app/(app)/catalogo/history-line.tsx` (nuevo, cliente), `src/app/globals.css` | Pantalla del historial y ficha a pantalla completa en móvil |

---

### Task 1: Catálogo, conjuntos e importación «Añadir y actualizar» para todos

**Files:**
- Modify: `src/modules/catalog/service.ts` (quitar `assertAdmin` de `createConcept`, `updateConcept`, `setConceptActive`, `removeConcept`)
- Modify: `src/modules/kits/service.ts` (quitar de `saveKit`, `setKitActive`)
- Modify: `src/modules/catalog/import.ts`, `src/modules/clients/import.ts` (quitar `assertAdmin(actor)`; vuelve en la tarea 6 solo para `full`)
- Modify: `src/app/(app)/catalogo/page.tsx` (todos ven `ConceptForm`; se elimina la rama `<dl>` de solo lectura; botones «Importar Excel» y «Nuevo concepto» para todos), `src/app/(app)/catalogo/importar/page.tsx` y `src/app/(app)/clientes/importar/page.tsx` (quitar `notFound()` por rol), `src/app/(app)/clientes/page.tsx:26`, `src/app/(app)/conjuntos/page.tsx:16`, `src/app/(app)/conjuntos/[id]/page.tsx:16-47`
- Modify: comentarios «admin only» de `src/modules/catalog/actions.ts:80` y `src/modules/clients/actions.ts:81`
- Test: `tests/catalog/service.test.ts:77-81`, `tests/catalog/excel.test.ts:84-86`, `tests/clients/excel.test.ts:155-156`, `tests/kits/service.test.ts`

**Interfaces:**
- Produces: mismas firmas; solo cambia quién puede llamarlas.

- [ ] **Step 1: Reescribir las pruebas de permisos**

```ts
// tests/catalog/service.test.ts — sustituye «un presupuestador consulta pero no modifica»
test("un presupuestador crea, modifica y elimina conceptos", async () => {
  const p = await makeUser("presupuestador");
  const c = await createConcept(p, { ...base, code: "P1" });
  expect((await updateConcept(p, c.id, { ...base, code: "P1", description: "Relé 2" })).description).toBe("Relé 2");
  expect(await removeConcept(p, c.id)).toBe("deleted");
});
// tests/catalog/excel.test.ts — sustituye «un presupuestador no puede importar»
test("un presupuestador puede importar en modo añadir y actualizar", async () => {
  const p = await makeUser("presupuestador");
  const r = await importConcepts(p, await book([row({ Codigo: "PRE-1" })]), { apply: true });
  expect(r.applied).toBe(true);
});
// tests/clients/excel.test.ts:155 — igual: el presupuestador importa y `applied` es true.
// tests/kits/service.test.ts — añadir: un presupuestador guarda un conjunto válido y lo desactiva sin error.
```

Mantener intacta `tests/catalog/lists.test.ts` (categorías siguen siendo del administrador).

- [ ] **Step 2: Ejecutar y ver que fallan con `ForbiddenError`**
- [ ] **Step 3: Quitar las comprobaciones de rol listadas en Files** (servicios y páginas). En `catalogo/page.tsx` desaparece `isAdmin` salvo que no quede uso.
- [ ] **Step 4: Ejecutar toda la suite, `tsc` y `lint`** — Expected: todo en verde.
- [ ] **Step 5: Commit** `feat(permisos): catálogo, conjuntos e importación para todos los usuarios`

---

### Task 2: Fotos de concepto e historial (datos)

**Files:**
- Create: `src/modules/catalog/history.ts`
- Modify: `src/modules/catalog/service.ts` (`createConcept`, `updateConcept`, `setConceptActive`, `removeConcept` guardan foto; `changeSummary` pasa a usar `diffSnapshots`)
- Test: `tests/catalog/history.test.ts` (nuevo)

**Interfaces:**
- Produces (en `history.ts`):
  - `type ConceptSnapshot = { code: string; description: string; category: string; unit: string; tax: string; salePrice: string | null; cost: string | null; listPrice: string | null; discountPct: string | null; validated: boolean; active: boolean; notes: string; manufacturer: string; supplier: string; supplierRef: string }` — decimales con `Decimal#toFixed()` (sin ceros sobrantes: `"16.75"`), nombres tal como estén ese día.
  - `type HistorySource = "manual" | "import" | "import-full"`
  - `conceptSnapshot(c: ConceptDetail): ConceptSnapshot`
  - `historyData(c: ConceptDetail, source: HistorySource): { concept: ConceptSnapshot; source: HistorySource }` — el valor de `data` de `logAction`.
  - `type SnapshotChange = { field: keyof ConceptSnapshot; label: string; before: string; after: string }` — valores ya para mostrar (decimales `formatDecimalEs(v, { max: 4 })`, booleanos «sí»/«no», vacío y `null` como «vacío»).
  - `diffSnapshots(after: ConceptSnapshot, before: ConceptSnapshot): SnapshotChange[]` — en el orden de los campos del tipo; etiquetas: Código, Descripción, Categoría, Unidad, Impuesto, Precio de venta, Coste, PVP, Descuento (%), Validado, Activo, Observaciones, Fabricante, Proveedor, Referencia.
  - `describeChanges(changes: SnapshotChange[]): string` → `"Precio de venta: 10,00 → 12,00; Validado: no → sí"`.
  - `type ConceptVersion = { id: string; at: Date; userName: string | null; source: HistorySource | null; summary: string; snapshot: ConceptSnapshot | null }`
  - `getConceptHistory(conceptId: string): Promise<ConceptVersion[]>` — entradas `entity: "concept", entityId: conceptId`, de la más reciente a la más antigua (`createdAt desc, id desc`), `snapshot = null` si `data` no tiene `concept`.

- [ ] **Step 1: Pruebas que fallan**

```ts
test("diffSnapshots da los campos que cambian con sus valores", () => {
  const a = snap({ salePrice: "12", validated: true }), b = snap({ salePrice: "10", validated: false });
  expect(describeChanges(diffSnapshots(a, b))).toBe("Precio de venta: 10,00 → 12,00; Validado: no → sí");
});
test("cada escritura guarda la foto y guardar sin cambios no crea versión", async () => {
  const p = await makeUser("presupuestador");
  const c = await createConcept(p, { ...base, code: "H1", salePrice: "10" });
  await updateConcept(p, c.id, { ...base, code: "H1", salePrice: "12" });
  await updateConcept(p, c.id, { ...base, code: "H1", salePrice: "12,00" }); // igual: no cuenta
  await setConceptActive(p, c.id, false);
  const h = await getConceptHistory(c.id);
  expect(h.map((v) => v.snapshot?.salePrice)).toEqual(["12", "12", "10"]);
  expect(h.map((v) => v.snapshot?.active)).toEqual([false, true, true]);
  expect(h[1].summary).toBe("H1: Precio de venta: 10,00 → 12,00");
});
test("una entrada antigua sin foto se lee con su frase", async () => {
  await prisma.auditLog.create({ data: { entity: "concept", entityId: "concept-ser-prog", action: "update", summary: "SER-PROG: precio 1 → 2" } });
  const [v] = await getConceptHistory("concept-ser-prog");
  expect(v.snapshot).toBeNull();
  expect(v.summary).toBe("SER-PROG: precio 1 → 2");
});
```
(`snap(over)` es un ayudante local con valores por defecto.)

- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar `history.ts` y usarlo en el servicio.** Las escrituras de `service.ts` leen el concepto con `include: INCLUDE` tras escribir y pasan `data: historyData(after, "manual")`. `updateConcept`: si `diffSnapshots` sale vacío, no escribe ni registra y devuelve el concepto. El resumen de un cambio es `` `${code}: ${describeChanges(changes)}` ``. Borrado: la entrada «Baja de …» lleva la foto de antes de borrar.
- [ ] **Step 4: Suite, `tsc`, `lint` en verde** (ajustar solo las pruebas que comprobaban el texto antiguo de `changeSummary`, si las hay, al nuevo formato).
- [ ] **Step 5: Commit** `feat(catalogo): fotos de cada versión del concepto en el historial`

---

### Task 3: «Sin cambios» en la importación del catálogo

**Files:**
- Create: `src/lib/import-result.ts`
- Modify: `src/modules/catalog/import.ts`, `src/components/import-form.tsx` (solo el tipo `ImportRow` pasa a importarse de `import-result.ts`)
- Test: `tests/catalog/excel.test.ts`

**Interfaces:**
- Produces (`import-result.ts`):
  - `type ImportAction = "create" | "update" | "unchanged"`
  - `type ImportRow = { sheet?: string; row: number; code: string; action: ImportAction; changes: string[]; errors: string[] }`
  - `type Removal = { kind: "concept" | "client" | "contact" | "location"; id: string; label: string; outcome: "delete" | "deactivate"; reason: string }`
  - `type ClientDecision = { id: string; label: string; taxId: string; quotes: number; drafts: number }`
  - `type ImportMode = "merge" | "full"`
  - `type ImportOptions = { apply: boolean; mode?: ImportMode; keep?: string[] }`
  - `type ImportResult = { error?: string; rows: ImportRow[]; created: number; updated: number; unchanged: number; removals: Removal[]; decisions: ClientDecision[]; incompleteKits: { name: string; codes: string[] }[]; applied: boolean }` (en esta tarea `removals`, `decisions` e `incompleteKits` van vacíos).
- Consumes: `conceptSnapshot`, `diffSnapshots`, `historyData` de la tarea 2.

- [ ] **Step 1: Pruebas que fallan** — cambiar la existente y añadir:

```ts
test("exportar e importar sin cambios da 6 sin cambios y no toca el historial", async () => {
  // …como la prueba actual…
  expect([r.created, r.updated, r.unchanged]).toEqual([0, 0, 6]);
  const before = await prisma.auditLog.count();
  expect((await importConcepts(admin, bytes, { apply: true })).applied).toBe(true);
  expect(await prisma.auditLog.count()).toBe(before + 1); // solo la entrada «Importación de catálogo»
});
test("un cambio dice qué campo cambia", async () => {
  // SER-PROG con Precio_venta "1.234,5" y el resto como en la base
  expect(r.rows[0]).toMatchObject({ action: "update", changes: ["Precio de venta: 85,00 → 1.234,50"] });
});
test("decimales con otra forma salen sin cambios", async () => { /* Precio_venta "0,3000" para SER-DESPL (0.3 en la base) → action "unchanged" */ });
```
(Ajustar el valor de partida de SER-PROG al de la semilla.)

- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar.** Para cada fila válida con código existente, construir la foto «como quedaría» (nombres de categoría/unidad/impuesto desde los `lookups`, decimales `new Prisma.Decimal(n).toFixed()`, `active`) y compararla con `conceptSnapshot(current)` usando `diffSnapshots`. Vacío ⇒ `"unchanged"` y no se escribe. Escrituras con `data: historyData(after, "import")` y resumen `` `${code}: ${describeChanges(changes)} (importación)` ``. Entrada final: `` `Importación de catálogo: ${created} altas, ${updated} cambios, ${unchanged} sin cambios` ``.
- [ ] **Step 4: Suite, `tsc`, `lint` en verde**
- [ ] **Step 5: Commit** `feat(importacion): el catálogo distingue «Sin cambios» y dice qué cambia`

---

### Task 4: «Sin cambios» en la importación de clientes

**Files:**
- Modify: `src/modules/clients/import.ts`
- Test: `tests/clients/excel.test.ts`

**Interfaces:**
- Consumes: `ImportRow`, `ImportResult` de la tarea 3 (devuelve ese tipo; `ClientImportResult` desaparece o pasa a ser un alias).
- Produces: `changedFields(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): string[]` local al archivo, con el mismo formato «Campo: antes → después» (vacío/`null` como «vacío», booleanos «sí»/«no»).

- [ ] **Step 1: Pruebas que fallan**

```ts
test("exportar e importar clientes sin cambios da todo sin cambios y no escribe", async () => {
  // crear cliente con un contacto y una instalación, exportar con exportClients + el escritor del libro, importar
  expect([r.created, r.updated, r.unchanged]).toEqual([0, 0, 3]);
});
test("un cambio en la instalación dice qué cambia", async () => {
  expect(row).toMatchObject({ sheet: "Instalaciones", action: "update", changes: ["País: España → Portugal"] });
});
```
Etiquetas: las de `CLIENT_FIELD`/`CHILD_FIELD` en castellano legible («Razón social», «CIF», «Nombre comercial», «Dirección fiscal», «Forma de pago», «Exclusiones», «Validez (días)», «Observaciones», «Cargo», «Email», «Teléfono», «Dirección», «Instalación», «País», «Activo»).

- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar.** Comparar lo validado (más `active`) con lo guardado, en cliente, contacto e instalación; sin cambios ⇒ `"unchanged"`, sin escritura ni entrada. Resumen de cada cambio con los campos. Entrada final con «K sin cambios».
- [ ] **Step 4: Suite, `tsc`, `lint` en verde**
- [ ] **Step 5: Commit** `feat(importacion): los clientes distinguen «Sin cambios»`

---

### Task 5: Concepto usado y conjuntos incompletos

**Files:**
- Create: `src/modules/catalog/usage.ts`
- Modify: `src/modules/catalog/service.ts` (`removeConcept`, `setConceptActive` devuelven los conjuntos afectados), `src/modules/catalog/actions.ts` (mensaje), `src/app/(app)/catalogo/forms.tsx` (`ConceptDangerZone` muestra «Desactivado. Quedan incompletos: …»)
- Modify: `src/modules/kits/service.ts` (`checkRefs` → `refIssues` que devuelve avisos; `saveKit` sigue lanzando `ValidationError` con ellos), `src/app/(app)/conjuntos/page.tsx` (insignia «Incompleto»), `src/app/(app)/conjuntos/[id]/page.tsx` (`warnbox` con cada aviso)
- Test: `tests/catalog/usage.test.ts` (nuevo), `tests/kits/service.test.ts`

**Interfaces:**
- Produces (`usage.ts`):
  - `usedConceptIds(tx: Prisma.TransactionClient | typeof prisma): Promise<Set<string>>` — ids en `QuoteLine.conceptId`, `RequiredConcept`, `KitTemplate.definition` (cualquier estado) y `KitInstance.definition`/`choices`. Las definiciones se recorren con `kitDefinition`/`refConceptId`; las `choices` son `{ slot: conceptId }`.
  - `kitsUsingConcepts(tx, conceptIds: string[]): Promise<{ name: string; codes: string[] }[]>` — plantillas **activas** que usan alguno de esos conceptos, con sus códigos.
  - `kitIssues(tx, kit: Kit): Promise<string[]>` (en `kits/service.ts`) — «DEMO-BANDEJA está desactivado: cámbialo por otro», «La categoría X está desactivada», «Falta un concepto que ya no existe».
- Changes: `removeConcept(...)` → `Promise<{ outcome: "deleted" | "deactivated"; incompleteKits: string[] }>`; `setConceptActive(...)` → `Promise<{ incompleteKits: string[] }>`. Actualizar sus llamadores (`catalog/actions.ts`, pruebas).

- [ ] **Step 1: Pruebas que fallan**

```ts
test("un concepto que solo está en una plantilla de conjunto se desactiva al eliminarlo", async () => {
  // plantilla activa «Bomba» cuyo main es concept-bom-hasta75 (seguir el patrón de tests/kits/service.test.ts)
  expect(await removeConcept(p, "concept-bom-hasta75")).toEqual({ outcome: "deactivated", incompleteKits: ["Bomba"] });
});
test("usedConceptIds cuenta líneas, obligatorios, plantillas y conjuntos de presupuestos", async () => { /* uno de cada */ });
test("kitIssues avisa de un concepto desactivado", async () => {
  expect(await kitIssues(prisma, kit)).toEqual(["BOM-HASTA75 está desactivado: cámbialo por otro"]);
});
```
- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar.** `removeConcept`: si está en `usedConceptIds` ⇒ desactivar (entrada «X desactivado porque está en uso», foto); si no ⇒ borrar dentro de `deleteOrDeactivate` como hoy (por si una FK aparece mientras tanto).
- [ ] **Step 4: Suite, `tsc`, `lint` en verde**
- [ ] **Step 5: Commit** `fix(catalogo): un concepto de un conjunto se desactiva y el conjunto avisa de que queda incompleto`

---

### Task 6: Importación completa del catálogo

**Files:**
- Modify: `src/modules/catalog/import.ts`, `src/lib/import-file.ts`, `src/modules/catalog/actions.ts`
- Test: `tests/catalog/excel.test.ts`

**Interfaces:**
- Consumes: `ImportOptions`, `Removal` (tarea 3), `usedConceptIds`, `kitsUsingConcepts` (tarea 5), `historyData` (tarea 2).
- Changes: `importConcepts(actor, bytes, opts: ImportOptions): Promise<ImportResult>`. `importFile(form, path, run: (bytes: Uint8Array, opts: ImportOptions) => Promise<R>)` lee `apply` (`"1"`), `mode` (`"full"` o por defecto `"merge"`) y `keep` (`form.getAll("keep")`).

- [ ] **Step 1: Pruebas que fallan**

```ts
test("la completa borra lo no usado y desactiva lo usado", async () => {
  // Excel con solo SER-PROG; MAN-4X25 en una línea de un borrador; SER-DESPL obligatorio; el resto sin usar
  const r = await importConcepts(admin, bytes, { apply: false, mode: "full" });
  expect(r.removals.filter((x) => x.outcome === "deactivate").map((x) => x.label)).toEqual(["MAN-4X25", "SER-DESPL"]);
  expect(r.removals.filter((x) => x.outcome === "delete")).toHaveLength(3);
  // con apply: true, los borrados ya no existen y los desactivados tienen active=false y su foto en el historial
});
test("un presupuestador no puede hacer la completa", async () => {
  await expect(importConcepts(p, bytes, { apply: false, mode: "full" })).rejects.toThrow(ForbiddenError);
});
test("la completa con una hoja sin filas da error", async () => {
  expect((await importConcepts(admin, await book([]), { apply: false, mode: "full" })).error)
    .toBe("El archivo no tiene filas: la importación completa lo borraría todo");
});
test("lo que pasa a estar usado entre revisar y confirmar se desactiva", async () => {
  // revisar (MAN-4X25 sale «delete»), añadirlo a un borrador, confirmar → MAN-4X25 desactivado, no borrado
});
test("la revisión avisa de los conjuntos que quedarán incompletos", async () => {
  expect(r.incompleteKits).toEqual([{ name: "Bomba", codes: ["BOM-HASTA75"] }]);
});
```
- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar.** Con `mode === "full"`: `assertAdmin`; error si la hoja no tiene filas; ausentes = conceptos de la base cuyo código no está en el Excel; los ya inactivos y usados no cuentan; `outcome` según `usedConceptIds` (calculado de nuevo dentro de la transacción al aplicar). Borrar o desactivar dentro de la misma transacción, con entrada y foto `"import-full"` («Baja de X (importación completa)», «X desactivado (importación completa)»). Un `P2003` al borrar ⇒ `ValidationError({ _: "Algo ha cambiado mientras revisabas: vuelve a revisar el archivo" })`. Entrada final con «B bajas, D desactivados».
- [ ] **Step 4: Suite, `tsc`, `lint` en verde**
- [ ] **Step 5: Commit** `feat(importacion): importación completa del catálogo (solo administradores)`

---

### Task 7: Importación completa de clientes

**Files:**
- Modify: `src/modules/clients/import.ts`, `src/modules/clients/actions.ts`
- Test: `tests/clients/excel.test.ts`

**Interfaces:**
- Consumes: `ImportOptions`, `Removal`, `ClientDecision` (tarea 3), `importFile` con `keep` (tarea 6).
- Changes: `importClients(actor, bytes, opts: ImportOptions): Promise<ImportResult>`.

- [ ] **Step 1: Pruebas que fallan**

```ts
test("cliente ausente sin presupuestos se borra; con presupuestos se decide", async () => {
  // A sin presupuestos, B con 2 presupuestos (1 borrador), Excel solo con C
  const r = await importClients(admin, bytes, { apply: false, mode: "full" });
  expect(r.decisions).toEqual([expect.objectContaining({ taxId: B.taxId, quotes: 2, drafts: 1 })]);
  expect(r.removals).toContainEqual(expect.objectContaining({ kind: "client", id: A.id, outcome: "delete" }));
  expect(r.removals).toContainEqual(expect.objectContaining({ kind: "client", id: B.id, outcome: "deactivate" }));
});
test("«Dejar como está» no toca el cliente ni sus contactos", async () => {
  await importClients(admin, bytes, { apply: true, mode: "full", keep: [B.id] });
  // B sigue activo y con sus contactos e instalaciones
});
test("contacto e instalación ausentes: usados se desactivan, el resto se borra", async () => { /* … */ });
test("un presupuestador no puede hacer la completa de clientes", async () => { /* ForbiddenError */ });
```
- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar.** Ausentes por CIF normalizado. Cliente: sin presupuestos ⇒ `delete`; con presupuestos ⇒ en `decisions` y, salvo que su id esté en `keep`, `deactivate`. Contactos/instalaciones ausentes de clientes no conservados: usados por `Quote.contactId`/`locationId` ⇒ `deactivate`, si no ⇒ `delete`. Al aplicar se recalcula todo; un cliente que ahora tiene presupuestos y no está en `keep` se desactiva. Mismo tratamiento de `P2003` y entradas de historial que la tarea 6.
- [ ] **Step 4: Suite, `tsc`, `lint` en verde**
- [ ] **Step 5: Commit** `feat(importacion): importación completa de clientes con decisión por cliente`

---

### Task 8: Pantalla de importación (maquetas E y F)

**Files:**
- Modify: `src/components/import-form.tsx`, `src/app/(app)/catalogo/importar/page.tsx`, `src/app/(app)/clientes/importar/page.tsx` (pasan `canFull={user.role === "admin"}`; textos de los pasos actualizados), `src/app/globals.css` (clases `.modes`, `.counts`, `.redbox`, `.choice` copiadas de `docs/diseno/maquetas/importacion-completa-app.html`)

**Interfaces:**
- Consumes: `ImportResult` (tarea 3).
- Changes: `ImportForm({ step, keyLabel, doneHref, doneLabel, canFull }: {…; canFull: boolean })`. El formulario envía `mode` (radio) y, en completa, un radio por cliente de `decisions` con `name="keep"`/`value=id` solo cuando se elige «Dejar como está» (por defecto «Desactivar»).

- [ ] **Step 1: Implementar según la maqueta E** (y F para `canFull=false`, sin la opción «Completa»): contadores (Altas, Cambios, Sin cambios y, en completa, Se borrarán, Se desactivarán); tabla «Altas y cambios» (filas `unchanged` fuera; errores primero, como hoy) con columna «Qué cambia» (`changes` unidos por «; »); en completa: `redbox`, «Clientes con presupuestos: decide uno a uno», «Lo demás se aplica solo» y «Conjuntos que quedarán incompletos» (catálogo). Botón verde «Confirmar importación» con «Añadir y actualizar»; rojo «Confirmar importación completa» con «Completa». Cambiar de modo o de archivo obliga a revisar de nuevo (como hoy con el archivo). Mensaje final: «Importación guardada: N altas, M cambios, K sin cambios» (+ «, B bajas y D desactivados»).
- [ ] **Step 2: `tsc`, `lint`, suite en verde**
- [ ] **Step 3: Revisar en Chrome** (`pnpm dev`, localhost:3000) con un administrador y con un presupuestador: escritorio y móvil; Excel exportado sin tocar (todo «Sin cambios»), con un cambio, y completa con bajas.
- [ ] **Step 4: Commit** `feat(importacion): revisión con «Sin cambios», modo completo y decisiones por cliente`

---

### Task 9: Revisiones con los precios del catálogo

**Files:**
- Modify: `src/modules/quotes/lifecycle.ts:76-145`, `src/modules/quotes/actions.ts:102-111`, `src/app/(app)/presupuestos/[id]/page.tsx`
- Test: `tests/quotes/lifecycle.test.ts`

**Interfaces:**
- Produces: `refreshLines(tx: Tx, quoteId: string): Promise<number>` (no exportada fuera del módulo salvo para pruebas si hace falta), usada por `refreshPricesFromCatalog` y `createRevision`.
- Changes: `createRevision(actor, id): Promise<{ quote: Quote; refreshed: number }>`. `createRevisionAction` redirige a `` `/presupuestos/${id}?precios=${refreshed}` `` si `refreshed > 0`.

- [ ] **Step 1: Pruebas que fallan**

```ts
test("una revisión sale con el precio actual del catálogo", async () => {
  // emitir un presupuesto con SER-PROG a su precio, cambiar el precio en el catálogo, createRevision
  expect(refreshed).toBe(1);
  // la línea de la revisión tiene el precio nuevo; la del emitido, el antiguo
});
test("la revisión respeta ajustes de precio y subpartidas de precio global", async () => { /* refreshed 0 en esas líneas */ });
test("el historial de la revisión cuenta las líneas actualizadas", async () => {
  // listQuoteHistory(rev.id) contiene "Revisión de <ref>; 1 línea con precios del catálogo"
});
```
- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: Implementar.** Extraer el bucle de `refreshPricesFromCatalog` a `refreshLines`; llamarlo en `createRevision` tras `copyContent`; ajustar el texto del historial («; N línea(s) con precios del catálogo» solo si N > 0). La página lee `searchParams.precios` y, si es un entero > 0, muestra `<p className="warnbox" role="status">Precios actualizados desde el catálogo en N líneas.</p>` encima de `PriceWarnings`. Actualizar otros llamadores de `createRevision` (pruebas).
- [ ] **Step 4: Suite, `tsc`, `lint` en verde**
- [ ] **Step 5: Commit** `feat(presupuestos): las revisiones salen con los precios del catálogo al día`

---

### Task 10: Pantalla del historial del concepto (maquetas C y D) y ficha a pantalla completa en móvil

**Files:**
- Create: `src/app/(app)/catalogo/concept-history.tsx` (servidor: columna del historial, línea C y paso a paso D) y `src/app/(app)/catalogo/history-line.tsx` (cliente: flechas ‹ › de la línea horizontal)
- Create: `src/app/(app)/catalogo/concept-version.tsx` (servidor: el panel en solo lectura con la versión y los campos en ámbar)
- Modify: `src/app/(app)/catalogo/page.tsx` (parámetros `historial` y `version`; botón «Historial (N)»; X en móvil), `src/app/globals.css` (estilos de la maqueta: `.wireline`, `.wirewrap`, `.stepper`, `.dots`, `.whatchg`, `.field.chg`, `.was`, `.ronly`, `.legacy`, `.x`, modo `.split.hist` y ficha a pantalla completa ≤ 600 px)

**Interfaces:**
- Consumes: `getConceptHistory`, `diffSnapshots`, `ConceptVersion` (tarea 2).
- Produces: `ConceptHistory({ versions, selectedId, href }: { versions: ConceptVersion[]; selectedId: string; href: (extra: Record<string, string>) => string })` y `ConceptVersionPanel({ version, previous, current, closeHref }: { version: ConceptVersion; previous: ConceptVersion | undefined; current: ConceptDetail; closeHref: string })`.

- [ ] **Step 1: Página.** Con `concepto` elegido, leer `getConceptHistory(id)`. «Historial (N)» (enlace a `href({ concepto, historial: "1" })`) solo si `versions.length > 1`. Con `historial=1`: filtros con `disabled`, la lista no se pinta, en su sitio `ConceptHistory`; el panel es `ConceptVersionPanel` con la versión `version` (o la primera). La X del historial enlaza a `href({ concepto })`. En ≤ 600 px, con concepto elegido, el panel (y el historial si está abierto) va a pantalla completa (`position: fixed; inset: 0`) y «Cerrar» se pinta como X «Volver al catálogo»; con el historial abierto solo se ve la X del historial.
- [ ] **Step 2: Componentes.** Seguir `docs/diseno/maquetas/historial-concepto-app.html` (propuesta C y D): cada versión de la línea es un `Link` con su tramo de línea y el círculo centrado (verde relleno la elegida, discontinuo sin foto); resumen con importes con valor y textos solo con el nombre del campo; etiqueta «Importación» si `source` empieza por `import`. Paso a paso: «‹ Antes»/«Después ›» como enlaces (desactivados en los extremos), puntos y «Qué cambió». Línea vertical > 900 px, horizontal 601–900 px (sin barra de scroll visible; `HistoryLine` activa/desactiva las flechas con `scrollLeft`), paso a paso ≤ 600 px; ambos se pintan y se eligen con CSS. Entre 901 y 1360 px, `.split.hist` mantiene dos columnas (panel de 360 px).
- [ ] **Step 3: Panel de versión.** Campos como en `ConceptForm` dentro de `<fieldset disabled>`, sin botones de acción; aviso «Versión del dd/mm/aaaa · usuario. Solo lectura: cierra el historial (X) para editar.» («Versión actual» si es la primera); campos de `diffSnapshots(version, previous)` en ámbar con «Antes: <s>valor</s>»; «Datos de proveedor» abierto si cambia alguno de sus campos; versión sin foto: `.legacy` con la frase y los valores actuales sin resaltar.
- [ ] **Step 4: `tsc`, `lint`, suite en verde**
- [ ] **Step 5: Revisar en Chrome** a 1440, 1024, 768 (iPad en vertical) y 390 px: centrado de los círculos, flechas que se apagan en los extremos, solo lectura, X que vuelve al panel editable, ficha a pantalla completa en móvil. Comprobar también que en móvil la ficha normal no se corta por la derecha (en la maqueta se cortaba por el `min-width: 150px` de `.field input/select`); si pasa, arreglarlo en `.pair` para ≤ 600 px.
- [ ] **Step 6: Commit** `feat(catalogo): historial de versiones del concepto y ficha a pantalla completa en móvil`

---

### Task 11: Cierre del bloque

**Files:**
- Modify: `docs/superpowers/progreso.md`, `AGENTS.md` (CRLF), `docs/diseno/maquetas/` (ya incluidas)

- [ ] **Step 1: Suite completa, `tsc`, `lint` y `pnpm build`** — Expected: todo en verde; anotar el número de pruebas.
- [ ] **Step 2: Revisión final en Chrome con el usuario** (no se da por cerrado sin su visto bueno).
- [ ] **Step 3: Actualizar `progreso.md`** («Bloque 3 … hecho y aprobado», decisiones tomadas por el camino, menores aplazados) y la sección «Estado actual» de `AGENTS.md` (siguiente: Bloque 4).
- [ ] **Step 4: Commit y push a `mejoras-uso-real`** `docs: cierre del Bloque 3`

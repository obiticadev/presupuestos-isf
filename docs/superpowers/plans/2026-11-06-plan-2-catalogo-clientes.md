# Plan 2 · Catálogo y clientes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un administrador mantenga el catálogo (categorías, unidades y conceptos, con importación y exportación en Excel) y que cualquier usuario gestione clientes con sus contactos, ubicaciones y condiciones habituales, todo desde la interfaz.

**Architecture:** Se siguen los patrones del plan 1. Cada módulo (`catalog`, `clients`) tiene `schema.ts` (Zod), `service.ts` (lógica, Prisma y permisos), `actions.ts` (Server Actions finas que devuelven `ActionResult`) y sus páginas en `src/app/(app)`. El «eliminar» de conceptos y clientes intenta borrar y, si una clave foránea `RESTRICT` lo impide (presupuestos del plan 3), desactiva. Los importes son `Prisma.Decimal`, nunca `number`.

**Tech Stack:** el del plan 1 más `exceljs@4.4.0` (lectura y escritura de `.xlsx`).

**Spec:** `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md` (secciones 5.2, 5.4, 5.8 «Categorías y unidades», 5.9 y 5.10)

**Fuera de este plan:** conjuntos (`KitTemplate`) y conceptos obligatorios van en el plan 3, porque solo tienen sentido con el editor de presupuestos. El botón «Nuevo presupuesto» de la ficha de cliente y la lista de presupuestos del cliente también llegan con el plan 3.

**Rama:** `plan-2-catalogo-clientes`, creada desde `plan-1-base`, en el mismo worktree `D:\dev\presupuestos-isf`.

## Global Constraints

- Todas las del plan 1 siguen vigentes (versiones fijadas, código en inglés e interfaz en español, permisos en `service.ts`, decimales exactos, BD de desarrollo en el puerto 5433, `pnpm test` con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)"`).
- Nueva dependencia fijada sin `^`: `exceljs@4.4.0`. Ninguna otra.
- Precios unitarios, costes y PVP: `@db.Decimal(14,4)`. Porcentajes: `@db.Decimal(5,2)`. Claves foráneas de `Concept` hacia `Category`, `Unit` y `Tax`: `onDelete: Restrict`.
- Permisos: catálogo, categorías, unidades e importación solo `admin`; consulta y exportación del catálogo, cualquier usuario. Clientes, contactos y ubicaciones: cualquier usuario (spec 5.1).
- Nada se borra si está en uso: categorías, unidades e impuestos solo se desactivan; conceptos y clientes usan «eliminar» (borra si nadie los referencia y, si no, desactiva).
- Lo inactivo no se ofrece en selecciones nuevas, pero se sigue mostrando donde ya está.
- Cada alta, cambio y baja va a `logAction` en la misma transacción. Entidades: `category`, `unit`, `concept`, `client`. Los cambios de precio dicen el valor anterior y el nuevo en el resumen.
- Rutas visibles: `/catalogo`, `/catalogo/importar`, `/clientes`, `/clientes/nuevo`, `/clientes/[id]`. Descargas: `/api/catalogo/exportar` y `/api/catalogo/plantilla`.
- Interfaz según `docs/diseno/maquetas/catalogo.html` (tabla con filtros y panel lateral de edición) y `clientes.html` (ficha). Debe funcionar en móvil (≤ 900 px) sin desbordamiento horizontal de la página.
- Pruebas de interfaz con Claude in Chrome antes de dar una tarea de interfaz por terminada (preferencia del usuario).

## Review Focus

1. **Números de Excel con artefactos de coma flotante o escritos a la española:** una celda numérica `15.845220000000001` debe guardarse como `15.8452`, y una celda de texto «1.234,56» como `1234.56`. Nunca debe pasar por `number` sin redondear → prueba en la Tarea 4.
2. **Códigos que solo difieren en mayúsculas o espacios («man-4x25 » frente a «MAN-4X25»):** son el mismo concepto. En el formulario dan «Ya existe un concepto con ese código»; en la importación actualizan el existente, y si aparecen dos veces en el mismo archivo es un error de fila → pruebas en las Tareas 2 y 4.
3. **Archivo de importación que no es un `.xlsx` o al que le falta una columna:** error claro («Falta la columna Precio_venta»), sin excepción no controlada y sin cambios en la BD → prueba en la Tarea 4.
4. **CIF escrito con espacios, guiones o minúsculas («b-12 345 678»):** se normaliza a «B12345678» y detecta el duplicado → prueba en la Tarea 5.
5. **Categoría, unidad o impuesto desactivado al crear o importar un concepto:** se rechaza con un error en ese campo o fila; los conceptos que ya los usaban se siguen mostrando → pruebas en las Tareas 2 y 4.

---

## Estructura de archivos

```
prisma/schema.prisma                       Category, Unit, Concept, Client, ClientContact, ClientLocation
prisma/migrations/<ts>_catalog/            con la semilla SQL de categorías, unidades y 6 conceptos
prisma/migrations/<ts>_clients/
src/lib/decimal.ts                         + formatDecimalEs()
src/lib/delete-or-deactivate.ts            deleteOrDeactivate()
src/modules/settings/seed.ts               seedDefaults() también siembra el catálogo inicial
src/modules/catalog/{schema,service,actions}.ts
src/modules/catalog/lists.ts               categorías y unidades
src/modules/catalog/excel.ts               COLUMNS, readCatalogSheet(), writeCatalogSheet()
src/modules/catalog/import.ts              importConcepts()
src/modules/clients/{schema,service,actions}.ts
src/app/(app)/catalogo/page.tsx, forms.tsx
src/app/(app)/catalogo/importar/page.tsx, forms.tsx
src/app/api/catalogo/exportar/route.ts, plantilla/route.ts
src/app/(app)/clientes/page.tsx, nuevo/page.tsx, [id]/page.tsx, forms.tsx
src/app/(app)/admin/configuracion/page.tsx  + secciones Categorías y Unidades
src/app/(app)/admin/historial/page.tsx      + entidades del catálogo y clientes
src/app/(app)/layout.tsx                    Clientes y Catálogo dejan de ser «Próximamente»
tests/lib/*.test.ts, tests/catalog/*.test.ts, tests/clients/*.test.ts
```

---

### Task 1: Categorías, unidades y utilidades compartidas

**Files:**
- Create: `src/modules/catalog/lists.ts`, `src/lib/delete-or-deactivate.ts`
- Modify: `prisma/schema.prisma`, `src/lib/decimal.ts`, `src/modules/settings/seed.ts`, `src/modules/settings/actions.ts` (o `src/modules/catalog/actions.ts`), `src/app/(app)/admin/configuracion/page.tsx` y `forms.tsx`, `src/app/(app)/admin/historial/page.tsx`
- Migración: `pnpm db:migrate --name catalog_lists`, con semilla SQL al final
- Test: `tests/lib/decimal.test.ts`, `tests/lib/delete-or-deactivate.test.ts`, `tests/catalog/lists.test.ts`

**Interfaces:**
- Consumes: `prisma`, `assertAdmin`, `logAction`, `parseOrThrow`, `ValidationError`, `seedDefaults` (plan 1).
- Produces:
  - `model Category { id String @id @default(cuid()), name String @unique, active Boolean @default(true) }` y `model Unit` igual.
  - Semilla (SQL de la migración y `seedDefaults`, con los mismos ids): categorías `cat-servicios` «Servicios», `cat-personal` «Personal», `cat-material` «Material», `cat-mangueras` «Mangueras», `cat-bombas` «Bombas»; unidades `unit-km` «km», `unit-h` «h», `unit-m` «m», `unit-ud` «ud».
  - `listCategories(opts?: { includeInactive?: boolean }): Promise<Category[]>`, `saveCategory(actor, input: { id?: string; name: string }): Promise<Category>`, `setCategoryActive(actor, id: string, active: boolean): Promise<void>`. Lo mismo para unidades (`listUnits`, `saveUnit`, `setUnitActive`). Ordenadas por nombre. Nombre recortado, de 1 a 50 caracteres; si se repite: `ValidationError({ name: "Ya existe" })`. Solo admin.
  - `formatDecimalEs(value: Prisma.Decimal | string, opts?: { min?: number; max?: number }): string`, con `min = 2` y `max = 2` por defecto, redondeo *half-up* y punto de miles.
  - `deleteOrDeactivate(del: () => Promise<unknown>, deactivate: () => Promise<unknown>): Promise<"deleted" | "deactivated">`: ejecuta `del` y, si lanza `Prisma.PrismaClientKnownRequestError` con código `P2003`, ejecuta `deactivate`. Cualquier otro error se relanza. `del` debe ir en su propia transacción: en PostgreSQL, un `DELETE` fallido invalida la transacción en curso.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/lib/decimal.test.ts (añadir)
test.each([
  ["1234.5", undefined, "1.234,50"], ["10", undefined, "10,00"], ["0.005", undefined, "0,01"],
  ["0.305", { max: 4 }, "0,305"], ["15845.22", undefined, "15.845,22"],
])("formatDecimalEs(%s, %o) = %s", (v, o, out) => expect(formatDecimalEs(v, o)).toBe(out));

// tests/lib/delete-or-deactivate.test.ts
const fk = () => new Prisma.PrismaClientKnownRequestError("fk", { code: "P2003", clientVersion: "7.10.1" });
test("si se puede borrar, borra", async () => {
  expect(await deleteOrDeactivate(async () => {}, async () => { throw new Error("no"); })).toBe("deleted");
});
test("si una FK lo impide, desactiva", async () => {
  expect(await deleteOrDeactivate(async () => { throw fk(); }, async () => {})).toBe("deactivated");
});
test("otros errores se relanzan", async () => {
  await expect(deleteOrDeactivate(async () => { throw new Error("x"); }, async () => {})).rejects.toThrow("x");
});

// tests/catalog/lists.test.ts
test("la semilla trae las cinco categorías y las cuatro unidades", async () => {
  expect((await listCategories()).map((c) => c.name)).toEqual(["Bombas", "Mangueras", "Material", "Personal", "Servicios"]);
  expect((await listUnits()).map((u) => u.name)).toEqual(["h", "km", "m", "ud"]);
});
test("una categoría desactivada solo se lista si se pide", async () => {
  const admin = await makeUser("admin");
  await setCategoryActive(admin, "cat-material", false);
  expect((await listCategories()).some((c) => c.id === "cat-material")).toBe(false);
  expect((await listCategories({ includeInactive: true })).some((c) => c.id === "cat-material")).toBe(true);
});
test("nombre repetido y presupuestador se rechazan", async () => {
  const admin = await makeUser("admin");
  await expect(saveUnit(admin, { name: "km" })).rejects.toThrow(ValidationError);
  const p = await makeUser("presupuestador");
  await expect(saveCategory(p, { name: "Nueva" })).rejects.toThrow(ForbiddenError);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/lib tests/catalog` → FAIL (no existen `formatDecimalEs`, `deleteOrDeactivate` ni `lists.ts`).
- [ ] **Step 3: Implementar modelos, migración con semilla, `seedDefaults`, `lists.ts`, `formatDecimalEs` y `deleteOrDeactivate`.** Los cambios se registran con `logAction` (entity `category`/`unit`, resúmenes como «Alta de categoría Bombas» o «Unidad ud desactivada»).
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test` → PASS (toda la batería, porque `seedDefaults` cambió).
- [ ] **Step 5: Interfaz.** En `/admin/configuracion`, dos secciones nuevas, «Categorías» y «Unidades», con el mismo patrón que «Impuestos» (renombrar, añadir y activar o desactivar; la fila se monta con `key` que incluye su estado, como en la corrección del plan 1). En `/admin/historial`, nuevas entidades del filtro: `concept` «Catálogo», `category` «Categorías», `unit` «Unidades» y `client` «Clientes». Comprobar en Chrome: alta, renombrado y desactivación de una unidad, y la entrada correspondiente en el historial.
- [ ] **Step 6: Commit** — `git commit -m "feat(catalog): categorías y unidades editables, formato decimal español y eliminar-o-desactivar"`

---

### Task 2: Conceptos del catálogo (servicio)

**Files:**
- Create: `src/modules/catalog/schema.ts`, `src/modules/catalog/service.ts`, `src/modules/catalog/actions.ts`
- Modify: `prisma/schema.prisma`, `src/modules/settings/seed.ts`; migración `pnpm db:migrate --name catalog_concepts` con semilla SQL
- Test: `tests/catalog/service.test.ts`

**Interfaces:**
- Consumes: Tarea 1 (`Category`, `Unit`, `deleteOrDeactivate`), `Tax`, `getSettings().defaultMarginPct`, `parseDecimalEs`.
- Produces:
  - `model Concept`: `id`, `code String @unique` (guardado recortado y en mayúsculas), `categoryId`, `description String`, `unitId`, `salePrice Decimal? @db.Decimal(14,4)`, `cost Decimal? @db.Decimal(14,4)`, `taxId`, `active Boolean @default(true)`, `validated Boolean @default(false)`, `notes String @default("") @db.Text`, `manufacturer String @default("")`, `supplierRef String @default("")`, `supplier String @default("")`, `listPrice Decimal? @db.Decimal(14,4)`, `discountPct Decimal? @db.Decimal(5,2)`, `createdAt`, `updatedAt`. Índices en `categoryId` y `description`.
  - Semilla (los mismos ids en SQL y en `seedDefaults`), todos con `validated = false`, `active = true` y el impuesto `iva-21`:

    | id | code | categoría | descripción | unidad | venta | notes |
    |---|---|---|---|---|---|---|
    | `concept-ser-despl` | SER-DESPL | Servicios | Desplazamiento | km | 0.30 | Origen Alcalá de Henares. Confirmar kilómetros facturables, viajes, vehículos y vigencia. |
    | `concept-ser-prog` | SER-PROG | Servicios | Hora de programador | h | 50.00 | Confirmar la unidad. |
    | `concept-bom-mayor75` | BOM-MAYOR75 | Bombas | Bomba de potencia mayor que 7,5 kW | ud | 102.00 | Unidad por aclarar: el precio se trata como precio por bomba. |
    | `concept-bom-hasta75` | BOM-HASTA75 | Bombas | Bomba de potencia menor o igual que 7,5 kW | ud | 160.00 | Unidad por aclarar: el precio se trata como precio por bomba. |
    | `concept-man-4x25` | MAN-4X25 | Mangueras | Manguera 4 hilos x 2,5 mm² | m | 10.00 | Confirmar alcance de suministro o montaje y vigencia. |
    | `concept-man-12x075` | MAN-12X075 | Mangueras | Manguera 12 hilos x 0,75 mm² | m | 15.00 | Confirmar alcance de suministro o montaje y vigencia. |

  - `conceptInput` (Zod): `code` (1..30, recortado y en mayúsculas, solo `[A-Z0-9._-]`), `categoryId`, `description` (1..300), `unitId`, `taxId`, `salePrice`, `cost`, `listPrice` y `discountPct` como textos opcionales que pasan por `parseDecimalEs` (vacío ⇒ `null`; precio de 0 a 999999999, descuento de 0 a 100), `validated: boolean`, `notes`, `manufacturer`, `supplierRef` y `supplier`.
  - `listConcepts(filter: { q?: string; categoryId?: string; status?: "active" | "inactive" | "all"; validated?: "yes" | "no" | "all"; page?: number }): Promise<{ items: ConceptRow[]; total: number }>`: `status` vale `"active"` por defecto; `q` busca sin distinguir mayúsculas en código o descripción; orden por código; 50 por página. `ConceptRow` incluye `category.name`, `unit.name` y `tax.name`/`ratePct`. Cualquier usuario.
  - `getConcept(id): Promise<ConceptDetail>` (lanza `NotFoundError`). Cualquier usuario.
  - `createConcept(actor, input): Promise<Concept>` y `updateConcept(actor, id, input): Promise<Concept>`, solo admin. Si el código se repite: `ValidationError({ code: "Ya existe un concepto con ese código" })`. Si la categoría, la unidad o el impuesto están inactivos y no son los que ya tenía el concepto: `ValidationError({ <campo>: "Está desactivado" })`. El resumen del historial de un cambio de precio es «MAN-4X25: precio 10,00 → 12,00» (con `formatDecimalEs(…, { min: 2, max: 4 })`).
  - `setConceptActive(actor, id, active)` y `removeConcept(actor, id): Promise<"deleted" | "deactivated">` (vía `deleteOrDeactivate`), solo admin.
  - `suggestSalePrice(cost: string, marginPct: Prisma.Decimal | string): string | null`: venta = coste × (1 + margen/100), redondeada a 2 decimales *half-up*, con formato español; `null` si el coste no es un número. Función pura, que usará el formulario.
  - Actions: `saveConceptAction`, `setConceptActiveAction`, `removeConceptAction`, con el patrón de `settings/actions.ts`; revalidan `/catalogo`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/catalog/service.test.ts
const base = { categoryId: "cat-material", unitId: "unit-ud", taxId: "iva-21", description: "Relé", validated: false };
test("la semilla trae los seis conceptos sin validar", async () => {
  const { items } = await listConcepts({ status: "all" });
  expect(items.map((c) => c.code)).toEqual(["BOM-HASTA75", "BOM-MAYOR75", "MAN-12X075", "MAN-4X25", "SER-DESPL", "SER-PROG"]);
  expect(items.every((c) => !c.validated)).toBe(true);
});
test("el código se normaliza y no puede repetirse aunque cambie el formato", async () => {
  const admin = await makeUser("admin");
  const c = await createConcept(admin, { ...base, code: " rel-01 ", salePrice: "12,5" });
  expect(c.code).toBe("REL-01");
  expect(c.salePrice?.toFixed(4)).toBe("12.5000");
  await expect(createConcept(admin, { ...base, code: "REL-01" })).rejects.toThrow("Ya existe un concepto con ese código");
});
test("un concepto sin precio de venta se puede guardar", async () => {
  const admin = await makeUser("admin");
  expect((await createConcept(admin, { ...base, code: "SIN-PRECIO" })).salePrice).toBeNull();
});
test("no se puede usar una categoría desactivada", async () => {
  const admin = await makeUser("admin");
  await setCategoryActive(admin, "cat-material", false);
  await expect(createConcept(admin, { ...base, code: "X1" })).rejects.toThrow(ValidationError);
});
test("buscar y filtrar", async () => {
  expect((await listConcepts({ q: "mangu" })).items).toHaveLength(2);
  expect((await listConcepts({ categoryId: "cat-bombas" })).items).toHaveLength(2);
  expect((await listConcepts({ validated: "yes" })).items).toHaveLength(0);
});
test("cambiar el precio deja el antes y el después en el historial", async () => {
  const admin = await makeUser("admin");
  const c = await getConcept("concept-man-4x25");
  await updateConcept(admin, c.id, { ...base, code: c.code, categoryId: c.categoryId, unitId: c.unitId, description: c.description, salePrice: "12" });
  const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "concept", entityId: c.id } });
  expect(log.summary).toContain("10,00 → 12,00");
});
test("eliminar un concepto sin uso lo borra", async () => {
  const admin = await makeUser("admin");
  expect(await removeConcept(admin, "concept-ser-prog")).toBe("deleted");
  await expect(getConcept("concept-ser-prog")).rejects.toThrow(NotFoundError);
});
test("un presupuestador consulta pero no modifica", async () => {
  const p = await makeUser("presupuestador");
  expect((await listConcepts({})).total).toBe(6);
  await expect(createConcept(p, { ...base, code: "P1" })).rejects.toThrow(ForbiddenError);
  await expect(removeConcept(p, "concept-ser-prog")).rejects.toThrow(ForbiddenError);
});
test.each([["14,20", "35", "19,17"], ["3,10", "35", "4,19"], ["abc", "35", null]])(
  "suggestSalePrice(%s, %s) = %s", (cost, m, out) => expect(suggestSalePrice(cost, m)).toBe(out));
```

(La rama «desactivar en vez de borrar» con un concepto realmente en uso se prueba en el plan 3, cuando exista `QuoteLine`. Aquí la cubre la prueba unitaria de `deleteOrDeactivate`.)

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/catalog` → FAIL
- [ ] **Step 3: Implementar el modelo, la migración con semilla, `seedDefaults`, `schema.ts`, `service.ts` y `actions.ts`.** El código duplicado se detecta capturando `P2002` sobre `code`, no con una consulta previa (dos altas simultáneas).
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(catalog): conceptos con búsqueda, filtros, historial de precios y eliminar-o-desactivar"`

---

### Task 3: Página del catálogo

**Files:**
- Create: `src/app/(app)/catalogo/page.tsx`, `src/app/(app)/catalogo/forms.tsx`
- Modify: `src/app/(app)/layout.tsx` (el enlace Catálogo pasa a `RailLink href="/catalogo"`), `src/app/globals.css` (si hace falta para el panel lateral en móvil)

**Interfaces:**
- Consumes: `listConcepts`, `getConcept`, `listCategories`, `listUnits`, `listTaxes`, `getSettings`, `suggestSalePrice`, `formatDecimalEs` y las actions de la Tarea 2.
- Produces: la ruta `/catalogo`. Los filtros van en la URL (`q`, `categoria`, `estado`, `validacion`, `pagina`) y el panel se abre con `?concepto=<id>` o `?nuevo=1`.

- [ ] **Step 1: Listado.** Cabecera «Catálogo» con «Importar Excel» (solo admin, enlaza a `/catalogo/importar`), «Exportar» (todos, enlaza a `/api/catalogo/exportar`) y «Nuevo concepto» (solo admin). Los filtros se envían con un formulario `GET`. Tabla con Código, Descripción, Categoría, Unidad, Coste, Venta e IVA, más una etiqueta «Sin validar» (ámbar) o «Desactivado». Los importes se muestran con `formatDecimalEs(…, { min: 2, max: 4 })` y «€»; si falta un valor, «—». Pie con «N resultados» y paginación como en el historial.
- [ ] **Step 2: Panel lateral** (layout `app with-aside` de la maqueta; en móvil se muestra debajo de la tabla). Para un admin, el formulario tiene todos los campos de `conceptInput`, con los datos de proveedor en un `<details>` «Datos de proveedor». Las listas solo ofrecen categorías, unidades e impuestos activos, más el actual del concepto aunque esté inactivo. Si hay coste y la venta está vacía, un botón «Proponer precio (margen N %)» rellena la venta con `suggestSalePrice`. Avisos: mientras no esté validado, «Se puede usar en borradores, pero bloquea la emisión»; si no tiene precio, «Sin precio de venta: no se podrá usar en presupuestos». Botones «Guardar» y «Eliminar»; tras eliminar se muestra «Concepto borrado» o «Concepto desactivado porque está en uso». Para un presupuestador, el panel es de solo lectura, en una lista `dl`. El formulario conserva lo escrito si el servidor lo rechaza (patrón `onSubmit` + `startTransition` del plan 1).
- [ ] **Step 3: Verificar.** Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test` → sin errores. En Chrome, como admin: buscar «mangu»; crear `REL-01` con coste 14,20 y «Proponer precio» (19,17); cambiar el precio y comprobar la entrada en `/admin/historial`; código repetido (error en el campo, sin perder lo escrito); eliminar `REL-01` (borrado). Como presupuestador: solo lectura, sin «Nuevo concepto» ni «Importar». En móvil (iframe de 390 px si la ventana no se deja redimensionar): sin desbordamiento horizontal de la página.
- [ ] **Step 4: Commit** — `git commit -m "feat(catalog): página de catálogo con filtros y panel de edición"`

---

### Task 4: Importación y exportación en Excel

**Files:**
- Create: `src/modules/catalog/excel.ts`, `src/modules/catalog/import.ts`, `src/app/api/catalogo/exportar/route.ts`, `src/app/api/catalogo/plantilla/route.ts`, `src/app/(app)/catalogo/importar/page.tsx`, `src/app/(app)/catalogo/importar/forms.tsx`
- Modify: `package.json` (`exceljs@4.4.0`), `src/modules/catalog/actions.ts`
- Test: `tests/catalog/excel.test.ts`

**Interfaces:**
- Consumes: Tareas 1 y 2.
- Produces:
  - `COLUMNS = ["Codigo", "Categoria", "Descripcion", "Unidad", "Precio_venta", "Coste", "Impuesto", "Activo", "Validado", "Observaciones", "Fabricante", "Referencia_proveedor", "Proveedor", "PVP", "Descuento_pct"] as const`. Categoría, unidad e impuesto van por **nombre**; `Activo` y `Validado`, como `SI`/`NO`; los números, como celdas numéricas (en la exportación) o como texto español (en la importación se aceptan ambos).
  - `writeCatalogSheet(rows: ConceptDetail[]): Promise<Uint8Array>`: libro con la hoja «Catalogo» (cabecera en negrita y fila fija) y la hoja «Instrucciones» (qué significa cada columna y qué valores admite). La plantilla es el mismo libro sin filas.
  - `readCatalogSheet(bytes: Uint8Array): Promise<{ rows: RawRow[] } | { error: string }>`: lee la hoja «Catalogo» (o la primera). Exige todas las columnas de `COLUMNS` en la fila 1 (en cualquier orden; si falta alguna: `{ error: "Falta la columna X" }`). Si el archivo no es un `.xlsx` válido: `{ error: "El archivo no es un Excel (.xlsx) válido" }`. Las celdas numéricas se convierten a texto con `new Prisma.Decimal(value).toDecimalPlaces(4).toString()`. Las filas vacías se ignoran. Máximo 5.000 filas.
  - `importConcepts(actor, bytes: Uint8Array, opts: { apply: boolean }): Promise<ImportResult>`, con `ImportResult = { error?: string; rows: { row: number; code: string; action: "create" | "update"; errors: string[] }[]; created: number; updated: number; applied: boolean }`, donde `row` es el número de fila de Excel (la cabecera es la 1). Solo admin. Cada fila se valida con `conceptInput`, tras resolver los nombres a ids. Una categoría, unidad o impuesto inexistente o inactivo da «Categoría "X" no existe o está desactivada». Un código repetido en el archivo da «Código repetido en la fila N». Con `apply: true` y sin ningún error, todo se escribe en **una** transacción (con `logAction` por concepto creado o cambiado y una entrada «Importación de catálogo: N altas, M cambios»). Si hay algún error, no se escribe nada y `applied` es `false`.
  - `GET /api/catalogo/exportar` (cualquier usuario con sesión; 401 sin ella): `catalogo-AAAA-MM-DD.xlsx` con todos los conceptos, activos e inactivos. `GET /api/catalogo/plantilla`: `plantilla-catalogo.xlsx`.
  - Actions `previewImportAction` y `applyImportAction`. Las dos reciben el archivo (el navegador lo vuelve a enviar al confirmar; el servidor no guarda estado entre la vista previa y la confirmación). Tamaño máximo: 2 MB.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/catalog/excel.test.ts — los libros se construyen en memoria con exceljs
async function book(rows: unknown[][], header: readonly string[] = COLUMNS): Promise<Uint8Array> { /* hoja "Catalogo" con header + rows */ }
const row = (o: Partial<Record<(typeof COLUMNS)[number], unknown>>) =>
  COLUMNS.map((c) => o[c] ?? ({ Categoria: "Material", Unidad: "ud", Impuesto: "IVA 21 %", Activo: "SI", Validado: "NO", Descripcion: "Algo" } as Record<string, unknown>)[c] ?? null);

test("exportar e importar sin cambios da 0 altas y 6 cambios sin errores", async () => {
  const admin = await makeUser("admin");
  const { items } = await listConcepts({ status: "all" });
  const bytes = await writeCatalogSheet(await Promise.all(items.map((c) => getConcept(c.id))));
  const r = await importConcepts(admin, bytes, { apply: false });
  expect(r.rows.every((x) => x.errors.length === 0)).toBe(true);
  expect([r.created, r.updated]).toEqual([0, 6]);
});
test("números con artefactos de coma flotante y texto español se guardan exactos", async () => {
  const admin = await makeUser("admin");
  const bytes = await book([row({ Codigo: "F1", Precio_venta: 15.845220000000001 }), row({ Codigo: "F2", Precio_venta: "1.234,56" })]);
  expect((await importConcepts(admin, bytes, { apply: true })).applied).toBe(true);
  const { items } = await listConcepts({ q: "F" , status: "all" });
  expect(items.find((c) => c.code === "F1")?.salePrice?.toFixed(4)).toBe("15.8452");
  expect(items.find((c) => c.code === "F2")?.salePrice?.toFixed(4)).toBe("1234.5600");
});
test("una fila mala impide toda la importación", async () => {
  const admin = await makeUser("admin");
  const bytes = await book([row({ Codigo: "OK-1", Precio_venta: 5 }), row({ Codigo: "MAL-1", Precio_venta: "cinco" })]);
  const r = await importConcepts(admin, bytes, { apply: true });
  expect(r.applied).toBe(false);
  expect(r.rows[1].errors[0]).toMatch(/número/);
  expect((await listConcepts({ q: "OK-1", status: "all" })).total).toBe(0);
});
test("código existente actualiza, aunque venga en minúsculas; repetido en el archivo es error", async () => {
  const admin = await makeUser("admin");
  const r = await importConcepts(admin, await book([row({ Codigo: "man-4x25 ", Categoria: "Mangueras", Unidad: "m", Precio_venta: 11 })]), { apply: false });
  expect(r.rows[0].action).toBe("update");
  const dup = await importConcepts(admin, await book([row({ Codigo: "D1" }), row({ Codigo: "d1" })]), { apply: false });
  expect(dup.rows[1].errors).toContain("Código repetido en la fila 2");
});
test("categoría inexistente o desactivada es error de fila", async () => {
  const admin = await makeUser("admin");
  await setUnitActive(admin, "unit-km", false);
  const r = await importConcepts(admin, await book([row({ Codigo: "C1", Categoria: "Inventada" }), row({ Codigo: "C2", Unidad: "km" })]), { apply: false });
  expect(r.rows[0].errors[0]).toContain("Inventada");
  expect(r.rows[1].errors[0]).toContain("km");
});
test("archivo no Excel o sin una columna: error claro y nada cambia", async () => {
  const admin = await makeUser("admin");
  expect((await importConcepts(admin, new TextEncoder().encode("hola"), { apply: true })).error).toBe("El archivo no es un Excel (.xlsx) válido");
  const sinPrecio = await book([], COLUMNS.filter((c) => c !== "Precio_venta"));
  expect((await importConcepts(admin, sinPrecio, { apply: true })).error).toBe("Falta la columna Precio_venta");
});
test("un presupuestador no puede importar", async () => {
  const p = await makeUser("presupuestador");
  await expect(importConcepts(p, await book([]), { apply: false })).rejects.toThrow(ForbiddenError);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm add exceljs@4.4.0 && pnpm test tests/catalog/excel.test.ts` → FAIL
- [ ] **Step 3: Implementar `excel.ts`, `import.ts`, las dos rutas y las actions.** Las rutas responden con `content-type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y `content-disposition: attachment; filename="…"`.
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test` → PASS
- [ ] **Step 5: Página `/catalogo/importar`** (solo admin; si no lo es, `notFound()`). Pasos: enlace «Descargar plantilla», selector de archivo y «Revisar». La vista previa muestra un resumen («N altas, M cambios, K filas con errores») y una tabla con fila, código, acción y errores; las filas con error van en rojo y primero. «Confirmar importación» solo se habilita si no hay errores y vuelve a enviar el mismo archivo. Comprobar en Chrome: exportar, editar un precio en el `.xlsx` exportado, importar, revisar y confirmar, y ver el cambio en `/catalogo` y en el historial. Después, un archivo con una fila errónea: la vista previa la señala y «Confirmar» queda deshabilitado.
- [ ] **Step 6: Commit** — `git commit -m "feat(catalog): importación de Excel con vista previa y todo o nada, exportación y plantilla"`

---

### Task 5: Clientes (servicio)

**Files:**
- Create: `src/modules/clients/schema.ts`, `src/modules/clients/service.ts`, `src/modules/clients/actions.ts`
- Modify: `prisma/schema.prisma`; migración `pnpm db:migrate --name clients`
- Test: `tests/clients/service.test.ts`

**Interfaces:**
- Consumes: `prisma`, `requireUser`, `logAction`, `deleteOrDeactivate`, `parseOrThrow`.
- Produces:
  - `model Client { id, legalName String, tradeName String @default(""), taxId String @unique, fiscalAddress String @default("") @db.Text, notes String @default("") @db.Text, paymentTerms String @default("") @db.Text, exclusions String @default("") @db.Text, offerValidityDays Int?, active Boolean @default(true), createdAt, updatedAt, contacts ClientContact[], locations ClientLocation[] }`. Índice en `legalName`. Si `offerValidityDays` es `null`, se usa el valor de configuración.
  - `model ClientContact { id, clientId (onDelete: Cascade), name String, role String @default(""), email String @default(""), phone String @default(""), active Boolean @default(true) }`.
  - `model ClientLocation { id, clientId (onDelete: Cascade), name String, address String @default(""), city String @default(""), province String @default(""), active Boolean @default(true) }`.
  - `clientInput`: `legalName` (1..200), `taxId` (se normaliza quitando espacios, guiones y puntos y pasándolo a mayúsculas; después, de 1 a 20 caracteres, solo `[A-Z0-9]`; sin dígito de control, según la spec 5.4), `tradeName`, `fiscalAddress`, `notes`, `paymentTerms`, `exclusions` y `offerValidityDays` (texto vacío ⇒ `null`; si no, entero de 1 a 365). `contactInput`: `name` (1..100), `role`, `email` (vacío o email válido) y `phone`. `locationInput`: `name` (1..100), `address`, `city` y `province`.
  - `listClients(filter: { q?: string; status?: "active" | "inactive" | "all"; page?: number }): Promise<{ items: ClientRow[]; total: number }>`: `q` busca en razón social, nombre comercial o CIF; orden por razón social; 50 por página.
  - `getClient(id): Promise<ClientDetail>`, con contactos y ubicaciones (activos primero). Lanza `NotFoundError`.
  - `createClient(actor, input): Promise<Client>` y `updateClient(actor, id, input)`. Si el CIF se repite: `ValidationError({ taxId: "Ya existe un cliente con ese CIF/NIF" })` (capturando `P2002`).
  - `removeClient(actor, id): Promise<"deleted" | "deactivated">` y `setClientActive(actor, id, active)`.
  - `saveContact(actor, clientId, input & { id?: string })`, `removeContact(actor, contactId): Promise<"deleted" | "deactivated">`, y lo mismo para ubicaciones (`saveLocation`, `removeLocation`). Todo con `logAction` (entity `client`, `entityId` = id del cliente; por ejemplo, «Talleres Henares: contacto Laura Medina añadido»).
  - Cualquier usuario autenticado puede usar todas estas funciones. Las actions llaman a `requireUser()` y revalidan `/clientes` y `/clientes/[id]`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/clients/service.test.ts
const datos = { legalName: "Talleres Henares, S.A.", taxId: "a-28 000.000", tradeName: "", fiscalAddress: "", notes: "", paymentTerms: "30 días", exclusions: "", offerValidityDays: "" };
test("un presupuestador crea un cliente y el CIF se normaliza", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  expect(c.taxId).toBe("A28000000");
  expect(c.offerValidityDays).toBeNull();
});
test("CIF repetido con otro formato se rechaza", async () => {
  const p = await makeUser("presupuestador");
  await createClient(p, datos);
  await expect(createClient(p, { ...datos, taxId: "A28000000" })).rejects.toThrow("Ya existe un cliente con ese CIF/NIF");
});
test.each(["", "  ", "B-12#4"])("CIF «%s» se rechaza", async (taxId) => {
  const p = await makeUser("presupuestador");
  await expect(createClient(p, { ...datos, taxId })).rejects.toThrow(ValidationError);
});
test("contactos y ubicaciones: varios por cliente, email validado", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await saveContact(p, c.id, { name: "Laura Medina", role: "Mantenimiento", email: "lmedina@ejemplo.es", phone: "" });
  await saveContact(p, c.id, { name: "Óscar Prieto", role: "", email: "", phone: "600000002" });
  await saveLocation(p, c.id, { name: "Nave 3", address: "C/ Forja 2", city: "Torrejón de Ardoz", province: "Madrid" });
  await expect(saveContact(p, c.id, { name: "X", role: "", email: "no-es-email", phone: "" })).rejects.toThrow(ValidationError);
  const d = await getClient(c.id);
  expect([d.contacts.length, d.locations.length]).toEqual([2, 1]);
});
test("buscar por CIF o nombre comercial", async () => {
  const p = await makeUser("presupuestador");
  await createClient(p, { ...datos, tradeName: "THSA" });
  expect((await listClients({ q: "28000" })).total).toBe(1);
  expect((await listClients({ q: "thsa" })).total).toBe(1);
});
test("eliminar un cliente sin presupuestos lo borra con sus contactos", async () => {
  const p = await makeUser("presupuestador");
  const c = await createClient(p, datos);
  await saveContact(p, c.id, { name: "L", role: "", email: "", phone: "" });
  expect(await removeClient(p, c.id)).toBe("deleted");
  expect(await prisma.clientContact.count()).toBe(0);
  expect(await prisma.auditLog.count({ where: { entity: "client", entityId: c.id } })).toBeGreaterThanOrEqual(3);
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/clients` → FAIL
- [ ] **Step 3: Implementar el modelo, la migración, `schema.ts`, `service.ts` y `actions.ts`.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(clients): clientes con contactos, ubicaciones y condiciones habituales"`

---

### Task 6: Páginas de clientes y cierre del plan

**Files:**
- Create: `src/app/(app)/clientes/page.tsx`, `src/app/(app)/clientes/nuevo/page.tsx`, `src/app/(app)/clientes/[id]/page.tsx`, `src/app/(app)/clientes/forms.tsx`
- Modify: `src/app/(app)/layout.tsx` (Clientes pasa a `RailLink href="/clientes"`), `AGENTS.md` (estado), `README.md` (módulos)

**Interfaces:**
- Consumes: Tarea 5 y `getSettings()` (validez por defecto, para mostrarla cuando el cliente no tiene una propia).

- [ ] **Step 1: `/clientes`.** Buscador `GET` (`q`, `estado`), tabla con razón social, nombre comercial, CIF, ubicaciones y estado, y paginación. Botón «Nuevo cliente». Cada fila enlaza a la ficha.
- [ ] **Step 2: `/clientes/nuevo` y `/clientes/[id]`.** El alta usa el formulario de cliente y, al guardar, redirige a la ficha. La ficha sigue `clientes.html`: «Datos fiscales» en `dl` con «Editar», que abre el mismo formulario en la página; «Condiciones habituales» (si la validez está vacía, «30 días (por defecto)»); tablas de «Contactos» y «Ubicaciones de trabajo», cada una con una fila de alta, edición en línea y «Eliminar»; y los botones «Eliminar cliente» y «Desactivar/Reactivar». Los formularios conservan lo escrito ante un error del servidor. Los inactivos se ven atenuados con la etiqueta «Desactivado». Debajo, el texto «Los presupuestos de este cliente aparecerán aquí» (hasta el plan 3).
- [ ] **Step 3: Verificación completa.** Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build` → todo limpio. En Chrome, como presupuestador: crear el cliente «Talleres Henares, S.A.» con CIF «a-28 000 000», dos contactos y dos ubicaciones; editar una ubicación; probar un CIF repetido y un email de contacto inválido (errores en su sitio, sin perder lo escrito); buscar por CIF; eliminarlo. Revisar la entrada en `/admin/historial` como admin. Repasar en móvil `/clientes`, la ficha y `/catalogo`. Recorrer el éxito parcial de la spec 1: crear un cliente y un concepto sin tocar código.
- [ ] **Step 4: `AGENTS.md` y `README.md`.** Estado: plan 2 implementado en `plan-2-catalogo-clientes`; siguiente paso, escribir el plan 3. README: módulos `catalog` y `clients`, y la importación de Excel.
- [ ] **Step 5: Commit** — `git commit -m "feat(clients): listado y ficha de clientes; cierre del plan 2"`

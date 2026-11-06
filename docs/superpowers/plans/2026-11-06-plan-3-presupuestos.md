# Plan 3 · Presupuestos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un presupuestador monte un presupuesto para un cliente con partidas, líneas del catálogo o específicas y conjuntos que calculan solos sus cantidades; que lo emita con número tras pasar las validaciones; y que después cambie su estado, lo revise, lo duplique y lo encuentre filtrando por mes y estado.

**Architecture:** Se siguen los patrones de los planes 1 y 2: `schema.ts` (Zod), `service.ts` (lógica, Prisma y permisos), `actions.ts` (Server Actions finas que devuelven `ActionResult`) y páginas en `src/app/(app)`. El cálculo vive en un único módulo puro, `src/modules/quotes/calculation.ts`, sin Prisma ni React, y lo usan el editor, el listado y la instantánea de emisión. Las fórmulas de los conjuntos viven en otro módulo puro, `src/modules/kits/formulas.ts`. Todo importe es `Prisma.Decimal` (decimal.js), nunca `number`. Un presupuesto emitido no se puede modificar: cada función de escritura del borrador lo comprueba en el servidor.

**Tech Stack:** el de los planes 1 y 2. Sin dependencias nuevas: `Prisma.Decimal` ya es decimal.js.

**Spec:** `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md` (secciones 5.3, 5.5, 5.6, 5.8 «Numeración» y «Conceptos obligatorios», 5.9, 5.10 y 6)

**Fuera de este plan (plan 4):** el PDF (plantilla, Playwright, marca de agua y descarga), Dokploy y las copias de seguridad. Aquí la emisión guarda la instantánea JSON y la versión de plantilla `"v1"`. `IssuedDocument.pdfPath` y `sha256` quedan a `null` hasta el plan 4, que los rellenará al emitir y ofrecerá generar los PDF de lo ya emitido.

**Rama:** `plan-3-presupuestos`, creada desde `plan-2-catalogo-clientes`, en el mismo worktree `D:\dev\presupuestos-isf`.

## Global Constraints

- Todas las de los planes 1 y 2 siguen vigentes: versiones fijadas, código en inglés e interfaz en español, permisos en `service.ts`, decimales exactos, BD de desarrollo en el puerto 5433, `pnpm test` con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)"` y pruebas de interfaz con Claude in Chrome antes de cerrar una tarea de interfaz.
- Ninguna dependencia nueva.
- **Columnas:** importes en `@db.Decimal(14,2)`; cantidades y precios unitarios en `@db.Decimal(14,4)`; tipos de impuesto en `@db.Decimal(5,2)`.
- **Cálculo (spec 5.5):**
  1. importe de línea = cantidad × precio, redondeado a 2 decimales *half-up*;
  2. subpartida = suma de sus líneas, o cantidad × precio de la subpartida si es de precio global; partida = suma de subpartidas; base = suma de partidas;
  3. cuota de cada tipo = suma de las bases con ese tipo × tipo / 100, redondeada a 2 decimales *half-up*;
  4. total = base + cuotas.
- **Permisos:**
  - Presupuestos: cualquier usuario puede ver y editar todos, también los de otros (spec 5.1).
  - Conjuntos, numeración y conceptos obligatorios: solo `admin`, aunque cualquiera puede consultarlos.
- **Inmutabilidad:** si el presupuesto no está en `DRAFT`, toda función que modifica contenido (cabecera, partidas, líneas, conjuntos, ajustes y renuncias) lanza `ValidationError({ _: "El presupuesto ya está emitido y no se puede modificar" })`.
- **Copias:** al insertar una línea de catálogo se copian descripción, unidad, precio, nombre del impuesto y tipo, y se guarda `conceptId`. Al insertar un conjunto se copia su definición. Los cambios posteriores del catálogo o de la plantilla no alteran nada ya insertado.
- **Historial:** todo se registra con `logAction` en la misma transacción. Entidades `quote` y `kit`. Acciones nuevas:
  - `issue` «Emisión»;
  - `status` «Cambio de estado»;
  - `revision` «Revisión»;
  - `adjust` «Ajuste de precio»;
  - `duplicate` «Duplicado».
- **Rutas:**
  - `/` es el listado de presupuestos;
  - `/presupuestos/nuevo?cliente=<id>`;
  - `/presupuestos/[id]`;
  - `/conjuntos` y `/conjuntos/[id]`;
  - `/admin/configuracion`, con las nuevas secciones «Numeración» y «Conceptos obligatorios».
- **Interfaz:** según `docs/diseno/maquetas/editor.html` (tabla de partidas, bloques de conjunto con su esquema y un panel lateral con totales y «Para emitir») y `listado.html` (pestañas de estado, filtros y suma filtrada). Sin desbordamiento horizontal en móvil (≤ 900 px).

## Review Focus

1. **Dos emisiones simultáneas:** dos presupuestos emitidos a la vez reciben números consecutivos distintos, nunca el mismo ni un hueco → prueba en la Tarea 6.
2. **Pestaña antigua que guarda sobre un presupuesto ya emitido:** el servidor lo rechaza y nada cambia → prueba en la Tarea 3.
3. **El catálogo o la plantilla cambian después de insertar:** el presupuesto conserva sus precios y su definición, y al duplicarlo avisa de las diferencias → pruebas en las Tareas 4 y 7.
4. **Cantidades escritas a la española en el editor** («1,5», «1.234,5», «1.500»): las dos primeras se aceptan exactas y «1.500» se rechaza por ambigua, como en el catálogo → prueba en la Tarea 3.
5. **Revisiones cruzadas:** no puede haber dos borradores de revisión del mismo número a la vez, una revisión sustituida no cambia de estado, y el listado suma solo la última revisión emitida → pruebas en la Tarea 7.

---

## Estructura de archivos

```
prisma/schema.prisma                 KitTemplate, Quote, QuoteSection, QuoteLine, KitInstance, PriceAdjustment,
                                     IssuedDocument, NumberCounter, RequiredConcept; CompanySettings + numeración
prisma/migrations/<ts>_kits/, <ts>_quotes/, <ts>_issue/
src/modules/quotes/calculation.ts    calculateQuote(): puro
src/modules/kits/{definition,formulas,service,actions}.ts
src/modules/quotes/{schema,service,kit-instances,issue,lifecycle,actions}.ts
src/modules/quotes/numbering.ts      formatReference(), nextNumber()
src/modules/settings/seed.ts         + conjunto de ejemplo y conceptos obligatorios
src/app/(app)/page.tsx               listado
src/app/(app)/presupuestos/nuevo/page.tsx, [id]/page.tsx, [id]/*.tsx (componentes del editor)
src/app/(app)/conjuntos/page.tsx, [id]/page.tsx, forms.tsx
src/app/(app)/clientes/[id]/page.tsx  lista de presupuestos y «Nuevo presupuesto»
src/app/(app)/admin/configuracion/*   Numeración y Conceptos obligatorios
tests/quotes/*.test.ts, tests/kits/*.test.ts
```

---

### Task 1: Módulo de cálculo

**Files:**
- Create: `src/modules/quotes/calculation.ts`
- Test: `tests/quotes/calculation.test.ts`

**Interfaces:**
- Consumes: `Prisma.Decimal` de `@/generated/prisma/browser`, para que el editor también pueda usarlo en el cliente.
- Produces:
  ```ts
  type Dec = Prisma.Decimal | string;
  type CalcLine = { id: string; quantity: Dec; unitPrice: Dec | null; taxName: string | null; taxRatePct: Dec | null };
  type CalcSub = { id: string; mode: "SUM" | "GLOBAL"; globalQty?: Dec | null; globalPrice?: Dec | null;
                   taxName?: string | null; taxRatePct?: Dec | null; lines: CalcLine[] };
  type CalcSection = { id: string; subsections: CalcSub[] };
  type QuoteTotals = {
    lines: Record<string, Prisma.Decimal | null>;       // null = sin precio (no cuenta)
    subsections: Record<string, Prisma.Decimal>; sections: Record<string, Prisma.Decimal>;
    base: Prisma.Decimal; taxes: { name: string; ratePct: Prisma.Decimal; base: Prisma.Decimal; amount: Prisma.Decimal }[];
    total: Prisma.Decimal; unpricedLineIds: string[];  // líneas de subpartidas SUM sin precio o sin impuesto
  };
  export function calculateQuote(sections: CalcSection[]): QuoteTotals;
  ```
  - En una subpartida `GLOBAL`, las líneas son descriptivas: su importe es `null`, no cuentan en `unpricedLineIds` y su base y su cuota toman `taxName`/`taxRatePct` de la subpartida.
  - Los impuestos se agrupan por `(name, ratePct)` y se ordenan por tipo descendente.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
const L = (id: string, q: string, p: string | null, rate: string | null = "21") =>
  ({ id, quantity: q, unitPrice: p, taxName: rate ? `IVA ${rate} %` : null, taxRatePct: rate });
const sum = (id: string, lines: ReturnType<typeof L>[]) => ({ id, mode: "SUM" as const, lines });

test("ejemplo de la spec: 100 km × 0,30 + 20 h × 50 + 30 m × 10", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "100", "0.30"), L("b", "20", "50"), L("c", "30", "10")])] }]);
  expect([t.base, t.taxes[0].amount, t.total].map((d) => d.toFixed(2))).toEqual(["1330.00", "279.30", "1609.30"]);
});
test("el redondeo de línea es half-up en ,005", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "1", "0.005"), L("b", "3", "0.335")])] }]);
  expect([t.lines.a?.toFixed(2), t.lines.b?.toFixed(2)]).toEqual(["0.01", "1.01"]);
});
test("la cuota se redondea una vez por tipo, no por línea", () => {
  // 7 líneas de 0,10: por tipo, 0,70 × 21 % = 0,147 → 0,15; redondeando por línea daría 7 × 0,02 = 0,14.
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", Array.from({ length: 7 }, (_, i) => L(`l${i}`, "1", "0.10")))] }]);
  expect(t.taxes[0].amount.toFixed(2)).toBe("0.15");
});
test("una subpartida de precio global ignora el precio de sus líneas descriptivas", () => {
  const t = calculateQuote([{ id: "1", subsections: [
    { id: "1.1", mode: "GLOBAL", globalQty: "1", globalPrice: "15845.22", taxName: "IVA 21 %", taxRatePct: "21", lines: [L("d", "4", null, null)] },
  ] }]);
  expect(t.subsections["1.1"].toFixed(2)).toBe("15845.22");
  expect(t.unpricedLineIds).toEqual([]);
});
test("dos tipos de IVA dan dos cuotas; una línea sin precio no cuenta y se señala", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "1", "100"), L("b", "1", "100", "10"), L("c", "2", null)])] }]);
  expect(t.taxes.map((x) => [x.ratePct.toFixed(0), x.amount.toFixed(2)])).toEqual([["21", "21.00"], ["10", "10.00"]]);
  expect(t.base.toFixed(2)).toBe("200.00");
  expect(t.unpricedLineIds).toEqual(["c"]);
});
test("sin líneas, todo es cero", () => {
  expect(calculateQuote([]).total.toFixed(2)).toBe("0.00");
});
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/quotes/calculation.test.ts`. Expected: FAIL (no existe el módulo).
- [ ] **Step 3: Implementar `calculateQuote`.** Solo `Prisma.Decimal` y `ROUND_HALF_UP`, sin `Number(...)` sobre importes.
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test tests/quotes/calculation.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(quotes): módulo único de cálculo con redondeo half-up por línea y por tipo de impuesto"`

---

### Task 2: Conjuntos (plantillas, fórmulas y página)

**Files:**
- Create: `src/modules/kits/definition.ts`, `formulas.ts`, `service.ts`, `actions.ts`, `src/app/(app)/conjuntos/page.tsx`, `[id]/page.tsx`, `forms.tsx`
- Modify: `prisma/schema.prisma`, `src/modules/settings/seed.ts`, `src/app/(app)/layout.tsx` (enlace «Conjuntos»), `src/app/(app)/admin/historial/page.tsx` (entidad `kit` «Conjuntos»)
- Migración: `pnpm db:migrate --name kits`, con el conjunto de ejemplo en SQL
- Test: `tests/kits/formulas.test.ts`, `tests/kits/service.test.ts`

**Interfaces:**
- Consumes: `Concept`, `Category`, `parseOrThrow`, `assertAdmin`, `logAction`.
- Produces:
  - `model KitTemplate { id String @id @default(cuid()), name String @unique, description String @default("") @db.Text, active Boolean @default(true), definition Json, createdAt, updatedAt }`.
  - `kitDefinition` (Zod) y su tipo `KitDefinition`:
    ```ts
    type Ref = { conceptId: string } | { categoryId: string };   // concepto fijo o «elegir de la categoría»
    type Formula = { type: "FIXED"; k: string } | { type: "PER_QTY"; k: string } | { type: "PER_QTY_AND_PARAM"; param: string; k: string };
    type KitDefinition = {
      main: Ref & { label: string };
      params: { key: string; label: string; unit: string; required: boolean }[];   // key: [a-z][a-z0-9_]*, únicas
      components: { slot: string; label: string; ref: Ref; required: boolean; formula: Formula }[];  // slot único: "c1", "c2"…
    };
    ```
    Refinamientos:
    - `PER_QTY_AND_PARAM.param` debe existir en `params`;
    - `k` es un decimal positivo leído con `parseDecimalEs`.
  - `expandKit(def: KitDefinition, input: { quantity: string; params: Record<string, string>; choices: Record<string, string> }, concepts: Map<string, ConceptForKit>): KitExpansion` (pura), donde:
    ```ts
    type ConceptForKit = { id: string; categoryId: string; description: string; unitName: string; salePrice: Prisma.Decimal | null; taxName: string; taxRatePct: Prisma.Decimal; active: boolean };
    type KitExpansion = { lines: { slot: string; conceptId: string; quantity: Prisma.Decimal }[]; missing: string[] };
    ```
    - El slot del principal es `"main"`, con cantidad N.
    - Las cantidades de los componentes siguen las fórmulas `FIXED` (k), `PER_QTY` (k × N) y `PER_QTY_AND_PARAM` (k × N × dato).
    - `missing` lista etiquetas en español: «Falta elegir Mangueras», «Falta el dato Distancia al cuadro», «La cantidad debe ser mayor que cero».
    - Un componente opcional sin elegir se omite sin error.
    - Un concepto elegido que no pertenece a la categoría del hueco da «Manguera no es de la categoría Mangueras».
    - Un concepto fijo o elegido que ya no existe, está inactivo o no tiene precio da «<etiqueta> ya no está disponible». La definición guarda ids en JSON, sin clave foránea, así que borrar un concepto del catálogo no lo impide.
    - Si hay algún `missing`, `lines` vale `[]`: la instancia no se valora entera (maqueta: «Sin valorar hasta elegir la manguera»).
  - Servicio:
    - `listKits(opts?: { includeInactive?: boolean })` y `getKit(id)`, para cualquier usuario;
    - `saveKit(actor, input: { id?: string; name: string; description: string; definition: KitDefinition })` y `setKitActive(actor, id, active)`, solo admin;
    - los conceptos y categorías referenciados deben existir y estar activos, y si no, `ValidationError` con la ruta del campo;
    - los conjuntos no se borran: se desactivan.
  - Semilla, con los mismos datos en SQL y en `seedDefaults`:
    - `id: "kit-bomba"`, «Instalación de bomba»;
    - principal `{ categoryId: "cat-bombas", label: "Bomba" }`;
    - dato `{ key: "distancia", label: "Distancia al cuadro", unit: "m", required: true }`;
    - componente `{ slot: "c1", label: "Manguera", ref: { categoryId: "cat-mangueras" }, required: true, formula: { type: "PER_QTY_AND_PARAM", param: "distancia", k: "1" } }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/kits/formulas.test.ts — con un Map de conceptos de prueba (bomba 102, manguera 10 €/m)
test("ejemplo de la spec: 2 bombas a 10 m del cuadro → 2 ud y 20 m; valorado con calculateQuote da 404,00", () => {
  const x = expandKit(BOMBA_DEF, { quantity: "2", params: { distancia: "10" }, choices: { main: "bomba", c1: "manguera" } }, CONCEPTS);
  expect(x.missing).toEqual([]);
  expect(x.lines.map((l) => [l.slot, l.quantity.toFixed(0)])).toEqual([["main", "2"], ["c1", "20"]]);
  const t = calculateQuote([{ id: "s", subsections: [{ id: "ss", mode: "SUM", lines: x.lines.map((l) => ({ id: l.slot, quantity: l.quantity, unitPrice: CONCEPTS.get(l.conceptId)!.salePrice, taxName: "IVA 21 %", taxRatePct: "21" })) }] }]);
  expect(t.base.toFixed(2)).toBe("404.00");
});
test("sin manguera o sin distancia el conjunto queda incompleto y sin líneas", () => {
  const x = expandKit(BOMBA_DEF, { quantity: "1", params: {}, choices: { main: "bomba" } }, CONCEPTS);
  expect(x.lines).toEqual([]);
  expect(x.missing).toEqual(["Falta el dato Distancia al cuadro", "Falta elegir Manguera"]);
});
test("FIXED no depende de N; PER_QTY sí", () => { /* k=3 FIXED con N=5 → 3; k=2 PER_QTY con N=5 → 10 */ });
test("un concepto de otra categoría en el hueco es un error", () => { /* choices.c1 = "bomba" → missing contiene "no es de la categoría" */ });
test("«1,5» se lee exacto y «1.500» es ambiguo", () => { /* distancia "1,5" con N=2 → 3; distancia "1.500" → missing «Distancia al cuadro no es un número válido» */ });

// tests/kits/service.test.ts
test("la semilla trae «Instalación de bomba»", async () => { expect((await listKits()).map((k) => k.name)).toEqual(["Instalación de bomba"]); });
test("una fórmula que usa un dato inexistente se rechaza", async () => { /* PER_QTY_AND_PARAM param "altura" → ValidationError */ });
test("un presupuestador no puede guardar conjuntos", async () => { /* ForbiddenError */ });
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/kits`. Expected: FAIL.
- [ ] **Step 3: Implementar el modelo, la migración con semilla, `definition.ts`, `formulas.ts`, `service.ts` y `actions.ts`.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test`. Expected: PASS (toda la batería, porque `seedDefaults` cambió).
- [ ] **Step 5: Interfaz.**
  - `/conjuntos` lista nombre, descripción, número de componentes y estado.
  - `/conjuntos/[id]`, y `/conjuntos/nuevo` solo para admin, es un formulario con:
    - nombre y descripción;
    - el principal, a elegir entre concepto fijo y categoría;
    - una lista de datos (añadir y quitar filas);
    - una lista de componentes (concepto o categoría, obligatorio, tipo de fórmula, k y dato).
  - Debajo, en el formulario, se escribe la fórmula en palabras: «Manguera: 1 × N × Distancia al cuadro».
  - El presupuestador ve lo mismo en solo lectura.
  - El formulario conserva lo escrito ante un error.
  - Comprobar en Chrome:
    - crear «Cuadro con PLC» (principal fijo, dato «Entradas», componente `PER_QTY_AND_PARAM`);
    - provocar un error (k vacío) y ver que no se pierde nada;
    - desactivarlo;
    - verlo como presupuestador.
- [ ] **Step 6: Commit** — `git commit -m "feat(kits): conjuntos configurables con fórmulas FIJA, POR_CANTIDAD y POR_CANTIDAD_Y_DATO"`

---

### Task 3: Presupuesto en borrador (modelo y servicio)

**Files:**
- Create: `src/modules/quotes/schema.ts`, `service.ts`, `actions.ts`
- Modify: `prisma/schema.prisma`, `src/modules/settings/seed.ts`; migración `pnpm db:migrate --name quotes`
- Test: `tests/quotes/service.test.ts`, `tests/helpers/quotes.ts` (`makeClient()` y `makeDraft()` para las tareas siguientes)

**Interfaces:**
- Consumes: Tarea 1 (`calculateQuote`), `Client`/`ClientLocation`/`ClientContact`, `Concept`, `getSettings`, `parseDecimalEs`.
- Produces:
  - `enum QuoteStatus { DRAFT ISSUED SENT ACCEPTED REJECTED EXPIRED }` y `enum SectionMode { SUM GLOBAL }`.
  - `model Quote`:
    - `id`; `status QuoteStatus @default(DRAFT)`;
    - `seqYear Int?`, `seq Int?`, `revision Int @default(0)`, `reference String? @unique` y `@@unique([seqYear, seq, revision])`;
    - `clientId` (Restrict); `locationId?` y `contactId?` (Restrict, de modo que el eliminar de la ficha de cliente los desactiva);
    - `ownerId` (User, Restrict) y `createdById`;
    - `date DateTime @db.Date`, `subject String @db.Text`, `paymentTerms`, `exclusions` (Text) y `validityDays Int`;
    - `travelNote String @default("")`;
    - `waivers Json @default("{}")`: `{ [conceptId]: motivo }` para los obligatorios a cero;
    - `parentId String?`, la revisión de la que nace, y `supersededById String? @unique`;
    - `issuedAt DateTime?`;
    - `base Decimal @default(0) @db.Decimal(14,2)` y `total` igual, recalculados en cada guardado para el listado;
    - `createdAt`, `updatedAt`;
    - índices en `status`, `date`, `clientId` y `ownerId`.
  - `model QuoteSection`:
    - `id`; `quoteId` (Cascade); `parentId String?` (`null` = partida; con valor = subpartida, Cascade); `position Int`; `title String`;
    - `mode SectionMode @default(SUM)`, `globalQty`/`globalPrice Decimal? @db.Decimal(14,4)`, `taxName String?` y `taxRatePct Decimal? @db.Decimal(5,2)`.
  - `model QuoteLine`:
    - `id`; `sectionId` (Cascade, siempre una subpartida); `position`;
    - `conceptId String?` (Restrict: esta es la FK que hace que «eliminar concepto» lo desactive);
    - `kitInstanceId String?` (Cascade) y `kitSlot String?`;
    - `description @db.Text` y `unitName`;
    - `quantity Decimal @db.Decimal(14,4)` y `unitPrice Decimal? @db.Decimal(14,4)`;
    - `taxName String?` y `taxRatePct Decimal? @db.Decimal(5,2)`;
    - `visible Boolean @default(true)`.
  - `model RequiredConcept { conceptId String @id, concept Concept @relation(onDelete: Restrict) }`. Semilla: `concept-ser-despl` y `concept-ser-prog`. Solo conceptos, no categorías: los dos iniciales de la spec son conceptos. Una categoría obligatoria se añadiría más adelante con otra tabla.
  - Escritura en `service.ts`, siempre con `actor` y dentro de una transacción que comprueba `DRAFT`, recalcula `base`/`total` con `calculateQuote` y registra en el historial:
    - `createDraft(actor, { clientId }): Promise<Quote>`:
      - `ownerId = actor.id` y `date` = hoy;
      - copia las condiciones del cliente, o las de la configuración si el cliente las tiene vacías;
      - crea la partida «1» con la subpartida «1.1»;
      - un cliente inactivo da `ValidationError`.
    - `updateHeader(actor, id, input)`: `clientId`, `locationId`, `contactId`, `ownerId`, `date`, `subject`, `paymentTerms`, `exclusions`, `validityDays` y `travelNote`. La ubicación y el contacto deben pertenecer al cliente.
    - `addSection(actor, quoteId, { parentId?, title })` crea una partida, que a su vez trae una subpartida vacía, o una subpartida.
    - `updateSection(actor, sectionId, { title, mode, globalQty, globalPrice, taxId })`, `moveSection(actor, sectionId, dir: -1 | 1)` y `removeSection(actor, sectionId)`.
    - `addCatalogLine(actor, subsectionId, { conceptId, quantity })` copia los datos del concepto. Un concepto inactivo o sin precio de venta da `ValidationError`, salvo en una subpartida `GLOBAL`, donde la línea es descriptiva y se guarda sin precio ni impuesto.
    - `addCustomLine(actor, subsectionId, { description, unitName, quantity, unitPrice, taxId })`.
    - `updateLine(actor, lineId, { description?, quantity?, visible? })`. En una línea de conjunto solo se puede cambiar `visible`; la cantidad sale de la fórmula. `moveLine` y `removeLine` siguen el mismo patrón.
    - `setWaiver(actor, quoteId, conceptId, reason: string | null)`.
    - `deleteDraft(actor, id)`: solo para borradores sin número de serie; los borradores de revisión también se pueden borrar.
  - Lectura:
    - `getQuote(id): Promise<QuoteDetail>`, con las secciones ordenadas, las líneas, las instancias, el cliente, la ubicación, el contacto, el responsable y `totals: QuoteTotals`;
    - `listRequiredConcepts()`.
  - Todas las cantidades y precios pasan por `parseDecimalEs`. Si no es un número válido: `ValidationError({ quantity: "Escribe un número; «1.500» es ambiguo: 1500 o 1,5" })` para el caso ambiguo y «No es un número válido» para el resto. Una cantidad negativa se rechaza.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
test("un borrador nuevo copia las condiciones del cliente y trae la partida 1 con la 1.1", async () => { /* … */ });
test("añadir una línea del catálogo copia el precio; cambiar el catálogo después no la altera", async () => {
  const { actor, admin, quote, sub } = await makeDraft();
  const line = await addCatalogLine(actor, sub.id, { conceptId: "concept-man-4x25", quantity: "30" });
  await updateConcept(admin, "concept-man-4x25", { ...conceptFields, salePrice: "99" });
  expect((await getQuote(quote.id)).totals.base.toFixed(2)).toBe("300.00");
  expect(line.unitPrice?.toFixed(2)).toBe("10.00");
});
test("cantidades a la española: «1,5» vale; «1.500» es ambiguo", async () => { /* … */ });
test("no se puede añadir un concepto inactivo ni uno sin precio a una subpartida por suma", async () => { /* … */ });
test("una línea específica con su propio impuesto entra en el total", async () => { /* 2 × 25 al 21 % → total 60,50 */ });
test("eliminar un concepto usado en un presupuesto lo desactiva", async () => {
  const { actor, admin, sub } = await makeDraft();
  await addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" });
  expect(await removeConcept(admin, "concept-ser-prog")).toBe("deactivated");
});
test("eliminar un cliente con presupuestos lo desactiva, igual que su ubicación usada", async () => { /* … */ });
test("un presupuesto emitido no se puede modificar", async () => {
  const { actor, quote, sub } = await makeDraft();
  await prisma.quote.update({ where: { id: quote.id }, data: { status: "ISSUED" } });
  await expect(addCatalogLine(actor, sub.id, { conceptId: "concept-ser-prog", quantity: "1" })).rejects.toThrow("ya está emitido");
  await expect(updateHeader(actor, quote.id, { subject: "x" })).rejects.toThrow("ya está emitido");
});
test("una ubicación de otro cliente se rechaza", async () => { /* … */ });
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/quotes/service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar el modelo, la migración, `schema.ts`, `service.ts` (con un ayudante `withDraft(tx, quoteId, fn)` que bloquea la fila del presupuesto con `SELECT … FOR UPDATE`, comprueba `DRAFT`, ejecuta `fn` y recalcula `base`/`total`) y `actions.ts`.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(quotes): borradores con partidas, subpartidas y líneas copiadas del catálogo"`

---

### Task 4: Conjuntos dentro del presupuesto y ajustes de precio

**Files:**
- Create: `src/modules/quotes/kit-instances.ts`
- Modify: `prisma/schema.prisma` (migración `pnpm db:migrate --name quote_kits`), `src/modules/quotes/service.ts` y `actions.ts`
- Test: `tests/quotes/kit-instances.test.ts`

**Interfaces:**
- Consumes: Tarea 2 (`expandKit`, `KitDefinition`) y Tarea 3 (`withDraft`, `QuoteLine`).
- Produces:
  - `model KitInstance`:
    - `id`; `sectionId` (Cascade, una subpartida `SUM`); `templateId String?` (SetNull);
    - `name String`; `definition Json`, que es una copia;
    - `quantity Decimal @db.Decimal(14,4)`, `params Json` y `choices Json`;
    - `missing Json @default("[]")`, donde se guardan las etiquetas de `expandKit`;
    - `position Int`.
  - `model PriceAdjustment`: `id`, `lineId` (Cascade), `originalPrice` y `newPrice Decimal @db.Decimal(14,4)`, `reason String`, `userId` (Restrict) y `createdAt`.
  - Funciones:
    - `addKitInstance(actor, subsectionId, { templateId, quantity, params, choices }): Promise<KitInstance>`, para una plantilla activa;
    - `updateKitInstance(actor, instanceId, { quantity, params, choices })`;
    - `removeKitInstance(actor, instanceId)`.
  - Regeneración: cada guardado vuelve a ejecutar `expandKit` con la definición **copiada** y reemplaza las líneas de la instancia. Una línea con un ajuste de precio conserva el precio ajustado si sigue el mismo `kitSlot` con el mismo `conceptId`; si cambia el concepto, el ajuste se pierde y se registra «Ajuste descartado al cambiar el concepto».
  - `adjustPrice(actor, lineId, { newPrice: string, reason: string })`:
    - el motivo es obligatorio (1..300);
    - no se aplica a líneas descriptivas;
    - guarda un `PriceAdjustment` y escribe en el historial «Ajuste de precio: <descripción> 10,00 → 9,00 (<motivo>)».
  - `QuoteDetail` incluye en cada línea su último ajuste, para mostrar «precio original 10,00 €».

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
test("insertar el conjunto de bombas da 404,00 en el total", async () => { /* N=2, distancia 10, BOM-MAYOR75 + MAN-4X25 → base 404,00 */ });
test("cambiar N o la distancia recalcula las líneas", async () => { /* N=3 → 3 × (102 + 100) = 606,00 */ });
test("sin manguera el conjunto queda incompleto y no suma", async () => { /* missing = ["Falta elegir Manguera"], base 0,00 */ });
test("cambiar la plantilla después no altera la instancia insertada", async () => { /* saveKit con k=2 → la instancia sigue dando 404,00 */ });
test("el ajuste de precio exige motivo, queda registrado y sobrevive a un recálculo del mismo concepto", async () => { /* … */ });
test("un conjunto desactivado no se puede insertar", async () => { /* … */ });
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/quotes/kit-instances.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar el modelo, la migración, `kit-instances.ts`, `adjustPrice` y las actions.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(quotes): conjuntos insertados con recálculo y ajustes de precio con motivo"`

---

### Task 5: Editor de presupuestos

**Files:**
- Create: `src/app/(app)/presupuestos/nuevo/page.tsx`, `src/app/(app)/presupuestos/[id]/page.tsx` y sus componentes en la misma carpeta (`header-form.tsx`, `sections.tsx`, `line-forms.tsx`, `kit-block.tsx`, `aside.tsx`)
- Modify: `src/app/globals.css`, `src/app/(app)/clientes/[id]/page.tsx`
- Test: verificación en Chrome (la lógica ya está cubierta por las Tareas 1–4)

**Interfaces:**
- Consumes: las actions de las Tareas 3 y 4, `getQuote`, `listKits`, `listConcepts`, `listRequiredConcepts`, `formatDecimalEs` y, desde la Tarea 6, `issueChecks` (mientras no exista, el panel muestra solo los totales).
- Produces: las rutas `/presupuestos/nuevo?cliente=<id>`, que crea el borrador y redirige al editor, y `/presupuestos/[id]`.

- [ ] **Step 1: Cabecera y estructura.**
  - Migas «Presupuestos / Borrador · sin número», o la referencia si ya la tiene, y una etiqueta de estado.
  - Bloque de cabecera con cliente, ubicación, contacto, responsable, fecha, asunto y condiciones, en un `<details>` «Condiciones» abierto si alguna está vacía.
  - Si el presupuesto está emitido, todo se muestra como texto, sin formularios.
- [ ] **Step 2: Tabla de partidas.**
  - Columnas `P | Denominación | Cantidad | Precio | Importe`.
  - Filas de partida y de subpartida, con su modo («por suma» o «precio global» con cantidad y precio) y los botones subir, bajar y eliminar.
  - Al pie de cada subpartida, tres formas de añadir:
    - «Del catálogo»: buscador de conceptos activos con cantidad;
    - «Línea específica»: descripción, unidad, cantidad, precio e impuesto;
    - «Conjunto»: lista de conjuntos activos.
  - En cada línea:
    - edición en el sitio de la cantidad y la descripción;
    - casilla «Visible en documento»;
    - «Ajustar precio», que pide el nuevo precio y el motivo y deja la marca «ajustado (antes 10,00 €)»;
    - etiqueta «Sin validar» en ámbar si el concepto enlazado no está validado, e «Inactivo» si está desactivado.
  - Las líneas ocultas se ven atenuadas.
- [ ] **Step 3: Bloque de conjunto** (maqueta `editor.html`).
  - Nombre y resumen («2 bombas · distancia al cuadro 10 m»).
  - Esquema en línea: nodo principal, cable y nodo del componente, con el cable discontinuo en ámbar y «Falta elegir manguera» si falta algo.
  - Fórmula en palabras con el importe: «2 × (102,00 + 10 × 10,00) = 404,00 €», o «Sin valorar hasta elegir la manguera».
  - «Editar conjunto» abre en el sitio N, los datos y un selector por cada hueco de categoría, con solo los conceptos activos de esa categoría.
- [ ] **Step 4: Panel lateral.**
  - Totales: base, una cuota por tipo de impuesto y total.
  - Si `travelOriginText` está configurado: «Desplazamiento: km facturables desde Alcalá de Henares», junto al campo `travelNote`.
  - Botón «Eliminar borrador».
  - En móvil, el panel va debajo de la tabla.
- [ ] **Step 5: Ficha de cliente.** «Nuevo presupuesto», que enlaza a `/presupuestos/nuevo?cliente=<id>`, y la tabla de sus presupuestos (referencia o «Borrador», fecha, estado y total) en lugar del texto provisional.
- [ ] **Step 6: Verificar.**
  - Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test`. Expected: sin errores.
  - En Chrome, como presupuestador, montar el presupuesto de la maqueta:
    - cliente con ubicación;
    - partida «Grupo de bombeo»;
    - subpartida 1.1 con dos conjuntos (uno completo de 404,00 € y otro sin manguera);
    - subpartida 1.2 con 100 km y 20 h.
  - Comprobar:
    - el total base de 1.434,00 € (404 + 30 + 1.000);
    - que elegir la manguera que faltaba recalcula;
    - un ajuste de precio con motivo;
    - una línea oculta;
    - «1.500» rechazado sin perder lo escrito.
  - Repasarlo en móvil.
- [ ] **Step 7: Commit** — `git commit -m "feat(quotes): editor de presupuestos con partidas, líneas, conjuntos y totales"`

---

### Task 6: Emisión y numeración

**Files:**
- Create: `src/modules/quotes/numbering.ts`, `src/modules/quotes/issue.ts`
- Modify:
  - `prisma/schema.prisma` y su migración (`pnpm db:migrate --name issue`);
  - `src/modules/settings/schema.ts` y `service.ts`;
  - `src/app/(app)/admin/configuracion/*`;
  - el panel lateral del editor;
  - `src/app/(app)/admin/historial/page.tsx`.
- Test: `tests/quotes/numbering.test.ts`, `tests/quotes/issue.test.ts`

**Interfaces:**
- Consumes: Tareas 1, 3 y 4.
- Produces:
  - `CompanySettings`, nuevos campos:
    - `numberPattern String @default("PR-{AAAA}{NNNNNN}-R{RR}")`;
    - `numberYearlyReset Boolean @default(false)`;
    - `numberStart Int @default(1)`.

    Los editan los admin. El patrón debe contener `{NNNNNN}` (de 1 a 8 N) y `{RR}`.
  - `model NumberCounter { key String @id, value Int }`: la clave es `"global"`, o el año si hay reinicio anual.
  - `model IssuedDocument`: `id`, `quoteId @unique` (Restrict), `snapshot Json`, `templateVersion String`, `pdfPath String?`, `sha256 String?` y `createdAt`.
  - `formatReference(pattern: string, p: { year: number; seq: number; revision: number }): string`, pura:
    - `formatReference("PR-{AAAA}{NNNNNN}-R{RR}", { year: 2026, seq: 1029, revision: 0 })` = `"PR-2026001029-R00"`.
  - `nextNumber(tx, year: number): Promise<number>`:
    - bloquea el contador con `SELECT … FOR UPDATE`;
    - si no existe, lo crea con `numberStart`, absorbiendo con `ON CONFLICT DO NOTHING` la carrera de dos primeras emisiones a la vez;
    - lo incrementa y devuelve el valor.
  - `issueChecks(quote: QuoteDetail, required: RequiredConcept[]): IssueProblem[]`, pura. `IssueProblem = { code: string; message: string; anchor: string }`, donde `anchor` es el `id` HTML del elemento: `#cabecera`, `#linea-<id>` o `#conjunto-<id>`. Comprueba:
    - el cliente y la ubicación;
    - que haya al menos una línea, o una subpartida `GLOBAL` con precio;
    - que cada concepto obligatorio sume una cantidad mayor que cero en el presupuesto, o tenga renuncia con motivo («Falta Desplazamiento (o marca 0 con motivo)»);
    - que no haya conjuntos con `missing`;
    - que ninguna línea con `conceptId` tenga hoy el concepto sin validar («3 conceptos sin validar»), salvo las específicas;
    - que no haya `unpricedLineIds`;
    - que las subpartidas `GLOBAL` tengan cantidad, precio e impuesto;
    - que la forma de pago y la validez estén rellenas. Las exclusiones pueden ir vacías.
  - `issueQuote(actor, id): Promise<Quote>`:
    - en una transacción, bloquea el presupuesto y comprueba `DRAFT` y `issueChecks`; si hay problemas, `ValidationError({ _: lista })`;
    - asigna el número: uno nuevo si `seq` es `null`, o el que ya tiene si es una revisión;
    - escribe `reference`, `status = ISSUED` e `issuedAt`;
    - si `parentId`, marca el padre con `supersededById = id`;
    - crea `IssuedDocument` con la instantánea: empresa, cliente, ubicación, contacto, cabecera, condiciones, secciones, líneas, conjuntos y `QuoteTotals` serializado con importes en texto;
    - registra en el historial «Emisión de PR-…».

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
test("formatReference con el patrón por defecto", () => expect(formatReference("PR-{AAAA}{NNNNNN}-R{RR}", { year: 2026, seq: 1029, revision: 0 })).toBe("PR-2026001029-R00"));
test("emitir asigna número, guarda la instantánea y bloquea la edición", async () => { /* presupuesto completo → reference PR-<año>000001-R00, IssuedDocument con snapshot.totals.total */ });
test("dos emisiones simultáneas dan números consecutivos distintos", async () => {
  const [a, b] = await Promise.all([completeDraft(), completeDraft()]);
  const r = await Promise.all([issueQuote(actor, a.id), issueQuote(actor, b.id)]);
  expect(r.map((q) => q.seq).sort()).toEqual([1, 2]);
});
test("con reinicio anual, cada año empieza en numberStart", async () => { /* … */ });
test("issueChecks lista cada problema con su ancla", async () => {
  // sin ubicación, sin horas, un conjunto incompleto y un concepto sin validar → 4 problemas con códigos
});
test("un obligatorio a cero con renuncia y motivo deja emitir", async () => { /* … */ });
test("validar el concepto después hace desaparecer el aviso: se mira el estado actual", async () => { /* … */ });
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/quotes/numbering.test.ts tests/quotes/issue.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar el modelo, la migración, `numbering.ts`, `issue.ts`, la configuración y las actions.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test`. Expected: PASS.
- [ ] **Step 5: Interfaz.**
  - En `/admin/configuracion`:
    - sección «Numeración»: patrón, reinicio anual, valor inicial y una vista previa con `formatReference`;
    - sección «Conceptos obligatorios»: lista con «Quitar» y un selector de conceptos activos para añadir.
  - En el editor, el panel «Para emitir» (maqueta) muestra cada problema con su enlace al ancla y, para cada obligatorio, su cantidad o «Marcar 0 con motivo».
  - «Emitir presupuesto» se deshabilita con «Faltan N datos para poder emitir» y pide confirmación en la página, no con `confirm()`.
  - Tras emitir, la página muestra la referencia y queda en solo lectura.
  - Comprobar en Chrome:
    - emitir el presupuesto de la Tarea 5 tras completar el conjunto y validar los conceptos como admin;
    - ver el número;
    - intentar editar desde otra pestaña que se quedó abierta: error, sin cambios.
- [ ] **Step 6: Commit** — `git commit -m "feat(quotes): emisión con validaciones, numeración configurable sin huecos e instantánea"`

---

### Task 7: Estados, revisiones, duplicado, listado y cierre

**Files:**
- Create: `src/modules/quotes/lifecycle.ts`
- Modify:
  - `src/modules/quotes/service.ts` (`listQuotes`) y `actions.ts`;
  - `src/app/(app)/page.tsx`;
  - el editor (botones de estado, «Nueva revisión» y «Duplicar»);
  - `src/app/(app)/admin/historial/page.tsx`;
  - `AGENTS.md` y `README.md`.
- Test: `tests/quotes/lifecycle.test.ts`, `tests/quotes/list.test.ts`

**Interfaces:**
- Consumes: Tareas 3 a 6.
- Produces:
  - `setStatus(actor, id, status: "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "ISSUED")`:
    - solo desde un presupuesto ya emitido (cualquier estado distinto de `DRAFT`) y nunca si `supersededById` tiene valor («Sustituido por R01: ya no cambia de estado»);
    - cambio manual, sin orden obligatorio;
    - historial «Estado: Emitido → Enviado».
  - `isExpired(q: { status; issuedAt; validityDays }, today: Date): boolean`, pura: emitido o enviado con `issuedAt + validityDays < today`.
  - `createRevision(actor, id): Promise<Quote>`:
    - desde un emitido no sustituido, crea un borrador con `parentId = id`, `seqYear`/`seq` iguales, `revision + 1` y una copia profunda de secciones, líneas, instancias y ajustes;
    - si ya existe un borrador de revisión de ese número (lo detecta la restricción única `P2002`): `ValidationError({ _: "Ya hay un borrador de revisión R01 de este presupuesto" })`.
  - `duplicateQuote(actor, id): Promise<{ quote: Quote; warnings: string[] }>`:
    - crea un borrador sin número, con fecha de hoy y el actor como responsable, copiando todo con sus precios;
    - `warnings` avisa de las líneas cuyo concepto está inactivo o tiene otro precio de venta en el catálogo: «MAN-4X25: catálogo 12,00, presupuesto 10,00».
  - `listQuoteHistory(quoteId): Promise<AuditEntry[]>`: el historial de un presupuesto y de todas sus revisiones, para cualquier usuario (spec 5.9: «se puede ver por presupuesto»). `listAudit` sigue siendo solo para admin.
  - `refreshPricesFromCatalog(actor, id): Promise<number>`: en un borrador, actualiza el precio, la descripción, la unidad y el impuesto de las líneas de catálogo con concepto activo y precio, sin tocar las ajustadas, y devuelve cuántas cambió.
  - `listQuotes(filter: { q?: string; clientId?: string; ownerId?: string; status?: QuoteStatus | "all"; from?: string; to?: string; page?: number }): Promise<{ items: QuoteRow[]; total: number; sum: Prisma.Decimal; counts: Record<QuoteStatus, number> }>`:
    - `q` busca en la referencia, la razón social y el asunto;
    - el filtro de fechas va sobre `date`;
    - solo cuentan los presupuestos con `supersededById = null`, es decir, la última revisión emitida de cada número más los borradores;
    - `sum` es la suma de `total` de todos los filtrados, no solo de la página;
    - `counts` se calcula con los mismos filtros salvo el estado, para las pestañas.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
test("revisar crea R01 en borrador; al emitirla, R00 queda sustituida y ya no cambia de estado", async () => { /* … */ });
test("no puede haber dos borradores de revisión del mismo número", async () => { /* segunda createRevision → «Ya hay un borrador de revisión R01» */ });
test("el borrador de revisión abandonado deja R00 vigente", async () => { /* deleteDraft(R01) → R00.supersededById null y setStatus funciona */ });
test("duplicar avisa de conceptos con otro precio o inactivos y refrescar actualiza salvo los ajustados", async () => { /* … */ });
test("el listado filtra por mes y estado y suma solo la última revisión", async () => {
  // R00 1.609,30 sustituida por R01 2.000,00 + un borrador 100,00 → sum 2.100,00; status SENT del mes → solo R01
});
test("isExpired: emitido hace 31 días con validez 30 → caducado; aceptado nunca", () => { /* … */ });
```

- [ ] **Step 2: Ejecutar y comprobar que fallan.** Run: `pnpm test tests/quotes/lifecycle.test.ts tests/quotes/list.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar `lifecycle.ts`, `listQuotes` y las actions.**
- [ ] **Step 4: Ejecutar y comprobar que pasan.** Run: `pnpm test`. Expected: PASS.
- [ ] **Step 5: Interfaz.**
  - **Listado `/`** (maqueta `listado.html`):
    - título «Presupuestos · <mes>»;
    - «Nuevo presupuesto», que pide antes el cliente con un selector de clientes activos;
    - pestañas de estado con sus recuentos;
    - filtros `GET`: buscar, mes (atajos «Este mes» y «Mes anterior», más desde/hasta), cliente y responsable;
    - tabla con referencia (o «Borrador»), cliente, asunto, responsable, fecha, estado y total;
    - el estado lleva «· N días» desde la emisión mientras está enviado, y la etiqueta «Validez vencida» si `isExpired`;
    - las revisiones muestran «Sustituye a R00»;
    - pie con «N resultados» y «Total filtrado X €».
  - **Editor de un emitido:**
    - selector de estado;
    - «Nueva revisión» y «Duplicar», que tras duplicar muestra los avisos y el botón «Actualizar precios desde catálogo»;
    - la marca «Sustituido por R01», con enlace;
    - un `<details>` «Historial» al pie, con `listQuoteHistory`.
  - En `/admin/historial`, las acciones nuevas en español.
- [ ] **Step 6: Verificación completa.**
  - Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`. Expected: todo limpio.
  - En Chrome, el criterio de éxito de la spec 1:
    1. crear un cliente;
    2. montar un presupuesto con desplazamiento, horas y el conjunto de bombas;
    3. emitirlo;
    4. pasarlo a «Enviado»;
    5. filtrar «este mes» + «Enviado» y verlo con su total;
    6. crear R01, cambiar una cantidad, emitirla y comprobar que el listado muestra solo R01 y que R00 dice «Sustituido por R01»;
    7. duplicar tras cambiar un precio del catálogo y ver el aviso.
  - Repasar en móvil el listado y el editor.
- [ ] **Step 7: Documentación.**
  - `AGENTS.md`: plan 3 implementado en `plan-3-presupuestos`; el siguiente paso es escribir el plan 4 (PDF, Dokploy y copias).
  - `README.md`: módulos `kits` y `quotes`, el cálculo y la numeración.
- [ ] **Step 8: Commit** — `git commit -m "feat(quotes): estados, revisiones, duplicado y listado con filtros; cierre del plan 3"`

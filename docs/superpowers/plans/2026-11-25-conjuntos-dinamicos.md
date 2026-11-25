# Conjuntos dinámicos: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir conjuntos dinámicos: piezas con tipos de slot cuyos slots se añaden en el borrador. Se pueden meter en conjuntos normales (PLC con tarjetas locales y periferia) o sueltas en una partida, con o sin principal. Se muestran en la lista, en el editor, en el borrador y en el PDF (A1).

**Architecture:** Todo cabe en el JSON `definition` que ya existe. Se le añaden `kind`, `main` opcional, `slotTypes` y `dynamics`, todos con valores por defecto, así que las definiciones antiguas siguen validando igual. El estado de los slots va en una columna JSON nueva, `KitInstance.slots`. `expandKit` sigue siendo puro: recorre el conjunto, sus dinámicos colocados y los slots. Las líneas llevan `kitSlot` con el grupo (`d1/…`, `s:<id>`) para que el borrador cerrado y el PDF agrupen. Una instancia guarda copia de las definiciones de sus dinámicos, así que cambiar una plantilla no toca los presupuestos.

**Tech Stack:** Next.js 16 (Server Actions), React 19, TypeScript 5.9, Prisma 7 + PostgreSQL 17, Zod 4, Vitest; interfaz revisada con Claude in Chrome.

**Spec:** `docs/superpowers/specs/2026-11-25-conjuntos-dinamicos-design.md`. Maqueta: `docs/diseno/maquetas/conjuntos-dinamicos.html` (v4).

## Global Constraints

- Se trabaja en la rama `mejoras-uso-real`, en el worktree sin `#` (`D:\dev\presupuestos-isf`). Cada tarea hace commit y push a esa rama, que se despliega sola en `:3101`. Fusionar en `master` o desplegar producción exige el visto bueno explícito del usuario.
- Cada tarea sube el parche de `version` en `package.json`. Hoy es 1.9.19 (tras los ajustes del borrador, plan `2026-11-25-ajustes-borrador.md`): la tarea 1 → 1.9.20, la 2 → 1.9.21 y así hasta la 9 → 1.9.28.
- Código en inglés; interfaz y textos en español. Importes y cantidades como `Decimal` o cadenas normalizadas, nunca `float`.
- Los permisos se comprueban en el servidor. Toda escritura de un borrador pasa por `withDraft()`. Lo emitido no se modifica.
- No se borran ni se reescriben pruebas existentes: solo se añaden.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test` (BD de pruebas en el puerto 5433; Docker Desktop encendido).
- Tras `prisma migrate dev`: `pnpm exec prisma generate` y reiniciar `pnpm dev`. Para matar el servidor desde Bash: `pkill -f '[n]ext dev'`.
- Formularios con `ActionForm`. Buscadores con `Combobox` (`src/components/combobox.tsx`): no se crea otro.
- `AGENTS.md` y `progreso.md` usan CRLF: edítalos con Python `newline=''`, nunca con `sed -i`.
- Textos fijados por la spec:
  - «Conjuntos dinámicos»; «Nuevo conjunto dinámico»; «+ Añadir conjunto dinámico»; «+ Añadir material fijo»;
  - «Slots · tipos que se pueden añadir»; «+ Añadir tipo de slot»; «Añadir slot»;
  - «Añadir variante: código, descripción o categoría»; «N slot» / «N slots»;
  - «Normal» / «Rojo»; «Toda una categoría» / «Elegidas»; «Se elige al presupuestar» / «Siempre el mismo».

## Review Focus

1. **Quitar un dinámico opcional** borra sus slots, sus elecciones (`dN/…`) y sus líneas. Si se vuelve a poner, empieza vacío. Prueba en la tarea 3.
2. **Cantidad de slot no válida** («0», «», «abc», «-1»): el servidor la rechaza con `ValidationError({ quantity })` y no guarda nada. «1,5» se acepta. Prueba en la tarea 3.
3. **Variante que deja de estar disponible** (artículo desactivado o sin precio en una subpartida con precio): el conjunto queda incompleto con «… ya no está disponible» y sin valorar, como los materiales de hoy. Prueba en la tarea 2.
4. **Revisión o ampliación de un presupuesto** (`lifecycle.ts`, copia de secciones): la copia conserva `slots` y las líneas con su `kitSlot`. Prueba en la tarea 3.
5. **Borrar un dinámico que usa un conjunto normal:** queda bloqueado igual que si lo usara un presupuesto. Desactivarlo se permite, pero el conjunto normal muestra el aviso de «no disponible». Prueba en la tarea 4.

---

### Task 1: Definición con dinámicos, tipos de slot y principal opcional (1.9.20)

**Files:**
- Modify: `src/modules/kits/definition.ts`
- Modify: every caller that `pnpm exec tsc --noEmit` reports after making `main` optional (expected: `form.ts`, `history.ts`, `service.ts`, `naming.ts` callers, `kit-instances.ts`, `presupuestos/[id]/sections.tsx`, `conjuntos/*`)
- Test: `tests/kits/definition.test.ts` (new)

**Interfaces:**
- Produces, in `definition.ts`:
  - `kitDefinition` now has:
    - `kind: z.enum(["normal","dynamic"]).default("normal")`;
    - `main` optional (same shape as today);
    - `slotTypes: SlotType[]` with default `[]`, at most 20;
    - `dynamics: DynamicPart[]` with default `[]`, at most 5.
  - `type SlotType = { key: string /* ^t\d+$ */; label: string; abbr: string /* 1-4 chars, trimmed */; red: boolean; variants: { conceptIds: string[] /* 1..100 */ } | { categoryId: string } }`
  - `type DynamicPart = { slot: string /* ^d\d+$ */; label: string; choice: { templateId: string } | { templateIds: string[] /* ≥2 */ }; optional: boolean; inName?: boolean; copies?: Record<string, { name: string; definition: KitDefinition }> }`. `copies` is only filled in an instance's copy, never in a template; validate it with `z.lazy(() => kitDefinition)`.
  - `type KitSlot = { id: string; group: string /* "self" or a DynamicPart.slot */; type: string /* SlotType.key */; conceptId: string | null; quantity: string }` and `kitSlotList = z.array(...)`, used to parse `KitInstance.slots`.
  - `allowedTemplates(d: DynamicPart): string[]`: `[templateId]` or `templateIds`.
  - `isDynamic(def): boolean`.
  - `slotLineKey(group: string, slotId: string): string`: `"s:<id>"` for `"self"`, otherwise `"<group>/s:<id>"`. Also `partKey(group: string, slot: string): string`: `"<group>/<slot>"`, for the `main` and `cN` of a nested dynamic.

- [ ] **Step 1: Write the failing tests** in `tests/kits/definition.test.ts`:
  - `"una definición antigua sigue validando y sale como normal sin slots ni dinámicos"`: parse a fixture like `BOMBA` from `tests/kits/form.test.ts`; expect `kind === "normal"`, `slotTypes` `[]`, `dynamics` `[]`.
  - `"un conjunto normal exige principal"`: no `main` → issue at path `["main"]`, message `"Elige el principal"`.
  - `"un dinámico puede no tener principal pero necesita al menos un tipo de slot"`:
    - `{ kind: "dynamic", params: [], components: [], slotTypes: [] }` → issue `"Añade al menos un tipo de slot"`;
    - with one slot type → valid.
  - `"un dinámico no lleva datos ni otros dinámicos"`: `params` not empty → `"Un conjunto dinámico no pide datos"`; `dynamics` not empty → `"Un conjunto dinámico no puede llevar otro"`.
  - `"un conjunto normal no lleva tipos de slot"`: normal with `slotTypes` → `"Solo los conjuntos dinámicos tienen slots"`.
  - `"claves de tipo y de dinámico repetidas"`: two `t1` → `"Tipo repetido"`; two `d1` → `"Hueco repetido"`.
  - `"elegir entre dinámicos pide al menos dos"`: `templateIds: ["a"]` → `"Elige al menos dos"`.
  - `"slotLineKey y partKey"`: `slotLineKey("self","x1") === "s:x1"`, `slotLineKey("d1","x1") === "d1/s:x1"`, `partKey("d1","c2") === "d1/c2"`.

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/kits/definition.test.ts`. Expected: FAIL (exports missing).

- [ ] **Step 3: Implement the schema and helpers** in `definition.ts`, with the issues above in `superRefine` (messages verbatim).

- [ ] **Step 4: Fix the callers.** Run `pnpm exec tsc --noEmit -p .` and fix each error from `main` being optional:
  - **Naming** (`autoKitName` in `service.ts`). With a main, the base name is as today. Without one, the base is the first three `slotTypes[].abbr` joined with `-` (for example `ED-SD-F`). Dynamics with `inName` add the first two letters of their template name, in order, the same way materials marked «en el nombre» do. Saving sets `main.symbol` only when there is a main.
  - **`Silhouette`** (`sections.tsx`) and the template page: with no main, show the kit name's first two letters.
  - **`kitLines`** (`history.ts`): add the line `Principal: —` when there is none.
  - **`fromDefinition`** (`form.ts`): return `main: FormRef | null`. Do not add fields to its result, because an existing test uses `toEqual` on it.
  - **`carryOver`** (`kit-instances.ts`): compare mains only when both exist.

- [ ] **Step 5: Run:** `pnpm exec vitest run tests/kits` and `pnpm exec tsc --noEmit -p .`. Expected: both pass; existing kit tests stay green.

- [ ] **Step 6: Bump to 1.9.20, commit `feat(conjuntos): definición con dinámicos, tipos de slot y principal opcional; 1.9.20`, push.**

---

### Task 2: Expansión pura con dinámicos y slots (1.9.21)

**Files:**
- Modify: `src/modules/kits/formulas.ts`
- Test: `tests/kits/formulas.test.ts` (add tests only)

**Interfaces:**
- Consumes: `SlotType`, `DynamicPart`, `KitSlot`, `slotLineKey`, `partKey`, `allowedTemplates` (Task 1).
- Produces:
  - `KitInput` gains `slots: KitSlot[]` (optional in the type, default `[]`).
  - `expandKit(def, input, concepts, descriptive)` keeps its signature and return shape.
  - `slotTypeOf(def: KitDefinition, group: string, type: string): SlotType | undefined`, which reads a nested type from `def.dynamics[].copies[choices[group]]`.
  - `isVariant(t: SlotType, c: ConceptForKit): boolean`.

**Rules to implement:**
- **Line order:**
  1. `main` (only if present, quantity N);
  2. `components` as today;
  3. for each placed dynamic, in definition order: its main as `partKey(d,"main")` with quantity 1, then its components as `partKey(d,"cN")` with N = 1, then its slots;
  4. last, the kit's own slots (`group "self"`, for a standalone dynamic).
- Slots are ordered by the position of their type in `slotTypes`, then by their order in `input.slots`.
- **A dynamic is placed** when `input.choices[d.slot]` names a template that is in `allowedTemplates(d)` and has an entry in `copies`.
  - If it is not placed and not optional: with `choice.templateId`, `"Falta {label}"`; with `templateIds`, `"Falta elegir {label}"`.
  - If the copy is missing: `"{label} ya no está disponible"`.
- A nested dynamic resolves its own main and components with `choices[partKey(d, slot)]`.
- **Slot problems, which go to `missing` with the type's label:**
  - no variant → `"Falta elegir la variante en {type.label}"`;
  - quantity not a decimal > 0 → `"{type.label}: cantidad no válida"`;
  - concept not a variant → `"{type.label}: {description} no es una variante válida"`;
  - concept inactive or without price (when not descriptive) → `"{type.label} ya no está disponible"`.
- A slot whose `group` is not placed, or whose type no longer exists, is ignored.
- A standalone dynamic with no main ignores `input.quantity`, which the UI sends as `"1"`.

- [ ] **Step 1: Write the failing tests:**
  - `"un dinámico suelto sin principal solo lleva sus slots"`: 2 slots (ED ×3, F ×1) → lines `s:a` 3 and `s:b` 1, with no `main`.
  - `"un PLC con dinámico fijo coloca su principal, sus fijos y sus slots tras los materiales"`: expect `kitSlot` order `main`, `c1`, `d1/main`, `d1/c1`, `d1/s:a`.
  - `"los slots salen en el orden de los tipos y luego en el de alta"`.
  - `"un dinámico opcional sin colocar no falta; uno obligatorio sí"`.
  - `"elegir dinámico: uno fuera de la lista no cuenta"`.
  - `"slot sin variante, con cantidad 0 o con un artículo que no es variante deja el conjunto incompleto y sin líneas"`: exact messages from the rules above.
  - `"variante por categoría acepta cualquier artículo de esa categoría"`.
  - Review Focus 3: `"una variante desactivada deja el conjunto incompleto"`, expecting `"Entradas digitales ya no está disponible"`.
- [ ] **Step 2: Run** `pnpm exec vitest run tests/kits/formulas.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Extract today's loop into a local `expandPart(def, prefix, n, …)` and call it for the kit itself and for each placed dynamic. Pure, with no I/O.
- [ ] **Step 4: Run** the same tests and `pnpm exec vitest run tests/kits`. Expected: PASS.
- [ ] **Step 5: Bump to 1.9.21, commit `feat(conjuntos): expansión con dinámicos y slots; 1.9.21`, push.**

---

### Task 3: Slots en el presupuesto: migración y servicio (1.9.22)

**Files:**
- Modify: `prisma/schema.prisma` (`KitInstance.slots Json @default("[]")`), migration `kit_slots` via `pnpm exec prisma migrate dev --name kit_slots`.
- Modify: `src/modules/quotes/kit-instances.ts`, `src/modules/quotes/schema.ts`, `src/modules/quotes/actions.ts`, `src/modules/quotes/lifecycle.ts`.
- Test: `tests/quotes/kit-instances.test.ts` (add), `tests/quotes/lifecycle.test.ts` (add).

**Interfaces:**
- Consumes: Task 1 types; `expandKit` with `slots` (Task 2).
- Produces, in `kit-instances.ts`:
  - `copyDynamics(tx: Tx, def: KitDefinition): Promise<KitDefinition>`: fills `copies` for every allowed template that is active and of kind dynamic. Used by `addKitInstance` and `changeKitInstance`.
  - `addKitSlot(actor, instanceId: string, group: string, type: string): Promise<string>`: returns the new slot id (`crypto.randomUUID().slice(0, 8)`) with `conceptId: null` and `quantity: "1"`. It rejects a group that is not placed or a type that does not exist with `ValidationError({ _: "Ese tipo de slot no existe" })`.
  - `updateKitSlot(actor, instanceId: string, slotId: string, patch: { conceptId?: string | null; quantity?: string }): Promise<void>`. The quantity goes through `decimalField()`; it must be > 0, otherwise `ValidationError({ quantity: "Escribe una cantidad mayor que cero" })`.
  - `removeKitSlot(actor, instanceId: string, slotId: string): Promise<void>`.
  - `setKitDynamic(actor, instanceId: string, group: string, templateId: string | null): Promise<void>`. `null` is only allowed when `optional`, and it removes `choices[group]`, every `choices` key starting with `group + "/"` and every slot of that group. A template id must be in `allowedTemplates` and in `copies`.
  - `addKitInstance`:
    - for a kit with fixed, non-optional dynamics, set `choices[d.slot] = templateId` when creating;
    - for a dynamic with no main, store `quantity` `"1"`.
  - `changeKitInstance`: keeps the slots whose `group` and chosen template coincide in both definitions and whose type key exists; drops the rest.
  - Actions in `actions.ts`, all with `id` (instance) in the form: `addKitSlotAction` (`group`, `type`), `updateKitSlotAction` (`slotId`, `conceptId`, `quantity`), `removeKitSlotAction` (`slotId`), `setKitDynamicAction` (`group`, `templateId`; empty means remove).
- In `regenerate`, also collect the concept ids of the copies, of the `dN/…` choices and of the slots. Pass `slots` to `expandKit`.
- Every write logs with `logQuote`, for example «Slot añadido en {kit}: {type.label}» or «Periferia descentralizada quitada de {kit}».
- `lifecycle.ts` copies `slots: kitData.slots as Prisma.InputJsonValue`.

- [ ] **Step 1: Write the failing tests:**
  - `"añadir un slot crea su línea al elegir la variante y suma en el recuento"`.
  - `"cantidad de slot no válida se rechaza sin guardar"`: «0», «», «abc» and «-1» throw; «1,5» is stored as `"1.5"`. (Review Focus 2.)
  - `"quitar un dinámico opcional borra sus slots, elecciones y líneas; volver a ponerlo empieza vacío"`. (Review Focus 1.)
  - `"no se quita un dinámico obligatorio"`.
  - `"elegir un dinámico fuera de la lista se rechaza"`.
  - `"un dinámico suelto sin principal se añade a una subpartida y se valora solo con sus slots"`.
  - `"cambiar una plantilla dinámica no altera la instancia ya creada"`: edit the template after `addKitInstance`; the instance's lines stay the same.
  - `"un presupuesto emitido no admite cambios de slots"`: expect the `LOCKED` error.
  - In `lifecycle.test.ts`: `"la revisión conserva los slots y las líneas del conjunto"`. (Review Focus 4.)
- [ ] **Step 2: Run** `pnpm test -- tests/quotes/kit-instances.test.ts tests/quotes/lifecycle.test.ts` (with the consent variable). Expected: FAIL.
- [ ] **Step 3: Migration, then** `pnpm exec prisma generate`.
- [ ] **Step 4: Implement** the functions and actions above.
- [ ] **Step 5: Run** the two files, then the whole suite. Expected: PASS.
- [ ] **Step 6: Bump to 1.9.22, commit `feat(conjuntos): slots en el presupuesto (migración kit_slots y servicio); 1.9.22`, push.**

---

### Task 4: Plantillas: guardar, validar, usos e historial (1.9.23)

**Files:**
- Modify: `src/modules/kits/service.ts`, `src/modules/kits/history.ts`
- Test: `tests/kits/service.test.ts`, `tests/kits/history.test.ts` (add)

**Interfaces:**
- Produces:
  - `refIssues` also checks:
    - every variant concept or category exists and is active;
    - every dynamic template exists, is active and is `kind: "dynamic"`. Messages: «{label}: ese conjunto ya no está disponible» and «{label}: no es un conjunto dinámico».
  - `kitUses(id)` counts instances plus templates whose `dynamics` reference `id`. `removeKit` uses it as today: «Se usa en N presupuestos o conjuntos».
  - `listKits` stays the same; callers filter with `isDynamic`.
  - `kitLines` adds one line per slot type, `Tipo de slot {abbr} {label}{ (rojo)}: {n} variantes | categoría {name}`, and one per dynamic, `Conjunto dinámico {label}: {templateId names joined " / "}{ · opcional}`.
- [ ] **Step 1: Write the failing tests:**
  - `"un normal no puede usar un conjunto normal como dinámico"`.
  - `"guardar un dinámico sin principal le da nombre con sus abreviaturas"`, expecting `ED-SD-F`.
  - `"no se borra un dinámico que usa otro conjunto"`. (Review Focus 5.)
  - `"desactivar un dinámico avisa en el conjunto que lo usa"`.
  - `"el historial lista los tipos de slot y los dinámicos"`.
- [ ] **Step 2: Run, and expect FAIL.** **Step 3: Implement.** **Step 4: Run** `pnpm exec vitest run tests/kits` and expect PASS.
- [ ] **Step 5: Bump to 1.9.23, commit `feat(conjuntos): validación, usos e historial de dinámicos; 1.9.23`, push.**

---

### Task 5: Lista de Conjuntos con dos pestañas (1.9.24)

**Files:**
- Modify: `src/app/(app)/conjuntos/page.tsx`, `src/app/globals.css`

**Behavior:**
- Tabs as links: `/conjuntos` and `/conjuntos?tipo=dinamicos`, styled like the maqueta's `.ltabs`, each with its count. The button reads «Nuevo conjunto» (`/conjuntos/nuevo`) or «Nuevo conjunto dinámico» (`/conjuntos/nuevo?tipo=dinamico`).
- **«Conjuntos»** gets a column «Conjuntos dinámicos» with one chip per dynamic: the `.mini` symbol and the name. The border is dashed when it is optional. With `templateIds` it reads «se elige: A / B».
- **«Conjuntos dinámicos»** columns:
  - Conjunto dinámico;
  - Principal → materiales fijos (`— sin principal —` when there is none);
  - Tipos de slot: `abbr` boxes, red when `red`;
  - Lo usan: names of the normal kits using it, plus «suelto en presupuestos» if any instance uses it directly;
  - Estado.
- [ ] **Step 1: Implement**, reusing the current table markup.
- [ ] **Step 2: Check** with `pnpm dev` and Claude in Chrome at 1440 and 390 px: both tabs, counts, chips and red boxes. No horizontal scroll at 390.
- [ ] **Step 3: Bump to 1.9.24, commit `feat(conjuntos): pestaña de conjuntos dinámicos en la lista; 1.9.24`, push.**

---

### Task 6: Editor de conjunto dinámico (1.9.25)

**Files:**
- Modify: `src/modules/kits/form.ts`, `src/app/(app)/conjuntos/forms.tsx`, `src/app/(app)/conjuntos/[id]/page.tsx` (`id = "nuevo"`; read `?tipo=dinamico` there and pass the kind to `KitForm`), `src/app/globals.css`
- Test: `tests/kits/form.test.ts` (add)

**Interfaces (`form.ts`):**
- `type FormSlotType = { key: string; label: string; abbr: string; red: boolean; mode: "conceptIds" | "categoryId"; conceptIds: string[]; categoryId: string }`
- `type FormDynamic = { slot: string; label: string; mode: "fixed" | "choose"; templateIds: string[]; optional: boolean; inName: boolean }`
- `extrasFromDefinition(def: KitDefinition): { kind: "normal" | "dynamic"; slotTypes: FormSlotType[]; dynamics: FormDynamic[] }`. It is new, because `fromDefinition` keeps its shape.
- `toDefinition(main: FormRef | null, materials, info, extras?: { kind; slotTypes; dynamics })`. Without `extras` it behaves as today.
- `nextKey(prefix: "t" | "d", taken: string[]): string`.

**Behavior (maqueta, tab 2):**
- The kind comes from `?tipo=dinamico` and cannot be changed after saving.
- The dynamic editor shows the main box with a third choice, «Sin principal», added to «Se elige al presupuestar / Siempre el mismo». The button reads «+ Añadir material fijo».
- **Block «Slots · tipos que se pueden añadir»:** one row per type (abbr box, label, summary of its variants) and «+ Añadir tipo de slot». The selected row has the inset green bar.
- **Side panel of a type:**
  - «Nombre»; «Abreviatura» (max 4); «Color» Normal/Rojo;
  - «Variantes» Toda una categoría / Elegidas;
    - with Elegidas: a list with ✕ and the `Combobox` with placeholder «Añadir variante: código, descripción o categoría», items = active concepts not yet added, `extra` = category, `onPick` adds the concept and remounts the combobox (via `key`) empty;
    - with Toda una categoría: the categories `select` used today;
  - «Quitar tipo».
- The symbol is principal or initials, ○ per fixed material and a dashed □ for the slots. The exact form is shown to the user in Chrome before closing the task (spec, «Matices visuales»).
- [ ] **Step 1: Write the failing tests:**
  - `"toDefinition de un dinámico sin principal"`: `kind`, no `main`, `slotTypes` with `variants.conceptIds`.
  - `"extrasFromDefinition ↔ toDefinition ida y vuelta"`: both variant modes and `red`.
  - `"nextKey no repite claves"`.
- [ ] **Step 2: Run and expect FAIL; implement; run and expect PASS.**
- [ ] **Step 3: Check in Chrome:**
  - create a dynamic with no main and three types;
  - add variants by typing «di 4» + Tab;
  - mark one type red and save;
  - reopen it and the data is still there.
- [ ] **Step 4: Bump to 1.9.25, commit `feat(conjuntos): editor de conjunto dinámico; 1.9.25`, push.**

---

### Task 7: Conjunto normal con dinámicos en el editor (1.9.26)

**Files:**
- Modify: `src/app/(app)/conjuntos/forms.tsx`, `src/modules/kits/form.ts`
- Test: `tests/kits/form.test.ts` (add)

**Behavior (maqueta, tab 3):**
- «+ Añadir conjunto dinámico» sits next to «+ Añadir material». A dynamic row has a solid green prefix and the subtitle «conjunto dinámico X · opcional | obligatorio».
- **Panel:**
  - «Cuál»: Se elige al presupuestar / Siempre el mismo. With «Siempre el mismo», a `Combobox` of active dynamics; with «Se elige», a list of at least two with ✕ and a combobox to add more.
  - «Nombre», «Opcional», «En el nombre», «Quitar».
- The symbol is principal, ○ per material and ■ per dynamic.
- [ ] **Step 1: Write the failing test** `"toDefinition con dinámicos: fijo y a elegir"`. **Run → FAIL, implement, run → PASS.**
- [ ] **Step 2: Check in Chrome:** build `PLC-RA-IM` (CPU by category, two dynamics, one of them optional); the automatic name includes the prefixes of the dynamics marked «en el nombre».
- [ ] **Step 3: Bump to 1.9.26, commit `feat(conjuntos): conjuntos dinámicos dentro de un conjunto; 1.9.26`, push.**

---

### Task 8: Borrador: ramas dinámicas, slots y vista cerrada (1.9.27)

**Files:**
- Create: `src/app/(app)/presupuestos/[id]/kit-block.tsx`. Move `KitBlock` and `Silhouette` here from `sections.tsx`, which has grown to 468 lines. The move is mechanical, in its own commit, and changes no behavior.
- Create: `src/app/(app)/presupuestos/[id]/kit-dynamic.tsx` (`DynamicBranch`, `SlotRow`, `AddSlotBar`)
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx` (the «+ Añadir» kit picker also lists dynamics, grouped), `src/modules/quotes/service.ts` if the editor context needs the dynamics' concepts, `src/app/globals.css`

**Behavior (maqueta, tab 4; spec §4):**
- **Level-1 row for each placed dynamic:**
  - `--tint` background and a solid green prefix;
  - the dynamic's main read-only (or a `Combobox` if it is chosen at quote time);
  - quantity 1 read-only;
  - `«N slot(s)»`, the sum of its slot quantities;
  - ✕ when it is optional (`setKitDynamicAction` with an empty template).
  - With `templateIds`: a `Combobox` of the allowed dynamics in the article column, submitting `setKitDynamicAction`.
- **Level 2:** fixed materials read-only; slots with:
  - the tag (`.kq-tag`, red variant when `red`);
  - the type label;
  - `Combobox` (`submit`, items = the type's variants) → `updateKitSlotAction`;
  - quantity with `SubmitOnBlur` → `updateKitSlotAction`;
  - ✕ → `removeKitSlotAction`.
- **Last branch «Añadir slot»:** label aligned with the elbow (13 px top margin, 17 px line-height, as in the maqueta's `.addlab`) and one button per type (`.addbar`, red when `red`) → `addKitSlotAction`. After the reload, the new slot's combobox has `autoFocus`.
- An optional dynamic that is not placed shows «+ Añadir {label en minúscula}» on a dashed button.
- The level-1 vertical continues between dynamics with the **same 1.5 px border** as the rest of the tree, not a gradient.
- **Closed view:** own lines, then per dynamic a title row (prefix + label) and its lines with a green left rule. Lines are grouped by the `kitSlot` prefix `dN/`.
- Kit header summary: `1 × {main} · {n} {label en minúscula}` per dynamic, for example «1 × CPU 1513-1 PN · 6 tarjetas locales · periferia con 7 slots»; the exact wording is the builder's call. A standalone dynamic: `{n} slots`.
- [ ] **Step 1: Commit the mechanical move of `KitBlock` → `kit-block.tsx`** (`refactor: KitBlock a su propio archivo`). Run `tsc`.
- [ ] **Step 2: Implement the branches and the actions wiring.**
- [ ] **Step 3: Check in Chrome at 1440, 820 and 390 px** with a `PLC-RA-IM` draft and a standalone dynamic with no main in an empty draft (the extension case):
  - add, choose, change quantity and remove slots;
  - remove and restore the optional periphery;
  - the closed view is grouped;
  - «Añadir slot» is aligned with its elbow;
  - no horizontal scroll at 390.
- [ ] **Step 4: Full suite + `pnpm lint`. Bump to 1.9.27, commit `feat(conjuntos): slots y conjuntos dinámicos en el borrador; 1.9.27`, push.**

---

### Task 9: PDF A1 (1.9.28)

**Files:**
- Modify: `src/pdf/document.ts`, `src/pdf/templates/v1/index.ts`, `src/pdf/templates/v1/styles.ts`
- Test: `tests/pdf/document.test.ts`, `tests/pdf/template.test.ts` (add)

**Interfaces:**
- The snapshot type in `document.ts` gains, all optional because of older snapshots:
  - on lines: `kitSlot?: string | null`;
  - on kits: `definition?: unknown`.
- `PdfRow` gains `{ kind: "group"; title: string }` and a flag `grouped?: true` on `line` rows. The group title is the `DynamicPart.label`, read from the kit's definition by the `kitSlot` prefix `dN/`.
- Template:
  - group row: `<tr class="ghd"><td></td><td colspan="3"><span class="gt">{title}</span></td></tr>`;
  - grouped lines: `class="line in"`, plus `lst` on the last one.
  - Styles copied from the maqueta (`.ghd .gt`: green, 10.5 pt, tracking .08em, uppercase, rule .75 pt; `.in` left rule 1.25 pt green, extra indent), in mm/pt like the rest of `styles.ts`.
- [ ] **Step 1: Write the failing tests:**
  - `"las líneas de un dinámico salen bajo su título"`.
  - `"un dinámico sin líneas visibles no deja título"`.
  - `"un snapshot antiguo sin kitSlot sale como hoy"`.
  - In the template test: `"fila de grupo y líneas agrupadas en el HTML"`.
- [ ] **Step 2: Run → FAIL; implement; run → PASS.**
- [ ] **Step 3: Check the «Vista previa (PDF)» of the Task 8 draft** in Chrome; it matches the maqueta's tab 5.
- [ ] **Step 4: Bump to 1.9.28, commit `feat(pdf): bloques de conjuntos dinámicos (A1); 1.9.28`, push.**

---

### Task 10: Cierre

- [x] Full suite, `pnpm lint` (0 errors) and `pnpm build`. Record the counts. Cierre 1.9.29: 477/477 pruebas (45 archivos), lint 0 errores/20 avisos anteriores, build correcto.
- [x] Check in `:3101` once the push has deployed: versión de cierre 1.9.29, app saludable y `migrate` Exited (0). Recorrido técnico PLC + ampliación y PDF correcto; HTTP con ambos roles repetido tras desplegar. No nueva revisión visual en Chrome (herramienta no disponible).
- [x] Update `docs/superpowers/progreso.md` and the «Estado actual» of `AGENTS.md` (CRLF): what was done, decisions taken by the way and minor items left over. Correcciones y documentación en `7084984`; confirmación del despliegue en commit documental de cierre.
- [x] Tell the user it is ready for review in `:3101`. Do not merge to `master` without their explicit approval: there is a migration (`kit_slots`) for production.

Correcciones del cierre (1.9.29): protección de variantes/copias/slots en catálogo, lecturas de instancia bajo `withDraft`, tipo inmutable en servidor y conservación interna de líneas durante estados incompletos (sin sumarlas ni mostrarlas). Sin nuevas migraciones. Recorrido técnico candidato PLC → emisión → revisión → ampliación → PDF comprobado en beta; la confirmación del autodespliegue se registra en `progreso.md`. Sin nueva revisión visual en Chrome: no está disponible en OpenCode.

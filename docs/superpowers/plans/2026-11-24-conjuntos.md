# Conjuntos: nueva forma de crearlos (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rehacer la pantalla de crear y editar conjuntos (interfaz 1, nombre automático opción D) sin cambiar el formato que leen los presupuestos.

**Architecture:** se mantiene el JSON de `kitDefinition` y se le añade la fórmula `PARAM` y dos campos opcionales (`main.symbol`, `components[].inName`). Unas funciones puras traducen formulario ↔ definición (`form.ts`) y calculan prefijos y nombre (`naming.ts`). El servicio decide el nombre final cuando no recibe uno.

**Tech Stack:** Next.js 16, React 19, Zod 4, Prisma 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-24-conjuntos-design.md`. Maqueta: `docs/diseno/maquetas/conjuntos-interfaz.html`, interfaz 1.

## Decisiones del usuario tras la revisión (2026-11-24, prevalecen sobre la spec)

1. **«Obligatorio»** solo se muestra si el material es de categoría o si su cantidad se pone al presupuestar. Un artículo fijo con cantidad fija se guarda siempre con `required: true`.
2. **Dato pedido:** la etiqueta del dato es `«{nombre del material}: cantidad»`. `Silhouette` no dibuja círculo para los datos con clave `q_…`.
3. **`label` pasa de 80 a 300 caracteres** en `kitDefinition`, tanto en `main`, como en `params` y `components`.
4. **Conjuntos antiguos:** si ningún componente tiene `inName`, el primero se marca «en el nombre». Si el nombre guardado no es el automático (ni el automático con `-N`), se antepone a la descripción: `«{nombre}. {descripción}»`, o solo `{nombre}` si la descripción está vacía.

## Global Constraints

- Solo en la rama `features`. Commit y push a `origin/features` en cada tarea. `master` no se toca.
- Versión: la tarea 1 deja `1.9.0` y cada tarea siguiente sube el parche (1.9.1, 1.9.2…).
- Código en inglés, interfaz en español. Decimales con `Prisma.Decimal` y `parseDecimalEs`, nunca float.
- No se borran ni se editan pruebas existentes, solo se añaden.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`, con la BD de Docker en el 5433.
- Ningún texto de la pantalla nombra un tipo concreto de conjunto (bombas, mangueras…) ni muestra «k» o «N».
- CRLF en `AGENTS.md` y `progreso.md`.

## Review Focus

- Un conjunto guardado con un sufijo `-2` no debe anteponer su propio nombre a la descripción cada vez que se abre → `legacyDescription` lo prueba (tarea 3).
- Editar un conjunto no debe hacer que choque consigo mismo y pase a `-2` → prueba de `saveKit` editando (tarea 2).
- Un prefijo vacío (una categoría con nombre solo de símbolos o de palabras vacías) no debe dejar el nombre vacío ni con un guion delante → prueba de `kitBaseName` (tarea 2).
- Las instancias guardadas antes (sin `symbol` ni `inName`, con etiquetas de hasta 80 caracteres) siguen pasando `kitDefinition.parse` → prueba en la tarea 1.
- Un material «se pone al presupuestar» y opcional con el dato vacío no añade línea, y obligatorio con el dato vacío deja el conjunto incompleto → pruebas de `PARAM` (tarea 1).

---

### Task 1: fórmula `PARAM`, etiquetas de 300 y campos opcionales (1.9.0)

**Files:**
- Modify: `src/modules/kits/definition.ts`, `src/modules/kits/formulas.ts`, `package.json`
- Test: `tests/kits/formulas.test.ts` (añadir al final)

**Interfaces:**
- Produces: `KitFormula` incluye `{ type: "PARAM"; param: string; k: string }`. `KitDefinition["main"]` tiene `symbol?: string` (de 1 a 2 caracteres) y cada componente tiene `inName?: boolean`. `describeFormula` para `PARAM` devuelve `` `${k} × ${label del dato}` ``.

- [ ] **Step 1: pruebas que fallan**
  - `test("PARAM: cantidad = k × dato, sin depender de N")`: principal fijo `cuadro`, `quantity: "3"`, dato `q_c1 = "25"`, componente `manguera` fijo con `PARAM(q_c1, k "1")` → líneas `[["main","3"],["c1","25"]]`.
  - `test("PARAM opcional con el dato vacío no añade línea; obligatorio deja el conjunto incompleto")`: con `required:false` en el dato y en el componente → solo la línea `main`. Con `required:true` → `missing` contiene `"Falta el dato …"` y `lines` es `[]`.
  - `test("PARAM con un dato que no existe se rechaza")`: `kitDefinition.safeParse(...)` da `success: false`.
  - `test("definiciones antiguas siguen siendo válidas y se admiten etiquetas de 300")`: `BOMBA_DEF` parsea igual. Una etiqueta de 300 caracteres parsea y una de 301 no.
- [ ] **Step 2:** ejecutar `pnpm test tests/kits/formulas.test.ts` → FAIL.
- [ ] **Step 3:** añadir `PARAM` a la unión, `symbol: z.string().max(2).optional()` en `main`, `inName: z.boolean().optional()` en los componentes, y `label` con `.max(300, "Máximo 300 caracteres")`. La comprobación «Ese dato no existe» se aplica a `PER_QTY_AND_PARAM` y a `PARAM`. En `expandKit`, la rama de `PARAM` hace `q = k.mul(v)`, con la misma regla de dato vacío que hoy. Actualizar el comentario de la cabecera.
- [ ] **Step 4:** las pruebas de `tests/kits/` pasan.
- [ ] **Step 5:** `version` = `1.9.0`. Commit `feat(conjuntos): fórmula PARAM y etiquetas de 300; 1.9.0` y push.

### Task 2: nombre automático en `naming.ts` y en el servicio (1.9.1)

**Files:**
- Create: `src/modules/kits/naming.ts`
- Modify: `src/modules/kits/service.ts`, `src/modules/kits/actions.ts`, `package.json`
- Test: `tests/kits/naming.test.ts` (nuevo) y `tests/kits/service.test.ts` (añadir)

**Interfaces:**
- Produces (puras y válidas en cliente):
  - `categoryPrefix(name: string): string`
  - `codePrefix(code: string): string`
  - `kitBaseName(mainPrefix: string, namePrefixes: string[]): string`, que une con `-` y omite los vacíos. Si el resultado queda vacío devuelve `"CJ"`.
  - `uniqueName(base: string, taken: string[]): string`, que devuelve `base` o `base-2`, `base-3`…
  - `matchesAutoName(name: string, base: string): boolean`, que vale `true` para `base` y `base-N`.
- Produces (servicio): `autoKitName(tx, def: KitDefinition, excludeId?: string): Promise<string>`. `saveKit` acepta `name` opcional. Sin `name`, calcula el nombre con `autoKitName` dentro de la transacción y guarda `definition.main.symbol = name.slice(0, 2)`.

- [ ] **Step 1: pruebas que fallan** (`naming.test.ts`)
  - `categoryPrefix`: `"Bombas"→"BOM"`, `"Mecanismos"→"MEC"`, `"Mano de obra"→"MO"`, `"Válvulas"→"VAL"`, `"Cajas para empotrar"→"CE"`, `"¿?"→""`.
  - `codePrefix`: `"VAL-010"→"VAL"`, `"MO-002"→"MO"`, `"ABC123"→"ABC"`, `"a.b-1"→"AB"`.
  - `kitBaseName("BOM", ["MAN", ""])→"BOM-MAN"` y `kitBaseName("", [])→"CJ"`.
  - `uniqueName("BOM-MAN", ["BOM-MAN","BOM-MAN-2"])→"BOM-MAN-3"`.
  - `matchesAutoName("BOM-MAN-2","BOM-MAN")` es `true` y `matchesAutoName("Instalación de bomba","BOM-MAN")` es `false`.
- [ ] **Step 2: pruebas de servicio que fallan** (`service.test.ts`)
  - `test("sin nombre, saveKit pone el automático y su símbolo")`: guarda la definición de la semilla con `c1.inName: true` y sin `name` → `name` es `"BOM-MAN"` (ajusta los prefijos a los nombres de categoría reales de la semilla) y `definition.main.symbol` es `"BO"`. Un segundo guardado igual da `"BOM-MAN-2"`.
  - `test("editar un conjunto con nombre automático no lo renombra a -2")`: guardar el primero otra vez con su `id` conserva `"BOM-MAN"`.
- [ ] **Step 3:** implementar. Las tildes se quitan con `normalize("NFD")` y se eliminan los diacríticos. Palabras vacías: `de del la las el los y para con en a`. `autoKitName` lee el nombre de las categorías y el código de los conceptos de `def.main` y de los componentes con `inName`, y los nombres de los demás conjuntos con `id ≠ excludeId`. `saveKitAction` deja de enviar `name` (el campo desaparece del formulario en la tarea 3).
- [ ] **Step 4:** `pnpm test tests/kits` pasa, con las pruebas antiguas sin tocar.
- [ ] **Step 5:** `1.9.1`. Commit `feat(conjuntos): nombre automático con prefijos y repetidos; 1.9.1` y push.

### Task 3: traducción formulario ↔ definición en `form.ts` (1.9.2)

**Files:**
- Create: `src/modules/kits/form.ts`
- Modify: `package.json`
- Test: `tests/kits/form.test.ts` (nuevo)

**Interfaces:**
- Produces:
  - `type FormRef = { kind: "categoryId" | "conceptId"; id: string }`
  - `type FormMaterial = { slot: string; ref: FormRef; qty: string; mult: boolean; ask: boolean; required: boolean; inName: boolean }`, donde `qty` es texto con coma decimal
  - `type RefInfo = (ref: FormRef) => { label: string; unit: string; prefix: string }`
  - `fromDefinition(def: KitDefinition): { main: FormRef; materials: FormMaterial[] }`
  - `toDefinition(main: FormRef, materials: FormMaterial[], info: RefInfo): KitDefinition`, sin `symbol`, que lo pone el servidor
  - `showsRequired(m: FormMaterial): boolean`, que vale `m.ref.kind === "categoryId" || m.ask`
  - `materialSummary(m: FormMaterial, unit: string): string`, con los textos de la spec 5.1: «1 ud × principal», «1 ud en total», «cantidad al presupuestar × principal» y «cantidad al presupuestar en total»
  - `legacyDescription(name: string, base: string, description: string): string`

- [ ] **Step 1: pruebas que fallan**
  - Tabla de la spec 5.2, de ida y vuelta: `ask/mult` = `no/sí → PER_QTY(k=qty)`, `no/no → FIXED`, `sí/sí → PER_QTY_AND_PARAM(q_<slot>, k "1")` y `sí/no → PARAM(q_<slot>, k "1")`. Un material con `ask` genera el dato `{ key: "q_c1", label: "Mangueras: cantidad", unit, required }`. Los datos que nadie usa desaparecen.
  - Un artículo fijo sin `ask` y con `required: false` se guarda con `required: true` (decisión 1).
  - Los dos conjuntos reales de producción (spec 3) pasan por `fromDefinition`: «Instalación de bomba» da `ask: true, mult: true` e «Equipo de medida» da `ask: false, mult: true, qty: "1"`. Los dos tienen `inName: true` en el primer material (decisión 4). Al volver con `toDefinition`, `expandKit` da las mismas cantidades que con la definición original, para `quantity "2"` y una distancia `"10"` (en la nueva, el dato `q_c1`).
  - Con algún `inName` guardado se respeta tal cual, incluido el de que todos sean `false`.
  - `legacyDescription("Instalación de bomba","BOM-MAN","Bomba con…")` da `"Instalación de bomba. Bomba con…"`. Con la descripción vacía da `"Instalación de bomba"`. `legacyDescription("BOM-MAN-2","BOM-MAN","x")` da `"x"`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. La `k` se pasa con `qty.replace(",", ".")` sin parsear: la valida `kitDefinition`. **Step 4:** PASS.
- [ ] **Step 5:** `1.9.2`. Commit `feat(conjuntos): traducción formulario ↔ definición; 1.9.2` y push.

### Task 4: pantalla nueva de crear y editar (1.9.3)

**Files:**
- Modify: `src/app/(app)/conjuntos/forms.tsx` (se reescribe `KitForm`, `KitActiveToggle` no cambia), `src/app/(app)/conjuntos/[id]/page.tsx`, `src/app/globals.css`, `package.json`

**Interfaces:**
- Consumes: todo lo de las tareas 2 y 3.
- `KitForm` props: `{ kit: Kit | null; concepts: { id; code; description; unitName; active }[]; categories: { id; name; active }[]; taken: string[] }`. `taken` son los nombres de los demás conjuntos, activos e inactivos. La página se los pasa y usa `kit?.name ?? "Nuevo conjunto"` en la miga.

- [ ] **Step 1:** maquetación según la interfaz 1, con las clases de la maqueta que no chocan con `globals.css`. No usar `.code`, `.seg` ni `.sum`, que ya existen: usar los prefijos `kn-` y `kt-`. Cosas que fija la spec:
  - nombre grande con 2 letras subrayadas y `.mini`;
  - aviso ámbar de repetido con el botón «Añadir X al nombre → …»;
  - `textarea` de la descripción, de 2000 como máximo, con el valor inicial `legacyDescription(...)`;
  - principal en un recuadro verde con el selector de dos botones;
  - árbol con «+ Añadir material», que marca `inName` solo si es el primero;
  - panel fijo a la derecha con Cantidad y su unidad de ancho fijo, «Se pone al presupuestar», «× cantidad del principal» con su ayuda, «Obligatorio» (solo si `showsRequired`), «En el nombre (PREFIJO)» y «Quitar material»;
  - Guardar y su nota.
  - Artículos con `<input list>` y `<datalist>`, opciones «CÓDIGO · Descripción». Si el texto no coincide con ninguna, el aviso es «Elige un artículo de la lista».
  - Por debajo de 1000 px, una sola columna.
- [ ] **Step 2:** envía `definition = toDefinition(...)` en el campo oculto, sin `name`. Los errores del servidor salen junto al campo, con las rutas `definition.main` y `definition.components.{i}.ref`.
- [ ] **Step 3:** `pnpm lint` y `pnpm exec tsc --noEmit` sin errores, y `pnpm test` en verde.
- [ ] **Step 4:** Claude in Chrome en local, a 1280 px y a 390 px:
  - crear un conjunto que no sea de bombas (por ejemplo, un artículo fijo con un material de mano de obra);
  - crear otro que repita nombre y comprobar el aviso y que se guarda como `-2`;
  - abrir «Instalación de bomba» y comprobar que la descripción lleva el nombre antiguo delante y que se guarda como `BOM-…`.
- [ ] **Step 5:** `1.9.3`. Commit `feat(conjuntos): pantalla de árbol con panel y nombre automático; 1.9.3` y push.

### Task 5: lista de la pestaña (1.9.4)

**Files:** Modify: `src/app/(app)/conjuntos/page.tsx`, `package.json`

- [ ] **Step 1:** columnas «Conjunto» (enlace más descripción en gris), «Principal → lo que lleva», «Materiales» y «Estado», con el texto de introducción de la spec 5.4. Los nombres salen de `def.main.label` y `components[].label`, sin consultas nuevas. El principal va en negrita.
- [ ] **Step 2:** comprobarlo en Chrome. `1.9.4`. Commit `feat(conjuntos): lista con lo que lleva cada conjunto; 1.9.4` y push.

### Task 6: los dos retoques del editor de presupuestos (1.9.5)

**Files:** Modify: `src/app/(app)/presupuestos/[id]/sections.tsx`, `src/app/(app)/presupuestos/[id]/page.tsx`, `package.json`

- [ ] **Step 1:** `Silhouette` recibe `main={def.main.symbol ?? def.main.label}`. Los `params` cuya clave empieza por `q_` no entran en `parts` (decisión 2). `ctx.kits` lleva `description`, y cada `<option>` de «Añadir conjunto» lleva `data-d={k.description}`. Hay que añadirlo también al tipo de la línea 24.
- [ ] **Step 2:** `pnpm test` en verde. En Chrome:
  - insertar un conjunto nuevo en un borrador y comprobar el símbolo, el campo «X: cantidad (unidad)» y el importe;
  - abrir un presupuesto que ya tenga «Instalación de bomba» y comprobar que se ve igual que antes.
- [ ] **Step 3:** `1.9.5`. Commit `feat(conjuntos): símbolo y descripción del conjunto en el editor; 1.9.5` y push.

### Task 7: cierre

- [ ] Actualizar `docs/superpowers/progreso.md` y la sección «Estado actual» de `AGENTS.md` (CRLF): el trabajo de Conjuntos queda en `features`, pendiente de la revisión del usuario.
- [ ] Commit `docs: conjuntos en features, pendiente de revisión` y push. Sin subir versión.

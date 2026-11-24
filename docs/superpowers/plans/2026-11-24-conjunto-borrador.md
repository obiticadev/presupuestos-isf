# Conjunto en el borrador: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buscador propio de artículos y conjuntos; conjunto del borrador en árbol con todos sus elementos; medida fija modificable solo en el borrador; cambio de conjunto sin borrarlo.

**Architecture:** La medida modificada vive en `params` de `KitInstance` como `k_<slot>` y la lee `expandKit`, así que no hay migración. «Cambiar conjunto» es una función de servicio nueva en `kit-instances.ts` que reutiliza `clean()` y `regenerate()`. La interfaz es un componente cliente `Combobox` y un componente cliente `FixedMeasure`, dentro del árbol que pinta `KitBlock` (servidor).

**Tech Stack:** Next.js 16, React 19, Prisma 7, Vitest, Zod 4.

**Spec:** `docs/superpowers/specs/2026-11-24-conjunto-borrador-design.md`. Maqueta de referencia visual: `docs/diseno/maquetas/conjunto-borrador.html` (copiar de ella la geometría de las líneas, los anchos y los colores).

## Global Constraints

- Rama `features`; commit y push al cerrar cada tarea; versión +1 parche por tarea, desde 1.9.9: 1.9.10, 1.9.11…
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`. No se borran pruebas existentes.
- Toda escritura de un borrador, por `withDraft()`. Importes con `Prisma.Decimal` y `parseDecimalEs`, nunca float.
- Formularios con `ActionForm`; textos de interfaz en español; código en inglés.
- Archivos CRLF: `AGENTS.md` y `progreso.md` (editar con `newline=''`).

## Review Focus

- Medida `"1,5"` escrita con coma española, y `"0"`: se aceptan; con 0 el material sale fuera, sin error. Test en la tarea 1.
- Medida vacía tras «Volver al original»: no debe quedar `k_<slot>: ""` guardado. Test en la tarea 1 (`clean`).
- Cambiar a un conjunto cuyo material de la misma categoría está en otra posición (`c2` frente a `c1`): la elección se conserva. Test en la tarea 2.
- Buscador: escribir texto que no coincide y salir del campo; no debe guardarse nada ni quedar el texto huérfano. Comprobación en Chrome, tarea 4.
- Conjunto antiguo con dato suelto («Distancia al cuadro»): el árbol lo muestra y se guarda. Comprobación en Chrome, tarea 4, con «Instalación de bomba».

---

### Task 1: Medida fija modificada en el cálculo

**Files:**
- Modify: `src/modules/kits/formulas.ts` (`expandKit`)
- Modify: `src/modules/quotes/kit-instances.ts` (`clean`)
- Test: `tests/kits/formulas.test.ts`, `tests/quotes/kit-instances.test.ts`

**Interfaces:**
- Produces: `overrideKey(slot: string): string` → `` `k_${slot}` ``, exportada desde `src/modules/kits/formulas.ts`; `clean()` conserva `k_<slot>` no vacíos de materiales `FIXED` o `PER_QTY`.

- [ ] **Step 1: Tests que fallan** en `tests/kits/formulas.test.ts`:
  - `"una medida modificada (k_<slot>) sustituye a k en FIXED y PER_QTY"`: con el `def` del test «FIXED no depende de N» y `params: { k_c1: "1,5", k_c2: "3" }` y N = 5 → cantidades `[["cuadro","5"],["manguera","1.5"],["bomba","15"]]` (con `toFixed()` sin decimales fijos o comparando `toString()`).
  - `"una medida modificada no numérica deja el conjunto incompleto"`: `k_c1: "abc"` → `missing` contiene `"Fija: medida no válida"` y `lines` vacío.
  - `"medida modificada 0 deja fuera el material sin error"`: `k_c1: "0"` → sin `missing`; no hay línea `c1`.
  - `"k_<slot> se ignora en materiales con cantidad escrita"`: `BOMBA_DEF` con `k_c1: "9"` → igual que sin él (20 m).
- [ ] **Step 2:** `pnpm exec vitest run tests/kits/formulas.test.ts` → los 4 fallan.
- [ ] **Step 3:** En `expandKit`, para `FIXED`/`PER_QTY`, `k = num(input.params[overrideKey(slot)])` si la clave existe y no está vacía. Si `num` da null o un negativo → `missing.push(\`${c.label}: medida no válida\`)` y `continue`.
- [ ] **Step 4: Test que falla** en `tests/quotes/kit-instances.test.ts`: `"modificar y restaurar la medida fija recalcula; una vacía no se guarda"`.
  - Montar un conjunto con un material `FIXED` (crear la plantilla con `saveKit(admin, …)`: principal `concept-ser-prog` fijo, material `concept-ser-despl` `FIXED` k `"1.5"`). Añadirlo con N = 2. Total = 2 × 50 + 1,5 × 0,30 = 100,45.
  - `updateKitInstance` con `params: { k_c1: "10" }` → 103,00.
  - `updateKitInstance` con `params: { k_c1: "" }` → 100,45 y `instance.params` sin `k_c1`.
- [ ] **Step 5:** En `clean()`, conservar también las claves `overrideKey(c.slot)` de los materiales `FIXED`/`PER_QTY` con valor recortado no vacío.
- [ ] **Step 6:** Pruebas completas en verde. Versión 1.9.10. Commit `feat(conjuntos): medida fija modificada solo en el borrador; 1.9.10` y push.

### Task 2: Cambiar conjunto

**Files:**
- Modify: `src/modules/quotes/kit-instances.ts`, `src/modules/quotes/actions.ts`
- Test: `tests/quotes/kit-instances.test.ts`

**Interfaces:**
- Consumes: `overrideKey` (tarea 1), `clean`, `regenerate`.
- Produces: `changeKitInstance(actor: CurrentUser, instanceId: string, templateId: string): Promise<void>` y `changeKitAction: Action`, que lee `id` y `templateId` del formulario.

- [ ] **Step 1: Tests que fallan**:
  - `"cambiar de conjunto conserva cantidad, comentario y elecciones compatibles"`. Plantilla B con el principal de categoría `cat-bombas`, igual que `kit-bomba`, y su material de categoría `cat-mangueras` en la posición `c2`, precedido de un `c1` fijo `concept-ser-despl` `FIXED` 1. Partiendo de `bombas` con comentario: tras el cambio, `name` = nombre de B, `quantity` 2, comentario intacto, `choices` = `{ main: "concept-bom-mayor75", c2: "concept-man-4x25" }`. El historial tiene un registro con `"Conjunto cambiado: Instalación de bomba → <B>"`.
  - `"no se cambia a un conjunto desactivado ni en un presupuesto emitido"`: con `setKitActive(admin, B, false)` lanza `ValidationError`. En un emitido, el error de `withDraft`.
- [ ] **Step 2:** Ejecutar y ver que fallan (`changeKitInstance` no existe).
- [ ] **Step 3:** Implementar `changeKitInstance`:
  - Plantilla activa o `ValidationError({ templateId: "Elige un conjunto activo" })`.
  - Emparejar referencias:
    - igualdad de `refCategoryId`/`refConceptId`;
    - principal con principal;
    - cada material nuevo con el primer material viejo libre de la misma referencia.
  - Copiar `choices[old]` → `choices[new]`, `q_old` → `q_new` (si ambos piden cantidad) y `k_old` → `k_new` (si `formula.type` coincide); los parámetros con la misma clave pasan tal cual.
  - Actualizar la instancia (`templateId`, `name`, `definition`, `params` y `choices` vía `clean`).
  - Llamar a `regenerate` y a `logQuote(..., "update", \`Conjunto cambiado: ${old} → ${new}\`)`.
- [ ] **Step 4:** Acción `changeKitAction` junto a `updateKitAction`.
- [ ] **Step 5:** Pruebas en verde. Versión 1.9.11. Commit `feat(conjuntos): cambiar el conjunto de un borrador sin quitarlo; 1.9.11` y push.

### Task 3: Buscador `Combobox` y uso en el editor de conjuntos

**Files:**
- Create: `src/components/combobox.tsx`
- Modify: `src/app/(app)/conjuntos/forms.tsx` (`RefPicker`, quitar `datalist`), `src/app/(app)/conjuntos/[id]/page.tsx` (pasar `categoryId`), `src/app/globals.css` (`.cb`)
- Test: `tests/lib/combobox.test.ts` (filtro puro)

**Interfaces:**
- Produces:
  - `type ComboItem = { id: string; code: string; description: string; extra?: string }`.
  - `matchItems(items: ComboItem[], q: string): ComboItem[]`: sin mayúsculas ni tildes, sobre `code`, `description` y `extra`.
  - `<Combobox items value onPick name? placeholder? submit? invalid? label? />`, donde `onPick?: (id: string) => void`. Con `name` pinta `<input type="hidden" name={name}>`. Con `submit`, tras elegir o borrar envía el formulario (`requestSubmit` en el siguiente frame).
- [ ] **Step 1: Test** `matchItems`: «MANGUERA», «bOmBa», «servicios» (en `extra`) y «programacion» frente a «Programación» encuentran; «xyz» da `[]`.
- [ ] **Step 2:** Implementar `matchItems` y el componente siguiendo la maqueta A2:
  - lista absoluta con «N de M»;
  - `<mark>` sobre la coincidencia (plegado letra a letra para no descuadrar con tildes);
  - ↑ ↓ Enter Esc; **Tab con la lista abierta elige la opción resaltada y deja pasar el foco al siguiente campo**;
  - ✕ solo con texto, que vacía, mantiene el foco y abre la lista;
  - al salir sin elegir, vuelve al texto del valor actual.
  - Accesibilidad: `role="combobox"`, `aria-expanded`, `aria-controls`, `role="listbox"`/`option`, `aria-activedescendant`.
- [ ] **Step 3:** `RefPicker` en modo artículo usa `Combobox` con `extra` = nombre de la categoría. Se mantienen el aviso «Elige un artículo de la lista» y la regla del código exacto al salir.
- [ ] **Step 4:** Chrome: `/conjuntos/nuevo`, «Siempre el mismo». Buscar «servicios» → 2 resultados. ✕ → lista completa con el foco. Guardar un conjunto.
- [ ] **Step 5:** Pruebas y lint en verde. Versión 1.9.12. Commit `feat(conjuntos): buscador de artículos propio; 1.9.12` y push.

### Task 4: Árbol del conjunto en el borrador

**Files:**
- Modify: `src/app/(app)/presupuestos/[id]/sections.tsx` (`KitBlock`), `src/app/globals.css` (`.ktree` y compañía, copiados de la maqueta con `@container`)
- Create: `src/app/(app)/presupuestos/[id]/kit-fields.tsx` (cliente: `FixedMeasure`, `KitSwap`)

**Interfaces:**
- Consumes:
  - `Combobox` (tarea 3);
  - `overrideKey` (tarea 1);
  - `changeKitAction` (tarea 2);
  - `updateKitAction` y su guardado automático (`SubmitOnBlur`).
- Produces:
  - `FixedMeasure({ name, value, original, unit }: { name: string; value: string; original: string; unit: string })`: campo gris de solo lectura con ✎. Si difiere del original, va en ámbar, con aviso y «Volver al original», que vacía y envía.
  - `KitSwap({ kitId, kits }: { kitId: string; kits: { id: string; name: string; description: string }[] })`.
- [ ] **Step 1:** Sustituir la rejilla `.kitform` del panel por el árbol `.ktree`:
  - Principal: medida = `quantity`.
  - Por material: etiqueta con `codePrefix`/`categoryPrefix`, en verde si se elige al presupuestar; artículo en gris (`.ro`) o `Combobox` con `name="choice.<slot>"` y `submit`; medida:
    - `q_<slot>` editable si `askedOf`;
    - `FixedMeasure` con `name="param.k_<slot>"` si es `FIXED`/`PER_QTY`;
    - unidad y forma con el texto de `materialSummary` del editor.
  - Datos sueltos: fila propia.
  - Las etiquetas y la vertical siguen la geometría medida en la maqueta: eje a 25 px, codo `top:24px`, vertical del principal desde `top:35px` y último material con `height:25px`.
- [ ] **Step 2:** `KitSwap` en `.kitfoot`: «Cambiar conjunto» abre `Combobox` de conjuntos activos distintos del actual, más «Cambiar» y ✕, con un `ActionForm` sobre `changeKitAction`.
- [ ] **Step 3:** Chrome en borrador, con BOM-MAN, SER-SER-BOM y la antigua «Instalación de bomba»:
  - elegir con el buscador → círculo negro;
  - ✎ en Desplazamiento a 3 → aviso y total recalculado; «Volver al original» → 1,5;
  - cambiar SER-SER-BOM → SER-SER conserva la cantidad;
  - a 1440, 820 y 390 px (iframe en `/api/health`, regla de `AGENTS.md`), medir con JS el desvío de los codos (≤ 1 px).
- [ ] **Step 4:** Pruebas, `tsc` y lint en verde. Versión 1.9.13. Actualizar `progreso.md` y `AGENTS.md` (estado de `features`). Commit `feat(conjuntos): árbol del conjunto en el borrador con medidas fijas y cambio de conjunto; 1.9.13` y push.

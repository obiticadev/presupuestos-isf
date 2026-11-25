# Conjuntos dinámicos (PLC, tarjetas y periferia descentralizada)

Diseño acordado con el usuario el 2026-11-25 sobre la maqueta `docs/diseno/maquetas/conjuntos-dinamicos.html`, tras cuatro versiones: idea C → v2 → v3 → v4. La maqueta es la **v4**. Rama `mejoras-uso-real`, que se despliega en `:3101`.

**Estado: diseño cerrado salvo las tres decisiones de «Pendiente de decidir».** El siguiente paso es resolverlas con el usuario y escribir el plan con `superpowers:writing-plans`. Hasta entonces no se escribe código.

## Por qué

ISF presupuesta instalaciones con autómatas. Un PLC lleva su CPU, sus tarjetas locales y muchas veces una periferia descentralizada con sus propios slots. Cada proyecto lleva un número y una mezcla distintos de tipos de slot: entradas digitales, salidas digitales, analógicas, safety… Además, dentro de cada tipo se elige una variante concreta (DI 8, DI 16, DI 16 HF…). Un proyecto puede tener tres tipos de entrada y un solo tipo de salida; otro, ninguna analógica.

Los conjuntos de hoy no lo resuelven. Cada material es **un** hueco fijo: «siempre el mismo artículo» o «se elige de una categoría al presupuestar». El presupuesto no puede **añadir huecos** que el conjunto no tenía. Las cantidades ya se gestionaban bien; el problema es la variedad de tipos y su número.

## Conceptos

- **Conjunto dinámico:** una pieza reutilizable con un principal (ver P1), materiales fijos y **tipos de slot**. Ejemplos: el rack local de un S7-1500 con sus tarjetas, una periferia ET 200SP, los módulos de ampliación de un S7-1200. Se usa de dos maneras:
  - **dentro** de un conjunto normal: el PLC lleva sus tarjetas locales y su periferia;
  - **suelto** en cualquier partida, como cualquier conjunto: la periferia de otro armario.
- **Tipo de slot:** nombre («Entradas digitales»), abreviatura («ED»), color (normal o **rojo**, a elección del usuario) y **variantes** (los artículos del catálogo que se pueden elegir).
- **Slot:** una fila del borrador con un tipo, una variante elegida y una cantidad. **Un slot es solo ese artículo.** No arrastra accesorios: el usuario rechazó expresamente que se añadieran solos (la base unit BU15 de la v1).
- **Conjunto normal con dinámicos:** un conjunto de los de hoy con uno o varios conjuntos dinámicos como elementos. Cada uno puede ser obligatorio u opcional, y fijo o a elegir (ver P3).

## Decisiones del usuario (2026-11-25)

1. Se descartaron la idea A (un material «repetible») y la B (subconjuntos con una sola zona). **Se eligió la C** y después se ajustó:
   - El PLC lleva como mucho **una** periferia descentralizada.
   - Si hay más periferias en otros armarios, van en **otras partidas o subpartidas** como conjunto propio, sin relación con el PLC. Por eso un dinámico tiene que poder usarse suelto.
   - Los conjuntos dinámicos **se reutilizan para otros casos**, como las tarjetas del propio PLC. Un conjunto puede llevar varios: el PLC con sus tarjetas locales (un dinámico) y además su periferia (otro dinámico).
2. En la periferia se añaden slots de **cualquier número de tipos** (más de dos, por ejemplo safety). Dentro de cada tipo, la variante se elige en el borrador.
3. **Cada tipo de slot se puede marcar en rojo o no**, a elección del usuario, sin depender del nombre. El rojo se ve en el borrador y en las listas, no en el PDF.
4. **Dos pestañas dentro de Conjuntos:** «Conjuntos» y «Conjuntos dinámicos».
5. **PDF: variante A1.** Cada conjunto dinámico es un bloque con título en mayúsculas verdes, un filete que lo prolonga y un filete vertical verde a la izquierda de sus líneas. Cada slot es una línea normal con la descripción del catálogo, sin tipo delante.
6. **El recuento de slots suma las unidades:** 3 + 1 + 2 + 1 = «7 slots», no «4».
7. Los buscadores (de variantes en el editor y de cada slot en el borrador) son **el mismo `Combobox` de la app** (`src/components/combobox.tsx`):
   - filtra mientras se escribe y resalta la coincidencia;
   - Tab coge la opción resaltada;
   - la ✕ vacía el campo;
   - la lista se aparta o se abre hacia arriba para caber en la ventana.

## Qué se construye

### 1. Lista de Conjuntos (`/conjuntos`)

- Pestañas «Conjuntos (n)» y «Conjuntos dinámicos (n)» bajo la cabecera. El botón principal cambia entre «Nuevo conjunto» y «Nuevo conjunto dinámico» según la pestaña.
- En «Conjuntos», una columna nueva «Conjuntos dinámicos». Muestra un chip por dinámico con su símbolo y su nombre; el borde es discontinuo si es opcional, y si se elige en el borrador pone «se elige: A / B».
- En «Conjuntos dinámicos», las columnas son:
  - Conjunto dinámico;
  - Principal → materiales fijos;
  - Tipos de slot: las abreviaturas en cajitas, en rojo las marcadas;
  - Lo usan: los conjuntos que lo contienen, y «suelto en presupuestos» si se usa así;
  - Estado.
- Desactivar y borrar siguen las reglas de hoy. No se borra un dinámico que use algún conjunto o presupuesto.

### 2. Editor de conjunto dinámico

- Es el editor de conjuntos de hoy (principal, materiales con su fórmula, panel lateral), con «+ Añadir material fijo».
- Debajo, un bloque nuevo: **«Slots · tipos que se pueden añadir»**. Tiene una fila por tipo (abreviatura en cajita, nombre y resumen de variantes) y «+ Añadir tipo de slot». Al elegir un tipo se abre su panel lateral con:
  - Nombre y Abreviatura.
  - Color: segmentado «Normal / Rojo».
  - Variantes: segmentado «Toda una categoría / Elegidas» (ver P2).
    - Con «Elegidas»: lista de artículos, cada uno con su ✕, y debajo el buscador «Añadir variante: código, descripción o categoría». Busca en el catálogo, no ofrece los artículos ya añadidos y Tab o Intro añade el resaltado.
    - Con «Toda una categoría»: un artículo nuevo de la categoría aparece solo como variante.
  - «Quitar tipo».
- El símbolo del dinámico es su principal más un círculo por cada material fijo y una marca de slots, que en la maqueta es un cuadrado discontinuo. Ver «Matices visuales».

### 3. Editor de conjunto normal con dinámicos

- Junto a «+ Añadir material» aparece **«+ Añadir conjunto dinámico»**. Cada dinámico es una fila más del árbol, con prefijo verde relleno. Su panel lateral tiene:
  - **Cuál:** segmentado «Se elige al presupuestar / Siempre el mismo», más el buscador de conjuntos dinámicos (ver P3).
  - **Nombre:** «Periferia descentralizada», «Tarjetas locales»…
  - **Opcional:** casilla. Marcada, el borrador muestra «+ Añadir …» y sin él el conjunto está completo.
  - **En el nombre:** casilla, como los materiales de hoy.
  - «Quitar».
- En el símbolo del conjunto, cada dinámico es un **cuadrado verde relleno** tras los círculos de los materiales: `PL─○─○─■─■`.

### 4. Borrador: árbol del conjunto

Es el árbol B1 de hoy (`docs/superpowers/specs/2026-11-24-conjunto-borrador-design.md`, clases `.kq-*`), con un nivel más:

- **Nivel 1:**
  - los materiales de hoy;
  - **cada dinámico**: fila sombreada `--tint` con prefijo verde relleno, el principal del dinámico en solo lectura, cantidad 1 en solo lectura, **«N slots»** (suma de las cantidades de sus slots) y, si es opcional, una ✕ para quitarlo.
- **Nivel 2, bajo cada dinámico:**
  - sus materiales fijos en solo lectura, como los fijos de hoy;
  - sus slots: tipo en cajita (roja si el tipo es rojo), nombre del tipo, buscador limitado a **las variantes de ese tipo**, cantidad editable y ✕. Los slots se ordenan por el orden de los tipos en el dinámico, y uno nuevo va tras el último de su tipo;
  - una última rama **«Añadir slot»** con un botón por tipo (`+ Entradas digitales`, `+ Safety` en rojo…). Al pulsarlo se crea el slot y el foco queda en su buscador.
- Las líneas del árbol (verticales y codos) se dibujan igual en todos los niveles: borde de 1,5 px en tinta. La vertical del nivel 1 sigue sin cortes de un dinámico al siguiente (ver «Matices visuales»). El texto «Añadir slot» queda **a la altura del codo horizontal**, como el resto de ramas, y los botones empiezan en esa misma altura.
- **Dinámico opcional quitado:** su rama se sustituye por «+ Añadir periferia descentralizada» (el texto sale del nombre del elemento) y desaparece su ■ del símbolo.
- Resumen de la cabecera del conjunto: «1 × CPU 1513-1 PN · 6 tarjetas locales · periferia con 7 slots». La redacción exacta la decide quien implemente.
- **Conjunto cerrado** (vista de líneas): las líneas propias primero y después, por cada dinámico, una fila de título (prefijo verde y nombre) seguida de sus líneas con el filete verde a la izquierda. Cada línea conserva su «Ver» y su comentario, como hoy.
- **Dinámico suelto** en una partida: se comporta como un conjunto más. Su árbol tiene en el nivel 1 sus materiales fijos y sus slots, y abajo «Añadir slot».

### 5. PDF (A1)

- Las líneas propias del conjunto, como hoy.
- Por cada dinámico con líneas visibles:
  - una fila de título: celda de denominación con el nombre en mayúsculas verdes (`--green`, 10,5 pt, tracking .08em) y un filete verde de 0,75 pt hasta el borde;
  - debajo, sus líneas con sangría extra y un filete vertical verde de 1,25 pt a la izquierda.
- Sin tipo de slot ni color en el PDF.
- Plantilla: `src/pdf/templates/v1`. `PdfRow` necesita un tipo nuevo, o una marca de grupo, para el título y las líneas agrupadas.

## Restricciones (de `AGENTS.md`)

- Importes con decimales exactos. Permisos en el servidor. Toda escritura de un borrador pasa por `withDraft()`. Lo emitido no se modifica.
- **Cambiar un conjunto o un dinámico no altera los presupuestos que ya lo usan.** La instancia guarda una copia de la definición, igual que hoy `KitInstance.definition`, y esa copia incluye la de los dinámicos que contiene.
- Formularios con `ActionForm`. No se borran pruebas existentes. Cada tarea sube el parche de la versión: hoy es 1.9.15, la primera tarea será 1.9.16 salvo que se decida abrir 1.10.0.
- Revisión de interfaz con Claude in Chrome en local (`pnpm dev`) y después en `:3101`. Fusionar en `master` y desplegar producción exige el visto bueno explícito del usuario.

## Cómo está hoy (para quien implemente)

- **Plantilla:** `KitTemplate.definition` (JSON validado por `kitDefinition` en `src/modules/kits/definition.ts`) = `main` (concepto o categoría) + `params` + `components[]`. Cada componente es un `slot` `cN` con `ref` y fórmula `FIXED | PER_QTY | PER_QTY_AND_PARAM | PARAM`.
- **Instancia:** `KitInstance` con `definition` (copia), `quantity`, `params`, `choices` (slot → concepto elegido) y `missing`. Las líneas son `QuoteLine` con `kitInstanceId` y `kitSlot`.
- **Cálculo:** `expandKit` (`src/modules/kits/formulas.ts`) es puro, y `src/modules/quotes/kit-instances.ts` (`addKitInstance`, `updateKitInstance`, `changeKitInstance`, `removeKitInstance`) rehace las líneas.
- **Editor:** `src/app/(app)/conjuntos/forms.tsx`.
- **Borrador:** `src/app/(app)/presupuestos/[id]/sections.tsx`, componente del conjunto con `.kq-tree`.
- **Símbolo:** `.mini` en `globals.css` (`Silhouette`).

## Enfoques considerados

- **A · Material repetible.** Un material marcado «repetible» admite N filas en el borrador. Es el cambio más pequeño, pero no permite varios tipos con identidad propia ni reutilizar la periferia. Descartado.
- **B · Subconjuntos con una zona.** Una sola zona de slots por PLC. Descartado: no cubre las tarjetas locales más la periferia.
- **C · Conjuntos dinámicos reutilizables (elegido).** Una pieza con tipos de slot que se mete en conjuntos normales o va suelta.

## Propuesta de modelo (la cierra el plan)

Es una propuesta: el plan la concreta.

- `KitTemplate` distingue normal y dinámico, con una columna `kind` o una marca en `definition`. Se necesita una migración: hoy no hay ninguna pendiente en producción.
- **Definición de un dinámico:** `main` opcional (ver P1), los `components` de hoy (materiales fijos) y `slotTypes: [{ key, label, abbr, red, variants: { conceptIds: string[] } | { categoryId } }]`.
- **Definición de un normal:** los `components` admiten una clase nueva `{ slot, label, kit: { templateId } | { templateIds: string[] }, optional, inName }`, con una copia de la definición del dinámico al crear la instancia.
- **Estado en la instancia:**
  - qué dinámicos están puestos y cuál se eligió;
  - los slots, como lista ordenada `{ id, group, type, conceptId | null, quantity }`. Pueden vivir en `choices`/`params` o en un campo JSON nuevo de `KitInstance`.
- **Líneas:** una `QuoteLine` por slot y por material fijo del dinámico. `kitSlot` lleva el grupo (por ejemplo `c3/s:<id>`, `c3/c1`) para que el borrador cerrado y el PDF agrupen y titulen.
- **Incompleto:** un slot sin variante («Falta elegir la variante en Entradas digitales») o un dinámico obligatorio que falta. Uno opcional que no está no cuenta. Un dinámico sin slots es válido, salvo que se decida un mínimo (no pedido).
- **Cantidades:** el dinámico cuenta como 1, y sus materiales fijos aplican sus fórmulas sobre esa unidad. Los slots llevan cantidad absoluta, no multiplicada por el principal. Si se quiere otra cosa, lo concreta el plan.

## Pendiente de decidir (preguntar antes del plan)

- **P1. ¿Un conjunto dinámico puede no tener principal?** Por ejemplo, los módulos de ampliación del S7-1200 serían solo slots. Propuesta: **sí, opcional** solo en los dinámicos.
- **P2. ¿Cómo se definen las variantes de un tipo de slot?** Opciones: toda una categoría del catálogo, artículos elegidos a mano o las dos (lo que muestra la maqueta). Propuesta: **las dos**.
- **P3. ¿El dinámico de un conjunto es fijo o se elige en el borrador?** La maqueta enseña las dos opciones en el panel, igual que los materiales de hoy. Propuesta: **las dos**; con «se elige», el borrador muestra un buscador de dinámicos en la fila del dinámico.

## Fuera de alcance

- Accesorios automáticos por slot (base units, conectores frontales…).
- Contar slots por señales («40 entradas → 3 tarjetas»): se cuentan tarjetas.
- Varios niveles de anidado (un dinámico dentro de otro dinámico).
- Enlazar una periferia de otra partida con su PLC.

## Matices visuales anotados en la v4 (corregir al implementar)

- Entre un dinámico y el siguiente, la vertical del nivel 1 se pintó con un degradado de fondo y se ve con un sombreado raro. En la app debe ser el mismo borde de 1,5 px que el resto de líneas del árbol.
- En «La periferia de otro armario, suelta en su partida», el símbolo del dinámico suelto (`IM─○─□`) no sigue la convención de cuadrados de los demás. Los símbolos deben ser coherentes en todas partes:
  - un dinámico se representa igual (■) dentro de un conjunto;
  - suelto, muestra su principal, sus materiales (○) y su marca de slots con el mismo lenguaje de cuadrados.

  La forma exacta la propone quien implemente, enseñándola en Chrome.

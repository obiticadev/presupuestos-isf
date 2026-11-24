# Conjuntos: nueva forma de crearlos (diseño)

Fecha: 2026-11-24 · Rama: `features` (creada desde `master` en `1930e79`). **`master` y producción no se tocan.**

Maquetas aprobadas: `docs/diseno/maquetas/conjuntos-interfaz.html`, **interfaz 1**. Nombre: `docs/diseno/maquetas/conjuntos-nombre.html`, **opción D**. Las demás maquetas `conjuntos*.html` son el recorrido hasta llegar ahí y solo sirven de contexto.

## 1. Intención y por qué

La pestaña **Conjuntos** sirve para agrupar materiales del catálogo que dependen de un **material principal**. Al presupuestar, se elige el principal (por ejemplo, una bomba), se indica su cantidad y la app pide y calcula el resto.

La lógica funciona, pero la pantalla de crear conjuntos parece pensada solo para «bomba + distancia + manguera». Tiene fórmulas con «k», «k × N × dato», un «dato» llamado «Distancia al cuadro» y textos con ejemplos de bombas. El usuario quiere una pantalla **genérica e intuitiva**, que sirva para cualquier conjunto y que se entienda sin explicaciones.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos**
- Rehacer la pantalla de crear y editar un conjunto con la interfaz 1: árbol con panel a la derecha.
- Hacer que cada material dependiente se exprese con **cantidad**, el interruptor **«× cantidad del principal»**, **«La cantidad se pone al presupuestar»** y **«Obligatorio»**.
- Generar el **nombre automáticamente** (opción D) y escribir la **descripción a mano**.
- Mostrar en la lista de la pestaña qué lleva cada conjunto.
- Que ningún texto de la pantalla nombre un tipo concreto de conjunto (bombas, mangueras…).

**No objetivos**
- **El editor de presupuestos no cambia.** La forma de añadir, completar y recalcular un conjunto en un borrador se queda como está. Solo hay dos retoques mínimos: las letras del símbolo y lo que muestra el desplegable (ver 5.6).
- No hay dependencias en varios niveles: todo material cuelga directamente del principal (decisión del usuario).
- No se crea la función de duplicar conjuntos.
- No se cambian los permisos: crear y editar conjuntos sigue abierto a cualquier usuario identificado, como hoy.

**Antiobjetivos (si pasa esto, ha fallado aunque funcione)**
- Que los presupuestos existentes (borradores, emitidos o revisiones) cambien de importe, de líneas o de aspecto.
- Que la pantalla vuelva a mostrar fórmulas o letras como «k» o «N».
- Que haga falta migrar datos a mano en producción o que se rompa un conjunto guardado con el formato antiguo.

## 3. Restricciones

- Se trabaja solo en la rama `features`. No se fusiona en `master` ni se despliega sin el visto bueno explícito del usuario. El entorno de pruebas `:3101` sigue apuntando a `mejoras-uso-real`, así que la revisión se hace en local con Claude in Chrome. Cambiar a qué rama apunta pruebas es otra decisión del usuario.
- Se siguen las reglas de `AGENTS.md`:
  - código en inglés e interfaz en español;
  - decimales exactos;
  - permisos en el servidor;
  - `ActionForm` en los formularios;
  - no se borran pruebas existentes, solo se añaden;
  - la versión de `package.json` sube en cada tarea;
  - CRLF en `AGENTS.md` y `progreso.md`.
- Cada presupuesto guarda una copia de la definición del conjunto (`KitInstance.definition`). El formato JSON de `KitTemplate.definition` debe seguir siendo legible por `kitDefinition` y por `expandKit` para todo lo ya guardado.
- Datos reales en producción (2026-11-24): 2 conjuntos y 5 instancias en presupuestos.
  - «Instalación de bomba»: principal de la categoría `cat-bombas`. Dato obligatorio «Distancia al cuadro». Componente Manguera de `cat-mangueras` con `PER_QTY_AND_PARAM(distancia, k=1)`.
  - «Equipo de medida»: principal fijo, un concepto. Dato «Distancia al cuadro eléctrico» que ninguna fórmula usa. Componente Manguera de `cat-mangueras` con `PER_QTY(k=1)`.

## 4. Enfoques considerados

| Enfoque | A favor | En contra | Decisión |
|---|---|---|---|
| **A. Mantener el formato JSON de `kitDefinition` y traducir la pantalla nueva a sus fórmulas, añadiendo solo una fórmula** | No hay tablas nuevas ni migración. Lo guardado sigue valiendo. El editor de presupuestos ya sabe pedir «datos» | La pantalla tiene que traducir en los dos sentidos (formulario ↔ definición) | **Elegido** |
| B. Modelo nuevo en tablas (conjunto, material, regla) | Más «limpio» sobre el papel | Hay que migrar plantillas e instancias y reescribir el cálculo y el editor de presupuestos, que el usuario no quiere tocar | Descartado |
| C. Dependencias en varios niveles (árbol real) | Permite «bomba → manguera → abrazaderas» | El usuario lo descartó: todo cuelga del principal | Descartado |

## 5. Diseño (lo decidido)

### 5.1 Pantalla de crear y editar (`/conjuntos/nuevo` y `/conjuntos/[id]`), interfaz 1

De arriba abajo:

1. **Miga** «Conjuntos / {nombre}».
2. **Nombre automático**, grande, con sus 2 primeras letras subrayadas, y a su lado el **símbolo** en pequeño: el mismo `.mini` del editor de presupuestos, un cuadrado con 2 letras y un círculo por material. Debajo, la nota «Nombre automático: prefijo del principal + los materiales marcados “en el nombre”. Las 2 letras subrayadas van en el símbolo».
3. **Aviso de nombre repetido** (ver 5.3), solo si hace falta.
4. **Descripción** (a mano), `textarea`, opcional, de 2000 caracteres como máximo, igual que hoy.
5. Dos columnas: a la izquierda el árbol y a la derecha el panel de edición del material seleccionado, que queda fijo al hacer scroll.
   - **Principal**, en un recuadro verde:
     - un selector de dos botones: «Se elige al presupuestar» o «Siempre el mismo»;
     - con el primero, el desplegable **De la categoría** (categorías activas, más la actual aunque esté desactivada);
     - con el segundo, el **Artículo del catálogo** (buscador, ver 5.5);
     - a la derecha, el campo fijo «Cantidad: Se pide al presupuestar», solo informativo.
   - **Árbol**: una línea vertical y una rama por material. Cada rama muestra:
     - una etiqueta con su prefijo, verde si entra en el nombre y gris si no;
     - el nombre (el de la categoría si se elige al presupuestar, o la descripción del artículo);
     - una línea pequeña: «se elige de «X» al presupuestar» o el código y la descripción, más «· opcional» si no es obligatorio;
     - a la derecha, el resumen en palabras: «1 ud × principal», «1 ud en total», «cantidad al presupuestar × principal» o «cantidad al presupuestar en total».
     - Al final, el botón discontinuo **«+ Añadir material»**: añade una rama nueva sin artículo elegido y la selecciona.
   - **Panel del material seleccionado**:
     - el mismo selector de dos botones con su desplegable o buscador;
     - **Cantidad** (decimal en español, mayor que 0) con la unidad al lado: la del artículo si es fijo, o en blanco si es de categoría. Se desactiva si la cantidad se pone al presupuestar;
     - **«Se pone al presupuestar»** (casilla);
     - **«× cantidad del principal»** (interruptor) con una ayuda de una línea: «Si el principal lleva 2, esto se multiplica por 2» o «Va una sola vez, lleve el principal lo que lleve»;
     - **«Obligatorio»** (casilla);
     - **«En el nombre (PREFIJO)»** (casilla);
     - el botón **«Quitar material»**.
6. **Guardar** y la nota «Cambiar el conjunto no altera los presupuestos donde ya se usó».
7. Si el conjunto ya existe: el botón Desactivar o Reactivar (`KitActiveToggle`) y los avisos de `kitIssues`, como hoy.

La pantalla no tiene «prueba» ni vista previa del presupuesto: el usuario la descartó.

Todo va alineado en una rejilla de columnas fijas. La unidad tiene un ancho fijo para que «ud» y «h» no muevan nada (exigencia explícita del usuario).

### 5.2 Traducción entre el formulario y la definición

Cada material del formulario tiene: `ref` (categoría o concepto), `qty`, `mult`, `ask`, `required` e `inName`. Al guardar se traduce así:

| `ask` | `mult` | Fórmula guardada |
|---|---|---|
| no | sí | `PER_QTY(k = qty)` |
| no | no | `FIXED(k = qty)` |
| sí | sí | `PER_QTY_AND_PARAM(param = q_<slot>, k = 1)` |
| sí | no | **nueva** `PARAM(param = q_<slot>, k = 1)` → cantidad = k × dato |

- Cada material con `ask` genera su propio dato en `params`:
  - clave `q_<slot>` (por ejemplo `q_c1`);
  - etiqueta: el nombre del material (por ejemplo «Mangueras»);
  - unidad: la del artículo fijo, o vacía si es de categoría;
  - obligatorio si el material es obligatorio.
- El editor de presupuestos ya pinta un campo por dato, así que no necesita cambios para pedirlo.
- `params` se rehace entero al guardar: los datos que nadie usa desaparecen.
- `main.label` y `components[].label` se rellenan solos: nombre de la categoría o descripción del concepto. El editor de presupuestos los sigue usando («Bombas: cantidad (N)», «Falta elegir Mangueras»).
- `inName` se guarda en cada componente como campo opcional (`inName?: boolean`, por defecto `false`).
- `main.symbol` se guarda como campo opcional con 2 caracteres (ver 5.6).

**Al abrir una definición antigua** (traducción inversa):
- `FIXED` → `ask = no, mult = no`;
- `PER_QTY` → `ask = no, mult = sí`;
- `PER_QTY_AND_PARAM` → `ask = sí, mult = sí`;
- `PARAM` → `ask = sí, mult = no`.

En la traducción inversa de `PER_QTY_AND_PARAM` se pierde una `k` distinta de 1 y la posibilidad de que varios materiales compartan el mismo dato. En producción no hay ningún caso así: los dos conjuntos usan `k = 1` y un dato por material. Así que se acepta y, al guardar, se pasa al formato nuevo.

**Nueva fórmula `PARAM`.** Va en `kitDefinition` (unión discriminada), en `expandKit` y en `describeFormula`. Si el dato está vacío y el material es opcional, no se aplica (igual que `PER_QTY_AND_PARAM`). Si el material es obligatorio, el dato obligatorio ya hace que el conjunto quede incompleto.

### 5.3 Nombre automático (opción D)

**Prefijo de un elemento:**
- Si es una **categoría**, se toma su nombre sin tildes, en mayúsculas, quitando las palabras vacías (de, del, la, las, el, los, y, para, con, en, a).
  - Si queda una palabra: sus 3 primeras letras (Bombas → `BOM`, Mecanismos → `MEC`).
  - Si quedan varias: sus iniciales (Mano de obra → `MO`).
- Si es un **artículo fijo**, la parte de su código anterior al primer guion (`VAL-010` → `VAL`, `MO-002` → `MO`). Si el código no tiene guion, sus 3 primeros caracteres.
- Solo se admiten letras y números `[A-Z0-9]`; lo demás se quita.

**Nombre** = prefijo del principal + prefijos de los materiales marcados «en el nombre», en el orden del árbol, unidos por `-`: `BOM-MAN`, `BOM-MAN-CUA`. Al crear un material nuevo, se marca «en el nombre» solo si es el primero del conjunto.

**Nombres repetidos:**
- La pantalla recibe los nombres de los demás conjuntos (activos e inactivos) para calcular la vista previa.
- Si el nombre base ya existe, muestra en ámbar: «Ya existe un conjunto BOM-MAN. [Añadir VAL al nombre → BOM-MAN-VAL] o se guardará como **BOM-MAN-2**». El botón marca el siguiente material sin marcar. Si ya están todos marcados, no se muestra el botón.
- **El servidor decide el nombre final** al guardar: el nombre base si está libre, y si no `-2`, `-3`… (sin contar el propio conjunto al editarlo).
- El nombre se recalcula en cada guardado. Los presupuestos que ya lo usan conservan el nombre que tenían al insertarlo, porque `KitInstance.name` es una copia.

### 5.4 Lista de la pestaña (`/conjuntos`)

- Tabla con estas columnas:
  - **Conjunto**: el nombre como enlace, más la descripción en gris si hay;
  - **Principal → lo que lleva**: nombres de las categorías o descripciones de los artículos, por ejemplo «**Bombas** → Mangueras, Válvula antirretorno 1"»;
  - **Materiales**: número;
  - **Estado**: Activo, Desactivado o Incompleto, como hoy.
- El texto de introducción pasa a ser genérico: «Un conjunto agrupa los materiales que dependen de un material principal: al presupuestar se elige el principal y su cantidad, y la app añade y calcula el resto».

### 5.5 Elegir un artículo del catálogo (buscador)

- Campo de texto con sugerencias nativas (`<input list>` + `<datalist>`). Cada opción es «CÓDIGO · Descripción» y sale de los conceptos activos, más el actual aunque esté desactivado.
- Al elegir una opción, se resuelve su id. Si el texto escrito no coincide con ninguna opción, el campo se marca con el error «Elige un artículo de la lista».
- Solo se usa en esta pantalla.

### 5.6 Los dos retoques mínimos fuera de la pestaña

- **Símbolo:** `Silhouette` en `src/app/(app)/presupuestos/[id]/sections.tsx` usa `def.main.symbol ?? def.main.label`. Las instancias antiguas (sin `symbol`) se ven igual que hoy. Las nuevas muestran las 2 primeras letras del nombre automático. `symbol` se guarda con esas 2 letras.
- **Desplegable «Añadir conjunto»:** cada opción lleva `data-d={descripción}`, como los desplegables de conceptos. Cerrado muestra el nombre (`BOM-MAN`) y abierto el nombre más la descripción. Hay que pasar `description` en `ctx.kits` (`page.tsx`).

### 5.7 Conjuntos que ya existen (sin migración)

- No hay migración de datos. Los dos conjuntos de producción se abren con el formulario nuevo mediante la traducción inversa (5.2). Al guardarlos por primera vez reciben el nombre automático, y su nombre antiguo pasa a la descripción.
- **Regla:** si al abrir un conjunto su `name` no coincide con el nombre automático que le correspondería y su descripción está vacía, el formulario rellena la descripción con el nombre antiguo. El usuario puede cambiarla antes de guardar.
- Hasta que alguien los guarde, siguen con su nombre de siempre y funcionan igual en los presupuestos.
- La semilla (`kit-bomba`, «Instalación de bomba») no cambia: las pruebas existentes cuentan con ella.

## 6. Lo que se deja a quien construye

- La estructura interna de componentes React de la pantalla, siempre que el aspecto se ajuste a la maqueta `conjuntos-interfaz.html`, interfaz 1, y a los tokens de `globals.css`.
- Dónde van las funciones puras (prefijo, nombre y traducción formulario ↔ definición). Se propone `src/modules/kits/naming.ts` y `src/modules/kits/form.ts`, cubiertas con pruebas Vitest.
- Cómo pasa la acción el nombre al servicio. Para no romper las pruebas existentes, `saveKit` sigue aceptando `name`. La acción calcula el nombre con una función de servicio (`kitName(tx, def, excludeId)`) y se lo pasa.

## 7. Decisiones mías que el usuario puede revisar

- La unidad de un material de categoría se deja en blanco, porque los conceptos de una categoría pueden tener unidades distintas.
- Prefijos: palabras vacías e iniciales para los nombres de varias palabras, y la parte del código antes del guion para los artículos.
- Buscador con `datalist` nativo en lugar de un componente nuevo.
- En el desplegable «Añadir conjunto» se muestra la descripción junto al nombre.
- La versión pasa a **1.9.0** con este trabajo, y cada tarea del plan sube el parche (1.9.1, 1.9.2…).
- Commit por tarea en `features` y push a `origin/features`. `master` no se toca.

## 8. Verificación

- **Vitest:**
  - prefijo y nombre (tildes, palabras vacías, códigos sin guion);
  - repetidos (`-2`, `-3`, excluyendo el propio conjunto);
  - traducción formulario ↔ definición en los dos sentidos, incluidos los dos conjuntos reales de producción;
  - `expandKit` con `PARAM`;
  - `saveKit` con nombre automático;
  - las pruebas existentes siguen pasando sin tocarlas.
- **Claude in Chrome** en local:
  - crear un conjunto genérico (no de bombas) y otro con un nombre repetido;
  - editar «Instalación de bomba» de la semilla;
  - insertar el conjunto en un borrador y comprobar el símbolo, los campos pedidos y el importe;
  - comprobar que un presupuesto ya existente no cambia.

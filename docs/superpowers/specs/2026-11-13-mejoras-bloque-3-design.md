# Bloque 3 — catálogo, importaciones, historial de conceptos y permisos: diseño

Fecha: 2026-11-13. Rama: `mejoras-uso-real`. Amplía la sección «Bloque 3» de `2026-11-11-mejoras-uso-real-design.md` con lo decidido con el usuario el 2026-11-13. Plan: `docs/superpowers/plans/2026-11-13-mejoras-bloque-3-catalogo.md`.

> **Estado: decisiones confirmadas por el usuario el 2026-11-13** (conversación y maquetas). `master` y el servidor no se tocan; se trabaja en `mejoras-uso-real`, en local, con commit y push a esa rama.

Maquetas elegidas (servir el repositorio con `python -m http.server 8765` desde la raíz y abrir `http://127.0.0.1:8765/docs/diseno/maquetas/historial-concepto.html`):
- `docs/diseno/maquetas/historial-concepto.html`: carrusel con barra de tamaños (escritorio 1440, iPad 1024 con giro, móvil 390). **Elegida la C** (línea unifilar) en escritorio e iPad, y **la D** (paso a paso) en móvil. **E** es la revisión de la importación completa; **F**, la de un usuario no administrador.
- `historial-concepto-app.html` e `importacion-completa-app.html`: las pantallas que carga el carrusel, con los estilos reales (`src/app/globals.css`).

## Intención

El equipo usa el catálogo y las importaciones a diario. Hoy la importación marca como «Cambio» filas que no cambian, no puede dejar la base igual que el Excel, una revisión arrastra precios viejos y no hay forma de ver cómo era un concepto antes de un cambio. Además, solo el administrador puede tocar catálogo y conjuntos, y el usuario quiere que cualquier usuario los gestione.

## Objetivos

1. Importaciones que dicen la verdad: «Sin cambios» si nada cambia, y cada cambio con su campo y valores.
2. Importación completa (dejar la base igual que el Excel), solo para administradores, que nunca rompe lo usado.
3. Revisiones con los precios del catálogo al día.
4. Historial de cada concepto con la versión completa de cada momento y los cambios resaltados.
5. Cualquier usuario gestiona catálogo, conjuntos y clientes, e importa en modo «Añadir y actualizar».
6. Un conjunto que pierde una pieza avisa de que está incompleto.

## No objetivos

- «Restaurar esta versión» desde el historial (se copia a mano si hace falta).
- Historial con foto completa para clientes o conjuntos (solo conceptos).
- Reconstruir la versión completa de cambios anteriores a este bloque: solo guardaron una frase.
- Categorías, unidades, impuestos, conceptos obligatorios, configuración, usuarios e historial general: siguen siendo del administrador.
- Ficha a pantalla completa en móvil para otras pantallas que no sean el catálogo.

## Anti-objetivos (sería un fracaso aunque funcione)

- Que la importación completa borre algo usado en un borrador, un presupuesto o un conjunto.
- Que un Excel vacío o equivocado deje la base vacía con un clic.
- Que mirar una versión antigua permita guardarla por accidente.
- Que un presupuesto emitido cambie.

## Restricciones

- Las de `AGENTS.md`: código en inglés, interfaz en español, decimales exactos, permisos en el servidor, `withDraft()` para escribir borradores, `ActionForm`/`useActionState` como el resto.
- **Sin migración**: `AuditLog.data` (`Json?`) ya existe y guarda las fotos del historial.
- Importación «todo o nada» en una transacción (como hoy).
- Pruebas: no se borran. Las que comprobaban que un presupuestador **no** podía importar o editar el catálogo y los conjuntos se reescriben para comprobar lo nuevo (puede hacerlo; la completa sigue prohibida). Las que esperaban «Cambio» en filas iguales pasan a esperar «Sin cambios».

## Enfoques considerados

| Decisión | Opciones | Elegida y por qué |
|---|---|---|
| Dónde guardar las versiones del concepto | A: foto completa en `AuditLog.data` de cada entrada del historial. B: tabla nueva `ConceptVersion` | **A**. El historial ya registra cada cambio; una tabla aparte duplicaría lo mismo. Sin migración. |
| Aspecto del historial | A lista, B tabla, C línea unifilar, D paso a paso (maqueta) | **C en escritorio e iPad, D en móvil** (usuario). |
| Saber si un concepto está «usado» en la importación completa | A: `deleteOrDeactivate` (borrar y, si falla, desactivar). B: consultar antes | **B**. Un DELETE fallido aborta la transacción entera; consultando antes, la vista previa da cifras exactas y se mantiene el «todo o nada». |
| Estado del historial en la pantalla | A: en la URL (`historial`, `version`). B: estado de React | **A**. La página del catálogo ya es de servidor y usa la URL para concepto y filtros; «atrás» funciona y no hay estado duplicado. |
| Concepto que solo está en una plantilla de conjunto | A: cuenta como usado (se desactiva). B: se borra y la plantilla queda rota | **A** (usuario). El conjunto queda incompleto y lo avisa. |

## Diseño

### 3.0 Permisos

Pasan a cualquier usuario autenticado (se quita `assertAdmin` y los `role === "admin"` de la interfaz):
- conceptos: crear, modificar, activar/desactivar, eliminar (`catalog/service.ts`);
- conjuntos: crear, modificar, activar/desactivar (`kits/service.ts`, páginas de `conjuntos`);
- importar catálogo y clientes en modo «Añadir y actualizar» (pantallas `catalogo/importar` y `clientes/importar`, botones «Importar Excel»).

Siguen siendo del administrador: la **importación completa** (la opción no aparece y el servidor la rechaza con `ForbiddenError`), categorías y unidades (`catalog/lists.ts`), conceptos obligatorios, configuración, usuarios e historial general.

### 3.1 «Sin cambios» y qué cambia

- Cada fila con clave existente se compara campo a campo con lo guardado, tras pasar por el mismo esquema Zod que se escribe: decimales con `Decimal.equals` (o los dos nulos), textos ya recortados por el esquema, booleanos e ids tal cual.
- Si nada cambia, la acción es `"unchanged"`: no se escribe, no se registra y en la revisión solo suma al contador «Sin cambios».
- Si cambia, la fila lleva `changes: string[]` con «Campo: antes → después» en formato español (decimales con `formatDecimalEs`; categoría, unidad e impuesto por su nombre; booleanos «sí»/«no»; vacío como «vacío»).
- Catálogo: todos los campos de `conceptInput` más `active`. Clientes: campos de `clientInput` más `active`; contactos y instalaciones, sus campos más `active` (el nombre no, porque es la clave).
- El resumen del historial de cada cambio pasa a listar los campos cambiados. La entrada final de la importación dice «N altas, M cambios, K sin cambios» (y, en completa, «B bajas, D desactivados»).
- Fuera de la importación, guardar un concepto sin cambiar nada tampoco escribe entrada en el historial (si no, el historial tendría versiones sin cambios).

### 3.2 Importación completa

**Modo.** El formulario de importar tiene `mode` = `merge` (por defecto) o `full`. La opción `full` solo se muestra al administrador y el servicio comprueba `assertAdmin` si `mode === "full"`. Botón según el modo (maqueta E/F): «Confirmar importación» (verde) o «Confirmar importación completa» (rojo). Con `full` y una hoja sin filas, error: «El archivo no tiene filas: la importación completa lo borraría todo».

**Catálogo.** Concepto que está en la base y no en el Excel:
- **usado** → se desactiva (si ya estaba desactivado, no cuenta ni se toca);
- **no usado** → se borra.

Un concepto está **usado** si: alguna `QuoteLine.conceptId` lo referencia (borrador o emitido), es un `RequiredConcept`, o su id aparece en la definición de alguna plantilla de conjunto (`KitTemplate.definition`, activa o no) o en la definición o elecciones de algún conjunto puesto en un presupuesto (`KitInstance.definition`/`choices`). Se calcula en una función `conceptUsage()` reutilizable (ver 3.5).

La revisión añade «Conjuntos que quedarán incompletos»: cada plantilla activa que usa un concepto que se va a desactivar, con el código del concepto.

**Clientes.** Cliente que está en la base y no en la hoja «Clientes»:
- **sin presupuestos** → se borra (con sus contactos e instalaciones, por `Cascade`);
- **con presupuestos** → la revisión lo lista con número de presupuestos (y cuántos borradores) y dos opciones: «Desactivar» (marcada por defecto) o «Dejar como está». «Dejar como está» no toca ni el cliente ni sus contactos ni sus instalaciones.

Contacto o instalación que está en la base y no en su hoja (de un cliente que no se deja como está): si algún presupuesto lo usa (`Quote.contactId`/`locationId`), se desactiva; si no, se borra. Sin preguntar.

**Confirmación.** «Confirmar» vuelve a enviar el archivo y las decisiones (`keep` = ids de clientes a dejar como están). El servidor recalcula todo: lo que pasó a estar usado entre «Revisar» y «Confirmar» se desactiva en vez de borrarse; un cliente que ahora tiene presupuestos y no tiene decisión se desactiva. Si un borrado choca con una FK (P2003) en la transacción: error «Algo ha cambiado mientras revisabas: vuelve a revisar el archivo», y no se guarda nada.

**Historial.** Cada baja o desactivación deja su entrada («Baja de X (importación completa)», «X desactivado (importación completa)») y, en conceptos, la foto (3.4).

**Revisión (maqueta E).** Contadores: Altas, Cambios, Sin cambios y, en completa, «Se borrarán» y «Se desactivarán». Tabla «Altas y cambios» con «Qué cambia». Errores primero, como hoy. En completa: aviso en rojo, «Clientes con presupuestos: decide uno a uno» y «Lo demás se aplica solo».

### 3.3 Revisiones con precios al día

`createRevision` aplica, dentro de su transacción y después de `copyContent`, la misma actualización que `refreshPricesFromCatalog` sobre la revisión nueva. Se extrae a una función común `refreshLines(tx, quoteId): Promise<number>` que usan las dos. Mismas exclusiones: concepto desactivado o sin precio, líneas con ajuste de precio y subpartidas de precio global. La entrada de historial de la revisión añade «; N líneas con precios del catálogo». La pantalla del borrador ya muestra los avisos de `priceWarnings`; además, `createRevisionAction` redirige con `?precios=N` y la página muestra «Precios actualizados desde el catálogo en N líneas» si N > 0. `duplicateQuote` no cambia.

### 3.4 Historial de un concepto

**Datos.** Toda escritura de un concepto (alta, cambio, activar/desactivar, eliminar que desactiva, importación) guarda en `AuditLog.data`:

```json
{ "concept": { "code": "…", "description": "…", "category": "Material", "unit": "m",
  "tax": "IVA 21 %", "salePrice": "16.75", "cost": "10.4", "listPrice": null, "discountPct": null,
  "validated": true, "active": true, "notes": "…", "manufacturer": "…", "supplier": "…", "supplierRef": "…" },
  "source": "manual" | "import" | "import-full" }
```

Nombres de categoría, unidad e impuesto tal como estaban ese día, y decimales como texto. Las entradas antiguas no tienen `data`: se muestran con su frase.

**Lectura.** `getConceptHistory(conceptId)` devuelve las entradas del concepto (más reciente primero) con fecha, nombre de usuario, `source`, frase y foto (o `null`). Una función pura `diffSnapshots(after, before)` da los campos que cambian con su valor anterior; solo compara si las dos versiones tienen foto. Con prueba unitaria.

**Botón.** En la cabecera del panel del concepto, «Historial (N)» junto a «Cerrar», solo si el concepto tiene **más de una** entrada (es decir, ha cambiado desde el alta). Lo ve cualquier usuario.

**Pantalla (maqueta C/D).** Estado en la URL: `?concepto=<id>&historial=1&version=<auditLogId>` (sin `version`, la más reciente).
- Con el historial abierto, la columna del historial ocupa el sitio de la lista y los filtros quedan desactivados. No se puede elegir otro concepto. La X (enlace sin `historial` ni `version`) devuelve la lista y el panel editable.
- El panel muestra la versión elegida en **solo lectura** (`fieldset disabled`, sin «Guardar», «Proponer precio», «Desactivar» ni «Eliminar»), con un aviso «Versión del dd/mm/aaaa · usuario. Solo lectura: cierra el historial (X) para editar.». Los campos que cambiaron en esa versión van en ámbar (borde `--amber-line`, fondo `--amber-bg`) con «Antes: <valor tachado>»; «Datos de proveedor» se abre solo si cambia algo dentro. Una versión sin foto muestra un aviso con su frase y los campos de la versión actual, sin resaltar.
- **Escritorio** (> 900 px): línea vertical; cada versión dibuja su tramo, con el círculo centrado sobre la línea. Círculo verde relleno: la que se ve; discontinuo: versión antigua sin foto. Cada versión: fecha (y «actual»), hora · usuario, etiqueta «Importación» si viene de una, y resumen (importes con valor; textos, solo el nombre del campo). Entre 901 y 1360 px, historial y panel siguen uno al lado del otro (panel de 360 px), aunque fuera del historial el panel vaya debajo de la lista.
- **iPad en vertical** (601–900 px): la línea en horizontal, sin barra de scroll visible, con flechas ‹ › que se desactivan (gris) al llegar a cada extremo. Componente cliente pequeño para el desplazamiento y el estado de las flechas.
- **Móvil** (≤ 600 px): al pulsar un concepto, el panel se abre **a pantalla completa** sobre la lista con una X («Volver al catálogo») en lugar de «Cerrar». El historial usa el **paso a paso**: «‹ Antes» / «Después ›» (desactivados en los extremos), puntos de posición y la lista «Qué cambió» de esa versión, encima del panel. Con el historial abierto solo se ve la X del historial.
- La línea y el paso a paso se pintan los dos y se elige con CSS por ancho; las flechas son lo único que necesita JavaScript.

### 3.5 Conjuntos incompletos

- `removeConcept` deja de fiarse solo de la FK: si el concepto está usado según `conceptUsage()` (por ejemplo, solo en una plantilla de conjunto), lo **desactiva** en vez de borrarlo. Hoy lo borraría y la plantilla quedaría rota.
- Al desactivar o eliminar (desactivando) un concepto que está en plantillas de conjunto activas, el mensaje dice «Desactivado. Quedan incompletos: Conjunto A, Conjunto B».
- La lista de conjuntos marca con «Incompleto» las plantillas que usan un concepto desactivado o inexistente, y la ficha del conjunto lo explica («DEMO-BANDEJA está desactivado: cámbialo por otro»). Se reutiliza la comprobación de `checkRefs` de `kits/service.ts` en modo «devolver avisos» en lugar de lanzar error.
- En los presupuestos no cambia nada: `expandKit` ya marca la pieza «ya no está disponible» y deja el conjunto sin valorar hasta cambiarla. Lo emitido no se toca.

## Pruebas

- 3.1: importar lo exportado da 0 altas, 0 cambios y todas «Sin cambios», sin entradas de historial; un cambio de precio da `changes` con «Precio de venta: 10 → 12».
- 3.2: completa borra lo no usado y desactiva lo usado (línea en borrador, emitido, plantilla de conjunto, obligatorio); presupuestador no puede `full`; hoja vacía en `full` da error; clientes: decisión «Dejar como está» y «Desactivar»; contacto/instalación usados se desactivan; choque de FK da error sin guardar nada.
- 3.3: una revisión sale con el precio actual; respeta ajustes y precio global; el historial cuenta las líneas.
- 3.4: cada escritura guarda la foto; `diffSnapshots`; guardar sin cambios no crea versión; `getConceptHistory` mezcla entradas antiguas sin foto.
- 3.5: eliminar un concepto que solo está en una plantilla lo desactiva; aviso de conjuntos incompletos.
- 3.0: un presupuestador crea, modifica y elimina conceptos y conjuntos, e importa en `merge`.
- Interfaz en Chrome, en local: escritorio, iPad en vertical y móvil, con datos ficticios.

## Lo que queda al constructor

Textos menores, nombres internos, el reparto exacto en tareas, cómo se envían las decisiones de clientes en el formulario (campos ocultos o `name="keep"` por cliente) y el formato del parámetro `precios`.

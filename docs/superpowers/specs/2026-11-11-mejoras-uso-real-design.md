# Mejoras tras el primer uso real — diseño

Fecha: 2026-11-11. Rama: `mejoras-uso-real` (desde `master` en `8a03a55`). `master` y el despliegue no se tocan hasta que el usuario fusione.

> **Estado: decisiones confirmadas el 2026-11-11; el aspecto del Bloque 1 se eligió con la maqueta `docs/diseno/maquetas/editor-filas-v2.html` («luz verde» del usuario). Falta el visto bueno final del documento.** Después, con la skill `superpowers:writing-plans`, se escribe un plan por bloque y se sube a esta rama. No se implementa nada antes de eso.
>
> **Forma de trabajo (usuario, 2026-11-11):** bloque a bloque: plan → ejecución → revisión en Chrome → commit y push **a esta rama**. Se prueba en local (localhost). `master` no se toca hasta el final: cuando la rama esté bien, se fusiona y se despliega todo de una vez.

## Intención

La app está desplegada y el equipo la ha usado con presupuestos reales. De ese uso salen fallos (campos inaccesibles en el editor, nota de desplazamiento que «no hace nada», importación que marca cambios que no lo son) y peticiones (firma y sello en el PDF, instalaciones con país, limpiar datos de prueba). El objetivo es que la herramienta sirva para el día a día sin rodeos, sin romper lo emitido ni la trazabilidad.

## Objetivos

1. Editor usable en cualquier ancho de escritorio y en móvil, con menos botones a la vista.
2. Clientes con instalaciones (nombre · país) e intercambio por Excel.
3. Importaciones que dicen la verdad (solo «Cambio» si algo cambió) y que pueden dejar la base igual que el Excel.
4. Ciclo del presupuesto: caducado automático, revisiones con precios al día y notas internas con fecha.
5. Cada usuario gestiona su contraseña y su firma; todo PDF emitido lleva sello y firma de quien lo emitió.
6. Administración: eliminar usuarios sin romper el historial, historial filtrable y puesta a cero con series de numeración.

## No objetivos

- Importar clientes desde Baseges (aparcado hasta tener un archivo de ejemplo).
- Cambiar PDF ya generados: lo emitido antes de este trabajo conserva su PDF sin firma.
- Notas internas en el PDF.
- Comentarios sueltos que se ordenan por su cuenta, como una línea más (se eligió un comentario pegado a cada elemento).

## Anti-objetivos (sería un fracaso aunque funcione)

- Que un PDF emitido cambie después de emitirlo (por ejemplo, porque el usuario cambie su firma).
- Que un número de presupuesto se repita o que una referencia ya enviada cambie.
- Perder quién hizo qué en el historial al eliminar un usuario.
- Borrar datos con un clic accidental.

## Restricciones

- Stack y convenciones de `AGENTS.md`: código en inglés, interfaz en español, decimales exactos, permisos en el servidor, escritura de borradores por `withDraft()`, formularios con `ActionForm`.
- Migraciones de Prisma que no pierdan datos (renombrados con `ALTER … RENAME`, no borrar y crear).
- Producción tiene datos reales: cada migración debe aplicarse sobre una copia restaurada antes de desplegar (`docs/despliegue.md`, prueba de restauración).
- Pruebas con Vitest sobre `presupuestos_test`; interfaz revisada con Claude in Chrome.

## Enfoques considerados

| Decisión | Opciones | Elegida y por qué |
|---|---|---|
| Comentario en cursiva | A: un campo `comment` en cada elemento (línea, conjunto, subpartida, partida). B: líneas de texto sueltas sin precio | **A** (usuario, ampliado tras ver la maqueta). El comentario va pegado a su elemento y se mueve con él; no toca cálculo, y en revisiones solo se copia un campo. |
| Aspecto del editor | Cinco variantes en `editor-filas.html` | **A «Dos pisos»** (usuario), con la silueta del conjunto de la B y los ajustes de `editor-filas-v2.html`. |
| Dónde guardar la firma | A: PNG en la base de datos, en el usuario, copiado al snapshot al emitir. B: archivo en el volumen como el logo | **A** (usuario). Entra en la copia de la BD y el PDF emitido queda congelado con la firma de ese día. |
| Reiniciar solo la numeración | A: seguir desde un número elegido. B: nueva serie con marca. C: solo si no hay presupuestos del año | **B** (usuario). Se puede volver a 1 sin chocar con referencias existentes. |
| Organización del trabajo | Un diseño común, una rama, un plan por bloque | Propuesta aceptada. |

## Diseño por bloques

Orden de implementación: 1 → 7. Cada bloque es un plan en `docs/superpowers/plans/` y deja la rama con pruebas en verde.

### Bloque 1. Editor y móvil

Referencia visual obligatoria: `docs/diseno/maquetas/editor-filas-v2.html` (variante A ajustada, aprobada por el usuario el 2026-11-11). Si este texto y la maqueta discrepan, manda la maqueta.

**1.1 Filas que no se cortan.** Hoy `.qrow` usa columnas fijas (`96px 1fr 110px 100px 112px auto`) y la columna de acciones (`auto`) crece con sus botones; con el menú (224 px) y el panel lateral (380 px) a la vista, el `1fr` de la denominación se queda en unos pocos píxeles (captura: «Bc», «Bomba de poten»). Arreglo:
- El editor de partidas es contenedor (`container-type: inline-size`). La columna de acciones tiene ancho fijo.
- Por debajo de ~980 px de contenedor, la fila pasa a dos pisos: arriba la denominación a todo el ancho (desde la columna del código); abajo cantidad, precio, importe y acciones. Por debajo de ~480 px (móvil), apilada: denominación; código e importe; cantidad y precio; acciones.
- La descripción de las líneas es un cuadro de texto que crece hacia abajo (`field-sizing: content`): el texto largo baja de línea y se lee entero.
- Se aplica a partidas, subpartidas, líneas y líneas de conjunto. El valor completo ya se guarda; es solo presentación.

**1.2 Menú en móvil (≤ 900 px).** Hoy el menú lateral pasa encima del contenido ocupando la pantalla. Pasa a una barra superior con «ISF Presupuestos» y un botón de menú que despliega los enlaces (y «Cerrar sesión»). Sin librerías: `<details>` o un botón con estado. (No se maquetó: se revisa en Chrome al construirlo.)

**1.3 Botones de acción y su orden.** Mismo tamaño de botón en todas las filas (`.icon`, 30 px; 38 px en móvil).
- Línea: Ver · € · comentario · ↑ · ↓ · ✕. En móvil: Ver, € y comentario a la izquierda; ↑ ↓ a la derecha; ✕ al extremo, separado de las flechas.
- Línea de conjunto: Ver · € · comentario (sin flechas ni ✕, como hoy).
- Partida: «Eliminar» · ↑ · ↓ · «＋ ▾» (desplegable: *Subpartida* · *Comentario de la partida*). Subpartida: «Eliminar» · ↑ · ↓ · comentario. «Eliminar» va primero (a la izquierda del todo en móvil) y las flechas quedan en la misma vertical que las de las líneas; el último hueco se reserva aunque el botón esté oculto.
- Las flechas se ven siempre, pero desactivadas y en gris cuando no hay con quién cambiar (primera/última línea; partida o subpartida única o en un extremo).

**1.4 «+ Añadir ▾» y cancelar.** En cada subpartida editable, bajo sus líneas, los botones «+ Del catálogo», «+ Línea específica» y «+ Conjunto» se agrupan en un único `.btn` «+ Añadir ▾» con menú; cada opción lleva una línea de ayuda: *Del catálogo* («concepto con su precio») · *Línea específica* («texto y precio a mano») · *Comentario de la subpartida* («al pie de la subpartida») · *Conjunto* («varios elementos que se calculan juntos»). «Conjunto» solo aparece si la subpartida va «por suma» (como hoy). Cada formulario abierto lleva a su derecha un ✕ «Cancelar» cuadrado de la misma altura que su botón principal (40 px), que lo cierra vacío sin guardar. Solo hay un formulario abierto a la vez.

**1.5 Nueva partida.** Al final del presupuesto, una banda a todo el ancho con el aspecto de una fila de partida, «＋ NUEVA PARTIDA», que abre el nombre, «Añadir partida» y ✕. Sustituye al formulario siempre visible de hoy. La nueva subpartida se añade desde el «＋ ▾» de la partida, con su nombre.

**1.6 Comentarios.** Campo `comment` (texto, por defecto `""`, máx. 2000) en `QuoteLine`, `KitInstance` y `QuoteSection` (partidas y subpartidas).
- Cada elemento tiene su botón de comentario (icono de bocadillo, rectangular); el cuadro se abre justo donde se verá, con «Guardar» y ✕. Mientras el elemento tiene comentario, el botón se oculta y el comentario se edita con su ✎ o se quita con su ✕ (lo vacía).
- Dónde se ve, en cursiva, sin marcas: bajo su línea (alineado con la descripción); el de un conjunto, tras sus líneas y antes de su pie; el de la subpartida, al pie de la subpartida; el de la partida, al pie de la partida, con fondo gris. Igual en el PDF.
- Se mueve con su elemento (no tiene flechas propias) y se borra con él.
- Al recalcular un conjunto, el comentario de cada línea se conserva si sigue existiendo la línea de ese hueco (`kitSlot`).
- Se copian en duplicados y revisiones y entran en el snapshot. Un comentario vacío no se pinta. Los snapshots antiguos no los tienen.

**1.7 Conjunto plegable.**
- Ocupa todo el ancho de la subpartida, alineado con los comentarios, a cualquier tamaño.
- Plegado (`<details>`): ▸, la silueta del conjunto, «Conjunto · nombre», resumen e importe o «Incompleto». La silueta: un cuadrado con las dos primeras letras del primer elemento (BO de bomba, VA de variador, MO de motor…) y un círculo por componente, discontinuo en ámbar si falta; al pasar el ratón muestra los nombres. Se ve igual plegado que abierto.
- Abierto: el cálculo, sus líneas, su comentario y el pie. Ya no se dibuja el esquema grande.
- Pie, separado de la última línea por un filete y en una sola línea también en móvil: «Editar» (o «Completar» en ámbar) · «Quitar» · comentario … ✓ verde a la derecha, que lo pliega y deja su título a la vista.
- Los incompletos salen abiertos y con borde ámbar; el que se acaba de editar se abre por su ancla `#conjunto-…`.
- Cambio del 2026-11-12 (usuario): la silueta lleva un círculo por dato del formulario (elemento principal, datos y componentes), con borde negro si está y discontinuo en ámbar si falta.

**1.8 Conjuntos en subpartidas de precio global** (añadido el 2026-11-12, decisión del usuario). Una subpartida «precio global» también admite conjuntos (sustituye a «solo si va por suma» de 1.4). Sus líneas son descriptivas como las demás de esa subpartida: sin precio ni importe, y no suman. El conjunto sigue obligando a elegir cada pieza y dato: incompleto bloquea la emisión («Falta completar: …»). En global se pueden elegir piezas del catálogo sin precio de venta, como en las líneas sueltas.

### Bloque 2. Clientes e instalaciones

**2.1 Instalaciones.** `ClientLocation` sigue siendo la entidad; cambia su presentación:
- La sección «Ubicaciones de trabajo» del cliente pasa a llamarse «Instalaciones».
- Campos, en este orden (decisión del usuario): **Nombre, Dirección, Instalación, País**. Migración con `RENAME COLUMN` que conserva los valores: `city` → `installation` (etiqueta «Instalación», antes «Localidad») y `province` → `country` (etiqueta «País», antes «Provincia»).
- En la cabecera del presupuesto (decisión del usuario), donde hoy está «Ubicación», van dos campos en la misma fila: a la izquierda **«Nombre»**, el selector, cuyas opciones son solo el nombre de cada instalación del cliente; a su derecha **«Instalación»**, de solo lectura, que muestra juntos la instalación y el país de la elegida: `instalación · país` (sin el separador si falta uno; «—» si no hay ninguna elegida). Igual en la vista de solo lectura (Nombre e Instalación) y en el aviso de «Para emitir» («Falta la instalación»). Cómo se refresca «Instalación» al cambiar el selector lo decide el constructor.
- PDF (cambiado por el usuario el 2026-11-12, tras revisar el bloque): en el destinatario, en lugar del nombre de la instalación va `instalación, país`, y debajo solo la dirección; la carta dice «…en referencia a {asunto} en {instalación}, {país}.», y el asunto pasa a ser obligatorio para emitir («Falta el asunto»). Antes: el bloque de dirección mantenía su estructura: dirección y, debajo, `instalación (país)`. Los snapshots ya emitidos tienen `city` y `province`: `buildDocument` lee `installation ?? city` y `country ?? province` para que los PDF antiguos se regeneren igual.

**2.3 Filas alineadas.** En las listas editables por filas (`.rowform`: contactos e instalaciones del cliente, y cualquier otra que use la misma clase), la fila vacía de «Añadir» y las filas guardadas tienen los mismos anchos de columna. Hoy no cuadran porque las guardadas llevan dos botones («Guardar» y «Eliminar») y la nueva uno («Añadir»), y la columna `auto` cambia de ancho. Arreglo: la columna de acciones tiene ancho fijo, el mismo en la cabecera, las filas y la fila nueva.

**2.2 Clientes por Excel.** Como el catálogo, con `exceljs`:
- Exportar: libro con tres hojas: *Clientes* (CIF, razón social, nombre comercial, dirección fiscal, forma de pago, exclusiones, validez, notas, activo), *Contactos* (CIF, nombre, cargo, email, teléfono, activo) e *Instalaciones* (CIF, nombre, dirección, instalación, país, activo). El CIF es la clave.
- Plantilla vacía descargable.
- Importar con vista previa y confirmación, como el catálogo: validación de todas las filas; si hay errores no se guarda nada. Los contactos e instalaciones se casan por CIF + nombre.
- Modos de importación, ver 3.2.

### Bloque 3. Catálogo e importaciones

**3.1 «Cambio» solo si cambia algo.** Al validar, cada fila con código existente se compara campo a campo con lo guardado (tras normalizar: decimales con `Decimal.equals`, textos recortados). Si nada cambia, la fila es «Sin cambios» y no se escribe ni se registra. La vista previa muestra solo altas, cambios (con los campos que cambian, «precio 10,00 → 12,00») y errores; los «Sin cambios» se resumen en un contador. Igual para clientes.

**3.2 Importación completa.** En la pantalla de importar se elige el modo:
- *Añadir y actualizar* (como hoy, por defecto).
- *Completa (dejar igual que el Excel)*: además, lo que está en la base y no en el Excel se quita. Lo que nunca se usó se borra; lo usado (un concepto en alguna línea o un cliente con presupuestos) se desactiva, con el helper existente `deleteOrDeactivate`. La vista previa lista las bajas aparte («Se borrarán N», «Se desactivarán M») y la confirmación avisa en rojo. En clientes, contactos e instalaciones ausentes siguen la misma regla.

**3.3 Revisiones con precios al día.** `createRevision` aplica, dentro de su transacción, la misma lógica que `refreshPricesFromCatalog` sobre la revisión nueva: líneas de catálogo activas con precio pasan al precio, descripción, unidad e impuesto actuales, salvo líneas con ajuste de precio y subpartidas de precio global (igual que el botón actual). El historial de la revisión anota cuántas líneas se actualizaron y la pantalla muestra los avisos que hoy da `priceWarnings`. `duplicateQuote` no cambia (copia precios).

### Bloque 4. Ciclo, caducado y notas

**4.1 Caducado automático.** Un presupuesto en *Emitido* o *Enviado* pasa a *Caducado* cuando `hoy (Madrid) > fecha de emisión + validityDays`. Fecha de emisión: `issuedAt` en zona Madrid. Mecanismo (decisión del usuario: **tarea programada**, para que la base esté al día aunque nadie abra la app, por ejemplo si se consulta desde otra herramienta o una IA): una función `expireQuotes()` con un `UPDATE … WHERE status IN ('ISSUED','SENT') AND …` idempotente, que el propio servidor ejecuta al arrancar y después cada hora (propuesta del agente: desde `instrumentation.ts` de Next, sin servicio nuevo en Compose; si la app estuvo parada, se pone al día al arrancar). Cada cambio queda en el historial con usuario «Sistema» (`userId` nulo). Aceptado y Rechazado no cambian. Un caducado puede seguir pasándose a mano a otro estado como hoy.

**4.2 Notas internas.** Sustituyen al campo `travelNote` del panel de desplazamiento:
- Se quita el texto de ayuda «Pon los km facturables…» y el título pasa a «Notas internas».
- Tabla nueva `QuoteNote` (id, quoteId con `Cascade`, userId nulo con `SetNull`, userName, text ≤ 1000, createdAt). `userName` guarda el nombre del autor para que la nota sobreviva si se elimina el usuario (6.1), mostrada entonces como «Nombre (eliminado)». Al guardar, la nota se añade arriba de una lista con fecha y hora (Madrid), autor y ✕ para eliminarla (con confirmación); el campo queda vacío.
- Se pueden añadir y eliminar en cualquier estado (no forman parte del documento, no pasan por `withDraft`). Las elimina su autor o un admin.
- Nunca van al PDF ni al snapshot.
- Al crear una revisión o duplicar, se copian las notas con su autor y fecha originales (decisión del usuario). Las notas nuevas que se añadan en la revisión o el duplicado llevan como autor a quien las escribe. Si una nota copiada ya no hace falta, se elimina.
- Migración: cada `travelNote` no vacío pasa a ser una nota con el creador del presupuesto como autor y `updatedAt` como fecha; luego se borra la columna `travelNote`.
- Alta y baja de notas quedan en el historial.

### Bloque 5. Cuenta, firma y sello

**5.1 «Mi cuenta» para todos.** Ruta `/cuenta`, enlace en el menú para todos los roles (junto al nombre del usuario). Contiene:
- Cambio de contraseña (actual + nueva + repetir) con la API de Better Auth (`changePassword`), cerrando las demás sesiones.
- Firma: lienzo para dibujar con ratón o dedo (Pointer Events, sin librerías), botones «Borrar» y «Guardar firma», y la firma guardada mostrada sobre el sello tal como saldrá en el PDF.

**5.2 Guardado de la firma.** Campo nuevo `User.signature` (PNG en `Bytes`, nulo por defecto). Validación en servidor: PNG real (cabecera), ≤ 200 KB, dimensiones razonables. El lienzo exporta con fondo transparente y recorta los márgenes vacíos.

**5.3 Sello.** `docs/sello/sello-isf.svg` pasa a `src/pdf/assets/` (o similar) y se incrusta en el PDF. Es fijo, no configurable.

**5.4 Emisión exige firma.** `issueChecks` añade el problema `signature` («Falta tu firma: configúrala en Mi cuenta», enlace a `/cuenta`) si quien emite no tiene firma. Se comprueba sobre el usuario que emite, no sobre el responsable.

**5.5 PDF.** Al emitir, el snapshot guarda la firma de quien emite (base64) y su nombre. La plantilla v1 sustituye el recuadro vacío «Firma y sello» por el sello con la firma superpuesta. Los snapshots antiguos sin firma siguen pintando el recuadro como hoy. La vista previa de un borrador usa la firma del usuario que lo mira, o el recuadro vacío si no tiene.

**5.6 Logo SVG en el inicio de sesión.** `docs/logos/logo-isf.svg` sustituye a `/logo-isf.jpg` en la pantalla de inicio de sesión. El logo del PDF sigue siendo el configurable de Configuración.

### Bloque 6. Usuarios, historial y zona de peligro

**6.1 Eliminar usuarios.** En Usuarios, cada usuario muestra:
- Sin presupuestos emitidos (ninguno como responsable ni como creador con estado distinto de borrador): botón «Eliminar» con confirmación. Sus borradores pasan al admin que elimina (responsable y creador). Se borra el usuario, sus sesiones y cuentas.
- Con alguno emitido: solo «Desactivar» (ya existe); la fila en gris y «Reactivar».
- No se puede eliminar a uno mismo ni al último admin activo (regla que ya existe para desactivar).

**6.2 Historial sin perder autores.** `AuditLog` gana `userName` (texto). Migración: se rellena con el nombre actual de cada usuario. La relación pasa a `onDelete: SetNull`. Al eliminar un usuario, sus entradas conservan `userName` y se muestran como «Nombre (eliminado)». Igual para `PriceAdjustment` (que hoy impide borrar): guarda `userName` y pasa a `SetNull`.

**6.3 Historial filtrable.** Filtros en la URL, como el catálogo: tipo (como hoy), usuario (incluye eliminados por nombre), acción, desde/hasta y texto (busca en la descripción). Paginación igual que hoy.

**6.4 Series de numeración.**
- `CompanySettings.numberSeries` (texto, `""` por defecto) y `Quote.series` (texto, `""`). La clave única pasa a `(seqYear, series, seq, revision)`.
- `formatReference` acepta el marcador `{S}`; si el patrón no lo tiene, la serie se inserta justo después de `{AAAA}` (o al principio del número si no hay año). Serie `""` → la referencia es idéntica a la actual.
- El contador (`NumberCounter`) usa como clave el año (si hay reinicio anual) más la serie; `nextNumber` limita el `MAX(seq)` a la serie.
- Una revisión conserva la serie de su original.

**6.5 Zona de peligro.** Al final de Configuración, solo admins: recuadro con borde y fondo rojos en el estilo de la app, con dos acciones:
- *Reiniciar la numeración*: pasa a la serie siguiente (`""` → `B` → `C` … → `Z` → `AA`) y la cuenta vuelve al valor inicial, igual que un reinicio anual pero con letra nueva. No toca presupuestos ni historial.
- *Borrar todos los presupuestos y reiniciar la numeración*: es para empezar de cero con la plataforma (decisión del usuario). Borra todos los presupuestos (todas sus tablas dependientes, incluidas notas y documentos emitidos), sus PDF en `DATA_DIR/pdf`, los contadores, y **las entradas del historial de esos presupuestos** (decisión del usuario), y deja la serie en `""`. Los números volverán a empezar y podrán coincidir con los de presupuestos borrados, y el aviso de confirmación lo dice expresamente. Es la única excepción al anti-objetivo de no repetir números. Queda una sola entrada en el historial que registra quién hizo la puesta a cero y cuántos presupuestos se borraron.
- Cada una se confirma escribiendo una palabra (`REINICIAR` / `BORRAR`) en un cuadro; el botón no se activa hasta que coincide, y el servidor vuelve a comprobarla. El texto recomienda hacer antes una copia manual (`docs/despliegue.md`). Ambas quedan en el historial.

## Datos y migraciones (resumen)

| Cambio | Migración |
|---|---|
| `QuoteSection.comment`, `QuoteLine.comment`, `KitInstance.comment` | `ADD COLUMN … DEFAULT ''` |
| `ClientLocation.city` → `installation`, `province` → `country` | `RENAME COLUMN` |
| `QuoteNote` (con `userName`, FK de usuario `SET NULL`) | tabla nueva; datos desde `Quote.travelNote`; luego `DROP COLUMN travelNote` |
| `User.signature` | `ADD COLUMN bytea NULL` |
| `AuditLog.userName`, `PriceAdjustment.userName` | `ADD COLUMN`, relleno desde `user.name`, FK a `SET NULL` |
| `CompanySettings.numberSeries`, `Quote.series` | `ADD COLUMN … DEFAULT ''`; cambio del índice único |

Los snapshots emitidos no se migran: `buildDocument` debe seguir leyendo los antiguos (sin comentarios, con `province`, sin firma).

## Lo que queda al constructor

Anchos exactos de los cortes en 1.1 (tomar los de la maqueta como punto de partida), iconos y textos menores, la forma del recorte del lienzo, el orden de las columnas de los Excel de clientes, y cómo se reparte cada bloque en tareas.

Se puede decidir al construir, sin consultar: si un concepto que solo aparece dentro de un conjunto cuenta como «usado»; qué hacer con nombres de contacto repetidos en una importación; y si la serie se puede editar a mano en Configuración.

### Bloque 7. Pendientes del despliegue (código)

Lo anotado en `progreso.md`, «Pendiente tras el despliegue», que se arregla en código (decisión del usuario: al final, con su propio plan):
- prueba intermitente de `tests/quotes/kit-instances.test.ts`;
- aviso «El PDF se generará al descargarlo» si falla el PDF al emitir (spec del plan 4, 5.5.1);
- encabezado de partida o subpartida solo al pie de una hoja al recolocar el cierre (`src/pdf/templates/v1/paginate.ts`);
- cierre más alto que una hoja que se corta sin aviso;
- `tar` que hace fallar la copia si un archivo cambia mientras se lee (`scripts/backup.sh`);
- versión de Playwright duplicada en `Dockerfile` y `package.json`.

Los textos cortados del editor ya los resuelve 1.1. Las comprobaciones en el servidor y el cambio de credenciales quedan para el usuario, al desplegar.

## Decisiones confirmadas por el usuario (2026-11-11)

- Editor (Bloque 1): variante A de la maqueta, con comentarios en cada línea, conjunto, subpartida y partida (1.1–1.7).
- Cabecera: selector «Nombre» y, a su derecha, «Instalación» con `instalación · país` (2.1).
- Notas copiadas a revisiones y duplicados con su autor y fecha originales; las nuevas, con quien las escribe (4.2).
- Notas y entradas del historial de un usuario eliminado se conservan con su nombre (anti-objetivo «perder quién hizo qué»).
- Puesta a cero completa: borra también el historial de esos presupuestos; reiniciar solo la numeración no toca el historial (6.5).
- Caducado por tarea programada, no al cargar la página (4.1).
- Vista previa de un borrador: firma del usuario que la mira (5.5).

# Mejoras tras el primer uso real — diseño

Fecha: 2026-11-11. Rama: `mejoras-uso-real` (desde `master` en `8a03a55`). `master` y el despliegue no se tocan hasta que el usuario fusione.

> **Estado: BORRADOR, sin aprobar.** Las decisiones marcadas como «del usuario» están tomadas. Las de «Decisiones tomadas por el agente», al final, están **pendientes de confirmar**. Falta debatir el estilo final y aprobar el documento. Después, con la skill `superpowers:writing-plans`, se escribe un plan por bloque y se sube a esta rama. No se implementa nada antes de eso.

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
- Varios comentarios sueltos y reordenables dentro de una partida (se eligió un comentario por partida/subpartida).

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
| Comentario en cursiva al pie | A: un campo `comment` por partida/subpartida. B: líneas de texto sueltas sin precio | **A** (usuario). Siempre queda al pie, no toca cálculo, paginación ni revisiones más allá de copiar un campo. |
| Dónde guardar la firma | A: PNG en la base de datos, en el usuario, copiado al snapshot al emitir. B: archivo en el volumen como el logo | **A** (usuario). Entra en la copia de la BD y el PDF emitido queda congelado con la firma de ese día. |
| Reiniciar solo la numeración | A: seguir desde un número elegido. B: nueva serie con marca. C: solo si no hay presupuestos del año | **B** (usuario). Se puede volver a 1 sin chocar con referencias existentes. |
| Organización del trabajo | Un diseño común, una rama, un plan por bloque | Propuesta aceptada. |

## Diseño por bloques

Orden de implementación: 1 → 6. Cada bloque es un plan en `docs/superpowers/plans/` y deja la rama con pruebas en verde.

### Bloque 1. Editor y móvil

**1.1 Campos cortados entre ~900 y ~1600 px.** Hoy `.qrow` usa columnas fijas (`96px 1fr 110px 100px 112px auto`) y la columna de acciones (`auto`) crece con sus botones; con el menú (224 px) y el panel lateral (380 px) a la vista, el `1fr` de la denominación se queda en unos pocos píxeles (captura: «Bc», «Bomba de poten»). Arreglo: el editor de partidas se vuelve contenedor (`container-type: inline-size`) y, por debajo de un ancho de contenedor (orientativo 820 px; el constructor lo ajusta probando), la fila pasa a dos pisos: arriba la denominación a todo el ancho; abajo código, cantidad, precio, importe y acciones. Se aplica a partidas, subpartidas, líneas y líneas de conjunto. El valor completo ya se guarda; solo es presentación.

**1.2 Menú en móvil (≤ 900 px).** Hoy el menú lateral pasa encima del contenido ocupando la pantalla. Pasa a una barra superior con «ISF Presupuestos» y un botón de menú que despliega los enlaces (y «Cerrar sesión»). Sin librerías: `<details>` o un botón con estado.

**1.3 Botón «+ Añadir ▾».** En cada partida/subpartida editable, los botones «+ Del catálogo», «+ Línea específica» y «+ Conjunto» se agrupan en un único botón con desplegable: *Del catálogo · Línea específica · Comentario · Conjunto*. «Conjunto» solo aparece cuando la subpartida va «por suma» (como hoy). Mismo tamaño y estilo que los botones `.btn` actuales. «Comentario» no aparece si ya hay comentario (se edita el existente).

**1.4 Cancelar al añadir.** Cada formulario de añadir abierto (concepto del catálogo, línea específica, comentario, conjunto) lleva un botón ✕ «Cancelar» a su derecha, igual al ✕ de las líneas, que lo cierra sin guardar y lo deja vacío.

**1.5 Comentario de partida/subpartida.** Campo nuevo `QuoteSection.comment` (texto, por defecto `""`, máx. 2000). Se edita en un cuadro al pie de la partida/subpartida, con «Guardar» y ✕ para quitarlo (lo vacía). Se ve en cursiva en el editor y en el PDF, al pie de su partida/subpartida, después de sus líneas. Se copia en duplicados y revisiones y entra en el snapshot. Un comentario vacío no se pinta.

**1.6 Conjunto plegable.** El bloque de conjunto se muestra plegado (una línea: «Conjunto · nombre», resumen e importe o «Incompleto») y se despliega al pulsarlo (`<details>`). Recuerda abierto el que se acaba de editar (ancla `#conjunto-…` abre el `<details>`). Los incompletos se muestran abiertos.

### Bloque 2. Clientes e instalaciones

**2.1 Instalaciones.** `ClientLocation` sigue siendo la entidad; cambia su presentación:
- La sección «Ubicaciones de trabajo» del cliente pasa a llamarse «Instalaciones».
- Campos, en este orden (decisión del usuario): **Nombre, Dirección, Instalación, País**. Migración con `RENAME COLUMN` que conserva los valores: `city` → `installation` (etiqueta «Instalación», antes «Localidad») y `province` → `country` (etiqueta «País», antes «Provincia»).
- En la cabecera del presupuesto, «Ubicación» pasa a «Instalación» y cada opción se muestra como `nombre · instalación · país`, omitiendo los vacíos (propuesta del agente). Igual en la vista de solo lectura y en el aviso de «Para emitir» («Falta la instalación»).
- PDF: el bloque de dirección mantiene su estructura: dirección y, debajo, `instalación (país)`. Los snapshots ya emitidos tienen `city` y `province`: `buildDocument` lee `installation ?? city` y `country ?? province` para que los PDF antiguos se regeneren igual.

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

**4.1 Caducado automático.** Un presupuesto en *Emitido* o *Enviado* pasa a *Caducado* cuando `hoy (Madrid) > fecha de emisión + validityDays`. Fecha de emisión: `issuedAt` en zona Madrid. Mecanismo: una función `expireQuotes()` con un `UPDATE … WHERE status IN ('ISSUED','SENT') AND …` idempotente, llamada al cargar el listado y la ficha de un presupuesto (sin tareas programadas). Cada cambio queda en el historial con usuario «Sistema» (`userId` nulo). Aceptado y Rechazado no cambian. Un caducado puede seguir pasándose a mano a otro estado como hoy.

**4.2 Notas internas.** Sustituyen al campo `travelNote` del panel de desplazamiento:
- Se quita el texto de ayuda «Pon los km facturables…» y el título pasa a «Notas internas».
- Tabla nueva `QuoteNote` (id, quoteId con `Cascade`, userId nulo con `SetNull`, userName, text ≤ 1000, createdAt). `userName` guarda el nombre del autor para que la nota sobreviva si se elimina el usuario (6.1), mostrada entonces como «Nombre (eliminado)». Al guardar, la nota se añade arriba de una lista con fecha y hora (Madrid), autor y ✕ para eliminarla (con confirmación); el campo queda vacío.
- Se pueden añadir y eliminar en cualquier estado (no forman parte del documento, no pasan por `withDraft`). Las elimina su autor o un admin.
- Nunca van al PDF ni al snapshot.
- Al crear una revisión o duplicar, se copian las notas con su autor y fecha originales (propuesta del agente).
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
- *Reiniciar la numeración*: pasa a la serie siguiente (`""` → `B` → `C` … → `Z` → `AA`) y la cuenta vuelve al valor inicial. No toca presupuestos.
- *Borrar todos los presupuestos y reiniciar la numeración*: borra todos los presupuestos (todas sus tablas dependientes, incluidas notas y documentos emitidos), sus PDF en `DATA_DIR/pdf`, los contadores, y deja la serie en `""`. Es para limpiar datos de prueba (decisión del usuario): los números volverán a empezar y podrán coincidir con los de presupuestos borrados, y el aviso de confirmación lo dice expresamente. Es la única excepción al anti-objetivo de no repetir números. El historial de los presupuestos borrados se conserva (propuesta del agente).
- Cada una se confirma escribiendo una palabra (`REINICIAR` / `BORRAR`) en un cuadro; el botón no se activa hasta que coincide, y el servidor vuelve a comprobarla. El texto recomienda hacer antes una copia manual (`docs/despliegue.md`). Ambas quedan en el historial.

## Datos y migraciones (resumen)

| Cambio | Migración |
|---|---|
| `QuoteSection.comment` | `ADD COLUMN … DEFAULT ''` |
| `ClientLocation.city` → `installation`, `province` → `country` | `RENAME COLUMN` |
| `QuoteNote` (con `userName`, FK de usuario `SET NULL`) | tabla nueva; datos desde `Quote.travelNote`; luego `DROP COLUMN travelNote` |
| `User.signature` | `ADD COLUMN bytea NULL` |
| `AuditLog.userName`, `PriceAdjustment.userName` | `ADD COLUMN`, relleno desde `user.name`, FK a `SET NULL` |
| `CompanySettings.numberSeries`, `Quote.series` | `ADD COLUMN … DEFAULT ''`; cambio del índice único |

Los snapshots emitidos no se migran: `buildDocument` debe seguir leyendo los antiguos (sin `comment`, con `province`, sin firma).

## Lo que queda al constructor

Ancho exacto del corte en 1.1, iconos y textos menores, la forma del recorte del lienzo, el orden de las columnas de los Excel de clientes, y cómo se reparte cada bloque en tareas.

Se puede decidir al construir, sin consultar: si un concepto que solo aparece dentro de un conjunto cuenta como «usado»; qué hacer con nombres de contacto repetidos en una importación; y si la serie se puede editar a mano en Configuración.

## Decisiones tomadas por el agente (PENDIENTES DE CONFIRMAR por el usuario)

- Opción del selector de instalación: `nombre · instalación · país`, sin los vacíos.
- Notas copiadas a revisiones y duplicados: conservan el autor y la fecha originales.
- Notas y entradas del historial de un usuario eliminado: se conservan con su nombre.
- Historial de los presupuestos borrados en la puesta a cero: se conserva.
- Caducado: lo calcula `expireQuotes()` al cargar el listado o la ficha, sin tareas programadas.
- Vista previa de un borrador: firma del usuario que la mira.

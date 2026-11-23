# Bloque 7. Tipos de presupuesto, ampliaciones y nombre de los borradores — diseño

Fecha: 2026-11-18. Rama: `mejoras-uso-real`. Se hace después del Bloque 6 (`2026-11-18-bloque-6-design.md`). Maqueta: `docs/diseno/maquetas/bloque-7.html`. Cada tarea del plan sube la versión: 1.7.1, 1.7.2… Los pendientes del despliegue (antes Bloque 7) pasan a ser el **Bloque 8**.

## Intención

Que la referencia diga de qué tipo es el presupuesto y que un trabajo ya ofertado pueda ampliarse sin perder su número. Además, distinguir los borradores en el listado y en el título.

## Decidido con el usuario (2026-11-18)

### 7.1 Tipos de presupuesto

- En Administración, junto a Categorías y Unidades: tabla «Tipos de presupuesto» con **nombre** (texto libre) y **código** (entero de 1 a 999, único, mostrado con 3 cifras y centrado).
- Un tipo usado por algún presupuesto no se borra: se desactiva (y se puede reactivar) y deja de salir en el desplegable. Uno sin usar se borra con la «×». Tras la puesta a cero del Bloque 6, los tipos vuelven a estar sin usar.

### 7.2 Tablas que se guardan solas (Tipos, Categorías y Unidades)

- Sin botones «Guardar»: al cambiar un campo y salir de él, se guarda. «Guardado» aparece durante 2 s y desaparece; un error se muestra en la fila y el campo conserva lo escrito.
- «+ Añadir fila» añade una fila vacía, que se crea al salir con el nombre (y el código, en Tipos) rellenos.
- «×» borra lo no usado; lo usado muestra «Desactivar» / «Reactivar» (como hoy).
- Mismas reglas de uso que ahora para Categorías y Unidades (las usan los conceptos).

### 7.3 Referencia

`PR-{AAAA}{TTT}{NNN}-R{RR}`, por ejemplo `PR-2026001007-R00`; con ampliación, `PR-2026001007-A01-R00`.

- **Contador por tipo:** cada tipo tiene su propio contador (por año si «Reiniciar la numeración cada año» está activo). La clave única pasa a ser `(seqYear, typeCode, seq, extension, revision)`; los presupuestos antiguos, sin tipo, conservan su referencia y sus revisiones siguen funcionando.
- Las revisiones y ampliaciones **copian la base de la referencia del original** y solo cambian el sufijo, así que cambiar el patrón en Configuración nunca altera la forma de lo ya numerado.
- El patrón por defecto pasa a `PR-{AAAA}{TTT}{NNN}-R{RR}`; `{TTT}` es el código del tipo.

### 7.4 Tipo en el borrador

- Desplegable «Tipo» delante de Cliente, estrecho (calculado para un código de 3 cifras). Cerrado muestra **solo el código** («002»), así que nunca se desborda. Al abrirlo, cada opción muestra el código y, a su lado, el nombre en gris y en cursiva. Si el navegador no permite dar estilo a las opciones, la opción sale como «002 · Nombre» y, cerrado, se corta con «…».
- Solo se elige en el primer borrador de un número (también en un duplicado, que es un número nuevo; el duplicado copia el tipo). En revisiones y ampliaciones es una caja de solo lectura.
- Para emitir es obligatorio: «Falta el tipo».

### 7.5 Ampliaciones

- Botón «Nueva ampliación» junto a «Nueva revisión», solo en la **última emitida de la línea principal**.
- Crea `…-A01-R00` (la siguiente, `-A02-R00`, y así sucesivamente). Sus revisiones son `-A01-R01`, `-A01-R02`…
- Arranca con la cabecera copiada, **sin partidas y sin notas**.
- En la ampliación **no** se cambian tipo, cliente ni instalación. **Sí** se cambian fecha, validez, contacto, asunto, forma de pago y exclusiones; el responsable es automático, como siempre.
- En cuanto el presupuesto tiene una ampliación, la principal **ya no admite nuevas revisiones** (el servidor lo impide; el panel solo ofrece «Nueva ampliación»).
- Propuesto y aceptado: al crear la A02, la A01 tampoco admite nuevas revisiones; solo avanza la línea más reciente.
- «Sustituido por» funciona dentro de cada línea (una R01 sustituye a la R00 de la misma línea).

### 7.6 Recuadro «Revisiones y ampliaciones»

Variante A de la maqueta, de lo más nuevo arriba a lo más viejo abajo: la ampliación más reciente arriba, la principal siempre abajo; dentro de cada bloque, la última revisión primero. Cabecera de cada bloque: «Ampliación A02 · -A02» … «Principal · PR-2026001007».

### 7.7 Listado

Cada línea viva sale como una fila con su última revisión (la principal y cada ampliación, cada una con su estado).

### 7.8 Nombre de los borradores

El título del borrador y su enlace en el listado son «Borrador-{nombre de la instalación}»; sin instalación elegida, «Borrador».

## No objetivos

- Ampliaciones de una ampliación.
- Cambiar el tipo de algo ya emitido o revisado.
- Renumerar presupuestos antiguos.

## Anti-objetivos

- Que una referencia ya emitida cambie o se repita.
- Que una revisión de un presupuesto antiguo salga con un formato distinto del suyo.

## Datos y migraciones (resumen)

| Cambio | Migración |
|---|---|
| `QuoteType` (nombre, código único, activo) | tabla nueva |
| `Quote.typeId` (nulo en los antiguos), `Quote.extension` (entero, 0 = principal) | `ADD COLUMN`; índice único nuevo |
| `CompanySettings.numberPattern` | nuevo valor por defecto; la migración cambia el guardado solo si sigue siendo el antiguo por defecto (`PR-{AAAA}{NNNNNN}-R{RR}`) |
| `NumberCounter.key` | pasa a incluir el código del tipo |

## Lo que queda al constructor

Cómo se reparte en tareas; si el contador de 3 cifras deja crecer a 4 al pasar de 999 (como hace hoy `{N…}`, que no corta); textos menores; cómo se guarda la «base» copiada (columna propia o derivada de `reference`).

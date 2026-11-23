# Cliente en el PDF y notas del presupuesto

Fecha: 2026-11-17 · Rama: `mejoras-uso-real` · Maqueta elegida: `docs/diseno/maquetas/notas-presupuesto.html` (modelo C).

Son cuatro cambios independientes que se hacen en el mismo trabajo. Fuera de esto no se toca nada.

## 1. Bloque del cliente en el PDF

**Por qué:** el destinatario debe mostrar el cliente y su dirección fiscal. Ahora muestra la ubicación de la obra.

**Qué se hace:** el bloque del destinatario pasa a ser siempre así:

```
<Razón social del cliente>
<Dirección fiscal: una línea por cada salto de línea; las líneas vacías se omiten>
A la atención de <contacto>      ← solo si hay contacto
```

- `src/pdf/document.ts`: `recipient` = `{ name, address: textLines(client.fiscalAddress), attention }`. Desaparece `recipient.place` y no se usan la dirección ni el nombre de la ubicación. Se mantiene el resto, incluida la ubicación en la frase de la carta («…en <instalación, país>»).
- `src/pdf/templates/v1/index.ts`: la línea `.to` deja de usar `place`.
- `tests/pdf/document.test.ts`: se ajustan las expectativas del destinatario y se añade un caso con la dirección fiscal en varias líneas.

**Fuera de alcance:** los PDF emitidos se guardan en disco al emitirse y no cambian. Solo se regenera un PDF si falta su archivo; en ese caso sale con el bloque nuevo, y se acepta.

## 2. Notas del presupuesto

**Por qué:** el campo «Nota sobre el desglose» (`travelNote`) es un único texto sin autor. Se quiere un historial de notas: quién escribió cada una, cuándo, y qué cambió.

### Comportamiento

- En el panel de totales se quitan el título «Desplazamiento» y su texto de ayuda. En su lugar va el bloque «Notas»:
  - la **última nota es un botón**, con autor, fecha y hora, el número total de notas y «Ver las N notas →», que abre la ventana. Si no hay notas, no aparece;
  - debajo, una caja de texto con «Guardar nota». Solo aparece en un borrador.
- **Ventana de notas** (modelo C): flotante, abajo a la derecha, sin oscurecer el editor y con solo la ×. Funciona como un chat, de la más antigua (arriba) a la más reciente (abajo):
  - mis notas a la derecha y las de otros a la izquierda; cada una con el nombre, la fecha y la hora;
  - separadores por revisión («R0 · emitida dd/mm/aaaa», «R1 · borrador»);
  - las notas de una revisión emitida van en gris, con borde punteado y candado, y no tienen menú;
  - abajo, la caja para escribir y «Guardar nota». No aparece si el presupuesto actual está emitido.
- **Menú del mensaje** (solo para notas del borrador actual), con el texto «Editar», «Ver versiones anteriores» (solo si la nota se ha editado) y «Eliminar», sin iconos:
  - se abre con clic derecho; en pantallas táctiles, manteniendo pulsado;
  - **Editar**: el texto pasa a la caja de abajo y aparece el aviso «Editando nota de X · quedará a tu nombre» con «Cancelar» y «Guardar cambios». Al guardar, la nota queda **a nombre de quien edita, con la fecha y hora actuales**, se marca como «editado» y pasa a la derecha;
  - **Eliminar**: borra la nota y sus versiones. Cualquiera puede borrar cualquier nota del borrador (decidido por el usuario el 2026-11-17).
- **Versiones anteriores**: de la más antigua (arriba) a la actual (abajo, marcada «actual»), cada una con su autor, fecha y hora.
- **Tamaños:**
  - **Escritorio:** el bloque de notas va en la columna de totales; la ventana es flotante; las versiones salen en una ficha junto al mensaje, que se cierra con un clic fuera o con Esc.
  - **iPad**, por debajo de 1360 px: el bloque queda al final del editor, como ya ocurre con el panel; la ventana es flotante y más ancha; las versiones sustituyen al chat dentro de la ventana, con «← Notas» para volver.
  - **Móvil**, por debajo de 900 px: la ventana ocupa toda la pantalla; el menú es una hoja que sube desde abajo; las versiones ocupan también toda la pantalla, con «← Notas».

### Reglas

- Solo se crean, editan o borran notas de un presupuesto en **borrador**, y solo las notas de **ese** borrador. Todo pasa por `withDraft()`, que bloquea la fila y rechaza lo emitido. Al emitir, las notas quedan fijas sin hacer nada más.
- Una revisión nueva **no copia** notas: la ventana muestra las de toda la cadena (`parentId` hacia atrás) y solo son modificables las del borrador actual.
- Puede escribir notas cualquier usuario que pueda abrir el presupuesto. Escribir una nota no cambia el responsable del presupuesto (`ownerId`).
- El texto se valida en el servidor: no puede estar vacío una vez recortado y admite como máximo 1000 caracteres, como `travelNote`.
- Cada alta, edición y borrado queda en el historial de cambios (`logQuote`: `note.create`, `note.update`, `note.delete`).
- **Las notas son internas y nunca llegan al PDF** (decisión del usuario): `PdfSource` no las incluye y una prueba comprueba que el texto de una nota no aparece en el HTML generado.

### Datos

```prisma
model QuoteNote {
  id        String  @id @default(cuid())
  quoteId   String  // cascade al borrar el borrador
  authorId  String  // quien la escribió o la editó por última vez
  text      String  @db.Text
  edited    Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime // fecha que se muestra: la de la última edición
  versions  QuoteNoteVersion[]
}
model QuoteNoteVersion {   // textos anteriores; la versión actual es la propia nota
  id        String   @id @default(cuid())
  noteId    String   // cascade
  authorId  String
  text      String   @db.Text
  createdAt DateTime // la fecha que tenía esa versión
}
```

- Al editar, se guarda la versión anterior (`authorId`, `text` y `updatedAt` de la nota) y se actualiza la nota con el autor, el texto y la fecha nuevos y `edited = true`.
- **Migración:** cada `travelNote` no vacío pasa a ser una nota con el responsable del presupuesto (`ownerId`) como autor y la fecha `updatedAt` del presupuesto. Después se elimina la columna `travelNote` y se quita de `schema.ts`, `actions.ts` (`updateHeader`) y `lifecycle.ts` (`HEADER`).
- Las relaciones con `User` usan `onDelete: Restrict`, como el resto.

### Lo que decide quien lo construye

- Componentes: un componente de cliente para la ventana y el menú, y acciones de servidor con `ActionForm` o equivalentes, siguiendo los patrones de `presupuestos/[id]`.
- Cuánto hay que mantener pulsado (unos 500 ms) y si al guardar se desplaza el chat hasta abajo.
- Pruebas: servicio (crear, editar con versión, borrar, rechazar en emitido, rechazar notas de una revisión anterior, cadena de revisiones) y comprobación de interfaz con Claude in Chrome en los tres tamaños.

## 3. Responsable del presupuesto

**Por qué:** el responsable debe ser quien tocó el presupuesto por última vez. Ahora solo cambia al guardar la cabecera.

**Qué se hace:** cualquier escritura en un borrador (cabecera, partidas, subpartidas, líneas, conjuntos, comentarios, precios) deja `ownerId = actor.id`. Lo más sencillo es que `withDraft()` reciba al actor y lo aplique en la misma actualización que guarda los totales. **Las notas no cambian el responsable:** crearlas, editarlas o borrarlas lo deja como estaba. Emitir, crear una revisión y duplicar siguen como ahora. Hay pruebas para un cambio en una línea (cambia el responsable) y para una nota (no lo cambia).

## 4. Nota del conjunto frente a nota de la última línea

**Por qué:** en el PDF y en el editor, la nota de un conjunto sale justo después de la nota de su última línea y con el mismo aspecto, así que no se distinguen.

**PDF** (maqueta `docs/diseno/maquetas/nota-conjunto-pdf.html`, mezcla de las opciones G y K):
- **solo si el conjunto tiene nota**, sus filas (sus líneas, las notas de esas líneas y la nota del conjunto) llevan un tinte verde muy suave (`#edf5f2`, para no confundirse con el gris de la partida) en las columnas de texto, sin la de numeración. Una raya punteada fina, del mismo ancho que el tinte, cierra el bloque y debajo va la nota en cursiva y del mismo tamaño que las notas de línea (ajuste del usuario del 2026-11-17, opción B de `docs/diseno/maquetas/nota-conjunto-pdf-resalte.html`);
- la nota de una línea sigue igual que ahora: en cursiva, bajo su línea;
- un conjunto sin nota no se resalta: sale exactamente como ahora;
- no aparecen ni el nombre del conjunto ni la palabra «Conjunto».
- En código: `buildDocument` marca las filas de los conjuntos que tienen nota (por ejemplo, con `kit: true` en `PdfRow`) y la plantilla añade la clase y su estilo. La paginación no cambia: una nota sigue sin poder empezar una hoja.

**Editor** (opción E2): la nota del conjunto va en un pie gris (`--band`) separado por una raya gruesa, con la etiqueta «Comentario del conjunto» en versalitas delante del texto en cursiva. Solo cambian el estilo de `.comment.ck` y la etiqueta del componente `Comment` cuando es de tipo `kit`.

## Enfoques considerados

1. **Tablas de nota y de versión, con las revisiones enlazadas por `parentId`** (elegido): no duplica nada y la regla es simple: solo se modifica lo del borrador actual.
2. Copiar las notas a cada revisión con una marca de bloqueo: duplica las notas y su historial en cada revisión.
3. Guardar todo en un campo JSON del presupuesto: dos personas que guardan a la vez se pisan y los autores no quedan enlazados a los usuarios.

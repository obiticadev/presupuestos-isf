# Ajustes tras el uso real (2026-11-26): diseño

Rama `mejoras-uso-real`, entorno de pruebas `:3101`. Cada tarea del plan sube un parche desde 1.9.29 (1.9.30, 1.9.31…) y se sube con commit y push para revisarla en `:3101`. `master` y producción siguen exigiendo visto bueno.

Maqueta: `docs/diseno/maquetas/conjunto-dinamico-pdf-arbol.html`, variante **B3** (elegida). Las variantes P2–P5, B1 y B2 quedan como descartadas.

## Por qué

El usuario revisó la beta 1.9.29 y encontró errores visuales, un borrador que enseña dos veces lo mismo dentro de cada conjunto y dos carencias: no se puede borrar desde las listas, y en lo emitido no se pueden añadir notas ni ver el historial de estados. Quiere menos ruido y menos altura en el editor, y que borrar algo nunca deje un borrador incoherente sin avisar.

## Objetivos

1. Quitar los errores visuales señalados.
2. Un solo árbol por conjunto en el borrador (B3), igual en vista y en edición.
3. PDF A1 sin cortes en los filetes.
4. Notas internas en presupuestos emitidos e historial de estados por revisión.
5. Borrar desde las listas con una ✕ y llevar las consecuencias a los borradores y a los conjuntos de forma visible y confirmada.

## Fuera de alcance

- Agrupar o sumar líneas iguales en el PDF. El usuario lo descartó: las cantidades se ponen en cada slot, y dos artículos distintos del mismo tipo son dos slots.
- Cambiar el PDF más allá de los dos filetes de la sección B.
- Propagar a los borradores los cambios de un conjunto que no sean borrados (precio, cantidad, fórmula). La regla actual se mantiene: «Cambiar el conjunto no altera los presupuestos donde ya se usó». La única excepción es el borrado de la sección F.

## Anti-objetivos

- Que borrar algo bloquee la sección Presupuestos entera. Se bloquea solo lo afectado; el usuario lo aceptó.
- Que se pierda trabajo de un borrador sin que nadie lo confirme.
- Que un presupuesto emitido cambie. Lo emitido no se modifica.

---

## A. Errores visuales

**A1. Estado encasillado y franja de «Borrador».** Es una colisión de CSS: el editor de conjuntos dinámicos definió `.st` (filas de tipo de slot, `globals.css:740` y `:752`), y ese nombre ya era el del estado (`globals.css:66-74`). Se renombra la clase del editor de slots y sus usos en `src/app/(app)/conjuntos/forms.tsx`. Con eso:
- vuelve el estado como icono y texto en el listado, la ficha del cliente y el panel de revisiones;
- la cabecera del borrador queda en una sola línea: título, «□ Borrador» y el tipo («Instalación»). El JSX ya lo hace así (`presupuestos/[id]/page.tsx:74-77`).

**A2.** Se quitan las flechas `›`/`v` (`.kt-chev`) de las filas del editor de conjuntos. La fila seleccionada ya se distingue por su marca.

**A3.** En `.kt-rgrid`, el mensaje de error bajo «De la categoría» no debe desplazar «Cantidad»: alinear arriba (`align-items:start`).

**A4. Textos largos sin espacios** (nombre del dinámico, nombre del tipo de slot y título del panel). No deben ensanchar el panel ni crear scroll horizontal: `overflow-wrap:anywhere` y `min-width:0` en `.kt-panel` y en las filas del árbol; truncado con puntos suspensivos donde la fila es de una línea. Aplica al editor de conjuntos normales y al de dinámicos (tipos de slot).

**A5. Anchos de 1007 a 1145 px**, medidos con un script de desbordes:
- editor de conjuntos: 145 px fuera; el corte a una columna está en 1000 px y pasa a 1360 px, como `.split`;
- cabecera del borrador, campo Cliente: 53 px fuera, y el nombre largo hace la celda alta y pisa «Nombre»;
- `/admin/usuarios`: scroll de página de 290 a 428 px; la tabla va en su propio contenedor con scroll;
- `/cuenta`: la firma sale 28 px.

Comprobación: ninguna página con desbordes a 1007, 1080, 1145, 1280 y 1360 px, con el mismo script (iframe al ancho dado y elementos cuyo `scrollWidth` supera su caja), más una captura de cada página corregida.

## B. PDF A1 (`src/pdf/templates/v1/styles.ts`, `src/pdf/document.ts`)

Se mantiene el diseño A1. Dos correcciones, a partir de la captura del usuario:
1. El comentario de una línea que está dentro de un dinámico rompe el filete verde vertical. La fila del comentario debe seguir el grupo: misma sangría y mismo filete.
2. En un conjunto con comentario (fondo verde claro), los filetes horizontales de las filas agrupadas no llegan al borde: «se van comiendo». Deben ir de lado a lado, igual que fuera del grupo, y el cierre del bloque (filete discontinuo y comentario del conjunto) no debe quedar recortado.

Comprobación: un PDF de prueba con un conjunto resaltado que lleve un dinámico con comentario de línea y comentario de conjunto, revisado visualmente.

## C. Árbol único en el borrador (B3)

Hoy, un conjunto abierto enseña la lista de sus líneas (con precios y casillas) y debajo el árbol para cambiar artículos. Pasa a haber **solo el árbol** (`kq-tree`, el dibujo actual, con sus clases), con columnas nuevas:

`Elemento | Artículo | Cantidad | Precio | Importe | ⋯`

- **Importe** de cada fila. Las filas de dinámico (verde claro) llevan el subtotal del dinámico en verde. La cabecera del conjunto conserva su total.
- **«⋯» por fila**, un menú con lo que hoy va en botones: «Ver en el PDF», «Mostrar cantidad», «Cambiar precio» (solo aquí), «Comentario», «Cambiar la medida» (el lápiz actual) y «Quitar slot». Cada fila muestra solo lo que le aplica.
- **El comentario** de una línea sale debajo de su fila, dentro del árbol, como en la maqueta.
- **Vista y edición son el mismo árbol.** En vista (conjunto plegado o presupuesto no editable) los campos pierden borde y fondo, y se ocultan «Añadir slot» y las ✕ de los campos. Ninguna columna cambia de sitio. Las ramas terminan en la última fila visible.
- **Se quita la fórmula del total** («3 m × 15,00 + … = 270,90 €»), que sobra con el importe en cada fila (decisión del agente).
- **Anchos estrechos:** se conserva el apilado actual por container query. Precio e importe van en la misma línea que la cantidad.
- **No cambia** el modelo de datos, el cálculo ni las Server Actions. Es presentación más el menú. Ninguna casilla ni acción se pierde: solo cambia de sitio.

## D. Notas internas en lo emitido

Reglas:
- En el presupuesto que se está viendo **se pueden añadir notas en cualquier estado** (borrador, emitido, enviado, aceptado, rechazado, caducado).
- Las notas escritas **antes de emitir** quedan bloqueadas: no se editan ni se borran.
- Las notas añadidas **después de emitir** se pueden editar y borrar hasta que se **emite** la revisión siguiente. Crear el borrador de esa revisión no las bloquea; emitirla sí.
- Las revisiones anteriores enseñan sus notas bloqueadas, como hoy.
- Las ampliaciones empiezan sin notas. Ya es así: no tienen `parentId`.

Implementación: `src/modules/quotes/notes.ts` deja de usar `withDraft` para las notas. Usa un bloqueo equivalente (fila del presupuesto) con la nueva regla de editable por nota: nota del presupuesto visto, y (presupuesto en borrador, o nota creada después de `issuedAt`), y sin revisión hija emitida. El cálculo `editable` de `listNotes` pasa a ser por nota. Los permisos se comprueban en el servidor y se añaden pruebas de cada regla.

## E. Historial de estados por revisión

En el panel «Revisiones y ampliaciones», al pulsar una revisión se despliega debajo su historial de estados:

`Emitido · 25/11/26 14:32 · admin → Aceptado · 25/11/26 14:32 · admin`

La fuente es `AuditLog` (`entity="quote"`, `entityId` = la revisión, acciones de emisión y `status`, incluido el caducado automático, con usuario nulo y mostrado como «automático»). Orden cronológico. Sin migración.

## F. Eliminar desde las listas y sus consecuencias

### F1. La ✕

En las listas de **catálogo, clientes y conjuntos**, una ✕ al final de cada fila, para **cualquier usuario**. La ✕ **solo elimina**; desactivar sigue siendo el botón «Desactivar» de la ficha. El botón «Eliminar» de las fichas pasa a seguir la misma regla: deja de desactivar en silencio. Cada botón hace lo que dice (decisión del agente, coherente con la del usuario).

### F2. Cuándo se puede eliminar

- **Se puede** si el elemento **no aparece en ningún presupuesto emitido** (cualquier estado distinto de borrador). Da igual que esté en borradores o en conjuntos.
- **No se puede** si aparece en alguno. La ✕ sale deshabilitada con el motivo («Emitido en 3 presupuestos: solo se puede desactivar»).

### F3. Aviso previo

Antes de eliminar, una confirmación enumera qué se verá afectado:
- **producto:** los conjuntos y conjuntos dinámicos que lo usan (nombre y dónde: principal, material, variante de slot) y los borradores que lo llevan (referencia y nombre, enlazados);
- **cliente:** sus borradores;
- **conjunto:** los borradores que lo llevan y los conjuntos que lo usan como dinámico.

Botones: «Eliminar» y «Cancelar». Sin afectados, la confirmación es la de un clic actual.

### F4. Producto eliminado → borradores

En cada borrador que lo lleve:
- su línea o líneas quedan **en naranja** (ámbar `--amber-line`, el color de lo incompleto);
- arriba sale un **aviso amarillo** (el estilo de «Precios actualizados…»): «El producto X se ha borrado del catálogo», con el botón **«Confirmar»**;
- **hasta confirmar no se puede modificar nada del borrador**. El servidor lo rechaza en `withDraft`, salvo la propia confirmación. Se puede ver, previsualizar el PDF y escribir notas, pero no emitir;
- al confirmar, las líneas del producto desaparecen. Si estaban en un conjunto, el conjunto se recalcula sin ese elemento (o sin el slot).

### F5. Producto eliminado → conjuntos

- En el editor del conjunto, el elemento que lo usaba sale **en naranja**: es el estado «Incompleto» que ya existe (Bloque 3, `kitIssues`), ampliado a los productos borrados.
- En la lista de conjuntos, la fila lleva un **«!»**. En el menú lateral, «Conjuntos» lleva un **«!»** mientras haya alguno con problemas.
- Un conjunto con «!» **no se puede insertar** en un borrador hasta arreglarlo: sale en el buscador deshabilitado y con el motivo. La sección Presupuestos sigue abierta.

### F6. Cliente eliminado → borradores

Los borradores **se conservan**. En cada uno, el campo Cliente queda en naranja con un aviso amarillo («El cliente X se ha borrado: elige otro»). Hasta elegir otro cliente no se puede modificar nada más ni emitir. Al elegir uno, el contacto y la instalación se vacían si eran del cliente borrado.

### F7. Conjunto eliminado, o elemento quitado de un conjunto → borradores

Hoy un borrador guarda su copia del conjunto y no se entera de los cambios. Pasa a enterarse **de los borrados**:
- **Conjunto entero eliminado:** en cada borrador que lo lleve, el conjunto queda en naranja con un aviso amarillo y «Confirmar». Al confirmar, el conjunto se quita del borrador.
- **Elemento quitado del conjunto** (material fijo, tipo de slot, variante, dinámico), o producto borrado que el conjunto usaba: la fila afectada queda en naranja dentro del conjunto con el mismo aviso. Al confirmar, el conjunto se refresca sin ese elemento.
- Mientras haya algo por confirmar, el borrador está bloqueado como en F4.
- Los demás cambios del conjunto (precios, cantidades, fórmulas) siguen sin llegar a los borradores.

### Modelo (lo decide quien implemente, con estas condiciones)

- Lo emitido no cambia: sus líneas y su copia del conjunto siguen intactas.
- Un elemento eliminado no aparece en catálogo, buscadores, listas ni importación/exportación. Su código **se puede volver a usar** después.
- Lo pendiente de confirmar por borrador debe sobrevivir a reinicios. Es estado persistente, no calculado en cliente.
- Opción sugerida: borrado lógico (`deletedAt`) en `Concept`, `Client` y `KitTemplate`, con purga física cuando nada lo referencia, más una marca de «pendiente de confirmar» en `QuoteLine`/`KitInstance`/`Quote`. Requiere migración.
- Todas las comprobaciones de permiso y de bloqueo, en el servidor.

## Orden propuesto

A (rápido y visible) → B → D → E → C → F. F es lo más grande y lleva migración. Va al final para no frenar lo demás.

## Lo que queda para quien implemente

- Nombre nuevo de la clase de las filas de tipo de slot.
- Texto exacto de avisos y motivos (en español, claro y sin jerga).
- Detalle del modelo de F, dentro de las condiciones de arriba.
- Pruebas: Vitest para D, E y F (reglas de servidor, bloqueo, confirmación, emitidos intactos), sin borrar pruebas existentes; interfaz con Claude in Chrome a los anchos de A5.

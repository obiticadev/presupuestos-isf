# Conjunto en el borrador: buscador, árbol, medidas fijas y cambio de conjunto

Aprobado por el usuario el 2026-11-24 sobre la maqueta `docs/diseno/maquetas/conjunto-borrador.html` (variantes A2 y B1, afinadas en cuatro rondas). Rama `features`.

## Por qué

Al montar un borrador con un conjunto, hoy solo se ven los elementos que «se eligen al presupuestar». Los fijos no aparecen, así que no se sabe qué lleva el conjunto. Su medida (los 1,5 km de desplazamiento) no se puede ajustar a una obra concreta. Elegir artículos en desplegables largos o con la lista nativa del navegador es lento y no sigue el estilo de la app. Y si se elige el conjunto equivocado, hay que quitarlo y volver a montarlo.

## Qué se construye

### 1. Buscador de artículos (`Combobox`)

- Componente cliente propio (`src/components/combobox.tsx`). Sustituye a:
  - la lista nativa (`datalist`) de «Artículo del catálogo» en el editor de conjuntos;
  - los `select` de «se elige al presupuestar» del borrador;
  - la elección de conjunto en «Cambiar conjunto».
- Filtra mientras se escribe, sin distinguir mayúsculas, minúsculas ni tildes, por código, descripción y tercera columna (categoría en artículos). Resalta la coincidencia.
- Lista con el estilo de los desplegables de la app: borde de 1,5 px en tinta, filas de 9 × 12 px, separador `--rule` y fondo `--band` al pasar o al estar activa. El código va en peso 600 y el resto en 400. En la cabecera, «N de M» al filtrar.
- Teclado: ↑ ↓ mueven, Enter elige, **Tab elige la opción resaltada y pasa al siguiente campo** (petición del usuario, 2026-11-24), Esc cierra. Se abre al entrar en el campo.
- **Sin flecha.** Con algo escrito o elegido aparece una ✕ a la derecha. Al pulsarla se vacía el campo, se queda el foco en él y se abre la lista completa.
- Si al salir del campo el texto no corresponde a nada elegido, se vuelve al valor anterior. En el editor se mantiene la regla actual: un código exacto escrito a mano cuenta como elegido.

### 2. Conjunto en el borrador: árbol (B1)

- El panel «Completar / Editar» del conjunto pasa a ser un árbol con todos los elementos, en tres columnas alineadas: elemento | artículo | medida.
  - **Principal:** etiqueta con su prefijo y «Principal». Artículo fijo en gris, o buscador si se elige al presupuestar. Su medida es la cantidad N del conjunto, siempre editable, con su unidad.
  - **Materiales:** etiqueta (verde si se elige al presupuestar, gris si es fijo), nombre y, debajo, «opcional» si lo es.
    - Artículo fijo en gris, o buscador.
    - Medida:
      - escrita al presupuestar: campo editable;
      - fija: campo gris de solo lectura con ✎.
    - Unidad y forma («km en total», «ud × principal», «m × principal»).
  - **Datos del conjunto** que no son la cantidad de un material (conjuntos antiguos, p. ej. «Distancia al cuadro»): una fila con su nombre y el campo en la columna de medida.
- Líneas del árbol:
  - una vertical continua que nace en el borde inferior de la etiqueta del principal y baja centrada bajo ella;
  - un codo por material que llega al centro del borde izquierdo de su etiqueta;
  - la línea termina en el codo del último material;
  - el eje es fijo (centro de la etiqueta), aunque «opcional» alargue la fila.
- Todas las etiquetas tienen el mismo ancho, para que los nombres queden alineados.
- Anchos:
  - escritorio: columnas de 190 px | flexible | 230 px;
  - iPad (contenedor < 760 px): 186 | flexible | 196;
  - móvil (contenedor < 560 px): cada elemento apilado (nombre, artículo, medida), con el contenido sangrado y la misma geometría de líneas.
- Todo se guarda solo, como desde la 1.9.9:
  - al elegir en un buscador;
  - al salir de un campo de medida cambiado.
- Los círculos de la silueta y el aviso «Falta…» siguen al servidor tras cada guardado.
- La descripción del conjunto sigue bajo el título (1.9.9).

### 3. Medida fija modificada solo en este borrador

- El artículo de un fijo **no cambia nunca**. Solo su medida, la `k` de una fórmula `FIXED` o `PER_QTY`.
- ✎ hace el campo editable. Al salir con un valor distinto se guarda en `params` de la instancia, con la clave `k_<slot>`.
  - Sin migración: `params` ya es JSON.
  - El original sigue intacto en la copia de la definición de la instancia.
- Con medida cambiada, el campo va en ámbar. Debajo aparece «⚠ Medida cambiada solo en este borrador; el conjunto dice 1,5.» con el botón «Volver al original», que borra `k_<slot>` y recalcula.
- Cálculo (`expandKit`):
  - si hay `k_<slot>` válido (número ≥ 0, con la coma española), sustituye a `formula.k`;
  - si no es un número válido, el conjunto queda incompleto con «<Material>: medida no válida»;
  - una medida 0 deja el material fuera, como hoy cualquier cantidad 0.
- `clean()` conserva `k_<slot>` solo para materiales `FIXED`/`PER_QTY` y lo descarta si viene vacío.

### 4. Cambiar conjunto

- Botón «Cambiar conjunto» en el pie del conjunto, junto a «Quitar». Abre un buscador de conjuntos activos (código | descripción) con «Cambiar» y ✕.
- Al cambiar, la instancia toma el nombre, la plantilla y la copia de la definición del nuevo conjunto, y **se conservan**:
  - la cantidad N y el comentario;
  - la elección del principal si los dos principales tienen la misma referencia (misma categoría o mismo artículo);
  - por cada material del nuevo conjunto, lo elegido, la cantidad escrita y la medida cambiada del material del viejo con la misma referencia (emparejados en orden, cada viejo una vez). La medida cambiada solo se conserva si la fórmula es del mismo tipo;
  - los datos sueltos con la misma clave.
- Lo demás se vuelve a pedir. Las líneas se regeneran con `regenerate()`. En la misma posición y con el mismo concepto, la línea conserva su precio copiado y sus ajustes; si cambia el concepto, se descartan con aviso, como hoy. Queda en el historial: «Conjunto cambiado: A → B».
- Solo en borradores (`withDraft`) y solo a conjuntos activos.

### 5. Retoques de la 1.9.9 que se mantienen

- Etiqueta «Cantidad» sin «(N)».
- Aviso de categoría sin conceptos.
- Descripción visible.
- Guardado automático.

## Fuera de alcance

- Cambiar el artículo de un fijo.
- Avisar en el editor de conjuntos de una categoría vacía.
- Cambiar el PDF: lleva las líneas resultantes como hoy.

## Enfoques considerados

1. **Medida cambiada en `params` de la instancia (`k_<slot>`), elegido.** No toca la base de datos, el original queda en la copia de la definición y «Volver al original» es borrar una clave.
2. Columna nueva de modificaciones: separa mejor, pero exige migración en producción para lo mismo.
3. Reescribir la `k` en la copia de la definición: pierde el original, y «Volver al original» tendría que ir a la plantilla, que puede haber cambiado.

## Pruebas

- `tests/kits/formulas.test.ts`: `k_<slot>` sustituye a `k` en `FIXED` y `PER_QTY`; un valor no numérico deja el conjunto incompleto; se ignora en los materiales con cantidad escrita.
- `tests/quotes/kit-instances.test.ts`:
  - modificar y restaurar una medida recalcula el total;
  - cambiar de conjunto conserva cantidad, comentario y elecciones compatibles, recalcula, registra en el historial y rechaza un conjunto inactivo o un presupuesto emitido.
- Interfaz: Claude in Chrome a tres anchos (escritorio, iPad y móvil), midiendo la geometría de las líneas como en la maqueta.

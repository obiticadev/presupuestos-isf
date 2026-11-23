# Bloque 6. Usuarios, historial y zona de peligro — diseño

Fecha: 2026-11-18. Rama: `mejoras-uso-real`. Sustituye al apartado «Bloque 6» de `2026-11-11-mejoras-uso-real-design.md`. Maqueta: `docs/diseno/maquetas/bloque-6.html` (servir con `python -m http.server 8765` desde la raíz). Cada tarea del plan sube la versión: 1.6.1, 1.6.2… hasta la última.

## Intención

Que el administrador pueda limpiar usuarios y presupuestos de prueba sin perder quién hizo qué, y encontrar cosas en el historial. Más cuatro arreglos menores de Configuración y del PDF vistos en el uso real.

## Decidido con el usuario (2026-11-18)

- **Fuera:** las series de numeración (6.4 del diseño anterior) y «Reiniciar la numeración» sin borrar. El reinicio anual ya existe («Reiniciar la numeración cada año» en Configuración) y una revisión conserva año y número del original: no se construye nada para eso.
- Tipos de presupuesto, ampliaciones y el nombre «Borrador-{instalación}» van al **Bloque 7**, con su propio diseño. Los pendientes del despliegue pasan a ser el Bloque 8.
- Usuarios: columnas alineadas (maqueta, sección 1).
- Historial: variante **B** sin botón «Buscar»: filtra al escribir y al cambiar cada desplegable.
- Zona de peligro: variante **B** (botón que abre una ventana donde se escribe BORRAR).

## 6.1 Eliminar usuarios

En `/admin/usuarios`, la columna de acciones se parte en dos columnas de ancho fijo: la primera «Desactivar» / «Reactivar» (ya existe); la segunda «Eliminar» (botón rojo) o «N emitidos» en texto apagado.

- «Eliminar» solo aparece si el usuario no es responsable ni creador de ningún presupuesto que no sea borrador. Si lo es, se muestra «N emitidos» y solo se puede desactivar.
- No se puede eliminar a uno mismo ni al último administrador activo (misma regla que desactivar). El servidor vuelve a comprobarlo todo.
- Confirmación con `ConfirmButton`: «¿Eliminar a {nombre}? Sus N borradores pasarán a ti».
- En una transacción: sus borradores pasan al admin que elimina (`ownerId` y `createdById`); se borran sus sesiones y cuentas (ya en cascada) y el usuario; entrada en el historial «Baja» con el nombre y el email.

## 6.2 Lo que escribió un usuario conserva su nombre

Hoy `AuditLog`, `PriceAdjustment`, `QuoteNote` y `QuoteNoteVersion` apuntan al usuario con `Restrict` e impiden borrarlo. Las cuatro tablas ganan una columna de texto con el nombre (`userName` / `authorName`), que se rellena en la migración con el nombre actual y se escribe a partir de ahora en cada alta. La relación pasa a ser opcional con `onDelete: SetNull`.

Donde se muestra el autor: si la relación es nula y hay nombre, «Nombre (eliminado)»; si no hay ninguno de los dos, «Sistema» (como hoy en el historial).

Migración escrita a mano: `ADD COLUMN … DEFAULT ''`, `UPDATE … FROM "user"`, `ALTER COLUMN … DROP NOT NULL` y cambio de las FK. Sin pérdida de datos; probar sobre una copia restaurada antes de desplegar.

## 6.3 Historial filtrable

Filtros en la URL (como el catálogo), con la página que vuelve a la 1 al cambiar cualquier filtro:

- `q`: texto; busca en el resumen sin distinguir mayúsculas.
- `entidad` (como hoy), `usuario` (los usuarios actuales y los nombres de los eliminados que aparecen en el historial, más «Sistema»), `accion`, `desde` y `hasta` (días de Madrid, `hasta` incluido).

Aspecto (maqueta, variante B): buscador grande arriba; debajo, «Más filtros (N activos)» plegado con los desplegables y las fechas; los filtros activos se muestran como etiquetas con «×» y «Quitar filtros». No hay botón: la caja de texto aplica el filtro al dejar de escribir (unos 300 ms), y los desplegables y las fechas al cambiar. La página funciona también sin JavaScript (formulario GET).

## 6.4 Zona de peligro

Al final de Configuración, solo para administradores: recuadro con borde rojo (variante B). Contiene una sola acción, «Borrar todos los presupuestos…», que abre una ventana:

- Título «¿Borrar los N presupuestos?». El texto avisa de que se borran sus PDF, notas y entradas del historial, de que los números nuevos **pueden coincidir con los de presupuestos borrados** y de que no se puede deshacer, y recomienda hacer antes una copia manual (`docs/despliegue.md`).
- Para activar «Borrar» hay que escribir `BORRAR`; el servidor vuelve a comprobar la palabra y el rol.
- En una transacción: borra todos los presupuestos con sus tablas dependientes (incluidos documentos emitidos y notas), las entradas del historial con `entity = "quote"` y todos los `NumberCounter`. Fuera de la transacción, y solo si esta termina bien, borra `DATA_DIR/pdf`. Deja una entrada en el historial con quién lo hizo y cuántos presupuestos se borraron.

## 6.5 Menores

1. Configuración → Conceptos obligatorios: el desplegable «Elige un concepto activo…» no tiene el relleno de los demás (no está dentro de un `.field`). Se le aplica el mismo estilo.
2. PDF: el texto del pie de página (datos registrales y CIF) va centrado entre la fecha y «Página X de Y».
3. «Datos registrales (pie de página)» pasa a ser un campo de una sola línea; al guardar, los saltos de línea se cambian por espacios.
4. «Dirección» pasa a ser una caja de varias líneas; en la cabecera del PDF (bloque del emisor), cada línea sale en su propia línea. Lo emitido no cambia: su instantánea conserva la dirección como era.

## No objetivos

- Series, reinicio manual de la numeración, borrar presupuestos sueltos desde la zona de peligro.
- Eliminar usuarios con algo emitido.

## Anti-objetivos

- Que se pierda el nombre de quien hizo algo al eliminar a un usuario.
- Que la puesta a cero se pueda lanzar sin querer, o que deje PDF huérfanos o contadores viejos.

## Lo que queda al constructor

Cómo se reparte en tareas, textos menores, el orden de las migraciones y si `usuario` se filtra por id o por nombre (el de los eliminados solo puede ir por nombre).

# Bloque 8. Pendientes del despliegue (código)

Fecha: 2026-11-18. Rama: `mejoras-uso-real`. Último bloque de `2026-11-11-mejoras-uso-real-design.md`. Cada tarea sube la versión: 1.8.1, 1.8.2…  Diseño aprobado por el usuario el 2026-11-18.

## Por qué

Cerrar los cabos sueltos del plan 4 que se arreglan en código (`progreso.md`, «Pendiente tras el despliegue», puntos 2 y 3), con el menor cambio posible. Las comprobaciones en el servidor, el cambio de credenciales y el manual quedan fuera: son del usuario.

## Qué se hace

1. **Prueba intermitente** (`tests/quotes/kit-instances.test.ts`, «sin manguera…»): se intenta reproducir repitiendo el archivo y la suite (unas 30 pasadas). Si falla, se busca la causa y se arregla en su origen. Si no falla, se anota como no reproducible y se cierra, sin cambios a ciegas.
2. **Aviso del PDF al emitir** (spec del plan 4, 5.5.1): la página del emitido muestra «El PDF se generará al descargarlo» mientras `IssuedDocument.pdfPath` esté vacío. Se calcula a partir de los datos y no del resultado de la acción, así que sigue siendo cierto tras recargar y desaparece cuando la descarga lo genera.
3. **Paginación** (`src/pdf/templates/v1/paginate.ts`), al llevar el cierre a una hoja nueva:
   - una partida o subpartida no se queda sola al pie de la hoja anterior: vuelve con lo que encabeza;
   - una nota no abre la hoja del cierre ni se queda sola con él, separada de la fila que comenta;
   - **un cierre más alto que una hoja continúa en la página siguiente** (decisión del usuario), con la cabecera y el pie de siempre, en vez de cortarse. Solo pasa con condiciones muy largas: las exclusiones admiten 8.000 caracteres.
4. **`scripts/backup.sh`**: el código 1 de GNU `tar` («un archivo cambió mientras se leía») se acepta con un aviso en el log, porque el archivo sigue siendo válido. Cualquier otro código sigue haciendo fallar la copia.
5. **Versión de Playwright**: no se toca el `Dockerfile`. Una prueba falla si la versión de `playwright-core` del `Dockerfile` no coincide con la de `package.json`.

## Enfoques considerados

- Aviso del PDF: devolverlo desde `issueAction` (se pierde al recargar y hay que pasarlo por `ActionResult`) o **deducirlo de `pdfPath`** (elegido: sin cambiar la acción y siempre cierto).
- Cierre largo: **dejar que siga en otra página** (elegido por el usuario) o impedir emitir (habría que generar el PDF antes de emitir y no se puede medir en el servidor sin el navegador).
- Playwright: leer la versión de `package.json` dentro del `Dockerfile` (cambia la imagen de producción) o **una prueba que compare las dos** (elegido: no hay riesgo para la imagen).

## Anti-objetivos

Perder texto del PDF, romper la paginación que ya funciona (hay pruebas en `tests/pdf/pdf-content.test.ts`), y que una copia fallida parezca buena.

## Lo que queda al constructor

El texto exacto del aviso en el log de la copia, el número de pasadas de la prueba intermitente y cómo se construyen los casos de prueba de la paginación.

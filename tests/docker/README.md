# Pruebas de copias y restauración

Desde la raíz del repositorio, con Docker disponible:

```sh
docker run --rm --env T7_SCRIPT_TEST_CONTAINER=1 \
  --tmpfs /backups --tmpfs /data \
  --mount "type=bind,source=$(pwd),target=/repo,readonly" \
  postgres:17 sh /repo/tests/docker/backup-scripts.sh
```

En Git Bash, anteponer `MSYS_NO_PATHCONV=1` y sustituir `$(pwd)` por la ruta Windows del repositorio, por ejemplo `D:/dev/presupuestos-isf`.

No usa la base de datos ni los volúmenes de la aplicación: simula las órdenes de PostgreSQL y usa archivos temporales dentro del contenedor. Los mensajes de error son intencionados; la última línea debe empezar por `OK:` y la orden debe terminar con código 0.

Comprueba fallos de volcado y archivo, limpieza de temporales, retención de 30 copias de cada tipo, permisos privados, colisiones del mismo minuto, exclusión mutua entre copia y restauración, rechazo de una app encendida o de conexiones abiertas, prevalidación del archivo, restauración de archivos, continuidad del bucle después de fallar y el salto horario de primavera.

Esto **no sustituye** la prueba con PostgreSQL real y PDF dentro de la imagen ni la revisión con Claude in Chrome. Los resultados de la Tarea 7 están en `docs/superpowers/progreso.md`.

## Contenido de la imagen

Después de construir la imagen con `docker compose -p presupuestos-t7 -f compose.yaml build app`, comprobar el usuario sin privilegios, la fuente, el paquete completo de Playwright y la generación real de un PDF:

```sh
docker run --rm --entrypoint node \
  --mount "type=bind,source=$(pwd)/tests/docker/runtime-smoke.mjs,target=/app/runtime-smoke.mjs,readonly" \
  presupuestos-t7-app runtime-smoke.mjs
```

No accede a la BD ni monta `appdata`. En Git Bash se aplica la misma indicación sobre rutas que arriba.

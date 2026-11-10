# Operación

## Arranque local

Requisitos: Node 24 (también funciona con 25), pnpm 12 y Docker.

> La ruta del proyecto no puede contener `#`: Vite/Vitest no la admite. Por eso el código se trabaja en `D:\dev\presupuestos-isf`.

```bash
cp .env.example .env            # y cambia BETTER_AUTH_SECRET por 32+ caracteres aleatorios
docker compose up -d db         # PostgreSQL de desarrollo en localhost:5433 (compose.override.yaml)
pnpm install
pnpm exec playwright-core install chromium-headless-shell   # navegador del PDF (una vez por equipo)
pnpm db:migrate                 # aplica las migraciones a la BD de desarrollo
pnpm exec prisma generate       # Prisma 7 no regenera el cliente tras migrate dev
pnpm admin create --email tu@isf-esp.com --name "Tu nombre"
pnpm dev                        # http://localhost:3000
```

Las pruebas (`pnpm test`) usan la base `presupuestos_test` del mismo contenedor y la vacían en cada ejecución.

> El 5432 del equipo puede estar ocupado por un PostgreSQL instalado en Windows. Por eso el de Docker se publica en el 5433.

## Primer administrador

No hay registro público. El primer administrador se crea por consola:

```bash
pnpm admin create --email admin@isf-esp.com --name "Administración"
```

La contraseña se pide por teclado sin mostrarse (mínimo 10 caracteres). Para scripts, se puede pasar en la variable `ADMIN_PASSWORD`. Nunca se pasa como argumento, porque quedaría en el historial.

Después, ese administrador da de alta al resto desde **Administración → Usuarios**.

## Recuperar el acceso

Si un administrador olvida su contraseña o queda desactivado:

```bash
pnpm admin reset-password --email admin@isf-esp.com
```

Cambia la contraseña, reactiva al usuario y cierra todas sus sesiones abiertas.

## Dentro del contenedor

Con la aplicación desplegada en Docker, los mismos comandos se ejecutan dentro del contenedor `app` con el CLI ya empaquetado (`scripts/admin.mjs`):

```bash
docker compose exec app node scripts/admin.mjs create --email admin@isf-esp.com --name "Administración"
docker compose exec app node scripts/admin.mjs reset-password --email admin@isf-esp.com
```

Sin terminal interactiva (por ejemplo, desde Dokploy), pasa la contraseña con `-e ADMIN_PASSWORD=…`.

## Docker

```bash
docker compose -f compose.yaml up -d --build   # db → migrate → app
docker compose -f compose.yaml ps              # migrate: Exited (0); app: healthy
```

Las migraciones las aplica el servicio `migrate` en cada arranque (`prisma migrate deploy`). La app no arranca si fallan.

## Actualizar la versión

Producción la despliega Dokploy desde `master` (ver `docs/despliegue.md`). Para publicar una versión:

1. Fusionar el PR en `master`.
2. Si la versión trae migraciones nuevas (`prisma/migrations`), hacer antes una **copia en el momento** en el servidor: `docker compose -p presupuestos-isf-app-oy9un2 -f compose.yaml exec backup /scripts/backup.sh now`.
3. En Dokploy, **Deploy** del Compose. `migrate` aplica las migraciones antes de arrancar la app.
4. Comprobar `http://192.168.105.83:3100/api/health` y abrir un presupuesto.

## Revertir

Volver a desplegar el commit anterior **no revierte las migraciones**: la base de datos se queda con el esquema nuevo y la versión anterior puede fallar. Si la versión que se quiere quitar migró la base:

1. Desplegar el commit anterior.
2. Restaurar la copia hecha justo antes de actualizar (apartado «Restauración» de `docs/despliegue.md`). Se pierde lo que se hiciera entre la actualización y la restauración.

Si no había migraciones, basta con desplegar el commit anterior.

## Navegador del PDF

Los PDF se generan con el *headless shell* de Chromium de `playwright-core`. En la imagen Docker ya viene instalado. En desarrollo hay que instalarlo una vez por equipo:

```bash
pnpm exec playwright-core install chromium-headless-shell
```

Sin él, las pruebas del PDF fallan con un mensaje que dice cómo instalarlo.

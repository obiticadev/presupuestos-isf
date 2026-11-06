# Operación

## Arranque local

Requisitos: Node 24 (también funciona con 25), pnpm 12 y Docker.

> La ruta del proyecto no puede contener `#`: Vite/Vitest no la admite. Por eso el código se trabaja en `D:\dev\presupuestos-isf`.

```bash
cp .env.example .env            # y cambia BETTER_AUTH_SECRET por 32+ caracteres aleatorios
docker compose up -d db         # PostgreSQL de desarrollo en localhost:5433 (compose.override.yaml)
pnpm install
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

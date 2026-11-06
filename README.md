# Presupuestos ISF

Aplicación web interna de presupuestos de ISF: catálogo → cliente → presupuesto → PDF corporativo. Solo se usa desde la red de la oficina.

Estado: base (plan 1) con inicio de sesión, roles, usuarios, historial y configuración de empresa e impuestos. El catálogo, los clientes, los presupuestos y el PDF llegan en los planes 2 a 4 (`docs/superpowers/plans/`).

## Requisitos

- Node 24 y pnpm 12 (`npm i -g pnpm@12.18.0`)
- Docker con Compose
- Una ruta de proyecto **sin `#`**: Vite/Vitest no la admite.

## Arranque local

```bash
cp .env.example .env        # cambia BETTER_AUTH_SECRET y las contraseñas
docker compose up -d db     # PostgreSQL de desarrollo en localhost:5433
pnpm install
pnpm db:migrate && pnpm exec prisma generate
pnpm admin create --email tu@isf-esp.com --name "Tu nombre"
pnpm dev                    # http://localhost:3000
```

Más detalle (primer administrador, recuperar el acceso) en [`docs/operacion.md`](docs/operacion.md).

## Pruebas

```bash
pnpm test     # Vitest contra la base presupuestos_test (se vacía en cada ejecución)
pnpm lint
pnpm build
```

## Docker

```bash
docker compose -f compose.yaml up -d --build
curl http://localhost:3000/api/health      # {"status":"ok"}
```

- `db`: PostgreSQL 17 con el volumen `pgdata`, sin puertos publicados.
- `migrate`: aplica las migraciones (`prisma migrate deploy`) y termina.
- `app`: arranca cuando `migrate` termina bien. Guarda los archivos (logo y, más adelante, PDF) en el volumen `appdata` (`/data`).

`compose.override.yaml` publica PostgreSQL en el 5433 y solo se usa en desarrollo (sin `-f compose.yaml`). El despliegue en Dokploy, HTTPS y las copias de seguridad llegan en el plan 4.

## Estructura

```
src/app/                 páginas y rutas (App Router)
src/modules/<módulo>/    schema.ts (Zod) · service.ts (lógica y permisos) · actions.ts (Server Actions)
  auth/                  Better Auth, roles, sesión y CLI de administración
  audit/                 historial de acciones
  users/                 gestión de usuarios
  settings/              empresa, textos, logo e impuestos
src/lib/                 BD, errores, decimales y validación
prisma/                  esquema y migraciones
scripts/admin.ts         CLI: create / reset-password
tests/                   pruebas (Vitest)
docs/                    diseño, planes, diseño visual y operación
```

Los permisos se comprueban siempre en el servidor, dentro de cada `service.ts`. Los importes van en `Decimal`, nunca en float.

# Presupuestos ISF

Aplicación web interna de presupuestos de ISF: catálogo → cliente → presupuesto → PDF corporativo. Solo se usa desde la red de la oficina.

Estado:
- **Plan 1, base:** inicio de sesión, roles, usuarios, historial y configuración.
- **Plan 2, catálogo y clientes:** conceptos con categorías y unidades editables, importación y exportación en Excel, y clientes con contactos, ubicaciones y condiciones.
- **Plan 3, presupuestos:** conjuntos configurables, editor con partidas y líneas, ajustes de precio con motivo, emisión con numeración, estados, revisiones, duplicado y listado con filtros.
- **Plan 4, PDF y despliegue:** PDF corporativo con Chromium (el del emitido se genera una vez y se guarda con su SHA-256; el borrador lleva marca de agua), imagen Docker, despliegue en Dokploy en `http://192.168.105.83:3100` y copias diarias con su restauración. Ver [`docs/despliegue.md`](docs/despliegue.md).

## Requisitos

- Node 24 y pnpm 12 (`npm i -g pnpm@12.18.0`)
- Docker con Compose
- Navegador del PDF: `pnpm exec playwright-core install chromium-headless-shell` (una vez por equipo)
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
curl http://localhost:3100/api/health      # {"status":"ok"}
```

- `db`: PostgreSQL 17 con el volumen `pgdata`, sin puertos publicados.
- `migrate`: aplica las migraciones (`prisma migrate deploy`) y termina.
- `app`: arranca cuando `migrate` termina bien, en el puerto `${APP_PORT:-3100}`. Guarda los logos y los PDF emitidos en el volumen `appdata` (`/data`). Lleva Chromium para el PDF.
- `backup`: copia diaria a las 02:00 de la base de datos y de `appdata` en `${BACKUP_DIR}`; conserva 30 de cada.

`compose.override.yaml` publica PostgreSQL en el 5433 y solo se usa en desarrollo (sin `-f compose.yaml`). `compose.restore.yaml` solo sirve para restaurar una copia. Despliegue, copias y restauración: [`docs/despliegue.md`](docs/despliegue.md).

## Estructura

```
src/app/                 páginas y rutas (App Router)
src/modules/<módulo>/    schema.ts (Zod) · service.ts (lógica y permisos) · actions.ts (Server Actions)
  auth/                  Better Auth, roles, sesión y CLI de administración
  audit/                 historial de acciones
  users/                 gestión de usuarios
  settings/              empresa, textos, logo e impuestos
  catalog/               categorías, unidades, conceptos e importación/exportación en Excel (excel.ts, import.ts)
  clients/               clientes, contactos y ubicaciones
  kits/                  conjuntos (plantillas) y sus fórmulas (formulas.ts)
  quotes/                presupuestos: cálculo (calculation.ts), borradores (service.ts), conjuntos insertados
                         (kit-instances.ts), emisión (issue.ts), numeración (numbering.ts) y ciclo de vida (lifecycle.ts)
src/pdf/                 PDF: Chromium compartido (browser.ts, render.ts), modelo del documento (document.ts)
                         y plantilla versionada (templates/v1, con la paginación de la hoja de partidas)
src/lib/                 BD, errores, decimales y validación
prisma/                  esquema y migraciones
scripts/admin.ts         CLI: create / reset-password
scripts/backup.sh        copias (loop | now) · scripts/restore.sh: restauración
tests/                   pruebas (Vitest)
docs/                    diseño, planes, diseño visual y operación
```

Los permisos se comprueban siempre en el servidor, dentro de cada `service.ts`. «Eliminar» un concepto o un cliente lo borra si nada lo usa y, si una clave foránea lo impide, lo desactiva (`src/lib/delete-or-deactivate.ts`). La plantilla de importación del catálogo se descarga desde `/catalogo/importar`. Los importes van en `Decimal`, nunca en float.

## Presupuestos

- **Cálculo.** Todo pasa por `src/modules/quotes/calculation.ts`, un módulo puro: redondeo «half-up» a 2 decimales por línea y por tipo de impuesto. Una línea con precio pero sin impuesto cuenta como sin valorar y no suma.
- **Borradores.** Toda escritura pasa por `withDraft()`, que bloquea la fila, comprueba que sigue en borrador y recalcula los totales. Lo emitido no se modifica.
- **Emisión.** Comprueba lo que falta (`issueChecks`, el panel «Para emitir»), asigna el número y guarda una instantánea JSON inmutable en `IssuedDocument`, de la que saldrá el PDF.
- **Numeración.** Patrón configurable en Configuración (por defecto `PR-{AAAA}{NNNNNN}-R{RR}`, sin reinicio anual, desde 1). El contador es una fila de `NumberCounter` que se incrementa dentro de la transacción de emisión: sin huecos ni duplicados con emisiones a la vez. El valor inicial solo cuenta mientras no existe el contador. Las revisiones conservan el número y suben `R{RR}`.
- **Revisiones.** «Nueva revisión» crea un borrador R+1; al emitirlo, la anterior queda «Sustituida» y ya no cambia de estado. El listado solo muestra la última revisión de cada número, más los borradores.
- **Conceptos obligatorios.** Se configuran en Configuración. Cada presupuesto debe llevarlos con cantidad mayor que cero, o marcarlos a 0 con motivo.

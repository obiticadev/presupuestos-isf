# AGENTS.md

Instrucciones para agentes de IA que trabajan en este proyecto.

## Proyecto

Aplicación web interna de presupuestos de ISF (catálogo → cliente → presupuesto → PDF corporativo). Se usa solo desde la red de la oficina y se despliega con Dokploy, con datos persistentes.

## Documentos de referencia (leer antes de trabajar)

- Diseño aprobado: `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md`
- Planes de implementación, en este orden:
  1. `docs/superpowers/plans/2026-11-06-plan-1-base.md`: proyecto, BD, autenticación, usuarios, historial, configuración y Docker.
  2. `docs/superpowers/plans/2026-11-06-plan-2-catalogo-clientes.md`: categorías, unidades, conceptos, Excel y clientes.
  3. `docs/superpowers/plans/2026-11-06-plan-3-presupuestos.md`: cálculo, conjuntos, editor, emisión, revisiones y listado.
  4. `docs/superpowers/plans/2026-11-10-plan-4-pdf-despliegue.md`: PDF, Dokploy y copias de seguridad (pendiente de revisión). Su diseño: `docs/superpowers/specs/2026-11-10-plan-4-pdf-despliegue-design.md`.
- Diseño visual elegido («Esquema unifilar»): `docs/diseno/README.md` y `docs/diseno/maquetas/`. El contrato de dirección está en `.impeccable/surfaces/src-app.md`.
- Contexto de producto: `PRODUCT.md`.

## Estado actual

**El detalle completo (cronología, cómo retomar en otro equipo, decisiones tomadas y pendientes) está en `docs/superpowers/progreso.md`. Léelo antes de seguir.**

- Ramas:
  - `master` tiene los planes 1, 2 y 3 (PR #3 fusionado el 2026-11-10).
  - `plan-4-pdf-despliegue`, desde `master`: plan 4 **en ejecución**.
- Plan 4 (PDF, Dokploy y copias): **tareas 1 a 6 hechas y revisadas; Tarea 7 preparada y validada técnicamente, con revisión en Claude in Chrome pendiente por petición del usuario; falta la 8.** El traspaso completo está en `docs/superpowers/progreso.md`, sección «Plan 4: en ejecución». Léela antes de tocar nada.
  - Diseño: `docs/superpowers/specs/2026-11-10-plan-4-pdf-despliegue-design.md` (5.3.1 hoja de partidas B con cierre al pie y «Firma y sello»; 5.11 despliegue por IP y puerto y copias en el propio servidor).
  - Plan: `docs/superpowers/plans/2026-11-10-plan-4-pdf-despliegue.md`, 8 tareas.
  - Dokploy v0.31.0 en `192.168.105.83:3000`; servicio Compose «Presupuestos», `composeId F5SwbOFCyMb7tDSn0xQZk`, que todavía apunta a `./docker-compose.yml` (hay que cambiarlo a `./compose.yaml`). API con la cabecera `x-api-key`; el token está en `~/.dokploy-token` del equipo del usuario, nunca en el repositorio.
  - **Fusionar en `master` y desplegar en Dokploy exige el visto bueno explícito del usuario.**
- Siguiente paso: revisión pendiente de la Tarea 7 con Claude in Chrome; después, Tarea 8 (documentación, verificación completa, revisión final de la rama y PR) y, con el visto bueno del usuario, el despliegue. Para restaurar, usar `-f compose.yaml -f compose.restore.yaml` y el mismo proyecto `-p`: el override habilita escritura en el volumen correcto; nunca se usa para `up`.
- El código se trabaja en una ruta sin `#` (worktree `D:\dev\presupuestos-isf` en el equipo original): Vite/Vitest no admiten el `#` de `D:\# Otros\...`. En el equipo Linux, Node 24 y pnpm van fijados en `mise.local.toml` (no se sube).
- Reglas aprendidas:
  - Ningún rol tiene permisos del plugin admin de Better Auth: todo pasa por los servicios.
  - Prisma 7 no regenera el cliente tras `migrate dev`: ejecuta `pnpm exec prisma generate` y **reinicia `pnpm dev`**.
  - La BD de desarrollo está en el puerto 5433.
  - Las pruebas se ejecutan con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`; solo reinician `presupuestos_test`.
  - Formularios con `ActionForm` (`src/components/action-form.tsx`), que conserva lo escrito ante un error del servidor.
  - Toda escritura de un borrador pasa por `withDraft()`. Lo emitido no se modifica.
  - Las pruebas de interfaz se hacen con Claude in Chrome. El progreso se registra a mano en claude-mem y en `progreso.md`.
  - Al reescribir `AGENTS.md` o `progreso.md` desde un script, conserva sus saltos de línea CRLF.
  - Para matar el servidor desde Bash usa un patrón que no se encuentre a sí mismo: `pkill -f '[n]ext dev'`.

Actualiza esta sección cuando cambie el estado.

## Stack

Node 24, pnpm, Next.js 16, React 19, TypeScript 5.9, PostgreSQL 17, Prisma 7, Better Auth, Zod 4, Vitest y Docker Compose. Las versiones exactas están en el plan 1.

## Convenciones

- Código en inglés; interfaz y documentación en español.
- Importes con decimales exactos, nunca float.
- Los permisos se comprueban siempre en el servidor.

## Material de referencia

Los archivos originales (Word, PDF, Excel, .msg) se preservan: no se modifican ni se borran. Están excluidos de Git en `.gitignore` porque contienen datos reales. El repositorio de GitHub (`obiticadev/presupuestos-isf`) es privado.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

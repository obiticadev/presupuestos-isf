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
  4. PDF, Dokploy y copias de seguridad (por escribir).
- Diseño visual elegido («Esquema unifilar»): `docs/diseno/README.md` y `docs/diseno/maquetas/`. El contrato de dirección está en `.impeccable/surfaces/src-app.md`.
- Contexto de producto: `PRODUCT.md`.

## Estado actual

**El detalle completo (cronología, cómo retomar en otro equipo, decisiones tomadas y pendientes) está en `docs/superpowers/progreso.md`. Léelo antes de seguir.**

- Ramas:
  - `master` ya tiene el plan 1 (PR #1 fusionado).
  - El plan 2 se fusionó en `plan-1-base` (PR #2), no en `master`.
  - `plan-3-presupuestos` (plan 3 en curso) lleva los planes 2 y 3; su PR #3 contra `master` es el que llevará ambos a `master`.
- Plan 3:
  - Tareas 1 a 5 terminadas y probadas en Chrome: cálculo, conjuntos, borradores, conjuntos en el presupuesto, ajustes de precio y editor.
  - Tareas 6 y 7 (emisión y numeración; estados, revisiones, duplicado y listado): servicios y pruebas hechos (174 pruebas en verde). Interfaz hecha: panel «Para emitir», editor de emitidos (estado, revisión, duplicado, historial) y nombres en `/admin/historial` y listado en `/`. **Falta la configuración (numeración y obligatorios) y el cierre**, con la lista exacta en `progreso.md`, sección «Pendiente».
- Siguiente paso: terminar la interfaz de las tareas 6 y 7 y cerrar el plan 3 (build, Chrome, revisión final). Después, escribir el plan 4 (PDF, Dokploy y copias).
- El código se trabaja en una ruta sin `#` (worktree `D:\dev\presupuestos-isf` en el equipo original): Vite/Vitest no admiten el `#` de `D:\# Otros\...`.
- Reglas aprendidas:
  - Ningún rol tiene permisos del plugin admin de Better Auth: todo pasa por los servicios.
  - Prisma 7 no regenera el cliente tras `migrate dev`: ejecuta `pnpm exec prisma generate` y **reinicia `pnpm dev`**.
  - La BD de desarrollo está en el puerto 5433.
  - Las pruebas se ejecutan con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`; solo reinician `presupuestos_test`.
  - Formularios con `ActionForm` (`src/components/action-form.tsx`), que conserva lo escrito ante un error del servidor.
  - Toda escritura de un borrador pasa por `withDraft()`. Lo emitido no se modifica.
  - Las pruebas de interfaz se hacen con Claude in Chrome. El progreso se registra a mano en claude-mem y en `progreso.md`.

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

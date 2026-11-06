# AGENTS.md

Instrucciones para agentes de IA que trabajan en este proyecto.

## Proyecto

Aplicación web interna de presupuestos de ISF (catálogo → cliente → presupuesto → PDF corporativo). Se usa solo desde la red de la oficina y se despliega con Dokploy, con datos persistentes.

## Documentos de referencia (leer antes de trabajar)

- Diseño aprobado: `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md`
- Planes de implementación, en este orden:
  1. `docs/superpowers/plans/2026-11-06-plan-1-base.md`: proyecto, BD, autenticación, usuarios, historial, configuración y Docker.
  2. Catálogo y clientes (por escribir).
  3. Presupuestos: cálculo, conjuntos, editor, emisión y revisiones (por escribir).
  4. PDF, Dokploy y copias de seguridad (por escribir).
- Diseño visual elegido («Esquema unifilar»): `docs/diseno/README.md` y `docs/diseno/maquetas/`. El contrato de dirección está en `.impeccable/surfaces/src-app.md`.
- Contexto de producto: `PRODUCT.md`.

## Estado actual

- Plan 1 (base) implementado en la rama `plan-1-base`: 7 tareas, 51 pruebas en verde, build y Docker verificados. Probado en el navegador el 2026-11-06; los fallos encontrados están corregidos (notas #11 y #12 de claude-mem). Falta decidir la integración en `master`.
- El código se trabaja en el worktree `D:\dev\presupuestos-isf`: Vite/Vitest no admite el `#` de `D:\# Otros\...`. La carpeta original sigue en `master` con los materiales originales.
- Siguiente paso: escribir el plan 2 (catálogo y clientes).
- Reglas aprendidas en el plan 1:
  - Ningún rol tiene permisos del plugin admin de Better Auth: todo pasa por los servicios.
  - Prisma 7 no regenera el cliente tras `migrate dev`, así que hay que ejecutar `pnpm exec prisma generate` y reiniciar `pnpm dev`.
  - La BD de desarrollo está en el puerto 5433.

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

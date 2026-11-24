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
  4. `docs/superpowers/plans/2026-11-10-plan-4-pdf-despliegue.md`: PDF, Dokploy y copias de seguridad (terminado y desplegado). Su diseño: `docs/superpowers/specs/2026-11-10-plan-4-pdf-despliegue-design.md`.
- Diseño visual elegido («Esquema unifilar»): `docs/diseno/README.md` y `docs/diseno/maquetas/`. El contrato de dirección está en `.impeccable/surfaces/src-app.md`.
- Contexto de producto: `PRODUCT.md`.

## Estado actual

**El detalle completo (cronología, cómo retomar en otro equipo, decisiones tomadas y pendientes) está en `docs/superpowers/progreso.md`. Léelo antes de seguir.**

- Ramas:
  - `master` tiene los planes 1 a 4 y las mejoras tras el uso real, Bloques 1 a 8 y 1.8.7 (PR #7 fusionado y desplegado en producción el 2026-11-23).
  - `mejoras-uso-real` sigue como rama del entorno de pruebas `:3101` (autodespliegue, `APP_CHANNEL=beta`).
  - `features` (desde `master` en `1930e79`): **nueva pestaña Conjuntos terminada (2026-11-24, 1.9.0 → 1.9.8), pendiente de la revisión del usuario.** Diseño `docs/superpowers/specs/2026-11-24-conjuntos-design.md`, plan `docs/superpowers/plans/2026-11-24-conjuntos.md` (sus «Decisiones del usuario» mandan sobre la spec). Incluye eliminar conjuntos sin usar e historial de versiones. Se revisa en local (`pnpm dev` + Claude in Chrome); `:3101` sigue en `mejoras-uso-real`. No se fusiona en `master` sin visto bueno.
  - `mejoras-uso-real`: mejoras tras el primer uso real (diseño `docs/superpowers/specs/2026-11-11-mejoras-uso-real-design.md`, 7 bloques). **Bloques 1 y 2 cerrados** (2026-11-12). **Bloque 3 cerrado y aprobado (2026-11-17)**: catálogo e importaciones para todos, «Sin cambios», importación completa solo de administradores, historial de versiones del concepto, conjuntos incompletos y revisiones con precios al día (diseño `docs/superpowers/specs/2026-11-13-mejoras-bloque-3-design.md`, plan `docs/superpowers/plans/2026-11-13-mejoras-bloque-3-catalogo.md`; detalle y menores aplazados en `progreso.md`). **Bloques 4 y 5 cerrados y aprobados (2026-11-18, versión 1.5.0)**: caducado automático cada hora por días de Madrid, «Mi cuenta» con contraseña y firma dibujada, emitir exige firma y el PDF lleva sello y firma de quien emite (diseño `docs/superpowers/specs/2026-11-18-bloques-4-5-design.md`, plan `docs/superpowers/plans/2026-11-18-bloques-4-5.md`). **Diseños de los Bloques 6 y 7 aprobados (2026-11-18)**: `docs/superpowers/specs/2026-11-18-bloque-6-design.md` y `docs/superpowers/specs/2026-11-18-bloque-7-design.md`, con maquetas `docs/diseno/maquetas/bloque-6.html` y `bloque-7.html`; los pendientes del despliegue pasan a ser el Bloque 8. **Bloque 6 cerrado y aprobado (2026-11-18, 1.6.4; plan `docs/superpowers/plans/2026-11-18-bloque-6.md`). Bloque 7 cerrado y aprobado (2026-11-18, 1.7.4; plan `docs/superpowers/plans/2026-11-18-bloque-7.md`). Bloque 8 terminado (2026-11-19, 1.8.5; diseño `docs/superpowers/specs/2026-11-18-bloque-8-design.md`, plan `docs/superpowers/plans/2026-11-18-bloque-8.md`), pendiente de la revisión del usuario; con él se acaban los bloques de `mejoras-uso-real`.** Cada tarea de un plan sube un parche de la versión (1.6.1, 1.6.2…). **Hecho el 2026-11-17 fuera de bloque:** cliente con dirección fiscal en el PDF, notas internas tipo chat (`QuoteNote`), responsable = quien modifica el borrador y nota del conjunto resaltada (diseño `docs/superpowers/specs/2026-11-17-cliente-pdf-y-notas-design.md`, plan `docs/superpowers/plans/2026-11-17-cliente-pdf-y-notas.md`). Se trabaja aquí con push a esta rama y revisión en el entorno de pruebas del servidor; `master` y producción siguen exigiendo visto bueno explícito.
  - **Entorno de pruebas autorizado y creado el 2026-11-17:** `http://192.168.105.83:3101`, rama `mejoras-uso-real`; Dokploy → «Presupuestos ISF» → `pruebas` → «Presupuestos - PRUEBAS», `composeId e3Bkaq88xSYluN9dqrdZ6`, proyecto Compose `presupuestos-isf-pruebas-1uwipl`. BD, archivos, secretos y copias independientes; datos ficticios nuevos. Operación: `docs/despliegue-pruebas.md`; accesos: `ACCESOS-PRUEBAS.local.md` en la raíz (ignorado por Git). **Consulta automática cada 5 minutos desde cron de `isf` en el servidor**, con copia previa y despliegue solo si cambia la rama; respeta el interruptor Auto Deploy de Dokploy. El webhook de GitHub no llega a la IP privada. No requiere levantar la app en el portátil. Sesiones independientes en el mismo navegador: `BETTER_AUTH_COOKIE_PREFIX=isf-pruebas` en pruebas y `better-auth` por defecto en producción; no hace falta incógnito.
- Plan 4 (PDF, Dokploy y copias): **terminado y desplegado** en `http://192.168.105.83:3100` (2026-11-10). Quedan comprobaciones en el servidor y errores por revisar.
  - Dokploy v0.31.0 en `192.168.105.83:3000`; servicio Compose «Presupuestos», `composeId F5SwbOFCyMb7tDSn0xQZk`, `appName presupuestos-isf-app-oy9un2`, `composePath ./compose.yaml`. API con la cabecera `x-api-key`; el token está en `~/.dokploy-token` del equipo del usuario, nunca en el repositorio. SSH: `ssh -i ~/.ssh/isf_dokploy isf@192.168.105.83`.
  - **Fusionar en `master` y desplegar producción en Dokploy exige el visto bueno explícito del usuario.** El entorno independiente de pruebas de `mejoras-uso-real` sí está autorizado.
- **Para un chat nuevo: empieza por `docs/superpowers/progreso.md`, sección «Mejoras tras el uso real», y después «Pendiente tras el despliegue (revisar)».** Resumen de lo segundo:
  - interfaz: textos cortados en el editor (resuelto en `mejoras-uso-real`, Bloque 1);
  - en producción: emisión de prueba, reinicio y redespliegue, estado del contenedor `backup` y prueba de restauración (SSH `isf` ya tiene acceso a Docker, comprobado el 2026-11-17);
  - seguridad: rotar las credenciales que se pegaron en el chat;
  - manual de usuario: decidir si sus scripts van al repositorio y retirar la instancia local `presupuestos-manual`.
- Siguiente paso: revisar y corregir lo de «Pendiente tras el despliegue». Despliegue, copias y restauración: `docs/despliegue.md`. Para restaurar, usar `-f compose.yaml -f compose.restore.yaml` y el mismo proyecto `-p`: el override habilita escritura en el volumen correcto; nunca se usa para `up`.
- El código se trabaja en una ruta sin `#` (worktree `D:\dev\presupuestos-isf` en el equipo original): Vite/Vitest no admiten el `#` de `D:\# Otros\...`. En el equipo Linux, Node 24 y pnpm van fijados en `mise.local.toml` (no se sube).
- Reglas aprendidas:
  - Ningún rol tiene permisos del plugin admin de Better Auth: todo pasa por los servicios.
  - Prisma 7 no regenera el cliente tras `migrate dev`: ejecuta `pnpm exec prisma generate` y **reinicia `pnpm dev`**.
  - La BD de desarrollo está en el puerto 5433.
  - Las pruebas se ejecutan con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`; solo reinician `presupuestos_test`.
  - La versión de la app (`version` de `package.json`, se ve en el menú lateral y en el login) sigue los bloques: 1.0.0 = planes 1-4 en producción, 1.N.0 = Bloque N de `mejoras-uso-real` cerrado; desde el Bloque 6, cada tarea del plan sube el parche (1.6.1, 1.6.2…). Súbela en cada tarea.
  - Formularios con `ActionForm` (`src/components/action-form.tsx`), que conserva lo escrito ante un error del servidor.
  - Toda escritura de un borrador pasa por `withDraft()`. Lo emitido no se modifica.
  - Las pruebas de interfaz se hacen con Claude in Chrome. El progreso se registra a mano en claude-mem y en `progreso.md`.
  - Al reescribir `AGENTS.md` o `progreso.md` desde un script, conserva sus saltos de línea CRLF.
  - Para matar el servidor desde Bash usa un patrón que no se encuentre a sí mismo: `pkill -f '[n]ext dev'`.
  - No se borran pruebas existentes: solo se añaden (usuario, 2026-11-11).
  - Para probar la interfaz a varios anchos, el editor va en un `<iframe>` dentro de `/api/health`: no sustituyas el `body` de una página React.
  - En Git Bash de Windows, `sed -i` quita los CR: usa `sed -b -i` o Python con `newline=''` en archivos CRLF.
  - Si `pnpm dev` da `$$FORM_ACTION` de `undefined` tras añadir una Server Action a un archivo ya compilado, reinicia el servidor.
  - Con Playwright, `getByLabel(..., { exact: true })` no encuentra un `select` o un `textarea` con valor: la etiqueta envuelve al control y su texto incluye las opciones o el contenido. Localízalos por `name` o por el primer texto de la `label`.

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

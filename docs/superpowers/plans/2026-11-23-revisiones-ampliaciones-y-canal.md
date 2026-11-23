# Revisiones de ampliaciones anteriores y etiqueta beta — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revisar cualquier ampliación vigente aunque haya otras posteriores, y mostrar «· beta» junto a la versión en el entorno de pruebas.

**Architecture:** Se relaja una comprobación de `createRevision` y la condición del panel del emitido; la etiqueta sale de una variable de entorno leída en ejecución.

**Tech Stack:** Next.js 16, Prisma 7, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-11-23-revisiones-ampliaciones-y-canal-design.md`

## Global Constraints

- La principal con ampliaciones sigue sin admitir revisiones: «Ya tiene ampliaciones: la principal no admite nuevas revisiones».
- Etiqueta: «Versión 1.8.7 · beta» con `APP_CHANNEL=beta`; «Versión 1.8.7» sin variable.
- Versión 1.8.7 en `package.json`.
- Pruebas: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test`.

## Review Focus

- Revisar una A01 sustituida (ya hay A01-R01 emitida) sigue rechazado con «Sustituido…» — cubierto por la comprobación existente.
- Dos borradores de revisión de ampliaciones distintas a la vez: se permiten; la prueba de la Tarea 1 lo ejercita.
- Revisar A01 con un borrador de A02 pendiente: permitido; `createExtension` sigue bloqueada mientras tanto.
- La página de inicio de sesión es estática: sin `connection()` mostraría el canal de la compilación (Tarea 2).

---

### Task 1: Revisiones de ampliaciones anteriores

**Files:**
- Modify: `src/modules/quotes/lifecycle.ts` (`createRevision`)
- Modify: `src/app/(app)/presupuestos/[id]/lifecycle-panel.tsx` (`IssuedPanel`)
- Test: `tests/quotes/lifecycle.test.ts` («reglas de las ampliaciones» y una nueva)

- [ ] **Step 1: Pruebas.** En «reglas de las ampliaciones», el rechazo de `createRevision(actor, r0.id)` pasa a esperar «Ya tiene ampliaciones: la principal no admite nuevas revisiones»; la última línea (revisar A01 con A02 creada) pasa a la prueba nueva. Prueba nueva «una ampliación anterior admite revisiones aunque haya otra posterior»: con `withExtension()`, crear y emitir A02; `createRevision(a1)` y `createRevision(a2)` conviven como borradores; emitir la de A01 da `-A01-R01` y sustituye a A01-R00, no a A02.
- [ ] **Step 2:** Ejecutar `tests/quotes/lifecycle.test.ts` → falla.
- [ ] **Step 3: Servidor.** En `createRevision`, la comprobación de ampliación posterior solo para `q.extension === 0`, con el mensaje nuevo.
- [ ] **Step 4: Panel.** En `IssuedPanel`, `later` solo cuenta para la principal. En una ampliación: «Abrir el borrador» si el borrador es de su misma `extension`; si no, «Nueva revisión». El aviso `.locked` queda solo para la principal. Actualizar el comentario de cabecera.
- [ ] **Step 5:** Pruebas de quotes en verde; `pnpm exec tsc --noEmit` y `pnpm lint` limpios.
- [ ] **Step 6:** Commit.

### Task 2: Etiqueta beta y versión 1.8.7

**Files:**
- Modify: `src/lib/version.ts`, `src/app/(app)/layout.tsx`, `src/app/login/page.tsx`, `compose.yaml`, `package.json`, `docs/despliegue.md`

- [ ] **Step 1:** `src/lib/version.ts`: `export function versionLabel(): string` → `` `Versión ${pkg.version}${process.env.APP_CHANNEL === "beta" ? " · beta" : ""}` ``. Sustituye a los dos usos de `APP_VERSION`.
- [ ] **Step 2:** `login/page.tsx` pasa a `async` con `await connection()` (`next/server`), para leer la variable al servir.
- [ ] **Step 3:** `compose.yaml`, servicio `app`: `APP_CHANNEL: ${APP_CHANNEL:-}`. `docs/despliegue.md`: pruebas define `APP_CHANNEL=beta`; producción no.
- [ ] **Step 4:** `package.json` → 1.8.7. Comprobar en `pnpm dev` con `APP_CHANNEL=beta` que barra e inicio de sesión muestran «Versión 1.8.7 · beta», y sin ella «Versión 1.8.7».
- [ ] **Step 5:** Commit y actualizar `progreso.md` (CRLF).

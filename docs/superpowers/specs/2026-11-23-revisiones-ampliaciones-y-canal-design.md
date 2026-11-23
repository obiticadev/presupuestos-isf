# Revisiones de ampliaciones anteriores y etiqueta beta — diseño corto

Fecha: 2026-11-23. Rama: `mejoras-uso-real`. Versión: 1.8.7.

## 1. Revisiones de ampliaciones anteriores

**Por qué.** Hasta ahora (Bloque 7) solo avanzaba la línea más reciente del número: con A02 emitida, A01 ya no admitía revisiones. El usuario necesita revisar también ampliaciones anteriores.

**Regla nueva.**

| Línea | Nueva revisión |
|---|---|
| Principal sin ampliaciones | sí (igual que antes) |
| Principal con ampliaciones | no (igual que antes) |
| Cualquier ampliación (la última o anteriores) | sí (nuevo) |

Siempre sobre la revisión vigente (no sustituida). Las ampliaciones siguen naciendo solo de la principal, y nunca con un borrador pendiente en el número.

**Cambios.**
- `createRevision` (`src/modules/quotes/lifecycle.ts`): el rechazo por «ampliación posterior» pasa a aplicarse solo a la principal (`extension === 0`) con ampliaciones; mensaje «Ya tiene ampliaciones: la principal no admite nuevas revisiones».
- `IssuedPanel` (`lifecycle-panel.tsx`): en una ampliación, «Abrir el borrador» si hay uno de esa misma ampliación; si no, «Nueva revisión». La principal no cambia. Fuera el aviso «Hay una ampliación posterior…».
- Pruebas (`tests/quotes/lifecycle.test.ts`): revisar A01 con A02 emitida se acepta y se emite como `-A01-R01`; revisar la principal con ampliaciones sigue rechazado.

**Decisión propia.** Puede haber a la vez borradores de revisión de dos ampliaciones distintas (A01-R01 y A02-R01): cada una es un presupuesto propio y el bloqueo por número ya serializa su creación.

## 2. Etiqueta de versión beta

**Por qué.** Distinguir de un vistazo pruebas (:3101, `mejoras-uso-real`) de producción (:3100, `master`).

- Variable de entorno `APP_CHANNEL`, leída en ejecución. Con `beta`: «Versión 1.8.7 · beta». Sin valor: «Versión 1.8.7», sin etiqueta.
- Se pasa al servicio `app` en `compose.yaml` sin valor por defecto; en Dokploy solo el entorno de pruebas define `APP_CHANNEL=beta`.
- Aparece donde ya está la versión: barra lateral y página de inicio de sesión. Si alguna se compila estática, se marca como dinámica para que lea la variable al arrancar.

## Enfoques considerados

- Revisiones: quitar la regla solo para ampliaciones (elegido) frente a quitarla también para la principal (descartado por el usuario).
- Canal: variable de entorno en ejecución (elegido; el mismo código fusionado en `master` queda estable sin tocar nada) frente a deducirlo de la rama al compilar (exige pasar la rama por Dockerfile y Dokploy).

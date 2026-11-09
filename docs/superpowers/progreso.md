# Progreso del proyecto

Registro de lo hecho, de las decisiones tomadas por el camino y de lo pendiente, para retomar el trabajo desde cualquier equipo. Las reglas para agentes y el estado resumido están en `AGENTS.md`; aquí va el detalle.

Última actualización: 2026-11-10.

## Cronología

1. **Diseño y maquetas.** Spec aprobada (`specs/2026-11-06-app-presupuestos-design.md`) y dirección visual «Esquema unifilar» (`docs/diseno/`).
2. **Plan 1, base:** sesión, usuarios, historial, configuración y Docker. Rama `plan-1-base`; PR #1 ya fusionado en `master`.
   - Se probó en Chrome y aparecieron 7 fallos de interfaz, ya corregidos:
     - casilla de impuesto predeterminado desactualizada;
     - página 404 propia;
     - formulario de alta de usuario que perdía lo escrito;
     - historial en español;
     - vista previa del logo;
     - menú lateral fijo;
     - barra de navegación en móvil.
3. **Plan 2, catálogo y clientes.** Rama `plan-2-catalogo-clientes`, creada desde la del plan 1; PR #2 fusionado en `plan-1-base` (no en `master`).
   - Una revisión de toda la rama encontró dos fallos importantes, ya corregidos:
     - «1.500» se guardaba como 1,50; ahora se rechaza por ambiguo;
     - una fórmula de Excel con error dejaba el precio vacío; ahora es un error de fila.
4. **Plan 3, presupuestos.** Rama `plan-3-presupuestos`, creada desde la del plan 2; PR #3 contra `master`, que llevará a `master` los planes 2 y 3.
   - Tareas 1 a 5 terminadas y probadas en Chrome.
   - Tareas 6 y 7: servicios y pruebas hechos; la interfaz se terminó en el nuevo equipo (punto 5).
5. **2026-11-09, nuevo equipo (Linux).** Entorno local con `mise.local.toml` (Node 24, pnpm 12.18.0; no se sube), plugins superpowers, claude-mem y ponytail a nivel de usuario. Administrador de pruebas `admin@isf.test`, con la contraseña en `.superpowers/test-admin.env` (no se sube). Terminados el panel «Para emitir», el editor de emitidos, los nombres del historial y el listado y la configuración; queda el cierre.

## Cómo retomar en otro equipo

- **Carpeta de trabajo.** Clona el repositorio en una ruta **sin `#`**, porque Vite/Vitest no la admiten (en el equipo original: `D:\dev\presupuestos-isf`). Después: `git checkout plan-3-presupuestos`.
- **Instalación y base de datos.**
  1. `pnpm install` (genera también el cliente de Prisma).
  2. Copia `.env.example` a `.env` y levanta PostgreSQL con el override de desarrollo de Compose, que lo publica en el **puerto 5433**.
  3. `pnpm db:migrate`.
  4. Crea el primer administrador con `pnpm admin create --email … --name …`.
- **Pruebas.** Ejecútalas con:
  ```
  PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="Autorizo el reset (Recomendado)" pnpm test
  ```
  - Reinician solo la base `presupuestos_test`.
  - Ese consentimiento no vale para la base de desarrollo.
- **Después de cada migración.**
  1. `pnpm exec prisma generate`.
  2. **Reinicia `pnpm dev`**: el servidor conserva el cliente de Prisma antiguo y falla con `findMany of undefined` o `is not a function`.
  3. Si el servidor no termina, busca el proceso `node` de `next dev` y ciérralo.
- **Tipos de las rutas nuevas.** `PageProps<"/ruta">` falla en `tsc` hasta ejecutar `pnpm exec next typegen`, o hasta que arranque `pnpm dev`.
- **Pruebas de interfaz:** se hacen con Claude in Chrome (preferencia del usuario).
  - La ventana maximizada no se deja redimensionar. La vista de móvil se simula metiendo la página en un `<iframe>` de 390 px.
  - En Git Bash, para pasar rutas como `/conjuntos` a Node, usa `MSYS_NO_PATHCONV=1`.
- **Datos de prueba de la base de desarrollo** (no son datos reales):
  - cliente «Talleres Henares, S.A.» con un borrador;
  - MAN-4X25 a 12,00 €;
  - concepto IMP-01;
  - unidad kg desactivada;
  - conjunto «Cuadro con PLC» desactivado;
  - presupuestador de prueba `p3@isf.test`, creado con `.superpowers/mkuser.mts`. La contraseña está en ese script, que no se sube al repositorio: si no lo tienes, crea otro usuario de prueba igual.

## Arquitectura en dos líneas

- **Módulos.** Cada módulo vive en `src/modules/<módulo>/` y se divide en:
  - `schema.ts`: validación con Zod;
  - `service.ts`: lógica y permisos, con `logAction` en la misma transacción;
  - `actions.ts`: Server Actions finas que devuelven `ActionResult`.
- **Formularios.** Usan `ActionForm` (`src/components/action-form.tsx`), que conserva lo escrito cuando el servidor lo rechaza.
- **Presupuestos.**
  - El cálculo está en un único módulo puro, `src/modules/quotes/calculation.ts`.
  - Las fórmulas de los conjuntos están en `src/modules/kits/formulas.ts`.
  - Toda escritura de un borrador pasa por `withDraft()`: bloquea la fila, comprueba que sigue en borrador y recalcula los totales.

## Pendiente

### Plan 3: terminado el 2026-11-10 (rama `plan-3-presupuestos`)

La interfaz de las tareas 6 y 7 está hecha y probada en Chrome (detalle en la cronología, punto 5). Cierre:

- **Verificación:** `tsc` sin errores, lint sin errores (13 avisos antiguos), **180 pruebas** en verde y `pnpm build` correcto.
- **Criterio de éxito de la spec, en Chrome contra la versión de producción (`pnpm start`):**
  1. cliente «Conservas Ribera, S.A.» con ubicación;
  2. presupuesto desde «Nuevo presupuesto» con el conjunto de bombas (2 ud × 102,00 + 40 m × 10,00 = 604,00 €), 100 km y 8 h;
  3. validados los conceptos como admin y emitido como PR-2026000002-R00 (1.257,19 €);
  4. pasado a «Enviado»;
  5. filtrado «Este mes» + «Enviado»;
  6. R01 con 10 h, emitida: el listado solo muestra R01 y R00 dice «Sustituido por R01»;
  7. duplicado tras subir MAN-4X25 a 12,00: aviso «MAN-4X25: catálogo 12,00, presupuesto 10,00»; «Actualizar precios» recalcula también el conjunto.
- **Hallazgos del recorrido, corregidos:**
  - entre 900 y ~1.300 px la tabla de partidas no cabía junto al panel de 380 px y las columnas se solapaban: hasta 1.360 px el panel va debajo (comprobado con iframes de 1.000 a 1.920 px);
  - «Faltan 1 dato» → «Falta 1 dato».
- **Revisión final de la rama** (revisor independiente, `160b462..731a4e1`): sin críticos, dos importantes y varios menores, corregidos con pruebas que antes fallaban:
  - cambiar de cliente guardaba la ubicación y el contacto del anterior, porque el formulario los reenvía;
  - cambiar el reinicio anual después de emitir repetía un número y bloqueaba toda emisión: el contador ya no baja de lo emitido en su ámbito, el reinicio anual exige `{AAAA}` y un número repetido da un error claro;
  - menores: ubicación desactivada al emitir, obligatorio desactivado, `setStatus` con nombres heredados y sin bloqueo de fila, fechas mal escritas en la URL del listado, año de Madrid en las pruebas.
- **Queda de la revisión, aplazado:**
  - una prueba del reinicio anual a lo largo de dos años (necesita simular la fecha);
  - la instantánea guarda los importes sin ceros finales («1246.3»): el PDF del plan 4 debe formatearlos con `formatDecimalEs`.
- **PR #3 definitivo** (2026-11-10): rama subida y título y descripción actualizados. Queda revisarlo y fusionarlo en `master`.

### Después

- **Plan 4, por escribir:** PDF con Playwright (plantilla en `src/pdf/templates/`), Dokploy y copias de seguridad. La emisión ya guarda la instantánea con `templateVersion: "v1"`; `IssuedDocument.pdfPath` y `sha256` están a `null` hasta ese plan.
- **Integración.** `master` solo tiene el plan 1. El PR #3 lleva los planes 2 y 3.
- **`pnpm start` avisa** de que no encaja con `output: standalone`; sirve para probar en local, pero en producción se usa `node .next/standalone/server.js` (Docker ya lo hace).
- **Docker.** La imagen no se ha vuelto a construir desde que se añadió `exceljs` (plan 2).

## Decisiones tomadas por el camino

Cada decisión con lo que cuesta si resulta equivocada.

### Plan 1

- **Entorno local.**
  - Node local 25 (el plan pide 24); la imagen Docker usa node:24.
  - pnpm se instala con npm, porque corepack no existe en Node 25.
  - El CLI de Better Auth 1.7 se publica como paquete `auth@1.7.18`.
  - PostgreSQL de desarrollo en el puerto 5433, porque el 5432 lo ocupa un PostgreSQL de Windows.
- **Ruta de trabajo.** Vitest no admite `#` en la ruta, así que se trabaja en un worktree. Coste: dos carpetas que recordar.
- **Prisma 7.** No regenera el cliente tras `migrate dev`. Coste: si se olvida, las pruebas fallan con «schema mismatch».
- **Inicio de sesión.** Es una Server Action con `auth.api.signInEmail` y `nextCookies`. Ningún rol tiene permisos HTTP del plugin `admin` de Better Auth: todo pasa por los servicios.
- **Alta de usuario.** Se inserta User + Account con Prisma en la misma transacción que el historial. Coste: si Better Auth cambia el formato de Account, hay que adaptarlo (las pruebas de inicio de sesión lo detectarían).
- **Bloqueos con `FOR UPDATE`.**
  - Control del último administrador: nunca se queda la aplicación sin uno.
  - Impuesto por defecto: siempre hay exactamente uno.
- **Configuración.**
  - Los textos por defecto viven en los `@default` del esquema.
  - La semilla está en SQL y en `seedDefaults()`. Coste: cambiarla exige tocar los dos sitios.
  - Logo de hasta 2 MB, con `bodySizeLimit` de 3 MB.
- **Docker.**
  - Target `migrate` aparte.
  - CLI empaquetado con esbuild en `scripts/admin.mjs`.
  - Healthcheck con node y fetch.
  - `turbopackIgnore` en `dataDir()`.
- **Menores aplazados:**
  - el CLI no pasa el email a minúsculas;
  - «Usuario desactivado» no tiene prueba automática.

### Plan 2

- **«1.500» se rechaza por ambiguo** (`21.50` sí vale). Si la empresa quiere que signifique mil quinientos, se cambia en `src/lib/decimal.ts`.
- **Eliminar.** Si una clave foránea `RESTRICT` impide borrar (P2003), se desactiva (`deleteOrDeactivate`). El `DELETE` va en su propia transacción.
- **Menores aplazados:**
  - en Configuración, rechazar una categoría, unidad o impuesto vacía lo escrito;
  - el panel de concepto no muestra «Guardado», y «Desactivar» descarta lo que no se haya guardado;
  - una importación concurrente acaba en una página de error genérica;
  - se admiten nombres que solo difieren en mayúsculas;
  - los decimales de más se redondean sin aviso;
  - la fila de alta de contacto pierde el borrador si se elimina otra fila.

### Plan 3

- **Cálculo.** Una línea con precio pero sin impuesto cuenta como sin valorar.
- **Conjuntos.**
  - Las claves de los datos se generan solas (`d1`, `d2`…; la semilla usa `distancia`), para que renombrar un dato no rompa las fórmulas.
  - Un concepto fijo o elegido que está inactivo, sin precio o borrado deja el conjunto «ya no está disponible».
  - La semilla del conjunto va en una migración aparte (`kits_seed`).
- **Conceptos obligatorios.**
  - Son conceptos, no categorías.
  - SER-DESPL y SER-PROG son obligatorios, así que «Eliminar» los desactiva; para borrarlos, primero hay que quitarlos de la lista.
- **Borrador.**
  - Se preseleccionan la ubicación y el contacto si el cliente tiene exactamente uno activo.
  - La fecha es «hoy» en Europe/Madrid.
  - Cambiar el cliente limpia la ubicación y el contacto.
- **Recalcular un conjunto.** Una línea que conserva hueco y concepto conserva su precio copiado y su ajuste; un concepto nuevo vuelve a copiar del catálogo y descarta el ajuste, que queda anotado en el historial. Coste: para tomar un precio nuevo del catálogo hay que usar «Actualizar precios» o reinsertar el conjunto.
- **Restricciones del editor.**
  - Los conjuntos no van en subpartidas de precio global.
  - Las líneas de un conjunto solo cambian a mano su visibilidad o su precio.
- **Nuevo presupuesto.** Se crea con un POST desde `/presupuestos/nuevo`, nunca visitando una URL, para que un prefetch no cree presupuestos.
- **Interfaz del editor.**
  - La fórmula del conjunto se muestra como suma de sus líneas: «2 ud × 102,00 + 20 m × 12,00 = 444,00 €».
  - «Del catálogo» es un `<select>`. Coste: con cientos de conceptos habría que cambiarlo por un buscador.
  - Títulos y líneas se guardan al salir del campo (o con Intro).
- **Emisión.**
  - Una subpartida de precio global no cuenta como «presupuesto vacío»; si le falta precio, lo señala el aviso «global».
  - Numeración con un contador por fila: `INSERT … ON CONFLICT DO NOTHING` + `UPDATE … RETURNING`, dentro de la transacción de emisión. Así no hay huecos ni duplicados con emisiones a la vez.
  - El año del número es el de la emisión (Europe/Madrid); las revisiones conservan su número.
  - Por defecto: patrón `PR-{AAAA}{NNNNNN}-R{RR}`, sin reinicio anual y empezando en 1, todo configurable. **Falta que la empresa lo confirme.**

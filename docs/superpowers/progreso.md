# Progreso del proyecto

Registro de lo hecho, de las decisiones tomadas por el camino y de lo pendiente, para retomar el trabajo desde cualquier equipo. Las reglas para agentes y el estado resumido están en `AGENTS.md`; aquí va el detalle.

Última actualización: 2026-11-09.

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
   - Tareas 6 y 7: servicios y pruebas hechos; falta la interfaz. Ver «Pendiente».
5. **2026-11-09, nuevo equipo (Linux).** Entorno local con `mise.local.toml` (Node 24, pnpm 12.18.0; no se sube), plugins superpowers, claude-mem y ponytail a nivel de usuario. Administrador de pruebas `admin@isf.test`, con la contraseña en `.superpowers/test-admin.env` (no se sube). Terminados el panel «Para emitir», el editor de emitidos, los nombres del historial y el listado; quedan la configuración y el cierre.

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

### Plan 3: terminar las tareas 6 y 7 (rama `plan-3-presupuestos`)

Los servicios ya existen y tienen pruebas: `issue.ts`, `numbering.ts`, `lifecycle.ts`, y `addRequiredConcept`/`removeRequiredConcept` en `service.ts`. Las Server Actions también: `issueAction`, `setStatusAction`, `refreshPricesAction`, `createRevisionAction`, `duplicateAction` y `add|removeRequiredConceptAction`. Falta:

1. ~~**Editor, panel «Para emitir»**~~ **Hecho el 2026-11-09** (`src/app/(app)/presupuestos/[id]/issue-panel.tsx`) y probado en Chrome:
   - cada obligatorio en verde con su cantidad («100,00 km»), o en ámbar con «Marcar 0 con motivo»; con renuncia muestra «A 0: motivo» y «Quitar el 0»;
   - el resto de problemas de `issueChecks` enlazan a su ancla (comprobado `#linea-<id>`);
   - «Emitir presupuesto» deshabilitado con «Faltan N datos…»; sin problemas, confirmación en la página;
   - emitido PR-2026000001-R00: queda en solo lectura, y una pestaña antigua que intenta guardar recibe «El presupuesto ya está emitido…» sin cambios en la BD.
   - Hallazgo: dentro del panel lateral (`overflow-y:auto`) la `.confirmbox` flotante quedaba cortada; en `.emit` va en línea (`position:static`).
   - Sin comprobar todavía: el panel en móvil (≤ 900 px).
2. ~~**Editor de un presupuesto emitido**~~ **Hecho el 2026-11-09** (`src/app/(app)/presupuestos/[id]/lifecycle-panel.tsx`) y probado en Chrome:
   - selector de estado (Emitido → Enviado, queda en el historial); «Validez vencida» si `isExpired`;
   - «Nueva revisión» crea R01 («Sustituye a R00»); si ya hay un borrador de revisión, el botón pasa a «Abrir el borrador R01»;
   - al emitir R01, R00 muestra «Sustituido por R01: ya no cambia de estado» con enlace y sin selector;
   - «Duplicar» (en emitidos y borradores) crea un borrador sin número;
   - en los borradores, aviso de `priceWarnings` y «Actualizar precios desde catálogo» (probado: 0,30 → 0,35);
   - `<details>` «Historial» al pie con `listQuoteHistory`.
   - `getQuote` incluye ahora `parent` y `revisions` (también entran en la instantánea de emisión).
3. ~~**Listado en `/`**~~ **Hecho el 2026-11-09** (`src/app/(app)/page.tsx`) y probado en Chrome:
   - pestañas de estado con `counts`; filtros GET `q`, `mes` (`este` por defecto, `anterior`, `todos`), `desde`/`hasta` (mandan sobre el mes), `cliente`, `responsable`, `estado` (slug en español) y `pagina`;
   - título «Presupuestos · noviembre de 2026» o con el rango; «Enviado · N días»; «Validez vencida»; «Sustituye a R00»; pie con resultados y total filtrado;
   - comprobado: R00 sustituida no sale, mes anterior, todas las fechas (2 resultados, 78,65 €), borrador + búsqueda, desde/hasta;
   - móvil (iframe de 390 px): sin desbordamiento horizontal en el listado ni en el editor; la tabla y las pestañas se desplazan dentro de su caja.
4. **Configuración** (`/admin/configuracion`):
   - sección «Numeración»: `numberPattern`, `numberYearlyReset` («si»/«no») y `numberStart`, con una vista previa hecha con `formatReference`;
   - sección «Conceptos obligatorios».
5. ~~**`/admin/historial`**~~ **Hecho el 2026-11-09:** entidad «Presupuestos» y acciones Emisión, Cambio de estado, Revisión, Ajuste de precio y Duplicado.
6. **Cierre:**
   - `pnpm build`;
   - prueba en Chrome del criterio de éxito de la spec (crear, emitir, enviar, filtrar por mes y estado, revisar R01, duplicar);
   - revisión final de toda la rama;
   - actualizar `AGENTS.md` y `README.md`;
   - cambiar el PR #3 a definitivo.

### Después

- **Plan 4, por escribir:** PDF con Playwright (plantilla en `src/pdf/templates/`), Dokploy y copias de seguridad. La emisión ya guarda la instantánea con `templateVersion: "v1"`; `IssuedDocument.pdfPath` y `sha256` están a `null` hasta ese plan.
- **Integración.** `master` solo tiene el plan 1. El PR #3 llevará los planes 2 y 3 cuando el plan 3 esté terminado.
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

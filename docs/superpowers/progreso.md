# Progreso del proyecto

Registro de lo hecho, de las decisiones tomadas por el camino y de lo pendiente, para retomar el trabajo desde cualquier equipo. Las reglas para agentes y el estado resumido están en `AGENTS.md`; aquí va el detalle.

Última actualización: 2026-11-23 (1.8.7 fusionada en `master` con el PR #7 y desplegada en producción).

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

6. **2026-11-11, mejoras tras el primer uso real.** Rama `mejoras-uso-real` (desde `master`). Diseño de 7 bloques aprobado (`specs/2026-11-11-mejoras-uso-real-design.md`); el aspecto del editor se eligió con maquetas en Chrome (`docs/diseno/maquetas/editor-filas*.html`). Bloque 1 (editor y móvil) terminado. Se trabaja bloque a bloque, con push a esta rama. Desde el 2026-11-17 se revisa en el entorno independiente del servidor; `master` y producción, solo con visto bueno.

7. **2026-11-17, entorno de pruebas en el servidor (autorizado por el usuario).**
   - URL: **http://192.168.105.83:3101**, rama `mejoras-uso-real`, inicialmente commit `c526d8e`. Producción continúa en `:3100` y `master`, sin redesplegar ni reiniciar.
   - Dokploy → proyecto «Presupuestos ISF» → entorno `pruebas` (`25HdFz3xoCRINa3gw_-r3`) → «Presupuestos - PRUEBAS» (`composeId e3Bkaq88xSYluN9dqrdZ6`, `appName presupuestos-isf-pruebas-1uwipl`). `composePath ./compose.yaml`, proveedor GitHub existente; despliegue manual, volúmenes estables.
   - Base de datos y archivos nuevos, sin copiar producción; secretos aleatorios exclusivos en Dokploy, copias en `/srv/presupuestos-pruebas-backups`. PostgreSQL no publica puertos.
   - Usuarios con nombres `admin` y `user`, roles administrador y presupuestador. Como se entra por correo, sus accesos son `admin@isf.test` y `user@isf.test`. Contraseñas solicitadas anotadas en **`ACCESOS-PRUEBAS.local.md`**, visible en la raíz de este worktree y en la carpeta original, excluido de Git; no se suben secretos.
   - Configuración marcada «PRUEBAS — ISF (datos ficticios)», numeración `TEST-{AAAA}{NNNNNN}-R{RR}`; 6 conceptos de las semillas, 2 clientes ficticios con contacto e instalación, 2 borradores con líneas de catálogo (670,34 € y 1.005,51 €). Inicialización por servicios de la aplicación, con guardas que rechazan otro entorno o una BD con usuarios/clientes/presupuestos.
   - Comprobaciones HTTP: acceso con ambos usuarios y roles correctos; clientes, catálogo y editor 200; PDF de borrador correcto (244.449 bytes); administrador accede a usuarios y presupuestador recibe 404 (protección prevista). No sustituye una revisión visual con Chrome.
   - Reinicio del contenedor de pruebas comprobado: conserva usuarios, clientes y borradores, y el PDF sigue descargando. Copia manual correcta `20261117-0858`, app saludable y bucle diario de `backup` activo. SSH `isf` **ya pertenece al grupo `docker`**: el bloqueo antiguo está resuelto; las comprobaciones de producción pendientes siguen pendientes.
   - **Sesiones separadas por petición del usuario (2026-11-17):** variable opcional `BETTER_AUTH_COOKIE_PREFIX`, compartida por Better Auth y el proxy; Compose la pasa al contenedor. Pruebas usa `isf-pruebas`; el valor por defecto `better-auth` conserva las sesiones existentes de producción. No se borra la cookie antigua desde pruebas. Se pueden contrastar ambos entornos en el mismo navegador sin incógnito. Pruebas unitarias añadidas para prefijo predeterminado, personalizado y coexistencia; 3/3 correctas sin tocar BD, TypeScript y ESLint de los archivos modificados correctos.
   - **Desplegado el aislamiento de cookies (`d87892c`):** copia previa `20261117-0910`, build y despliegue correctos. Comprobación HTTP con un único almacén de cookies: una cookie testigo con nombre de producción queda intacta al entrar y salir de pruebas como ambos roles, se emiten/borran solo cookies `isf-pruebas.*`, y el proxy reconoce el nuevo prefijo. Sin sesión de pruebas, la cookie testigo de producción no da acceso. No se ha usado ni modificado una sesión real de producción. PDF del borrador correcto y datos conservados tras el redespliegue. Ambos `/api/health` correctos; producción conserva su fecha de arranque del 2026-11-10. Lint completo: 0 errores y 17 avisos previos. Al ejecutar dos verificaciones de login simultáneas se alcanzó el límite 429 en una petición adicional; no se ha desactivado ni cambiado esa protección.
   - Operación y actualización por bloques: **`docs/despliegue-pruebas.md`**. Siguiente tarea funcional: Bloque 3, sin fusionar `master` ni desplegar producción.
   - **Automatización solicitada cada 5 minutos:** el usuario activó Auto Deploy, pero el push `9f4d429` no generó despliegue. Diagnóstico con la API de la GitHub App: webhook a la IP privada de Dokploy, entregas fallidas con «failed to connect to host» (502). Se sustituye la recepción del aviso por consultas salientes desde cron de `isf`, sin exponer Dokploy a Internet. Programa `scripts/deploy/poll-pruebas.py`, instalado fuera del checkout; token privado local del servidor con permisos restringidos; sin secretos en Git. Solo permite el Compose y la rama de pruebas, hace copia antes de desplegar, evita solapamientos y duplicados, confirma estado y salud, y no repite automáticamente un commit fallido. Respeta Auto Deploy para pausar desde Dokploy. Operación, rutas y registros en `docs/despliegue-pruebas.md`.
8. **2026-11-17, ajustes pedidos por el usuario (adelanto de parte del Bloque 4).** Diseño `specs/2026-11-17-cliente-pdf-y-notas-design.md`, plan `plans/2026-11-17-cliente-pdf-y-notas.md`, maquetas `docs/diseno/maquetas/notas-presupuesto.html` (modelo C) y `nota-conjunto-pdf.html`.
   - PDF: el destinatario es razón social, dirección fiscal línea a línea y «A la atención de…»; la instalación queda solo en la frase de la carta.
   - PDF: un conjunto con nota se resalta con un tinte verde muy suave (`#edf5f2`, distinto del gris de la partida), una raya punteada del ancho del tinte y la nota en cursiva del tamaño de las notas de línea (opción B de `nota-conjunto-pdf-resalte.html`); sin nota no cambia. Editor: la nota del conjunto va en un pie gris con «Comentario del conjunto».
   - Responsable: cualquier escritura en un borrador (`withDraft(actor, …)`) deja como responsable a quien la hace; las notas pasan `null` y no lo cambian.
   - Notas internas `QuoteNote` y `QuoteNoteVersion` en lugar de `travelNote` (migración `20261117120000_quote_notes`, que convierte cada nota antigua en la primera nota, a nombre del responsable). Ventana flotante tipo chat; clic derecho o pulsación larga para Editar, Ver versiones anteriores y Eliminar; quien edita pasa a ser el autor y la versión anterior se guarda; lo emitido queda en gris y solo lectura; una revisión muestra las notas de las anteriores. Las notas nunca llegan al PDF ni a la instantánea emitida (con prueba).
   - Comprobado con Claude in Chrome a 1500, 1024 y 390 px (el tinte verde final solo con pruebas, sin mirar el PDF). El ajuste «Origen habitual del desplazamiento» de configuración queda sin uso en el editor.
   - Revisión final independiente: sin críticos; corregidos los dos importantes (una nota ya no toca `updatedAt` del presupuesto, que borraba lo escrito sin guardar en la cabecera; el menú de una nota se cierra al eliminarla). 288 pruebas correctas.
   - Subido a `origin/mejoras-uso-real` (`9f4d429`); pruebas lo recoge solo por el sondeo de `docs/despliegue-pruebas.md`, que aplica la migración de notas en su BD. Sin comprobar todavía en `:3101`. Producción intacta.
   - **Menores aplazados (decidir si se arreglan):** `service.ts` y `kit-instances.ts` pasaron de CRLF a LF; cualquier refresco de la página cancela una edición de nota sin guardar; la pulsación larga del iPad se cancela con cualquier movimiento (poner umbral de ~10 px); Esc no devuelve el foco; posible aviso de hidratación por el formato de fechas `Intl`; Esc cierra la ventana aunque haya una edición a medias; la apertura del menú con la tecla de menú del teclado no se ha comprobado.

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

### Ajustes del borrador (rama `mejoras-uso-real`, 2026-11-25): 1.9.16 → 1.9.19, hechos

- Diseño `docs/superpowers/specs/2026-11-25-ajustes-borrador-design.md`, plan `docs/superpowers/plans/2026-11-25-ajustes-borrador.md`.
- 1.9.16: «Actualizar precios desde catálogo» no hacía nada porque el aviso contaba líneas de subpartidas en precio global que el botón se salta. Ahora `catalogLines` solo toma subpartidas por suma.
- 1.9.17: «Añadir del catálogo» (código · descripción y precio · categoría) y «Añadir conjunto» usan `Combobox`. El buscador vuelve a su valor al reiniciarse el formulario y, a ≤ 600 px, la tercera columna pasa debajo de la descripción.
- 1.9.18: Cliente (razón social · CIF · nombre comercial), Nombre (nombre · instalación · dirección) y Contacto (nombre · cargo · email/teléfono) usan `Combobox`. `ComboItem.text` fija lo que queda en la casilla.
- 1.9.19: casillas «Cant.» por línea y «Total» por subpartida (`QuoteLine.showQuantity`, `QuoteSection.showTotal`, migración `ocultar_cantidad_total`). El PDF las respeta y las instantáneas antiguas lo muestran todo. La columna de acciones del editor pasa de 214 a 262 px.
- Comprobado en Chrome a 390, 820 y escritorio. Falta la revisión del usuario.

### Conjuntos dinámicos (rama `mejoras-uso-real`): diseño y plan del 2026-11-25, en ejecución (tareas 1-8 de 10 hechas)

- **Para retomar en un chat nuevo:** leer `docs/superpowers/specs/2026-11-25-conjuntos-dinamicos-design.md` y abrir la maqueta `docs/diseno/maquetas/conjuntos-dinamicos.html` (v4; pestañas: lista, conjunto dinámico, conjunto PLC, borrador, PDF).
- Decisiones del usuario: P1 dinámico sin principal (ampliaciones que parten de un presupuesto vacío), P2 variantes por categoría y elegidas, P3 dinámico fijo y a elegir.
- Siguiente paso: ejecutar `docs/superpowers/plans/2026-11-25-conjuntos-dinamicos.md` (9 tareas, 1.9.20 → 1.9.28; lleva la migración `kit_slots`).
- **Hecho el 2026-11-25, ejecución en línea:** tareas 1-4 (1.9.20 → 1.9.23), todas con commit y push: definición, expansión, slots en el presupuesto (migración `kit_slots`) y validación, usos e historial de las plantillas. Solo servidor: aún no hay interfaz. Pruebas 494/494. Las decisiones tomadas están en `.superpowers/sdd/2026-11-25-conjuntos-dinamicos/progress.md` (ignorado por Git). Siguiente: la tarea 5, la lista con dos pestañas.
- **Hecho el 2026-11-25 (2.º chat), tareas 5-8 (1.9.24 → 1.9.27), con commit y push:** pestaña de dinámicos en la lista, editor de dinámico, dinámicos dentro de un conjunto normal (fijo o a elegir, opcional, en el nombre) y el borrador: ramas de nivel 2, slots con su buscador, «Añadir slot» por tipo, quitar y volver a poner el opcional, vista cerrada agrupada con filete verde y dinámico suelto. Probado en Chrome a 1568, 820 y 390 px. Pruebas 498/498 (`pnpm exec vitest run --dir tests`; `pnpm test` a secas también recoge la copia de `.next/standalone` y falla allí). **Siguiente: tarea 9 (PDF A1) y 10 del plan, en un chat nuevo**; las decisiones de cada tarea están en el ledger `.superpowers/sdd/2026-11-25-conjuntos-dinamicos/progress.md`. En la BD local quedan de prueba los conjuntos ED-F-SD, IM-TEST (`test-dyn-im`, insertado por SQL) y BOM-ED, añadidos al borrador `cmwdcinu5000sicton3wkkb5t`.
- Hecho el mismo día, en la versión 1.9.15 (commit `542ae86`):
  - la razón social de Configuración admite varias líneas y en el PDF sale línea a línea;
  - en el buscador (`Combobox`), los códigos largos ya no pisan la descripción (columnas compartidas con `subgrid`).
- Siguen abiertos de conjuntos: una opción para borrar un conjunto desde el borrador. Las filas desalineadas del árbol se corrigieron en 1.9.27 (la cantidad iba 5 px más alta que el artículo); falta que el usuario lo confirme.

### Conjuntos genéricos (rama `features`) — terminado el 2026-11-24, pendiente de revisión

- Pantalla de árbol con panel (interfaz 1), nombre automático (opción D) con aviso de repetidos, descripción a mano, buscador de artículos con `datalist`, lista con «Principal → lo que lleva», eliminar si no se ha usado e historial de versiones (lista con + / −, no la vista de 3 modos del catálogo).
- Formato de `kitDefinition` intacto más la fórmula `PARAM` y los opcionales `main.symbol` y `components[].inName`; etiquetas hasta 300. Sin migración: los conjuntos antiguos se traducen al abrirlos.
- Pruebas: 403/403 en verde. Revisión final de la rama hecha y sus importantes corregidos (1.9.8).
- Aplazado (menores): claves repetidas en el historial si dos materiales dan la misma frase; descripción entera en el desplegable «Añadir conjunto»; un nombre antiguo como «BOM-MAN-2024» se toma por automático.
- **Conjunto en el borrador (1.9.9 → 1.9.13, 2026-11-24)**, a partir de la revisión del usuario con capturas:
  - en el presupuesto, el conjunto se guarda al cambiar y su descripción se ve;
  - buscador propio (`src/components/combobox.tsx`): código, descripción y categoría, sin mayúsculas ni tildes, con ↑ ↓ Enter, Tab (elige lo resaltado) y Esc, y una ✕ que borra y reabre la lista;
  - árbol elemento | artículo | medida con todos los elementos, fijos en gris, en escritorio, iPad y móvil (codos medidos a ≤ 0,3 px);
  - medida fija modificable solo en el borrador (`params.k_<slot>`, sin migración) con aviso y «Volver al original»;
  - «Cambiar conjunto», que conserva cantidad, comentario y lo compatible.
  - Diseño, plan y maqueta en `docs/superpowers/specs/2026-11-24-conjunto-borrador-design.md`, `docs/superpowers/plans/2026-11-24-conjunto-borrador.md` y `docs/diseno/maquetas/conjunto-borrador.html`.
- 1.9.14 (2026-11-24): cantidad del principal dentro del árbol en móvil y lista del buscador que se recoloca (izquierda o hacia arriba) sin provocar scroll. 412/412 pruebas, build correcto. `features` subida a `mejoras-uso-real` (`:3101`) y fusionada en `master` (PR #8); **producción sin desplegar** (sigue en 1.8.7).
- **Pendiente (usuario, 2026-11-24), para otro momento:**
  - desalineamiento de filas en el árbol del conjunto en escritorio (BOM-MAN incompleto, filas «Principal» y «Mangueras», a unos 1200 px); revisar si influye `.kq-r .kq-m{align-self:start}` de la 1.9.14;
  - una opción para borrar un conjunto; concretar con el usuario dónde (hoy hay «Quitar» en el borrador y «Borrar» en `/conjuntos/[id]`, solo si ningún presupuesto lo usa).

### Mejoras tras el uso real (rama `mejoras-uso-real`) — en curso

- **Forma de trabajo (usuario):** un plan por bloque (`superpowers:writing-plans`), ejecución, revisión en Chrome, commit y push a `mejoras-uso-real`. No se borran pruebas: solo se añaden. `master` y Dokploy no se tocan hasta que el usuario dé el visto bueno a la rama entera.
- **Bloque 1, editor y móvil: hecho y aprobado por el usuario el 2026-11-11** (plan `plans/2026-11-11-mejoras-bloque-1-editor.md`). 238 pruebas en verde, `lint` sin errores, `build` correcto. Último commit del bloque: `b0824d2`.
  - Filas en rejilla con consultas de contenedor: una fila, dos pisos (≤ 980 px de tabla) o apiladas (≤ 480 px). Títulos y descripciones en cuadros que crecen; se guardan al salir del campo o con Enter.
  - Botones en el orden de la maqueta; flechas en gris en los extremos; «+ Añadir ▾» con menú y ✕; «＋ ▾» en la partida; banda «＋ NUEVA PARTIDA».
  - Comentario (`comment`) en `QuoteLine`, `KitInstance` y `QuoteSection`: servicio `setComment`, se copia en revisiones y duplicados, sale en el PDF en cursiva (filas `note`, que nunca abren hoja).
  - Conjunto plegable con silueta, sin el esquema grande, pie en una línea con ✓; el incompleto sale abierto y el enlace de «Para emitir» lo abre.
  - Móvil: barra superior con «Menú».
  - Decisiones tomadas por el camino: en `.superpowers/sdd/2026-11-11-mejoras-bloque-1-editor/progress.md` (no se sube) y resumidas en el mensaje de cierre del bloque.
- **Ajustes tras la revisión del usuario (2026-11-11):** botones del conjunto alineados con el ✓; estado del emitido con el desplegable de la app; «Recalcular» cierra la edición; los desplegables se abren hacia arriba si no caben; y, de la auditoría y la revisión final: las líneas sueltas van antes que las de los conjuntos (en el editor y en los PDF que se emitan desde ahora; los ya emitidos no cambian), «Actualizar precios» copia también unidad y nombre del impuesto, los saltos de línea pegados en títulos y descripciones pasan a espacios, el conjunto recién completado sigue abierto, un solo formulario abierto en la página, Escape cierra los menús y el foco se ve en los cuadros de texto. 238 pruebas.
- **Cierre del Bloque 1 (2026-11-12), tras otra revisión del usuario:** los desplegables del conjunto ya no vuelven a «Elige…» al recalcular (`form.reset()` devolvía cada `<select>` a su primera opción y el siguiente «Recalcular» borraba lo guardado; se arregla con `key` = valor guardado); la silueta dibuja un círculo por dato del formulario (elemento principal, datos y componentes): borde negro si está, discontinuo ámbar si falta; todos los `<select>` usan `appearance: base-select` (Chrome 135+) con el aspecto de `.menu`, rectos y de una línea; en los del conjunto la opción lleva solo el código y la descripción sale en la lista con `option[data-d]::after` (en Firefox, la lista nativa solo muestra códigos). `next.config.ts` lleva `experimental.mcpServer: false`: su log en `.next/dev/logs` hacía que Turbopack recompilase y el navegador se recargase en bucle en Windows. Añadido a petición del usuario (punto 1.8 del diseño): conjuntos en subpartidas de precio global, con líneas descriptivas sin precio, que siguen obligando a completar cada pieza y admiten piezas sin precio de venta (`expandKit(..., descriptive)`). Últimos retoques de maquetación: en móvil el número de partida y subpartida va en línea con su nombre, y en la subpartida de precio global «Guardar» queda siempre a la derecha, con los campos llenando cada fila. 240 pruebas, `lint` sin errores. **Bloque 1 cerrado.**
- **Pendientes menores del Bloque 1:** resueltos después (la nota sola en la hoja del cierre, en el Bloque 8; «Validez vencida», sustituida por el caducado del Bloque 4).
- **Bloque 2, clientes e instalaciones: hecho y aprobado por el usuario el 2026-11-12** (plan `plans/2026-11-12-mejoras-bloque-2-clientes.md`). 271 pruebas en verde, `lint` sin errores. Cerrado del todo con el añadido de responsable y revisiones (abajo).
  - Migración `20261112120000_installation`, escrita a mano (`prisma migrate dev --create-only` no funciona sin terminal): dos `RENAME COLUMN` (`city` → `installation`, `province` → `country`); comprobado con recuento y hash que no se pierde nada. «Ubicaciones de trabajo» pasa a «Instalaciones» (Nombre, Dirección, Instalación, País).
  - Cabecera: Cliente · Nombre · Instalación. «Instalación» es un `<output class="box">` (no se escribe ni se selecciona; se resalta al hacer clic) que cambia al momento con el selector (`InstallationFields`, `installationLabel`). Vista de solo lectura con Nombre e Instalación.
  - Cambio del usuario tras revisar: en el PDF, el destinatario lleva `instalación, país` en lugar del nombre (debajo, solo la dirección) y la carta dice «…en referencia a {asunto} en {instalación}, {país}.»; el asunto es obligatorio para emitir («Falta el asunto»). Los snapshots anteriores (con `city`/`province`) se regeneran como antes (`buildDocument`, `legacy`).
  - Filas `.rowform` con la columna de botones fija (10rem, clase `rowacts`; `.acts` ya existía en el editor).
  - Excel de clientes (`/clientes/importar`, solo admin; «Exportar» para todos): hojas Clientes, Contactos, Instalaciones e Instrucciones; en Contactos e Instalaciones el CIF se elige de una lista con los CIF de la hoja Clientes y una columna Razon_social (BUSCARV) muestra el cliente, solo informativa. CIF normalizado como clave; contactos e instalaciones por CIF + nombre sin mayúsculas (se conserva el nombre guardado); con varios del mismo nombre, una fila por cada uno en el orden de exportación. Todo o nada. Utilidades comunes en `src/lib/excel.ts`, `src/lib/import-file.ts` y `src/components/import-form.tsx` (el catálogo usa las mismas).
  - Menores aplazados de la revisión final: cada fila sin cambios deja «modificado (importación)» en el historial (lo resuelve el «Sin cambios» del Bloque 3); el selector «Nombre» no marca «(desactivada)»; Razon_social vacía si el CIF se escribe con otro formato; error genérico si alguien borra un contacto entre «Revisar» y «Confirmar»; `MAX_IMPORT_*` siguen en `catalog/excel.ts`.
  - Lección: tras añadir una exportación a un archivo `"use server"` ya compilado, `pnpm dev` puede servir la acción como `undefined` (`$$FORM_ACTION`): reiniciar el servidor.
  - Añadido tras la revisión (aprobado el 2026-11-12): «Responsable» deja de ser un desplegable; en el borrador es una caja de solo lectura como «Instalación» con quien lo gestiona (guardar la cabecera pone `ownerId` = quien guarda) y al emitir se graba quien emite (`issueInTx`); una revisión nueva arranca con quien la abre. Recuadro «Revisiones» bajo el panel lateral (`Revisions`, `listRevisions`): todas las versiones del número con estado, fecha y responsable; cada una abre su página (datos, PDF, duplicar). El listado sigue sin las sustituidas y «Nueva revisión» solo sale en la última emitida.
- **Bloque 3: hecho y aprobado por el usuario el 2026-11-17** (commits `1c24bd4`..`f30b256` y el ajuste del campo «Motivo»; 314 pruebas, `tsc`, lint y `pnpm build` en verde). Hecho: catálogo, conjuntos e importación «Añadir y actualizar» para todos; fotos de cada versión del concepto en `AuditLog.data` (`catalog/history.ts`) y pantalla «Historial (N)» con los tres formatos de la maqueta (línea vertical > 900 px, horizontal con flechas 601–900 px, paso a paso ≤ 600 px; ficha a pantalla completa en móvil); «Sin cambios» y «Qué cambia» en las importaciones de catálogo y clientes; importación completa solo para administradores (borra lo no usado, desactiva lo usado, decisión por cliente con presupuestos, todo o nada, P2003/P2025 → «Algo ha cambiado mientras revisabas»); un concepto usado (también solo en una plantilla) se desactiva y el conjunto sale «Incompleto» (`catalog/usage.ts`, `kitIssues`); las revisiones salen con los precios del catálogo y avisan con `?precios=N`.
  - Decisiones por el camino: `createRevision` devuelve `Quote & { refreshed }` (no rompe a sus llamadores) y recalcula totales con `recalc` (ahora exportada); en la completa de clientes, una fila de contacto o instalación cuyo CIF no está en «Clientes» es un error (evita escribir en un cliente que se va a borrar); guardar un concepto sin cambios no crea versión, aunque `updatedAt` se mueve; una definición de conjunto mal formada hace fallar `usedConceptIds` en vez de ignorarse.
  - Menores aplazados: la prueba de importación de clientes en completa no comprueba los números exactos del resumen ni el choque P2003; `kitIssues` hace consultas por conjunto en la lista; los avisos salen también en conjuntos desactivados; `choices` se lee con un `as` sin validar; los contadores «Se desactivarán» no se recalculan al elegir «Dejar como está» (el resultado final sí); las tareas 8 a 10 se hicieron sin revisión independiente (a petición del usuario, para ahorrar tokens) y no hubo revisión final de la rama completa. Registro detallado: `.superpowers/sdd/2026-11-13-mejoras-bloque-3-catalogo/progress.md` (local, fuera de git).
- Diseño del Bloque 3 (2026-11-13). Diseño `specs/2026-11-13-mejoras-bloque-3-design.md`; plan `plans/2026-11-13-mejoras-bloque-3-catalogo.md` (11 tareas, empezar por la 1). Decidido con el usuario: el usuario normal gestiona catálogo, conjuntos y clientes e importa en «Añadir y actualizar»; la importación completa es solo del administrador; historial de versiones de cada concepto (maqueta C en escritorio/iPad, D en móvil; ficha a pantalla completa en móvil); un concepto en una plantilla de conjunto cuenta como usado (se desactiva y el conjunto avisa de que queda incompleto); en la completa de clientes, cada cliente con presupuestos se decide («Desactivar» o «Dejar como está»). Maquetas en `docs/diseno/maquetas/historial-concepto.html` (servir con `python -m http.server 8765` desde la raíz).
- **Bloques 4 y 5: hechos juntos y aprobados por el usuario el 2026-11-18** (diseño `specs/2026-11-18-bloques-4-5-design.md`, plan `plans/2026-11-18-bloques-4-5.md`, maqueta `docs/diseno/maquetas/cuenta-firma.html`; versión 1.5.0). Menores de la revisión final, arreglados el 2026-11-18: con la validez vencida (días de Madrid, `validityRunOut`) ya no se puede volver a Emitido o Enviado a mano (solo Aceptado, Rechazado o Caducado; para volver a ofertar, una revisión), porque la tarea lo devolvería a Caducado; el arranque no espera a `expireQuotes`; el cliente de Prisma se comparte también en producción; «Eliminar firma» muestra el error del servidor; `checkSignaturePng` exige el bloque IHDR; la vista previa de Mi cuenta usa el lugar de Configuración y la fecha de hoy. Revisado en local con `user@isf.test` (firma, emisión con firma, caducado y contraseña); en esa revisión se arregló que cambiar la contraseña cerraba también la sesión actual (`c82f6c4`). Falta que el usuario lo pruebe en `:3101`.
  - Caducado: `expireQuotes()` al arrancar y cada hora desde `src/instrumentation.ts`, por días de Madrid (emitido el 1 con 30 días: caduca el 32), historial a nombre de «Sistema»; las revisiones sustituidas no caducan. Sin `isExpired` ni aviso «Validez vencida».
  - Mi cuenta (`/cuenta`, enlace en el menú): contraseña (cierra las demás sesiones) y firma dibujada con `signature_pad` en una ventana flotante; «Eliminar firma» con confirmación; debajo, el pie del PDF con la misma plantilla (`closeHtml`). Firma en `User.signature` (migración `20261118120000_user_signature`; PNG ≤ 200 KB, 20×10–4000×2000).
  - Emitir exige firma de quien emite (panel: «Falta tu firma: configúrala en Mi cuenta»); la instantánea guarda `signer` (nombre y firma), así que una revisión emitida por otro lleva la suya y cambiar la firma no toca lo emitido. PDF: sello de 62 mm (`src/pdf/assets/sello-isf.svg`) con la firma encima y «Fdo.: Nombre»; las instantáneas antiguas mantienen el recuadro vacío. La vista previa de un borrador usa la firma de quien la mira.
  - Logo SVG en el inicio de sesión (`public/logo-isf.svg`; se quita el JPG).
  - Los usuarios de las pruebas se crean con una firma de ejemplo (`TEST_SIGNATURE`); los reales tienen que firmar en Mi cuenta antes de emitir.
- **Diseños de los Bloques 6 y 7 aprobados por el usuario el 2026-11-18** (con maquetas elegidas): `specs/2026-11-18-bloque-6-design.md` (maqueta `docs/diseno/maquetas/bloque-6.html`) y `specs/2026-11-18-bloque-7-design.md` (maqueta `docs/diseno/maquetas/bloque-7.html`). Se quitaron las series de numeración y el reinicio manual (el reinicio anual ya existe). **Versión por tarea:** cada tarea del plan sube un parche, 1.6.1, 1.6.2… (Bloque 6) y 1.7.1… (Bloque 7).
- **Bloque 6 cerrado y aprobado por el usuario (2026-11-18, 1.6.1 a 1.6.4)**, plan `plans/2026-11-18-bloque-6.md`: «Notas internas», desplegable de conceptos obligatorios con estilo, pie del PDF centrado, datos registrales en una línea y dirección en varias; eliminar y **renombrar** usuarios sin emitidos (petición del usuario), con tabla de anchos fijos y «Guardado» que se va a los 2,5 s; historial con buscador y filtros que se aplican solos (`next/form`); zona de peligro con ventana y BORRAR. **Decisión aprobada:** el nombre del autor (`userName`/`authorName`) se copia solo al eliminar al usuario, no en cada alta. Migración `20261118140000_author_names` (columnas nuevas y FK `SET NULL`, sin tocar datos): probarla sobre una copia restaurada antes de producción. «Borrar todos» no se probó pulsando en la BD local (se perderían los presupuestos de desarrollo); lo cubre `tests/quotes/reset.test.ts`.
- **Bloque 7 cerrado y aprobado por el usuario el 2026-11-18 (1.7.1 a 1.7.4)** (plan `plans/2026-11-18-bloque-7.md`, hecho en otro equipo sin acceso al servidor; revisado en local con Claude in Chrome):
  - Tipos de presupuesto (`QuoteType`, código 1-999, usado = no se borra ni cambia de código) en Configuración; Tipos, Categorías y Unidades se guardan al salir del campo, «Guardado» 2 s, error dentro del campo sin agrandar la fila, «×» borra lo no usado.
  - Referencia `PR-{AAAA}{TTT}{NNN}-R{RR}` con contador por tipo (clave `{año|global}-{TTT}`), tope 999 sin gastar número; `Quote.typeCode`, `numberPattern` y `extension` se congelan al numerar y se copian a revisiones y ampliaciones, así que lo antiguo conserva su formato. Migraciones `20261118160000_quote_types` y `20261118170000_reference_by_type` (probada en la BD local con emitidos antiguos, no sobre una copia de `:3101`).
  - «Tipo» delante de Cliente: cerrado solo el código centrado, abierto código y nombre (patrón `data-d`); «—» se puede elegir; el nombre del tipo sale a la derecha del título. `<selectedcontent>` no sirve con React 19.3 (falla la hidratación).
  - Ampliaciones `-A01-R00` («Nueva ampliación» en la última emitida de la principal), sin partidas ni notas; en ellas tipo, cliente e instalación son de solo lectura; solo avanza la línea más reciente. Recuadro «Revisiones y ampliaciones» agrupado.
  - Borradores: «Borrador-{instalación}» sin número, «Borrador-{referencia que tendrá}» con número.
  - Menores de la revisión final, arreglados en 1.7.4: una fila nueva de las tablas ya muestra «Guardado»; «Nueva revisión» y «Nueva ampliación» bloquean todo el número, así que a la vez solo sale adelante una (prueba en `lifecycle.test.ts`). Revisión final hecha por el propio agente (sin revisor independiente).
  - En local: `admin@isf.test` y `user@isf.test` con la contraseña de `ACCESOS-PRUEBAS.local.md` y una firma de prueba.
- **Bloque 8 terminado el 2026-11-19 (1.8.1 a 1.8.5), pendiente de la revisión del usuario** (diseño `specs/2026-11-18-bloque-8-design.md`, plan `plans/2026-11-18-bloque-8.md`; ejecutado por el propio agente en esta sesión):
  - `backup.sh`: el código 1 de GNU tar (un archivo cambió al leerlo) guarda la copia con un «AVISO» en el log; otro código sigue fallando (prueba de Docker con `CHANGED_TAR`; `FAIL_TAR` simula ahora el código 2).
  - `tests/docker/versions.test.ts` falla si la versión de `playwright-core` del `Dockerfile` no es la de `package.json` (el `Dockerfile` no se toca).
  - El emitido muestra «El PDF se generará al descargarlo» mientras `IssuedDocument.pdfPath` esté vacío (`QuoteDetail.issued`); comprobado en Chrome.
  - `paginate`: al llevar el cierre a otra hoja, las filas van por bloques (encabezados y nota con su fila), así que no quedan partidas, subpartidas ni notas sueltas (solo pasaba con hojas de ~340 px); un cierre más alto que una hoja hace crecer la última hoja y Chromium lo continúa en las páginas siguientes con cabecera y pie (exclusiones de 8.000 caracteres: 8 páginas, comprobado en Chrome).
  - Prueba intermitente de `kit-instances`: no reproducible en 30 pasadas del archivo y 5 de la suite completa (370/370) el 2026-11-19; cerrada sin cambios.
  - Revisión final con un revisor independiente; arreglado en 1.8.5: un `tar` con código distinto de 1 no paraba la copia (`set -e` no corta dentro de `||`), así que publicaba un archivo roto y borraba una copia buena al limpiar; y una última hoja que es solo partida, subpartida y línea (con o sin nota) dejaba la subpartida o la nota sueltas: ahora el cierre se queda y la hoja fluye. Pruebas: `FAIL_TAR` escribe el archivo antes de fallar, y «cierre que no cabe con una sola partida…».
  - Quedan para el usuario: comprobaciones en el servidor, cambio de credenciales y manual (puntos 4 a 6 de «Pendiente tras el despliegue»).
- **Ensayo de la actualización de producción (2026-11-19), autorizado por el usuario:** copia `20261119-0835` de producción restaurada en un proyecto aparte (`presupuestos-restore`, puerto 3199, ya retirado) con el código de `10dd5d4`. Las 7 migraciones se aplican sin error; recuentos iguales (6 presupuestos, 5 emitidos, 2 clientes, 3 usuarios, 160 entradas de historial); instalaciones con la misma huella tras el `RENAME`; la única «Nota sobre el desglose» pasa a nota interna; los emitidos conservan `PR-{AAAA}{NNNNNN}-R{RR}`; los 5 PDF descargados tienen el mismo SHA-256 que los guardados. No se usó `:3101` (no admite datos reales). Siguiente: PR de `mejoras-uso-real` a `master`.
- **Última hora (2026-11-23, 1.8.7)** (diseño `specs/2026-11-23-revisiones-ampliaciones-y-canal-design.md`, plan `plans/2026-11-23-revisiones-ampliaciones-y-canal.md`): cualquier ampliación vigente admite «Nueva revisión» aunque haya otras posteriores (A01-R01 con A02 emitida); la principal con ampliaciones sigue sin revisiones. Pueden convivir borradores de revisión de ampliaciones distintas. La versión muestra «· beta» si `APP_CHANNEL=beta` (definirla en el Environment de Dokploy de `:3101`; producción sin ella); la página de inicio de sesión pasa a dinámica (`connection()`) para leerla al servir.
- **Paso a producción (2026-11-23):** copia `20261123-1149`; PR #7 fusionado (`c141ed3`); despliegue en Dokploy con las 7 migraciones aplicadas; `backup` recreado a mano (mismo SHA-256 de `backup.sh` que el repositorio); `/api/health` ok, «Versión 1.8.7» sin etiqueta; 6 presupuestos, 5 emitidos y los 5 PDF con el SHA-256 guardado. `:3101` con `APP_CHANNEL=beta` muestra «Versión 1.8.7 · beta».
- **Al retomar:** `git pull` en `mejoras-uso-real`, `mise x -- pnpm install`, `mise x -- pnpm exec prisma migrate deploy` (migraciones nuevas: `20261111205350_comments` y `20261112120000_installation`), la suite, y arrancar con `mise x -- pnpm dev`. Al hacer commit desde el equipo Linux, los archivos que tienen CRLF se añaden con `git -c core.autocrlf=false add` (la configuración global de git usa `autocrlf=input`).
- **Usuarios de prueba (local y `:3101`):** `admin@isf.test` (admin) y `user@isf.test` (presupuestador), con la contraseña de `ACCESOS-PRUEBAS.local.md`; si en local no entran, se restauran con `ADMIN_PASSWORD=… pnpm admin reset-password --email <usuario>` (y `user@isf.test` se crea con `auth.api.createUser`, rol presupuestador).
- **Datos de la BD de desarrollo:** el borrador «Ampliación del grupo de bombeo» (`cmw9urhye0012djm6hdo8szw4`) tiene nombres largos, comentarios y elementos «… de prueba UI» para revisar el editor.
- **Pruebas de interfaz:** para simular anchos se mete el editor en un `<iframe>` dentro de `http://localhost:3000/api/health` (una página sin React). Sustituir el `body` de una página React provoca excepciones `removeChild` que no son de la app.

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
- **PR #3 fusionado en `master`** (2026-11-10, commit `1b60c6d`). `master` tiene los planes 1, 2 y 3; su árbol es idéntico al de `plan-3-presupuestos`.

### Plan 4: en ejecución (rama `plan-4-pdf-despliegue`) — traspaso del 2026-11-10

Ejecutado con superpowers:subagent-driven-development (un implementador por tarea, una revisión por tarea). El usuario pidió seguir con otro asistente a partir de aquí.

**Hecho y revisado** (pruebas: 214+ en verde; `tests/pdf` 23/23; `tsc` y `lint` limpios):

| Tarea | Commits | Notas |
|---|---|---|
| 1. Chromium y `renderPdf` | `da2f332` | `page.evaluate()` funciona con JS desactivado. La cabecera y el pie de Chromium no heredan el `@font-face`: la plantilla lo repite en ellos. Navegador: `pnpm exec playwright-core install chromium-headless-shell`. |
| 2. Modelo `buildDocument` | `fb34b9d` (+ `0a37d26`) | Etiqueta de impuesto: el nombre solo si ya contiene «%» (los nombres reales son «IVA 21 %»). |
| 3. Plantilla v1 y `paginate` | `f8942cf`, `cb37423`, `45830b7`, `0a37d26` | Variante B con cierre al pie y «Firma y sello». Arreglos: subpartidas sin líneas al paginar; la fuente se lee de `process.cwd()/node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2` y `next.config.ts` la incluye en standalone (`outputFileTracingIncludes`); datos de empresa vacíos sin separadores. |
| 4. Logo por contenido | `54347b3` | `uploads/logo-<sha12>.<ext>`; `readLogo(path)` con respaldo al logo actual. |
| 5. PDF del emitido y del borrador | `3cf0caf` | `src/modules/quotes/pdf.ts`: `ensureIssuedPdf` con `FOR UPDATE`, hash y regeneración; `draftPdf`; `pdfResponse`. |
| 6. Descarga e interfaz | `04098b5` | `GET /api/presupuestos/[id]/pdf`; «Descargar PDF», «Vista previa (PDF)», enlace «PDF» en listado y ficha de cliente; historial «Descarga» y «PDF». |

**Probado en navegador** (Chrome sin interfaz por CDP contra `pnpm build` + `pnpm start`, porque la extensión Claude in Chrome no estaba conectada): vista previa del borrador, emisión, descarga del emitido (archivo en `data/pdf/2026/`), historial y enlace del listado. Sin probar en la interfaz: el cambio de logo tras emitir (lo cubren las pruebas de las tareas 4 y 5). Sin sesión, la ruta del PDF responde 307 a `/login` por `src/proxy.ts`; se aceptó (el 401 de `pdfResponse` queda como segunda defensa).

**Datos cambiados en la BD de desarrollo** (puerto 5433, solo desarrollo): administrador `pdf-check@isf.local`; conceptos BOM-MAYOR75, MAN-4X25, MAN-12X075, SER-DESPL y SER-PROG marcados como validados; el borrador de Talleres Henares quedó **emitido** como `PR-2026000001-R00`.

**Tarea 7, preparada y validada técnicamente (2026-11-10).** El usuario pidió expresamente dejar la revisión con Claude in Chrome para más adelante. No se ha fusionado ni desplegado en Dokploy. La Tarea 8 sigue pendiente.

Cambios y problemas encontrados al probar el «wip»:
- `Dockerfile`: OpenSSL y certificados también en `migrate`; CLI de Prisma directo, sin descargar pnpm al arrancar como `node`; variables ficticias solo durante la compilación para evitar errores de Better Auth sin secretos reales; Chromium 1.64.1 instalado y legible por `node`.
- **Faltaba `playwright-core` en la imagen.** `next.config.ts` lo declara externo y traza el paquete completo, además de la fuente. Comprobado en la imagen con UID 1000 y generación real de PDF.
- `backup.sh`: bloqueo con `flock` compartido con la restauración (se libera incluso con SIGKILL); permisos privados; no sobrescribe copias del mismo minuto; completa ambos temporales antes de publicar; limpia sus temporales al fallar; mantiene 30 copias por tipo. El bucle continúa tras un fallo y usa las 03:00 si no existen las 02:00 por el cambio horario de primavera.
- `restore.sh`: valida fecha, copia y archivo antes de modificar datos, rechaza la app encendida incluso sin conexiones a la BD, comprueba conexiones y restaura la BD en una sola transacción.
- **`docker compose run -v …:rw` no quitaba el montaje de solo lectura en este Compose.** Se añade `compose.restore.yaml`, que cambia únicamente `/data` a escritura y conserva el volumen lógico `appdata` del proyecto. **Usarlo solo con `run`, nunca con `up`, y siempre con el mismo `-p` que la app.**
- `.gitattributes`: scripts `.sh` en LF también en Windows. Pruebas repetibles en `tests/docker/` (instrucciones en su `README.md`).

Verificación local con **solo el archivo de producción** y un proyecto aislado: `docker compose -p presupuestos-t7 -f compose.yaml …`; `BETTER_AUTH_URL=http://localhost:3100`, `BACKUP_DIR=./.backups` y secretos exclusivos de prueba. No se ha cambiado la BD de desarrollo.
1. Imagen construida, `migrate` termina con código 0, `app` saludable y `backup` en marcha. Solo `app` publica `3100:3000`; `db`, `migrate` y `backup` no publican puertos.
2. Administrador creado con el CLI de la imagen. Cliente, ubicación, logo y presupuesto creados mediante los servicios dentro del contenedor; emisión `PR-2026000001-R00` y PDF de **211.753 bytes**, 2 páginas. Descarga HTTP con sesión de Better Auth: referencia, cliente, total **1.246,30 €** y «Firma y sello» presentes. SHA-256 del archivo, de la BD y de la descarga: `d08c1be1af347ead672a0df0d1ec19ed137e870dc45eb199cb4744120a07201e`.
3. `down` sin `-v`, `up` y después redespliegue con `up -d --build`: presupuesto, logo y descarga conservados, mismo SHA-256.
4. Copia real `20261110-1034`; emitido un segundo presupuesto y creado un archivo posterior; restauración rechazada con la app encendida. Tras pararla, restauración correcta: desaparecen el segundo presupuesto y el archivo posterior, se conserva el logo y el primero descarga el PDF con el mismo SHA-256. Retención real con 31 copias falsas por tipo y una nueva: quedan 30 de cada.
5. `tests/docker/backup-scripts.sh` y `runtime-smoke.mjs` correctos. `tsc` correcto; build Linux en Docker correcto; **217/217 pruebas Vitest**. La primera ejecución concurrente con la compilación tuvo un timeout de 5 s en una prueba existente de cabecera; repetida sin esa carga, pasa la suite entera sin cambiar los tiempos de espera. Lint sin errores, con avisos anteriores (13 en código y 4 de un auxiliar local antiguo).

**Revisión con Claude in Chrome contra la imagen: hecha (2026-11-10).** Proyecto aislado `presupuestos-t7` reconstruido desde `4324a56` con solo `compose.yaml`, secretos de prueba fuera del repositorio y administrador creado con el CLI de la imagen. Todo desde los formularios en `http://localhost:3100`:
1. Configuración: datos de empresa y logo (`public/logo-isf.jpg`) guardados.
2. Cliente «Conservas Ribera, S.A.» con contacto y ubicación; el borrador los toma por defecto.
3. Partida y subpartida, conjunto «Instalación de bomba» (2 × BOM-MAYOR75, 20 m, MAN-4X25 = 604,00 €), 100 km y 8 h: base 1.034,00 €, IVA 21 % 217,14 €, total **1.251,14 €**.
4. Vista previa del borrador: dos páginas, logo, marca de agua «BORRADOR», cierre con exclusiones, forma de pago, validez, totales y «Firma y sello».
5. Conceptos validados en el catálogo y emisión como `PR-2026000001-R00`; el PDF del emitido lleva la referencia en cabecera y asunto y no tiene marca de agua.
6. `down` (sin `-v`) y `up`: logo y PDF conservados; la descarga desde el navegador tiene el mismo SHA-256 que el archivo guardado (`6b6fd25b…e7f0ea`). El historial registra validaciones, emisión y descargas.

Observación menor, sin corregir: en la hoja de partidas el título es el asunto tal cual, que empieza en minúscula («la sustitución de…») porque el campo está pensado para continuar «…en referencia a». Decidir en la Tarea 8 si se pone en mayúscula inicial.

**Tarea 8 (2026-11-10), antes del despliegue:**
- Título de la hoja de partidas con mayúscula inicial (`d53dff7`, con prueba).
- `docs/despliegue.md` nuevo y `docs/operacion.md` ampliado con «Actualizar la versión», «Revertir» y «Navegador del PDF» (`38fdc7c`).
- Verificación completa: `tsc` limpio, lint sin errores (17 avisos antiguos), `pnpm build` correcto y **217/217** pruebas. En la primera ejecución falló una vez `tests/quotes/kit-instances.test.ts` («sin manguera el conjunto queda incompleto…»); no se reprodujo ni sola ni repitiendo la suite: queda como prueba intermitente que vigilar.
- Revisión final de toda la rama (`1b60c6d..38fdc7c`, revisor independiente): sin críticos. Los dos importantes estaban en `docs/despliegue.md` y están corregidos en `4466407`: la prueba de restauración va en una subshell para que sus variables no lleguen a producción, y tras restaurar se usa `up -d` (corre `migrate`) en lugar de `start app`. También se documentan `--build`/`--rmi local` en la prueba, recrear `backup` si cambian sus scripts y el acceso SSH.
- Menores aplazados: el aviso «El PDF se generará al descargarlo» de la spec 5.5.1 no se muestra al emitir si falla el PDF (solo queda en el log); al recolocar el cierre, un encabezado de partida o subpartida puede quedar solo al pie de la hoja (`paginate.ts`); un cierre más alto que una hoja se corta sin aviso; `tar` falla la copia entera si un archivo cambia mientras se lee; la versión de Playwright está en `Dockerfile` y en `package.json`.
- **Servidor:** la API de Dokploy funciona. SSH entra como `isf` con `~/.ssh/isf_dokploy`, pero `isf` no está en el grupo `docker` y `sudo` pide contraseña: hace falta `sudo usermod -aG docker isf` (lo hace el usuario) para crear el administrador y probar la restauración por SSH.
- **Desplegado (2026-11-10 12:10):** PR #4 fusionado en `master` (`b7a7e45`); en Dokploy `composePath ./compose.yaml` y variables `POSTGRES_PASSWORD` y `BETTER_AUTH_SECRET` (aleatorias, solo en Dokploy), `BETTER_AUTH_URL=http://192.168.105.83:3100` y `BACKUP_DIR=/srv/presupuestos-backups`. `compose.deploy` → `done`; `/api/health` responde `ok` y `/login` 200; 5432 y 5433 cerrados desde la red. Pendiente: primer administrador, emisión de prueba, reinicio y redespliegue, y prueba de restauración (necesitan SSH con acceso a Docker).

**Cierre de sesión:** avances técnicos guardados en `63a1213`. Se arrancó temporalmente `pnpm dev --hostname 127.0.0.1` para que el usuario consultara la app en `http://localhost:3000` (`/api/health`: 200, `status: ok`). Servidor detenido a petición del usuario antes de subir los avances al remoto. Esta consulta no sustituye la revisión pendiente con Claude in Chrome. La BD local existente se mantiene sin detener ni borrar; no se ha fusionado en `master` ni desplegado en Dokploy.

Para repetir la restauración (con variables definidas y una copia de prueba disponible):
```sh
docker compose -p presupuestos-t7 -f compose.yaml stop app
docker compose -p presupuestos-t7 -f compose.yaml -f compose.restore.yaml run --rm backup /scripts/restore.sh AAAAMMDD-HHMM
docker compose -p presupuestos-t7 -f compose.yaml start app
```

Al acabar las pruebas se retira el proyecto aislado con `down -v` y se borra `./.backups`; no se deben usar estos datos ni las contraseñas de prueba en producción. Para la revisión futura de la imagen, recrear este proyecto aislado y sus datos de prueba.

**Tarea 8:** `docs/despliegue.md`, `docs/operacion.md`, verificación completa (`pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build`), revisión final de toda la rama, README/AGENTS/progreso y PR contra `master`. El despliegue real (Alcance de la Tarea 8) solo con el visto bueno del usuario.

**Decisiones tomadas durante la ejecución:**
- Las comprobaciones de interfaz se hicieron con Chrome sin interfaz por CDP y curl.
- La Tarea 7 se prueba con `-p presupuestos-t7 -f compose.yaml` (lo que ejecuta Dokploy, sin `compose.override.yaml`).
- Si la fuente cambiaba el número de páginas de las pruebas, mandaba la regla de `paginate` (al final coincidieron: 2 y 3 páginas).
- Ruta del PDF sin sesión: 307 a `/login`, aceptado.
- Etiqueta del impuesto: el nombre solo si contiene «%».

**Menores aplazados, para la revisión final:**
- `browser.ts`: el evento `disconnected` pone `browser = null` sin comparar la instancia; el límite de 30 s cuenta el tiempo en cola y no cancela el render; las pruebas de «sin red» y del límite de 2 son indirectas.
- `document.ts`: `?? "0"` silencioso si falta un total; referencia vacía en un emitido sin referencia; faltan pruebas de líneas en subpartida GLOBAL y de «Sin título» en subpartida.
- `paginate.ts`: el cierre que no cabe puede dejar una partida o subpartida al pie de la hoja anterior; los atajos (fila más alta que una hoja) cortan sin avisar.
- Plantilla: el título colapsa los saltos de línea del asunto; el tipo del logo se repite tres veces; `v1/index.ts` y `paginate.ts` tienen saltos de línea CRLF y el resto LF.
- `settings`: `logoPath` de la instantánea va directo a `path.join` (comprobar el prefijo `uploads/logo-`).
- `quotes/pdf.ts`: el `.tmp` no se borra si fallan `writeFile` o `rename`; `seqYear` nulo daría `pdf/null/…`; el render dentro de la transacción ocupa una conexión del pool, así que varias descargas distintas a la vez pueden agotarlo (500).
- La salida de las pruebas tiene un `DeprecationWarning` de pg que ya estaba antes.

### Plan 4: diseño y plan escritos, pendientes de revisión (rama `plan-4-pdf-despliegue`)

Escritos el 2026-11-10 con superpowers (brainstorming → comprobación del constructor → writing-plans) mientras el usuario estaba ausente. **No hay código todavía.** Antes de ejecutar:

1. Leer el diseño, `docs/superpowers/specs/2026-11-10-plan-4-pdf-despliegue-design.md`, y sobre todo su sección 7, «Para confirmar». Hay 12 decisiones mías y una pregunta abierta: si el plan incluye **ejecutar** el despliegue en el servidor o termina en la imagen probada en local y la documentación. Para ejecutarlo hace falta saber:
   - versión de Dokploy (las copias de un Compose piden 0.22 o posterior);
   - si habrá acceso al servidor;
   - DNS interno;
   - si hay destino S3.
2. Ver la maqueta del documento: `docs/diseno/maquetas/pdf.html`, con la carta, las partidas, la continuación con la cabecera repetida y el borrador con marca de agua.
3. Revisar el plan, `docs/superpowers/plans/2026-11-10-plan-4-pdf-despliegue.md`, con 8 tareas, y elegir cómo ejecutarlo: con subagentes o en la misma sesión.
2b. **Densidades de la hoja de partidas** (pedido del usuario el 2026-11-10: que el presupuesto quepa en una hoja con el total, la carta aparte): ver `docs/diseno/maquetas/pdf-densidades.html` y el diseño 5.3.1.
   - Cuatro variantes con el mismo presupuesto de 31 filas y la letra a 10 pt: A estándar (no cabe, unas 15 filas), B compacta (unas 31), C resumen arriba (unas 31 de desglose) y D agrupada (la que más cabe: sobran 63 mm).
   - **Respondido el 2026-11-10: la B**, con estos cambios:
     - sin total junto al título;
     - cierre (condiciones, fecha y totales) siempre pegado al pie de la última hoja;
     - hueco de «Firma y sello» a la derecha, bajo los totales y de su mismo alto;
     - si el cierre no cabe, pasa a la hoja siguiente con la última subpartida.
   - Se hace con paginación propia antes de `page.pdf()` (diseño 5.3.1). La maqueta ya la tiene, con tres casos.
   - Letra a 10 pt; A, C y D descartadas. El diseño y el plan (tareas 1 y 3) están actualizados.

**Hallazgos del diseño:**

- **El logo** se sobrescribía siempre en `uploads/logo.png`. Para que el PDF regenerado de un emitido conserve su logo, pasa a guardarse por contenido (Tarea 4).
- **Comprobación del constructor:** guardar el SHA-256 y dar error si no coincidía fallaba en casos normales:
  - dos descargas a la vez generan PDF distintos, porque Chromium no da bytes idénticos;
  - las copias de base de datos y de volumen se hacen a horas distintas.

  Ahora se serializa por presupuesto y se regenera desde la instantánea.
- **El PDF de referencia** `PR-2026001029-R00.pdf` no está en el equipo Linux: la comparación visual se hace en el equipo original.
- **Dokploy (documentación consultada el 2026-11-10):**
  - el dominio de un Compose añade solo Traefik y `dokploy-network` al servicio elegido;
  - las copias de base de datos y de volúmenes van a destinos S3, con un cron;
  - la copia de volúmenes puede parar el contenedor («Container OFF»);
  - la restauración se hace desde la interfaz y exige que el volumen no exista.
- **Versiones elegidas**, con al menos tres semanas por la edad mínima de pnpm: `playwright-core` 1.64.1, `@fontsource-variable/archivo` 5.3.0 y `unpdf` 1.9.1.

### Después

- **Empresa:** confirmar la numeración (por defecto `PR-{AAAA}{NNNNNN}-R{RR}`, sin reinicio anual, desde 1), el destino S3 y la retención de copias, y el logo y los textos definitivos.
- **Docker.** La imagen no se ha vuelto a construir desde que se añadió `exceljs` (plan 2). Se hace en la Tarea 7 del plan 4.
- **`pnpm start` avisa** de que no encaja con `output: standalone`; sirve para probar en local, pero en producción se usa `node .next/standalone/server.js` (Docker ya lo hace).

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

### Pendiente tras el despliegue (revisar) — anotado el 2026-11-10

Errores y cabos sueltos encontrados durante el despliegue y al preparar el manual de usuario. Ninguno está corregido.

**1. Interfaz: textos cortados en el editor del borrador (por corregir).**
- Entre ~1360 px (a partir de ahí el panel va al lado de la tabla) y ~1600 px de ancho de ventana, los campos del nombre de partida y de subpartida y la descripción de las líneas son demasiado estrechos: se ve «BOMBEO DE LA LÍNEA DE ENVASAD» o «Cuadro de mando y protección p…».
- El valor se guarda completo (comprobado en la BD); solo se ve recortado. A 1440 px se recorta más («BOMBEO DE»).
- Reproducir: borrador con una partida de nombre largo y una línea de catálogo de descripción larga, ventana de 1440 px. Código en `src/app/(app)/presupuestos/[id]/sections.tsx`.
- Probable arreglo: que esos campos ocupen el ancho de la columna «Denominación» (o un `min-width` razonable) y comprobarlo en Chrome a 1366, 1440, 1600 y 1920 px.

**2 y 3. Prueba intermitente y menores del plan 4:** resueltos en el Bloque 8 (2026-11-19); detalle arriba, en «Mejoras tras el uso real».

**4. Comprobaciones en el servidor sin hacer** (aceptación, `docs/despliegue.md` apartado 8):
- el usuario creó el primer administrador y dice que la app funciona; falta una emisión de prueba con descarga del PDF desde un equipo de la oficina;
- reinicio del servidor y redespliegue sin pérdida de datos;
- estado y log del contenedor `backup` (`docker logs presupuestos-isf-app-oy9un2-backup-1`), y que `/srv/presupuestos-backups` se llena tras las 02:00;
- prueba de restauración en el proyecto aparte `presupuestos-restore`;
- comparación del PDF con `PR-2026001029-R00.pdf`.

Bloqueo: el usuario SSH `isf` no está en el grupo `docker` y `sudo` pide contraseña. Lo resuelve el usuario con `ssh -t -i ~/.ssh/isf_dokploy isf@192.168.105.83 'sudo usermod -aG docker isf'`. El agente no escribe contraseñas de `sudo`.

**5. Seguridad.** Durante la sesión se pegaron en el chat la contraseña del usuario de servidor `isf` (la misma que la de `obiticadev` y la que el usuario usaba en la app) y la clave privada de una clave SSH creada en Dokploy. Recomendado:
- cambiar esas contraseñas y no repetirlas entre servidor y app;
- borrar esa clave en Dokploy (la copia local ya se borró).

Las contraseñas de producción (`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`) se generaron al momento y solo están en la pestaña Environment de Dokploy.

**6. Manual de usuario (2026-11-10).**
- PDF de 37 páginas en la raíz de la carpeta del proyecto: `Manual de usuario - Presupuestos ISF.pdf`. Git lo ignora.
- Se hizo con capturas automáticas (Playwright y el Chromium del proyecto) de una instancia local aislada con datos de demostración: proyecto Compose `presupuestos-manual`, puerto 3101.
- Los scripts (`capture.mjs`, `content.mjs`, `build.mjs`) quedaron en la carpeta temporal de la sesión y se pierden con ella. Decidir si se rehacen en `docs/manual/` para regenerar el manual cuando cambie la interfaz.
- La instancia sigue encendida. Para retirarla sin su `.env`:
  ```sh
  docker rm -f $(docker ps -aq --filter label=com.docker.compose.project=presupuestos-manual)
  docker volume rm presupuestos-manual_appdata presupuestos-manual_pgdata
  docker image rm presupuestos-manual-app presupuestos-manual-migrate
  ```

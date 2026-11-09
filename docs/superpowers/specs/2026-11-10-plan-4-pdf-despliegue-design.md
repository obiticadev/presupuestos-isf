# Diseño del plan 4: PDF, despliegue y copias de seguridad

Fecha: 2026-11-10. Rama: `plan-4-pdf-despliegue`, desde `master` (con los planes 1 a 3 ya fusionados).

Desarrolla las secciones 5.7 (documento PDF), 5.12 (despliegue y operación) y 6 (aceptación) de la spec general, `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md`. Esa spec manda: este documento solo concreta cómo se construye.

> **Cómo se escribió.** El usuario pidió avanzar sin preguntas mientras estaba ausente. Por eso, todo lo que la spec general no fija está marcado como **Decisión mía**, con su motivo. Son propuestas: se revisan antes de ejecutar el plan, y cualquiera se puede cambiar sin rehacer el resto. La sección «Para confirmar» las recoge.

Maqueta visual del documento: `docs/diseno/maquetas/pdf.html` (cuatro hojas A4: carta, partidas, continuación y borrador).

## 1. Intención

Que el presupuesto emitido salga en un PDF corporativo y, en lugar de rehacerlo en Word, el presupuestador:

- lo descargue y lo mande al cliente;
- sepa que **siempre** baja el mismo documento, el que se emitió, aunque luego cambien el catálogo, el logo o los textos;
- pueda sacar un borrador, con la marca de agua «BORRADOR», para revisarlo antes de emitir.

Y que la aplicación quede instalada en el servidor de la oficina con Dokploy, con HTTPS, con los datos a salvo en copias fuera del servidor y con una restauración probada. Sin esto último el sistema no se da por operativo (spec 5.12).

**Éxito** (spec 1): el presupuestador emite y **descarga un PDF con el contenido del ejemplo**, y los datos sobreviven a un reinicio, a un redespliegue y a una restauración.

## 2. Objetivos, no objetivos y antiobjetivos

**Objetivos:**

1. PDF A4 con Chromium, desde una plantilla HTML/CSS versionada (`v1`), con el contenido de la spec 5.7.
2. PDF del emitido generado una vez, guardado en el volumen persistente con su hash y servido siempre igual.
3. Vista previa del borrador con marca de agua, sin guardarla.
4. Descarga con sesión y registrada en el historial.
5. Imagen Docker con Chromium y despliegue en Dokploy con HTTPS interno.
6. Copias programadas de la base de datos y del volumen de archivos, a un destino fuera del servidor, con la restauración documentada y probada.
7. Documentación de operación: actualizar, restaurar y revertir.

**No objetivos:**

- envío por correo, firma o sello (spec 2);
- editor visual de plantillas (spec 2);
- un PDF «calcado» del Word: basta con el contenido del ejemplo (spec 5.7);
- PDF de otros documentos (listados, catálogo).

**Antiobjetivos** (aunque funcionase, sería un fracaso):

- que el PDF de un emitido cambie al regenerarse con datos actuales: el catálogo, el logo o los textos de hoy;
- que una fila o una partida se corte, o que se encoja la letra para que quepa (spec 1 y 5.7);
- que una caída de Chromium impida emitir o deje un presupuesto a medio emitir;
- que el puerto de la app quede abierto en HTTP en el servidor, saltándose el HTTPS;
- copias que nadie ha restaurado nunca.

## 3. Restricciones

- **Stack** fijado por la spec: Playwright/Chromium para el PDF y Docker Compose compatible con Dokploy.
- **Reglas de los planes 1 a 3:**
  - versiones exactas;
  - código en inglés y textos en español;
  - permisos en el servidor;
  - importes con `Decimal` y formateados con `formatDecimalEs`;
  - pruebas con Vitest contra `presupuestos_test`.
- **pnpm 12** aplica una edad mínima de publicación: las versiones elegidas tienen al menos tres semanas.
- **El PDF de referencia** `PR-2026001029-R00.pdf` no está en este equipo: Git lo excluye porque tiene datos reales. La comparación visual (spec 6) se hace en el equipo original.
- **La instantánea emitida** (`IssuedDocument.snapshot`, plan 3) es la única fuente del PDF de un emitido. Guarda los importes como texto sin ceros finales («1246.3»): el PDF los formatea siempre.

## 4. Enfoques considerados

### 4.1 Cómo se genera el PDF

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Chromium dentro de la app** (`playwright-core`) con una plantilla HTML/CSS | Es lo que fija la spec. Chromium pagina solo: repite la cabecera de tabla, evita partir filas y pone número de página. Una sola imagen. | Imagen más grande (unos 150 MB más) y unos 200 MB de RAM mientras genera. |
| B. Servicio aparte de PDF (Gotenberg o Browserless) | La imagen de la app no crece. | Otro contenedor que desplegar, vigilar y copiar. Contradice la spec («app … + Chromium»). |
| C. Biblioteca de PDF sin navegador (pdfmake, react-pdf) | Imagen pequeña y rápida. | Hay que programar a mano la paginación, las cabeceras repetidas y los cortes. Contradice el stack de la spec. |

**Elegido: A.** Lo fija la spec y es el único que da gratis las reglas de paginación de la spec 5.7.

### 4.2 Cómo se escribe la plantilla

| Enfoque | A favor | En contra |
|---|---|---|
| **Funciones TypeScript que devuelven HTML**, con un único escapado | Sin dependencias ni `react-dom/server` en una ruta. Se prueba como texto. | El escapado es responsabilidad nuestra, así que lleva su propia prueba. |
| Componentes React con `renderToStaticMarkup` | Escapado automático. | Mete `react-dom/server` en una ruta de la App Router de Next 16, que lo desaconseja en código de servidor de componentes. Sin ventaja real para una página estática. |

**Elegido (decisión mía): funciones TypeScript** en `src/pdf/templates/v1/`, con un helper `html` que escapa todo lo interpolado salvo lo marcado como seguro. Una prueba comprueba que `<script>` y `&` llegan escapados.

### 4.3 Cuándo se genera el PDF del emitido

| Enfoque | A favor | En contra |
|---|---|---|
| a. Dentro de la transacción de emisión | Atómico: o hay número y PDF, o nada. | Chromium tarda 1–3 s con la fila y el contador bloqueados: las emisiones a la vez se ponen en cola. Si Chromium falla, **no se puede emitir**, y eso es un antiobjetivo. |
| **b. Justo después de confirmar la emisión, desde la instantánea, y otra vez en la descarga si falta** | Emitir no depende de Chromium. El PDF sale de la instantánea congelada, así que es el mismo contenido se genere cuando se genere. Cubre también los emitidos antes de este plan y la pérdida del volumen de archivos. | Durante un instante un emitido puede no tener archivo. La descarga lo genera. |
| c. Una cola de trabajos en segundo plano | Desacopla del todo. | Infraestructura nueva para una oficina con pocas emisiones al día. |

**Elegido (decisión mía): b.** Para que regenerar dé el mismo documento, todo lo que entra en el PDF tiene que estar congelado:

- **Los datos:** la instantánea.
- **La plantilla:** `templateVersion`. Una plantilla publicada no se edita; un cambio de diseño es `v2`.
- **La fuente:** se incrusta en la plantilla, sin depender de las fuentes del sistema.
- **El logo:** hoy se sobrescribe siempre en `uploads/logo.png`. Pasa a guardarse por contenido (`uploads/logo-<sha256 corto>.png`) y nunca se borra. Así la ruta guardada en la instantánea sigue apuntando al logo de aquel día.

## 5. Diseño

### 5.1 Piezas

```
src/pdf/
  browser.ts            lanzador único de Chromium (playwright-core), reutilizado; máximo 2 páginas a la vez
  render.ts             renderPdf(html, { header, footer }) → Uint8Array: setContent + page.pdf
  document.ts           buildDocument(source, { draft }) → PdfDocument: modelo plano, ya formateado (puro)
  templates/
    index.ts            TEMPLATES = { v1 } y renderTemplate(version, doc)
    v1/
      index.ts          cuerpo (carta + partidas + totales + condiciones), cabecera y pie
      styles.ts         CSS de impresión, con la fuente incrustada
      html.ts           helper html`…` con escapado, y safe() para lo ya escapado
src/modules/quotes/pdf.ts
  ensureIssuedPdf(id) · draftPdf(id) · pdfFileName(q) · readIssuedPdf(id)
src/app/api/presupuestos/[id]/pdf/route.ts      GET: descarga (emitido) o vista previa (borrador)
```

**Decisión mía:** la ruta va en `/api/presupuestos/[id]/pdf`, junto a `/api/logo` y las rutas de catálogo, que ya siguen ese patrón con comprobación de sesión.

### 5.2 Modelo del documento (`buildDocument`, puro)

Recibe una fuente con la forma de la instantánea, `{ company, quote }`. Para un borrador se construye igual desde `getSettings()` y `getQuote()` y se pasa por `JSON.parse(JSON.stringify(...))`: así borradores y emitidos van por el mismo camino y los importes llegan como texto. Devuelve un objeto **ya formateado**, sin cálculo ni decimales sueltos, que la plantilla solo pinta:

- `reference`: la referencia, o «BORRADOR».
- `draft`: si lleva marca de agua.
- `date`: la fecha del presupuesto, en dos formatos: corta («9/11/2026», para el pie) y larga («9 de noviembre de 2026», para la carta).
- `company`: razón social, CIF, dirección, teléfono, email, datos registrales y ruta del logo.
- `recipient`:
  - razón social;
  - nombre de la ubicación;
  - dirección: **la de la ubicación si la tiene; si no, la fiscal del cliente** (spec 5.7, «la de la ubicación o la fiscal»);
  - «A la atención de {contacto}», si hay contacto. **Decisión mía:** la spec no lo pide, pero el presupuesto guarda el contacto y es lo habitual en una carta. Para confirmar con el ejemplo.
- `letter`: lugar, saludo, introducción + `asunto` del presupuesto, y despedida en párrafos (separados por líneas en blanco).
- `title` y `clientName`: asunto y cliente, para la página 2.
- `rows`: lista plana en orden. Cada fila es una de estas:
  - `{ kind: "part", number, title, total }`;
  - `{ kind: "sub", number, title, total }`;
  - `{ kind: "line", text, quantity }`.
- `totals`: `{ base, taxes: [{ label: "IVA 21 %", amount }], total }`, en texto «1.219,00 €».
- `conditions`: exclusiones, forma de pago y «{n} días» de validez. Una exclusión vacía no se imprime.
- `place`: «Alcalá de Henares a {fecha larga}», para el final.

**Reglas de las filas:**

- **Líneas ocultas:** no salen, pero su importe ya está en el total de su subpartida (spec 5.5).
- **Líneas de un conjunto:** salen como líneas normales, sin fila con el nombre del conjunto. **Decisión mía:** el conjunto es una herramienta de cálculo interna y en el documento interesa qué se instala. Para confirmar con el ejemplo.
- **Cantidad:** con la unidad («2 ud», «40 m», «10 h»), formateada con hasta 4 decimales y sin ceros sobrantes («1,5 h»).
- **Subpartida de precio global:** su total es su importe global y sus líneas salen con descripción y cantidad, como las demás.
- **Partida o subpartida sin título:** sale con su número y «Sin título». **Decisión mía:** mejor que una fila en blanco.

### 5.3 Plantilla `v1`

La maqueta `docs/diseno/maquetas/pdf.html` es la referencia visual.

- **Página A4**, márgenes de 18 mm a los lados, cabecera de 30 mm y pie de 16 mm.
- **Cabecera de cada hoja** (`headerTemplate` de Chromium): logo, «INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL» y la referencia (o «BORRADOR»). El logo va como `data:` URI, porque las cabeceras de Chromium no cargan recursos externos.
- **Pie de cada hoja** (`footerTemplate`): fecha, datos registrales, CIF y «Página X de Y» (clases `pageNumber` y `totalPages` de Chromium).
- **Hoja 1, la carta:** empresa, destinatario, lugar y fecha, «Asunto: {referencia}», saludo, introducción y despedida. Después, salto de página.
- **Hoja 2 y siguientes:**
  - cliente y título;
  - tabla `P | Denominación | Cantidad | Total`;
  - totales;
  - exclusiones, forma de pago y validez;
  - lugar y fecha.
- **Reglas de paginación** (spec 5.7):
  - `thead` se repite en cada hoja (Chromium lo hace solo con `display: table-header-group`);
  - `tr { break-inside: avoid }`;
  - totales y condiciones con `break-inside: avoid`;
  - **nada de reducir la letra**: tamaño fijo de 10 pt, y si no cabe, hoja nueva.
- **Borrador:** una capa `position: fixed` con «BORRADOR» en diagonal y al 7 % de opacidad. Chromium repite los elementos fijos en cada hoja impresa.
- **Fuente: Archivo**, la de la interfaz, incrustada en el CSS como `@font-face` con datos base64 desde `@fontsource-variable/archivo`. **Decisión mía:** sin fuentes del sistema, el documento es igual en cualquier máquina.
- **Importes y cantidades:** siempre llegan ya formateados desde `buildDocument`. La plantilla no formatea.

**Riesgo a comprobar en la primera tarea:** que la fuente incrustada en el documento también se use en `headerTemplate` y `footerTemplate`. Chromium los dibuja aparte. Si no la usa, la cabecera y el pie llevan su propio `@font-face` dentro de la plantilla, que también es HTML.

### 5.4 Chromium (`src/pdf/browser.ts` y `render.ts`)

- **Un único navegador por proceso:** `chromium.launch()` la primera vez que hace falta, y se reutiliza. Si se cae (evento `disconnected`), el siguiente PDF lanza otro.
- **Un contexto nuevo por PDF**, que se cierra siempre en `finally`, con:
  - `javaScriptEnabled: false`;
  - todas las peticiones de red abortadas (`context.route("**", r => r.abort())`), porque todo va incrustado.

  Así un texto de un cliente no puede hacer que el servidor pida nada a la red.
- **Como mucho 2 PDF a la vez**, con un semáforo de 2. Si llega un tercero, espera. **Decisión mía:** acota la memoria en un servidor de oficina.
- **Tiempo máximo de 30 s.** Si se pasa, error «No se pudo generar el PDF».
- **`page.pdf`** con `format: "A4"`, `printBackground: true`, `displayHeaderFooter: true` y `preferCSSPageSize: false`.
- **Dependencias:**
  - `playwright-core` **1.64.1**, de producción. Next 16 ya lo trata como paquete externo del servidor, y la salida `standalone` lo incluye.
  - El navegador es el *headless shell* de Chromium de esa misma versión: en Docker se instala en la imagen y en desarrollo con `pnpm exec playwright-core install chromium-headless-shell` (unos 100 MB, en `~/.cache/ms-playwright`).

### 5.5 PDF del emitido (`ensureIssuedPdf`)

1. **Al emitir:** `issueAction`, cuando `issueQuote` ya ha confirmado, llama a `ensureIssuedPdf(id)`. Si falla, la emisión **sigue siendo válida**: se registra el error en el log y el editor muestra «El PDF se generará al descargarlo».
2. **`ensureIssuedPdf(id)`** trabaja dentro de una transacción que bloquea la fila de `IssuedDocument` de ese presupuesto (`SELECT … FOR UPDATE`, con un tiempo máximo de transacción de 60 s porque Chromium tarda). Así **dos descargas a la vez del mismo presupuesto se ponen en cola**: la segunda encuentra el archivo hecho. Las de otros presupuestos no esperan.
   - **Si `pdfPath` existe, el archivo está y su SHA-256 coincide con el guardado,** no hace nada.
   - **Si no hay archivo, o su SHA-256 no coincide** (volumen perdido, copias de base de datos y de volumen de horas distintas, archivo tocado a mano):
     - genera el PDF desde la instantánea con la plantilla de `templateVersion`;
     - lo escribe en `DATA_DIR/pdf/<año>/<referencia>.pdf`, primero en un temporal que luego renombra, para que nunca quede un PDF a medias;
     - guarda `pdfPath` y el `sha256` nuevo.

     Si ya había `pdfPath`, lo registra en el historial («PDF regenerado desde la instantánea», con el motivo: «faltaba el archivo» o «el archivo no coincidía»).
   - **Por qué regenerar y no dar error (decisión mía, tras la comprobación del constructor):** la fuente de verdad del emitido es la **instantánea**; el PDF se deriva de ella con una plantilla congelada. Un archivo que no coincide nunca puede contener algo distinto de lo emitido si se regenera desde la instantánea. Un error permanente, en cambio, dejaría el presupuesto sin documento hasta que alguien tocase el servidor. Chromium no genera bytes idénticos dos veces, así que tras regenerar el hash cambia, y el historial lo refleja.
3. **Descarga** (`GET /api/presupuestos/[id]/pdf`):
   - Sin sesión: 401. Presupuesto inexistente: 404.
   - **Emitido** (cualquier estado distinto de borrador, también los sustituidos):
     - llama a `ensureIssuedPdf` y lee el archivo;
     - registra «Descarga de PR-…» en el historial (spec 5.9: «descargas de PDF emitidos»).
   - **Borrador:** genera la vista previa al momento, con marca de agua y sin guardarla. No se registra.
   - **Cabeceras de la respuesta:**
     - `Content-Type: application/pdf`;
     - `Content-Disposition: inline; filename="PR-2026000002-R00.pdf"`, o `BORRADOR-<cliente>.pdf` en un borrador, con el nombre limpio de caracteres raros;
     - `Cache-Control: private, no-store`.

   **Decisión mía:** `inline` abre el PDF en el visor del navegador, desde donde se puede imprimir o guardar.
4. **Permisos:** cualquier usuario con sesión puede ver y descargar cualquier presupuesto, igual que lo edita (spec 5.1). Un usuario desactivado no tiene sesión.
5. **Interfaz:**
   - En un emitido, «Descargar PDF» en el panel del editor, en el listado (un enlace por fila) y en la ficha del cliente.
   - En un borrador, «Vista previa (PDF)» en el panel del editor.

### 5.6 Logo por contenido

`saveLogo` guarda en `uploads/logo-<12 primeros caracteres del sha256>.<ext>` y nunca borra los anteriores, que pesan como mucho 2 MB cada uno.

- `/api/logo` sigue sirviendo el actual (`CompanySettings.logoPath`).
- El PDF usa el `logoPath` de la instantánea.
- Si ese archivo no existe (emitidos de antes de este cambio, cuyo `logo.png` se haya sobrescrito), usa el logo actual y lo deja escrito en el log.

### 5.7 Docker

- **Etapa `runtime`:**
  - `ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`;
  - `RUN npx -y playwright-core@1.64.1 install --with-deps chromium-headless-shell` como root, antes de `USER node`.

  `--with-deps` instala las bibliotecas del sistema que necesita Chromium en Debian bookworm. **A comprobar en la tarea:** el nombre exacto del comando en 1.64.1 (`chromium-headless-shell` o `--only-shell`).
- **Etapa `build`:** sin cambios. `playwright-core` se queda como dependencia externa y la copia `standalone` lo incluye. Si no lo incluye, se copia de `node_modules`.
- **`.dockerignore`:** sin cambios.
- **`compose.yaml`:**
  - El servicio `app` **deja de publicar el 3000**: en Dokploy entra por Traefik con HTTPS (antiobjetivo 4).
  - Un archivo nuevo, `compose.local.yaml`, lo publica para probar la imagen en un equipo: `docker compose -f compose.yaml -f compose.local.yaml up -d --build`.
  - Los volúmenes siguen siendo con nombre (`pgdata` y `appdata`), que es lo que piden las copias de volúmenes de Dokploy.
  - `mem_limit` sugerido de 1 GB para `app`, comentado y sin activar: lo decide quien despliega.

### 5.8 Despliegue en Dokploy

Documentación nueva en `docs/despliegue.md`, paso a paso:

1. **Proyecto y aplicación Compose** desde el repositorio privado de GitHub (`obiticadev/presupuestos-isf`, rama `master`, archivo `compose.yaml`). El acceso es con la app de GitHub de Dokploy o con una clave de despliegue de solo lectura.
2. **Variables de entorno** en Dokploy, nunca en el repositorio:
   - `POSTGRES_PASSWORD`, larga y aleatoria;
   - `BETTER_AUTH_SECRET`, de 32 o más caracteres;
   - `BETTER_AUTH_URL=https://<dirección interna>`.
3. **Dominio:** pestaña Domains, servicio `app`, puerto 3000.
   - Dokploy añade solo las etiquetas de Traefik y la red `dokploy-network` a `app`. `db` sigue solo en la red `internal`, sin publicar.
   - Cada cambio de dominio exige volver a desplegar.
4. **HTTPS interno.** **Decisión mía, recomendada:** un certificado de una CA interna de la oficina (por ejemplo, creada con `step-ca` o `mkcert`) para `presupuestos.<dominio interno>`.
   - Se sube en Dokploy → Certificates y el dominio usa «Certificate: custom».
   - El certificado raíz de la CA se instala una vez en cada equipo de la oficina.
   - **Alternativa** si la empresa tiene un dominio público y acceso a su DNS: Let's Encrypt con desafío DNS-01 para un subdominio interno. Así no hay que instalar nada en los equipos, pero hace falta configurar Traefik.
   - Lo decide quien despliega (spec 5.12).
5. **Primer administrador:**
   ```
   docker compose exec app node scripts/admin.mjs create …
   ```
   Desde Dokploy, se pasa `ADMIN_PASSWORD` como variable de la orden.
6. **Comprobaciones:**
   - `/api/health` con HTTPS;
   - `migrate` termina con «Exited (0)»;
   - una emisión con su PDF;
   - reinicio del servidor y redespliegue sin pérdida de datos (spec 6).

### 5.9 Copias de seguridad

| Enfoque | A favor | En contra |
|---|---|---|
| **A. Las copias programadas de Dokploy:** copia de la base de datos del servicio `db` del Compose y copia del volumen `appdata`, a un destino S3 | Las prefiere la spec 5.12. Se configuran y se restauran desde la interfaz. | Solo van a destinos **S3** (o compatibles: MinIO en un NAS, Backblaze B2, Wasabi o Cloudflare R2). La retención no está documentada: hay que comprobarla al configurarlas. |
| B. Un contenedor `backup` propio en el Compose: `pg_dump` y `tar` cada noche hacia una carpeta del NAS montada en el servidor | Sirve para cualquier destino. Retención explícita en el script. | Más piezas que mantener. Su restauración es nuestra, sin interfaz. |
| C. Cron en el servidor | Simple. | Fuera de Dokploy y del repositorio: nadie lo ve ni lo actualiza. |

**Elegido (decisión mía): A**, como pide la spec. **Depende de que la empresa tenga un destino S3 o compatible** (spec 7.6). Si no lo tiene, se usa B: el diseño la deja descrita en `docs/despliegue.md`, pero no se construye mientras no haga falta.

**Configuración en Dokploy:**

- **Destino S3:** creado en Settings → Destinations y probado con «Test».
- **Base de datos:**
  - copia del servicio `db` (PostgreSQL), base `presupuestos`, cada noche a las 02:00;
  - prefijo `presupuestos/db/`.
- **Volumen `appdata`** (PDF y logos):
  - cada noche a las 02:30, prefijo `presupuestos/appdata/`;
  - modo «Container OFF»: la app se para unos segundos a esa hora, para que la copia sea coherente.
- **Retención propuesta: 30 copias diarias.** Si Dokploy no la tiene, se pone con una regla de ciclo de vida en el bucket. Es el punto 7.6 de la spec, pendiente de la empresa.

**Restauración** (en `docs/despliegue.md`, y obligatoria antes de dar el sistema por operativo, spec 5.12 y 6):

1. Parar la app.
2. Restaurar la base de datos con la función de restauración de Dokploy, o, a mano, con `pg_restore` dentro de `db` a partir del volcado.
3. Restaurar el volumen `appdata`. Dokploy exige que el volumen no exista y que nada lo use: se borra antes.
4. Arrancar.
5. Comprobar:
   - que el último presupuesto emitido descarga su PDF con el mismo SHA-256;
   - que, si se restaura solo la base de datos, el PDF se regenera desde la instantánea y queda en el historial.

**Prueba de restauración:** en el mismo servidor, en un proyecto de Dokploy aparte («presupuestos-restore»), para no tocar producción, y apuntando el resultado en `progreso.md`.

### 5.10 Documentación de operación

- **`docs/despliegue.md`** (nuevo): Dokploy, dominio y certificado, variables, primer administrador, copias, restauración y prueba de restauración.
- **`docs/operacion.md`:**
  - **actualizar la versión:** Dokploy despliega `master`; `migrate` aplica las migraciones antes de arrancar la app;
  - **revertir:** volver a desplegar el commit anterior **no revierte una migración**. Si la versión nueva migró la base, revertir exige restaurar la copia de antes de actualizar, así que se hace una copia manual antes de cada actualización que lleve migraciones;
  - **instalar el navegador** del PDF en desarrollo.
- **README:** el PDF y el despliegue en el estado y la estructura.

## 6. Pruebas

**Automáticas (Vitest):**

1. `buildDocument`:
   - líneas ocultas fuera;
   - líneas de conjunto dentro;
   - destinatario con la dirección de la ubicación y, sin ella, la fiscal;
   - importes «1.219,00 €» desde «1219» y «1246.3»;
   - cantidades «2 ud» y «1,5 h»;
   - «BORRADOR» y `draft` en un borrador.
2. Plantilla:
   - escapa `<script>` y `&` de un asunto;
   - `thead` presente;
   - la marca de agua solo en el borrador.
3. **PDF real con Chromium:**
   - un presupuesto corto y otro de 45 líneas;
   - se extrae el texto con `unpdf` y **cada descripción de línea visible aparece**, y ninguna oculta (spec 6, «PDF corto y largo sin pérdida de contenido»);
   - el largo tiene al menos 3 páginas;
   - el borrador contiene «BORRADOR».
4. Emisión:
   - tras `issueQuote` + `ensureIssuedPdf`, el archivo existe, `sha256` coincide y otra llamada no lo regenera;
   - si se borra el archivo, se regenera y queda en el historial;
   - dos `ensureIssuedPdf` a la vez del mismo presupuesto: el `sha256` de la base coincide con el archivo final.
5. Descarga:
   - 401 sin sesión;
   - el emitido registra «Descarga»;
   - un archivo alterado se regenera desde la instantánea y queda en el historial;
   - el borrador no se guarda.
6. Logo: guardar dos logos deja los dos archivos, y la instantánea de un emitido sigue apuntando al suyo.

Las pruebas de Chromium necesitan el navegador instalado (`pnpm exec playwright-core install chromium-headless-shell`). Si falta, fallan con un mensaje que dice cómo instalarlo: no se saltan en silencio.

**Manuales (spec 6):**

- comparar el PDF con `PR-2026001029-R00.pdf` en el equipo original;
- la maqueta frente al PDF real;
- en el servidor: reinicio, redespliegue y restauración.

## 7. Para confirmar (decisiones mías y pendientes de la empresa)

**Pregunta para el usuario (la más importante, de la comprobación del constructor):** ¿el plan 4 incluye **ejecutar** el despliegue en el servidor de la oficina, o termina con la imagen probada en local y `docs/despliegue.md`?

- Para ejecutarlo hace falta saber:
  - si Dokploy ya está instalado y en qué versión (las copias de base de datos y de volúmenes de un Compose piden **0.22 o posterior**);
  - si quien ejecute el plan tendrá acceso al servidor y a Dokploy;
  - si hay DNS interno y un nombre para la aplicación;
  - si hay un destino S3 (o compatible) hoy.
- **Decisión mía provisional:** el plan deja todo listo y probado en local (imagen, Compose, PDF dentro del contenedor, persistencia tras reinicio y redespliegue) y la parte del servidor queda como lista de pasos en `docs/despliegue.md`, que se hará con el usuario.
- **Sin destino S3** no se cumple el éxito (copia fuera del servidor más restauración probada): en ese caso se construye el plan B, el contenedor `backup`, como tarea añadida.

**Decisiones mías, para revisar:**

1. Ruta `/api/presupuestos/[id]/pdf` y descarga `inline`.
2. Plantilla en funciones TypeScript con escapado propio, sin React.
3. PDF del emitido generado después de emitir, no dentro de la transacción de emisión, y regenerado desde la instantánea si falta o no coincide su hash. La generación se serializa por presupuesto.
4. Logo guardado por contenido y sin borrar los anteriores.
5. «A la atención de {contacto}» en la carta.
6. Líneas de conjunto sin fila con el nombre del conjunto.
7. Fuente Archivo incrustada.
8. Como mucho 2 PDF a la vez y 30 s de tiempo máximo.
9. HTTPS con una CA interna (alternativa: Let's Encrypt con DNS-01).
10. Copias de Dokploy a S3, con el contenedor propio como plan B, y 30 copias diarias.
11. El puerto 3000 deja de publicarse en `compose.yaml`.

**Pendiente de la empresa** (spec 7): destino S3 y retención (7.6), logo y textos definitivos (7.3), y la comparación con el PDF real.

## 8. Lo que queda a criterio de quien construye

- Medidas finas de la plantilla, siempre que cumplan las reglas de 5.3 y el aspecto de la maqueta.
- Nombres internos de funciones y archivos dentro de `src/pdf/`.
- Cómo se implementa el semáforo de PDF a la vez.
- El texto exacto de los mensajes de error, en español y en la línea de los existentes.

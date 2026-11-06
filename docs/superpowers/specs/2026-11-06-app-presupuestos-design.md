# Diseño: aplicación interna de presupuestos

Fecha: 2026-11-06 · Estado: pendiente de aprobación

## 1. Intención

INSTALACIONES, SERVICIOS Y FORMACIÓN, S.L. (ISF, Alcalá de Henares) prepara hoy los presupuestos en Excel (`Word y Excel con datos reales/PR-2026001029.xls`) y los pasa a Word. Un prototipo con un cuaderno de Copilot no servía: no guardaba nada ni generaba documentos de forma fiable.

Se quiere una aplicación web interna, accesible solo desde la red de la oficina y desplegada con Dokploy, para:

- gestionar de forma intuitiva el catálogo (altas, cambios y bajas) y los clientes;
- montar presupuestos con partidas y conjuntos de servicios que calculan solos sus dependencias;
- generar el PDF corporativo;
- seguir el estado de cada presupuesto y consultar, por ejemplo, «los de octubre enviados y aún sin aprobar».

Debe ser sencilla de usar y de mantener.

**Éxito:** un presupuestador crea un cliente, monta un presupuesto con desplazamiento, horas y un conjunto (por ejemplo, bombas con su manguera), lo emite con número, descarga un PDF con el contenido del ejemplo y después puede filtrar por mes y estado. Todo ello sin tocar código ni calcular metros a mano.

**Antiobjetivos** (sería un fracaso aunque funcionase):

- importes con errores de coma flotante o de redondeo;
- un PDF que corte partidas o encoja la letra;
- que un documento emitido cambie después;
- que una bomba se valore sin manguera;
- un motor de reglas que nadie entienda.

## 2. Objetivos y no objetivos

**Dentro de alcance (v1):** usuarios y roles, catálogo, clientes, conjuntos configurables, presupuestos (editor, cálculos, validaciones, estados, numeración y revisiones), PDF, importación y exportación de catálogo en Excel, despliegue y copias de seguridad.

**Fuera de alcance:** cobros, facturación y contabilidad (el usuario lo confirmó: basta con estados de aprobación), IA o chat, envío de correos, firma electrónica, acceso desde Internet, Microsoft 365, ERP, editor visual de plantillas y cálculo automático de distancias.

## 3. Restricciones (fijadas por el usuario)

- **Stack:** Next.js + TypeScript, PostgreSQL, Prisma con migraciones, Zod, Playwright/Chromium para el PDF y Docker Compose compatible con Dokploy.
- **Arquitectura:** monolito modular, un repositorio, un gestor de paquetes, versiones fijadas y lockfile. Sin Redis, colas ni almacenamiento externo.
- **Autenticación:** con una biblioteca mantenida. Nada de criptografía ni sesiones hechas a mano.
- **Importes:** aritmética decimal, nunca float. La lógica de cálculo vive en un único módulo que usan el editor, el PDF y la exportación, nunca en componentes visuales.
- **Materiales originales:** se preservan. Los precios y condiciones históricos (John Deere, contraincendios, 30/30/30/10, márgenes del Excel) no se importan como catálogo ni se convierten en reglas.
- **Precios:** todos los actuales son de ejemplo. Los reales llegarán con la aplicación ya construida, así que todo precio, tramo, IVA y texto habitual debe poder editarse desde administración.

## 4. Enfoques considerados

Lo que había que decidir era cómo expresar reglas del tipo «la bomba no se valora sin saber qué manguera lleva», aplicables a cualquier servicio y no solo a bombas.

| Enfoque | Ventaja | Inconveniente | Decisión |
|---|---|---|---|
| A. Bloques programados por servicio («Añadir bombas»…) | Muy claro y fácil de probar | Cada servicio nuevo exige tocar código | Descartado: el usuario aclaró que se presupuestará cualquier servicio |
| **B. Conjuntos configurables con un repertorio cerrado de fórmulas** | Servicios nuevos sin código; pocas fórmulas fijas, fáciles de probar | Una regla que no esté en el repertorio requiere añadir una fórmula en código | **Elegido** («algo así») |
| C. Motor de reglas libre (fórmulas y condiciones escritas por el usuario) | Máxima flexibilidad | Difícil de usar, propenso a errores en importes, caro de mantener | Descartado |
| D. Líneas libres con aviso al emitir | Lo más simple | Los metros se calculan a mano, que es justo el error a evitar | Descartado |

## 5. Diseño

### 5.1 Usuarios y roles

- Sin registro público. El primer administrador se crea con un comando documentado (`seed`/CLI), que también sirve para recuperar el acceso.
- **Administrador:** usuarios, configuración, catálogo, conjuntos, clientes y presupuestos.
- **Presupuestador:** consulta el catálogo y gestiona clientes y presupuestos. Todos los usuarios ven y editan todos los presupuestos, incluidos los de otros (confirmado por el usuario). El campo «responsable» sirve para filtrar, no para restringir.
- Los usuarios se desactivan y no se borran: el historial y la autoría se conservan.
- *Decisión mía:* biblioteca **Better Auth** con usuario/email y contraseña. Se encarga del hash y de las sesiones en base de datos. Los roles se guardan en el usuario y se comprueban en servidor en cada acción y descarga.

### 5.2 Catálogo

Un **concepto** representa todo lo que tiene precio: material, servicio, hora de personal, km o manguera.

| Campo | Notas |
|---|---|
| código | único |
| categoría | tabla de categorías editable: Servicios, Personal, Material, Mangueras, Bombas… |
| descripción | |
| unidad de cobro | km, h, m, ud… (lista editable) |
| precio de venta | decimal; obligatorio para poder usarlo en un presupuesto |
| coste | decimal, opcional |
| impuesto | referencia a la tabla de impuestos (por defecto IVA 21 %) |
| estado | activo / inactivo |
| validado | sí/no; un concepto no validado se puede usar en borradores, pero bloquea la emisión |
| observaciones | |
| datos de proveedor | opcionales: fabricante, referencia, proveedor, PVP y % de descuento (estructura de la hoja «LISTADO MATERIAL») |

- **Personal** (hoja «Coste Horas Operarios»): cada combinación de perfil y tipo de hora es un concepto, por ejemplo `OF1-ELEC-NORMAL`, `OF1-ELEC-EXTRA`, `OF1-ELEC-NOCT` y `OF1-ELEC-VIAJE`. Dietas, medias dietas y km son conceptos de Servicios. *Decisión mía:* mantener un catálogo plano en lugar de tablas con varias columnas de precio, para que el editor, la importación y los cálculos sean uniformes.
- **Tramos** (bomba ≤7,5 kW y >7,5 kW): son conceptos distintos y quien presupuesta elige el que corresponde. No hay selección automática por potencia.
- **Margen:** *decisión mía, pendiente de confirmar por la empresa.* Si un concepto tiene coste pero no precio de venta, el formulario propone `venta = coste × (1 + margen)`, con un margen por defecto configurable (35 %, como en el Excel). Lo que se guarda y se usa es siempre el precio de venta.
- **Eliminar:** un mismo botón. Si el concepto nunca se ha usado, se borra; si se ha usado, se desactiva. Los inactivos no aparecen en las nuevas selecciones, pero siguen visibles en los presupuestos existentes.
- Búsqueda por código o descripción y filtros por categoría, estado y validado.
- **Importación de Excel:** se sube el archivo, se ve una vista previa con los errores por fila (código duplicado, precio no numérico, categoría, unidad o impuesto inexistentes) y se confirma. Si se confirma, entra todo o nada. Las filas con un código existente actualizan ese concepto, y la vista previa lo indica. La **exportación** usa el mismo formato de columnas.
- **Sin vigencias en la v1** (*decisión mía*): cada concepto tiene un único precio vigente. Los cambios de precio quedan en el historial (5.9). Las columnas `Vigente_desde`/`Vigente_hasta` de `03_Catalogo.xlsx` no se importan.
- **Formato de importación** (*decisión mía*): formato plano propio, el mismo de la exportación, con una plantilla descargable desde la aplicación. No se leen las hojas antiguas («LISTADO MATERIAL», «Coste Horas Operarios»): los precios reales llegarán nuevos y se cargarán en esa plantilla.
- Datos iniciales: los seis conceptos de `Para agregar al cuaderno/03_Catalogo.xlsx`, todos como no validados. Las bombas llevan la unidad «ud» por aclarar: el ejemplo del usuario las trata como precio por bomba, y los precios reales se cargarán más adelante.

### 5.3 Conjuntos (plantillas de cálculo)

Un administrador define conjuntos desde la interfaz:

- **Nombre y descripción** (por ejemplo, «Instalación de bomba»).
- **Concepto principal:** un concepto fijo, o «elegir uno de la categoría X». La cantidad N la introduce quien presupuesta.
- **Datos:** una lista de parámetros numéricos con nombre, unidad y obligatoriedad (por ejemplo, «Distancia al cuadro», m, obligatorio).
- **Componentes:** cada uno es un concepto fijo o «elegir uno de la categoría X», obligatorio u opcional, con una fórmula de cantidad del repertorio cerrado:
  - `FIJA(k)`: cantidad = k
  - `POR_CANTIDAD(k)`: cantidad = k × N
  - `POR_CANTIDAD_Y_DATO(dato, k)`: cantidad = k × N × dato

Ejemplo, con precios de ejemplo:

```
«Instalación de bomba»
  Principal:  elegir de Bombas        N = 2      102 €/ud
  Dato:       Distancia al cuadro      10 m       obligatorio
  Componente: elegir de Mangueras      obligatorio, POR_CANTIDAD_Y_DATO(distancia, 1)
              → 2 × 10 = 20 m × 10 €/m
  Importe: 2 × 102 + 20 × 10 = 404 €  ( = 2 × (102 + 10 × 10) )
```

- Al insertar un conjunto en un presupuesto se guarda una **instancia**: la plantilla de origen, N, los datos y los conceptos elegidos. A partir de ella se generan las líneas. En borrador, cambiar N, un dato o un concepto elegido recalcula esas líneas. Las líneas generadas no se editan a mano, salvo para un ajuste de precio (5.5).
- Si falta un concepto obligatorio por elegir o un dato obligatorio, la instancia queda **incompleta**: sus líneas sin valorar se muestran marcadas y la emisión se bloquea. Esto aplica la regla «no se valora la bomba sin saber qué manguera se usa».
- Un presupuesto sin conjuntos (solo desplazamiento y horas) es perfectamente válido.
- La plantilla se puede modificar después: las instancias ya insertadas no cambian, porque guardan su propia copia de la definición.
- Ampliar el repertorio de fórmulas se hace en código, con pruebas.

### 5.4 Clientes

- Razón social, nombre comercial, CIF/NIF (validado como formato no vacío; *decisión mía:* sin comprobar dígito de control en la v1), dirección fiscal y observaciones.
- **Contactos** (nombre, cargo, email, teléfono) y **ubicaciones de trabajo** (nombre, dirección, localidad, provincia), varias de cada.
- **Condiciones habituales:** forma de pago, exclusiones y validez de la oferta. Se copian al presupuesto, donde pueden modificarse.
- Búsqueda y el mismo comportamiento de «eliminar» que en el catálogo.

### 5.5 Presupuestos

**Estructura:** presupuesto → partidas (1, 2…) → subpartidas (1.1, 1.2…) → líneas. *Decisión mía:* dos niveles de agrupación como máximo, que es lo que usa el ejemplo.

**Dos modos de subpartida** (los dos aparecen en el ejemplo real; confirmado por el usuario):

- **Por suma** (como la 1.2): el importe es la suma de sus líneas con precio.
- **Precio global** (como la 1.1): la subpartida tiene su propia cantidad y precio unitario (15.845,22 €), y sus líneas son *descriptivas*: llevan descripción y cantidad, pero no precio. Las líneas descriptivas no cuentan en el cálculo ni en la regla «todas las líneas con precio». Se pueden escoger del catálogo, que solo aporta la descripción.

**Cabecera:**

- cliente, ubicación y contacto;
- responsable (por defecto, el usuario que lo crea);
- fecha;
- asunto/alcance (texto libre de la carta: «…en referencia a…»);
- condiciones (forma de pago, exclusiones y validez, copiadas del cliente o de los textos por defecto).

**Líneas:**

- Cada línea es un concepto del catálogo, un concepto específico del presupuesto (descripción, unidad, precio e impuesto libres, sin pasar al catálogo) o una línea generada por un conjunto.
- Al añadir un concepto se **copian** su descripción, unidad, precio e impuesto. Los cambios posteriores del catálogo no afectan a lo ya insertado.
- **Ajuste de precio:** se puede cambiar el precio unitario de una línea indicando un motivo obligatorio. Se registra el precio original, el nuevo, el usuario y la fecha. *Decisión mía:* cualquier rol puede ajustar; el control está en la constancia, no en un flujo de aprobación.
- **Visible en documento:** sí/no. Las líneas ocultas cuentan en el total de su partida, pero no se imprimen (en el Excel real, desplazamientos, dietas y horas van dentro de la partida 1.2 sin aparecer en el PDF). Por defecto, visibles.

**Conceptos obligatorios:** en configuración se marcan los conceptos o categorías que todo presupuesto debe incluir (inicialmente, desplazamiento y horas de programador). Para emitir, cada uno debe tener una cantidad mayor que cero, o cero con una confirmación expresa y un motivo.

**Desplazamiento:** se introducen los km facturables totales (ya incluidos los viajes, los vehículos y la ida y vuelta) y una nota libre opcional sobre ese desglose. El origen habitual (Alcalá de Henares) es un texto configurable que se muestra como recordatorio. No se calculan distancias.

**Cálculo** (módulo único `src/modules/quotes/calculation`, con `decimal.js`):

1. importe de línea = cantidad × precio unitario (o, en una subpartida de precio global, cantidad × precio de la subpartida), redondeado a 2 decimales (*half-up*);
2. subpartida = suma de sus líneas; partida = suma de sus subpartidas; base imponible = suma de las partidas;
3. por cada tipo de impuesto, cuota = (suma de las bases de las líneas con ese tipo) × tipo, redondeada a 2 decimales (*half-up*);
4. total = base + suma de cuotas.

Se almacenan importes en `numeric(14,2)`, y cantidades y precios unitarios en `numeric(14,4)`.

Pruebas obligatorias:

- 100 km × 0,30 + 20 h × 50 + 30 m × 10 → base 1.330,00; IVA 279,30; total 1.609,30;
- el conjunto de bombas de 5.3 → 404,00;
- casos de redondeo en el límite (,005).

**Estados** (cambio manual):

| Estado | Notas |
|---|---|
| borrador | editable |
| emitido | asigna número |
| enviado | equivale a «pendiente de aprobación»; no envía ningún correo |
| aceptado | |
| rechazado | |
| caducado | la aplicación avisa cuando la validez ha vencido, pero no cambia el estado sola |

Cada cambio de estado queda en el historial.

**Listado:**

- filtros por cliente, referencia, rango de fechas (con atajo «este mes» o «mes X»), responsable y estado;
- columnas: referencia, cliente, fecha, estado y total;
- suma de los totales filtrados.

**Duplicar:** crea un borrador sin número con las mismas partidas, líneas e instancias de conjunto, y con sus precios tal como estaban. Avisa de las líneas cuyo concepto está ahora inactivo o tiene otro precio en el catálogo, y ofrece «actualizar precios desde catálogo».

### 5.6 Emisión, numeración y revisiones

**Validaciones al emitir** (los borradores pueden estar incompletos):

- cliente y ubicación;
- al menos una línea;
- conceptos obligatorios resueltos;
- sin instancias de conjunto incompletas;
- sin conceptos no validados: se comprueba el estado **actual** del concepto enlazado en cada línea con precio (la línea guarda el id del concepto además de la copia). Las líneas específicas del presupuesto no pasan esta regla, porque su precio lo introduce a propósito quien presupuesta y queda en el historial;
- todas las líneas con precio e impuesto;
- condiciones rellenas.

Los errores se muestran como una lista clara que enlaza a cada problema.

**Número:**

- Se asigna en la emisión, dentro de una transacción con bloqueo de fila sobre el contador (`SELECT … FOR UPDATE`).
- Formato configurable mediante un patrón. Por defecto `PR-{AAAA}{NNNNNN}-R{RR}`, deducido del ejemplo `PR-2026001029-R00`.
- **Pendiente de confirmar con la empresa:** si la secuencia se reinicia cada año. Es una opción de configuración (reinicio anual sí/no) y el valor inicial del contador también es configurable.

**Al emitir se guardan:**

- una instantánea JSON completa del documento (empresa, cliente, ubicación, contacto, partidas, líneas, precios, impuestos, condiciones y textos);
- el PDF generado, en un volumen persistente;
- la versión de la plantilla.

A partir de ahí el contenido no se edita; solo se cambia el estado. La descarga siempre sirve ese mismo PDF.

**Nueva revisión:**

- A partir de un emitido, se crea un borrador con el mismo número base y la revisión siguiente (R01, R02…).
- La revisión anterior se conserva intacta. *Decisión mía:* se marca como «sustituida por R01» **cuando R01 se emite**, no al crear el borrador. Si el borrador se abandona, la anterior sigue vigente. Una revisión sustituida ya no cambia de estado. El listado y su suma solo cuentan la última revisión emitida de cada número, y además cada borrador.

### 5.7 Documento PDF

Plantilla HTML/CSS **nueva**, versionada en `src/pdf/templates/`. Se renderiza a A4 con Playwright/Chromium. El usuario confirmó que no hace falta calcar el Word, pero el contenido debe ser el del ejemplo.

**En todas las páginas:**

- cabecera con logo y «INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL»;
- referencia;
- pie con fecha, datos registrales y CIF de la empresa (configurables), y número de página.

**Página 1 (carta):**

- datos de la empresa;
- destinatario (razón social y dirección de la ubicación o la fiscal);
- «Alcalá de Henares a {fecha}»;
- «Asunto: {referencia}»;
- saludo;
- texto de presentación con el alcance;
- despedida.

Los textos son configurables.

**Página 2 y siguientes:**

- cliente y título;
- tabla `P | Denominación | Cantidad | Total`: las partidas y subpartidas con su total, y las líneas visibles con descripción y cantidad, sin precio;
- importe del presupuesto, IVA por tipo y total presupuesto;
- exclusiones;
- forma de pago;
- validez;
- lugar y fecha.

**Reglas del documento:**

- Si no cabe, sigue en páginas de continuación, repitiendo la cabecera de tabla y sin partir una fila. Nunca se eliminan partidas ni se reduce la letra.
- Importes siempre con 2 decimales y formato español (`21.628,62 €`).
- Los borradores llevan una marca de agua «BORRADOR» y no tienen número (aparece «BORRADOR»).
- Sin firma ni sello.

**Comprobación visual:** prueba automática con un presupuesto corto y otro largo (más de 40 líneas), que verifica que todo el texto de las líneas aparece en el PDF. Además, una revisión manual del resultado frente a `PR-2026001029-R00.pdf`.

### 5.8 Configuración (administración)

- Datos de la empresa y logo.
- Textos de la carta.
- Exclusiones y formas de pago por defecto.
- Validez de la oferta.
- Impuestos (nombre y tipo).
- Numeración.
- Margen por defecto.
- Conceptos obligatorios.
- Texto del origen de desplazamiento.
- Categorías y unidades.

### 5.9 Historial

Tabla de auditoría: usuario, fecha, entidad, acción y resumen. Registra altas, cambios, bajas, ajustes de precio, emisiones, revisiones, cambios de estado y descargas de PDF emitidos. Se puede ver por presupuesto y, para administradores, en general.

### 5.10 Modelo de datos (entidades)

`User`, `CompanySettings`, `Tax`, `Unit`, `Category`, `Concept`, `KitTemplate` (con sus componentes y parámetros en JSON validado con Zod), `Client`, `ClientContact`, `ClientLocation`, `Quote` (número base, revisión, estado, cabecera, `supersededBy`), `QuoteSection` (partida/subpartida), `QuoteLine`, `KitInstance`, `PriceAdjustment`, `IssuedDocument` (instantánea JSON, ruta del PDF, versión de plantilla y hash), `NumberCounter` y `AuditLog`.

Restricciones clave:

- código de concepto único;
- (número base, revisión) único;
- claves foráneas con `RESTRICT` sobre lo usado en presupuestos.

### 5.11 Estructura del repositorio

La del plan:

```
src/
  app/
  modules/{auth,users,catalog,clients,kits,quotes,settings}/
  lib/
  pdf/
prisma/
tests/
docs/
Dockerfile
compose.yaml
.env.example
README.md
```

Cada módulo separa validación (Zod), lógica, acceso a datos y acciones de servidor. Gestor de paquetes: *decisión mía*, **pnpm**.

### 5.12 Despliegue y operación

- **Dokploy** desde el repositorio, con Compose: `app` (Next.js standalone + Chromium) y `db` (PostgreSQL) en una red Docker privada. PostgreSQL no se publica.
- **Volúmenes persistentes:** datos de PostgreSQL y PDF emitidos.
- **Acceso:** dirección interna estable con HTTPS (certificado de una CA interna o autofirmado instalado en los equipos; lo decide quien despliega). Sin redirecciones de puertos.
- **Configuración y salud:** secretos en variables de entorno, con `.env.example` en el repositorio. Endpoint `/api/health` que comprueba la base de datos y registros a stdout.
- **Migraciones:** `prisma migrate deploy` como paso explícito antes de arrancar la nueva versión.
- **Copias de seguridad:** volcado programado de PostgreSQL y del volumen de PDF a un destino fuera del servidor. Se usan, si sirven, las copias programadas de Dokploy. Retención por acordar.
- **Restauración:** la prueba de restauración es requisito para dar el sistema por operativo.
- **Documentación** en `docs/`: actualización, restauración, reversión (revertir código no revierte una migración), primer administrador y recuperación de acceso.

## 6. Pruebas y aceptación

**Automatizadas:**

- cálculos y redondeo;
- fórmulas de conjuntos;
- conjuntos incompletos;
- validaciones de emisión;
- permisos por rol;
- numeración con emisiones simultáneas;
- importación de catálogo, con errores y con todo o nada;
- inmutabilidad de lo emitido;
- cambios de catálogo o de plantilla de conjunto que no alteran lo existente;
- autorización de descargas;
- PDF corto y largo sin pérdida de contenido.

**Funcionales:**

- crear un cliente, un concepto y un conjunto sin tocar código;
- crear, duplicar, emitir y revisar un presupuesto;
- filtrar por mes y estado;
- comparar visualmente el PDF con el ejemplo;
- comprobar que los datos sobreviven a un reinicio y a un redespliegue;
- restaurar una copia.

## 7. Pendiente de la empresa (no bloquea la construcción)

1. Reinicio anual o no de la secuencia de numeración, y su valor inicial.
2. Precios reales, tramos de bombas y unidad de cobro, IVA aplicable y vigencias.
3. Datos de la empresa, logo y textos de la carta.
4. Exclusiones, formas de pago y validez por defecto.
5. Si el margen sobre coste (5.2) se usa como ayuda o no hace falta.
6. Retención de copias de seguridad y destino externo.

## 8. Lo que queda a criterio de quien construye

Diseño visual de la interfaz y del PDF (dentro del contenido descrito), elección de bibliotecas auxiliares (por ejemplo, `exceljs` para Excel), organización interna de los componentes, detalles de la marca de agua y la paginación, y el mecanismo concreto de copias de seguridad, siempre que cumpla 5.12.

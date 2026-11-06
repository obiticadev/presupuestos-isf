# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 + TypeScript, PostgreSQL con Prisma, Better Auth. Desplegado con Docker Compose en Dokploy, con datos persistentes en volúmenes. Ver `docs/superpowers/specs/2026-11-06-app-presupuestos-design.md`.

## Users

Entre 5 y 15 personas de INSTALACIONES, SERVICIOS Y FORMACIÓN, S.L. (ISF), en ingeniería, oficina técnica y comercial. Los perfiles son mixtos: unos dominan Excel y Word, otros son poco técnicos y necesitan que la aplicación les guíe. Los usuarios tienen dos roles: Administrador y Presupuestador.

Trabajan sobre todo en un PC de oficina, pero también deben poder consultar presupuestos y cambiar estados desde una tablet o un móvil dentro de la red de la oficina.

## Product Purpose

Sustituir el flujo actual de Excel y Word para presupuestos: mantener un catálogo y los clientes, montar presupuestos con partidas y conjuntos que calculan solos sus dependencias, emitirlos con número y revisión, generar el PDF corporativo y seguir su estado (enviado o pendiente de aprobación, aceptado, rechazado, caducado).

El éxito es que cualquier usuario, incluido uno poco técnico, prepare un presupuesto correcto sin calcular metros ni importes a mano.

## Positioning

Herramienta interna hecha a la medida de cómo presupuesta ISF:

- partidas con precio global o por suma;
- conjuntos con dependencias, como la bomba que no se valora sin su manguera;
- desplazamiento y horas de programador obligatorios;
- documentos emitidos que nunca cambian.

## Operating Context

- Solo se usa dentro de la red de la oficina, sin acceso desde Internet.
- El documento de salida es el PDF corporativo: una carta en la página 1 y la tabla P / Denominación / Cantidad / Total en las siguientes.
- Las consultas habituales son del tipo «los de este mes pendientes de aprobación».
- Todos los usuarios ven y editan todos los presupuestos.

## Capabilities and Constraints

- Importes con aritmética decimal y redondeo a céntimos.
- Formato español en números, fechas y moneda (`21.628,62 €`, coma decimal en la entrada).
- Interfaz en español.
- No incluye facturación, cobros, IA ni envío de correos.
- Pendiente de la empresa: numeración definitiva, precios reales, tramos de bombas y textos de la carta.

## Brand Commitments

- Nombre: ISF, INSTALACIONES, SERVICIOS Y FORMACIÓN, S.L.
- Lema del documento: «INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL».
- La aplicación debe llevar la identidad de ISF. La empresa tiene el logo en buena calidad (la S verde con el nombre); el archivo está pendiente de entregar. Como referencia provisional sirve el logo del Word original.

## Evidence on Hand

- `Word y Excel con datos reales/PR-2026001029-R00.pdf` y `.docx`: presupuesto real de referencia.
- `Word y Excel con datos reales/PR-2026001029.xls`: estructura real de partidas y tablas de tarifas.
- `Prueba.xlsx`: tarifas de ejemplo, no reales.
- No hay manual de marca ni capturas de otras herramientas. No hay que inventar clientes, precios ni testimonios.

## Product Principles

1. **Guiar sin estorbar:** la aplicación pide lo que falta en el momento en que falta. Quien domina la herramienta no debe ir más lento por ello.
2. **Los números siempre a la vista y siempre correctos:** base, IVA y total visibles mientras se edita, sin sorpresas al emitir.
3. **Lo emitido es sagrado:** queda claro qué es borrador y qué es definitivo.
4. **Lo de siempre, a un clic:** cliente, catálogo, duplicar y consultar el estado del mes.

## Accessibility & Inclusion

Uso táctil en tablet y móvil con objetivos de tamaño suficiente. Contraste WCAG AA. Usuarios poco técnicos: etiquetas claras y en español, sin jerga.

---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: aplicación ISF Presupuestos (todas las pantallas)

Scope: shell y pantallas de trabajo de la app (presupuestos, editor, clientes, catálogo, conjuntos, administración, login). Mode: Operate. Desktop primero; tablet y móvil para consultar y cambiar estados.

Audience/job: 5-15 personas de ISF, de perfiles mixtos, que montan presupuestos por partidas y conjuntos, los emiten y siguen su estado mes a mes.

Unresolved: logo en buena calidad pendiente de la empresa; textos reales de la carta.

## Direction contract

THESIS: un presupuesto de ISF es una instalación. Cada conjunto se dibuja como su esquema unifilar (cuadro → manguera → carga) y lo que falta se ve en la línea. Rechaza el panel SaaS de tarjetas con métricas.

OWN-WORLD: papel de plano #f6f7f4, tinta #0f1f1d y rail y acciones en verde ISF #004742. Ámbar #b86e00 solo para lo incompleto. Archivo con anchos variables: condensada para la referencia y los rótulos, cifras tabulares. Filetes de 1-1,5 px en tinta, sin sombras ni esquinas redondeadas. Nodos de esquema: cuadrado para el cuadro, círculo para el motor.

STORY: quien presupuesta ve qué lleva cada partida, qué le falta para emitir y cuánto suma. Confía porque los números están siempre a la vista. Rellena lo que la línea discontinua le pide y emite.

FIRST VIEWPORT: rail verde de 224 px; la referencia como titular grande; cliente, ubicación y asunto; tabla P / Denominación / Cantidad / Precio / Importe con los conjuntos dibujados en línea. Columna derecha de 360 px con los totales y «Para emitir», y el botón Emitir abajo.

FORM: esquema unifilar, quinta de la lista ordenada. seed:13be0a40c99b4068

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

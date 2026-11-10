# Diseño visual: «Esquema unifilar»

Dirección elegida el 2026-11-06 (impeccable). Cada conjunto se dibuja como su esquema unifilar, cuadro → manguera → carga, y lo que falta se ve en la línea.

- **Color:** papel de plano `#f6f7f4`, tinta `#0f1f1d`, verde ISF `#004742` (rail y acciones principales) y ámbar `#9a5c00`/`#b86e00` reservado para lo incompleto.
- **Tipografía:** Archivo con anchos variables. Condensada para referencias y titulares, cifras tabulares alineadas a la derecha.
- **Líneas:** filetes de 1–1,5 px en tinta, sin sombras ni esquinas redondeadas.
- **Estados:** iconos cuadrados.
  - Borrador: contorno discontinuo.
  - Emitido: relleno de tinta.
  - Enviado: contorno verde.
  - Aceptado: relleno verde.
  - Rechazado: relleno rojo.
  - Caducado: tachado gris.
  - Enviado con muchos días sin respuesta: ámbar.

## Maquetas estáticas (`maquetas/`)

Ábrelas en el navegador. Los datos son ficticios.

| Archivo | Pantalla |
|---|---|
| `editor.html` | Editor de presupuesto con conjuntos dibujados, totales y «Para emitir» |
| `listado.html` | Listado del mes con la tira de estados y el total filtrado |
| `catalogo.html` | Catálogo con búsqueda, filtros y panel de edición |
| `clientes.html` | Ficha de cliente: datos, contactos, ubicaciones y presupuestos |
| `login.html` | Inicio de sesión |
| `movil.html` | Presupuesto en el móvil: estado, totales y cambio de estado |
| `pdf.html` | Documento PDF del presupuesto (plan 4): carta, partidas, continuación con la cabecera repetida y borrador con marca de agua |
| `pdf-densidades.html` | Hoja de partidas del PDF en cuatro densidades (estándar, compacta, resumen arriba y agrupada). **Elegida la B**, con el cierre al pie y el hueco de firma y sello, que se ve en tres casos: el ejemplo, pocos elementos y continuación (plan 4, diseño 5.3.1) |

Son referencia visual, no código de producción. El logo definitivo está pendiente de la empresa.

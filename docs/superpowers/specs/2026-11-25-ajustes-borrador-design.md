# Ajustes del borrador antes de conjuntos dinámicos (2026-11-25)

Diseño corto. Se hace antes del plan `2026-11-25-conjuntos-dinamicos.md`, que pasará a empezar después de estas versiones.

## Por qué

Revisión rápida del usuario sobre el borrador en uso: un botón que no funciona, desplegables nativos poco prácticos con listas largas y la necesidad urgente de ocultar en el PDF cantidades (horas) y totales de subpartida.

## Qué se hace

1. **«Actualizar precios desde catálogo» no actualiza.** Causa: `priceWarnings` avisa de líneas en subpartidas «precio global», pero `refreshLines` se las salta (el historial registra «0 líneas»). Arreglo: el aviso aplica la misma regla que el botón (salta subpartidas GLOBAL y líneas con ajuste). Si la subpartida pasa a «por suma», el aviso aparece y el botón actualiza. Prueba que lo cubra.
2. **«Añadir del catálogo» y «Añadir conjunto»** usan `Combobox` en lugar de `<select>`: tres columnas (código · descripción · categoría; en conjuntos, nombre · descripción), filtro al escribir, ↑ ↓ Enter Tab Esc y la ✕ en lugar de la flecha. Hereda el encaje en ventana ya existente (se desplaza a la izquierda, se abre hacia arriba, nunca más ancho que la ventana): sin solaparse ni barra horizontal.
3. **Cliente, Nombre y Contacto** de la cabecera usan `Combobox`, con columnas filtrables:
   - Cliente: razón social · CIF · nombre comercial.
   - Nombre: nombre · instalación · dirección (el recuadro «Instalación» se sigue actualizando al elegir).
   - Contacto: nombre · cargo · email / teléfono.
   Se conservan «— Sin elegir —» (vaciar con la ✕) y el cliente desactivado actual.
4. **Ocultar en el PDF, por línea y por subpartida:**
   - Línea: casilla «Cantidad» junto a «Ver». Desmarcada, el PDF muestra la descripción sin la cantidad.
   - Subpartida: casilla «Total». Desmarcada, el PDF no muestra el total de esa subpartida; sigue sumando en la partida y en el presupuesto.
   - Campos nuevos con migración: `QuoteLine.showQuantity` y `QuoteSection.showTotal`, por defecto `true`. Se copian al emitir (instantánea), al duplicar y en revisiones; las instantáneas antiguas sin el campo se leen como `true`.

## Enfoques considerados (columnas del buscador)

- **A (elegido por el usuario):** mantener las tres columnas de `ComboItem` (`code`, `description`, `extra`) y añadir un `text` opcional con lo que queda escrito en la casilla al elegir (p. ej. solo la razón social). El cambio es mínimo y Conjuntos no se toca.
- B: columnas ilimitadas. Se descarta porque obliga a rehacer el componente y ninguna lista lo necesita hoy.

## Escritorio, iPad y móvil

La lista ya se encaja en la ventana. A menos de ~600 px, la tercera columna pasa debajo de la descripción, dentro de la misma opción, en gris. Las casillas nuevas siguen el patrón de «Ver» en todos los anchos. Se comprueba con Claude in Chrome a 1280, 820 y 390 px.

## No se hace

- Ocultar cantidades para todo el presupuesto de una vez (el usuario prefiere por línea).
- Cambiar el comportamiento del cliente en la cabecera: Nombre y Contacto del cliente nuevo siguen apareciendo tras «Guardar cabecera», como hoy.

## Versiones

Una tarea, un parche: desde 1.9.16. El plan de conjuntos dinámicos se renumera a continuación.

# Bloques 4 y 5: caducado automático, Mi cuenta, firma y sello

Fecha: 2026-11-18. Rama: `mejoras-uso-real`. Parte de `2026-11-11-mejoras-uso-real-design.md` (apartados 4.1 y 5.1–5.6), con lo que el usuario decidió el 2026-11-18. Las notas internas (4.2) ya se hicieron el 2026-11-17, así que los dos bloques van juntos en un solo plan.

Maqueta aprobada: `docs/diseno/maquetas/cuenta-firma.html` (se ve servida desde la raíz del repositorio, p. ej. `python -m http.server`, porque enlaza `src/app/globals.css` y `docs/sello/sello-isf.svg`).

## Por qué

- La base de datos debe decir la verdad sobre la validez aunque nadie abra la app (se consultará desde otras herramientas): hoy «Validez vencida» es solo un aviso calculado al pintar.
- Los presupuestos salen hoy con el recuadro «Firma y sello» vacío y se firman a mano. El PDF emitido debe salir ya firmado y sellado por quien lo emite.
- Cada usuario necesita cambiar su propia contraseña sin pedírselo a un admin.

## Objetivos

1. Un presupuesto emitido o enviado pasa solo a «Caducado» cuando vence su validez.
2. Página «Mi cuenta» para todos: contraseña y firma.
3. El PDF emitido lleva el sello de ISF con la firma de quien lo emite encima y «Fdo.: Nombre».
4. No se emite sin firma.
5. Logo SVG en la pantalla de inicio de sesión.

## No objetivos

- Subir una imagen de firma (descartado por el usuario: solo se dibuja).
- Sello configurable o por usuario: es uno, fijo.
- Firmar digitalmente el PDF (certificado). La firma es una imagen.
- Avisar por correo de lo que caduca.

## Anti-objetivos

- Que un PDF ya emitido cambie: la firma se congela en la instantánea al emitir; cambiar o eliminar la firma después no toca lo emitido.
- Que la tarea de caducado toque Aceptado, Rechazado, borradores o revisiones sustituidas.

## Enfoques considerados

**Caducado** (decidido en la spec de 2026-11-11 por el usuario): tarea programada en el propio servidor. Descartados: calcularlo al leer (la base no dice la verdad fuera de la app) y un servicio cron aparte en Compose (más piezas para lo mismo).

**Trazo de la firma.** (a) Lienzo propio con Pointer Events, como decía la spec: se probó en la maqueta y salía rígido y escalonado. (b) **`signature_pad`**, la librería que usa Stirling PDF: curvas de Bézier y grosor según la velocidad. **Elegido (b)** tras verlo el usuario: imitar ese trazo a mano son ~150 líneas de geometría; la librería es pequeña, sin dependencias y muy usada.

**Firma en el PDF.** Se vieron tres: firma encima del sello, sello y firma lado a lado, firma que pisa el borde. **Elegida: encima del sello, rebasándolo**, que es como se firma en papel. Tamaño del sello: **62 mm** de ancho (elegido entre 50, 62 y 74).

**Mi cuenta.** Dos columnas, una columna o pestañas. **Elegidas dos columnas**; enlace «Mi cuenta» en la lista del menú (no el nombre clicable).

## Diseño

### 4.1 Caducado automático

- `expireQuotes(now = new Date())` en `src/modules/quotes/lifecycle.ts`. En una transacción:
  - `UPDATE "Quote" SET status = 'EXPIRED' WHERE status IN ('ISSUED','SENT') AND "supersededById" IS NULL AND ("issuedAt" AT TIME ZONE 'Europe/Madrid')::date + "validityDays" < (now AT TIME ZONE 'Europe/Madrid')::date RETURNING id, reference, status anterior`.
  - Una entrada de historial por presupuesto con `userId` nulo (se muestra como «Sistema»): «Estado de {referencia}: {Emitido|Enviado} → Caducado (validez vencida)».
  - Idempotente: una segunda llamada no encuentra nada.
- Regla de días: vence el día `fecha de emisión (Madrid) + validityDays`; caduca a partir del día siguiente. Ejemplo: emitido el 1 con 30 días → sigue vigente el 31, caduca el 32.
- `src/instrumentation.ts` (nuevo): en `register()`, solo con `NEXT_RUNTIME === "nodejs"`, llama a `expireQuotes()` al arrancar y con `setInterval` cada hora. Un error se registra en consola y no tumba el servidor. Una marca en `globalThis` evita intervalos duplicados con la recarga de `pnpm dev`.
- Se elimina `isExpired` y lo que lo usa: la insignia «Validez vencida» del listado (`src/app/(app)/page.tsx`) y el aviso del panel de estado (`lifecycle-panel.tsx`). Los días que quedan en el listado siguen igual.
- Un caducado se puede seguir pasando a mano a otro estado (sin cambios en `setStatus`).
- Decisión del agente: las revisiones sustituidas (`supersededById` no nulo) no caducan, igual que ya no admiten cambios de estado.

### 5.1 Mi cuenta

- Ruta `/cuenta`, para cualquier usuario con sesión. Enlace «Mi cuenta» en la lista del menú, después de «Conjuntos» y antes de «Administración».
- Cabecera: «Mi cuenta», debajo correo · rol.
- Dos columnas (una sola por debajo de 900 px):
  - **Contraseña:** actual, nueva y repetir; «Cambiar contraseña». Usa `auth.api.changePassword` de Better Auth con `revokeOtherSessions: true`. Validación con Zod: nueva ≥ 10 caracteres (como el alta), las dos nuevas iguales. Contraseña actual errónea → error en el campo. Con `ActionForm`. Texto: «Al cambiarla se cierran tus sesiones en otros equipos.» Queda en el historial (sin la contraseña).
  - **Firma:** texto «Sale sobre el sello en los presupuestos que emitas. Sin firma no se puede emitir.» Un recuadro (botón) que muestra el sello con la firma o, sin firma, «Sin firma. Pulsa para firmar.». Pulsarlo abre la ventana de firma (tanto para crearla como para cambiarla; no hay botón «Cambiar»). Con firma, debajo: «Eliminar firma» con `ConfirmButton` y el texto «Sin firma no podrás emitir presupuestos. Los ya emitidos conservan la suya.».
- Debajo de las dos columnas: «Así saldrá en el PDF», el pie de la última hoja a tamaño real (condiciones, lugar y fecha, totales, sello con firma y «Fdo.: {nombre}») con datos de ejemplo y los estilos del PDF. Sin firma, el recuadro vacío «Firma y sello» de hoy.
- El aviso «Falta tu firma» **no** sale en Mi cuenta: solo en el borrador (5.4).

### 5.2 Ventana de firma

- `<dialog>` modal centrado, ~960 px de ancho, lienzo de ~420 px de alto (a pantalla completa por debajo de 600 px).
- Barra superior: título «Firma», «Borrar», «Confirmar» (desactivado hasta el primer trazo) y ✕ (cancela sin guardar). Esc también cancela.
- Lienzo con `signature_pad` (dependencia nueva): tinta `#1b2a6b`, `minWidth 0.9`, `maxWidth 3.4`, `velocityFilterWeight 0.7`, resolución ≥ 2× para que no se pixele. Línea base guía «Firma aquí, con ratón, dedo o lápiz».
- «Confirmar» recorta los márgenes vacíos (4 px de aire), exporta PNG con fondo transparente y lo envía a una Server Action.
- La lógica de la maqueta (`cuenta-firma.html`: `fit`, `trimmed`) es la referencia.

### 5.3 Guardado de la firma

- Campo nuevo `User.signature Bytes?` (migración). Sin firma = nulo.
- Validación en el servidor: cabecera PNG real, ≤ 200 KB, dimensiones (leídas del IHDR) entre 20×10 y 4000×2000. Fuera de eso, error claro.
- Guardar y eliminar dejan entrada en el historial («Firma actualizada» / «Firma eliminada»), sin la imagen.
- Solo cada usuario cambia la suya (no hay edición de firmas por un admin).

### 5.4 Emitir exige firma

- La firma es de **quien emite**, que al emitir pasa a ser el responsable (`issueInTx` ya pone `ownerId = actor.id`). Así cada emisión y cada revisión llevan la firma de su responsable: si la revisión la emite otra persona, sale con la firma de esa persona.
- `issueInTx` lee la firma del actor dentro de la transacción; sin firma lanza el error con el resto de problemas.
- El panel «No se puede emitir» del borrador añade el problema `signature`: «Falta tu firma: configúrala en Mi cuenta» con enlace a `/cuenta`. Se comprueba sobre quien mira el borrador (quien emitiría), no sobre el responsable actual. `issueChecks` recibe si el usuario tiene firma.

### 5.5 PDF

- La instantánea al emitir guarda `signer: { name, signature }` (nombre de quien emite y su PNG en base64). Se congela: cambiar o eliminar la firma después no cambia lo emitido.
- `docs/sello/sello-isf.svg` pasa a `src/pdf/assets/sello-isf.svg` y se incrusta como `data:` URI (se lee una vez, como las fuentes).
- Plantilla v1: si el documento trae firmante, el recuadro «Firma y sello» se sustituye por el sello de 62 mm centrado en la columna de totales, con la firma encima (desplazada hacia arriba e inclinada ~3°, rebasando el sello) y «Fdo.: {nombre}» centrado debajo. Sin firmante (instantáneas anteriores), el recuadro vacío de hoy. `templateVersion` sigue siendo `v1`: la diferencia la marca el dato.
- La firma no debe quedar recortada: `.sheet` tiene `overflow:hidden`, así que el rebase cabe dentro de la columna de 78 mm (anchura de la firma ≤ 125 % del sello) y el hueco entre totales y sello deja sitio al rebase vertical. `paginate()` debe medir el cierre con su nueva altura.
- Vista previa de un borrador: usa la firma de quien la mira (quien emitiría), o el recuadro vacío si no tiene.
- La comprobación se hace mirando el PDF real (no solo pruebas), a diferencia del tinte verde del 2026-11-17.

### 5.6 Logo SVG en el inicio de sesión

- `docs/logos/logo-isf.svg` → `public/logo-isf.svg`; `login-form.tsx` lo usa en lugar de `/logo-isf.jpg` y `src/proxy.ts` deja pasar la ruta nueva. El logo del PDF sigue siendo el de Configuración.

## Restricciones

- Código en inglés, interfaz en español. Permisos en el servidor. Formularios con `ActionForm`.
- Lo emitido no se modifica.
- Cada tarea del plan se cierra con su commit y `git push` a `origin/mejoras-uso-real`, para verla en el entorno de pruebas `:3101`. Fusionar en `master` o desplegar producción exige el visto bueno del usuario.
- Versión de la app: los bloques cerrados la suben (regla de `AGENTS.md`); 1.5.0 al cerrar este plan conjunto (uno por bloque; decisión del usuario).

## Pruebas

- `expireQuotes`: caduca justo al día siguiente del vencimiento según Madrid (incluido un caso en el cambio de día UTC/Madrid), no toca Aceptado, Rechazado, borradores ni sustituidas, deja historial con `userId` nulo y es idempotente.
- Firma: rechaza no-PNG, > 200 KB y dimensiones fuera de rango; guarda y elimina.
- Emisión: sin firma falla; con firma la instantánea lleva `signer` con nombre y firma de quien emite; una revisión emitida por otro usuario lleva la firma de ese usuario.
- Cambio de contraseña: actual errónea → error; correcta → cambia y cierra las demás sesiones.
- Interfaz con Claude in Chrome a 1500, 1024 y 390 px: Mi cuenta, ventana de firma, eliminar, panel de emisión y el PDF emitido.

## Lo que queda al constructor

- Nombres de componentes y archivos dentro de las convenciones existentes.
- Cómo pasa `hasSignature` al panel y a `issueChecks`.
- Los datos de ejemplo del pie en Mi cuenta (pueden ser fijos).

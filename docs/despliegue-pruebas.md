# Entorno de pruebas en Dokploy

Creado el 2026-11-17 por petición expresa del usuario para revisar los bloques
pendientes en el servidor, sin ejecutar la aplicación en el portátil.

## Acceso y separación

| | Producción | Pruebas |
|---|---|---|
| Dirección | http://192.168.105.83:3100 | **http://192.168.105.83:3101** |
| Rama | `master` | `mejoras-uso-real` |
| Entorno Dokploy | `production` | `pruebas` |
| Servicio | Presupuestos | Presupuestos - PRUEBAS |
| Proyecto Compose | `presupuestos-isf-app-oy9un2` | `presupuestos-isf-pruebas-1uwipl` |
| Copias | `/srv/presupuestos-backups` | `/srv/presupuestos-pruebas-backups` |

- Proyecto Dokploy: «Presupuestos ISF».
- `environmentId` de pruebas: `25HdFz3xoCRINa3gw_-r3`.
- `composeId` de pruebas: `e3Bkaq88xSYluN9dqrdZ6`.
- Repositorio: `obiticadev/presupuestos-isf`, proveedor GitHub ya existente.
- Compose: `./compose.yaml`, sin override de desarrollo.
- Despliegue automático desactivado: actualizar de forma deliberada al terminar
  cada bloque o cuando el usuario quiera revisarlo.
- `randomize` e `isolatedDeployment` desactivados: los volúmenes conservan
  nombres estables entre despliegues, exclusivos del proyecto de pruebas.
- PostgreSQL no publica ningún puerto. No se comparte base de datos, volumen,
  carpeta de copias ni secretos con producción.
- Las contraseñas técnicas se generan aleatoriamente y solo están en Dokploy.

## Usuarios y datos ficticios

Usuarios `admin@isf.test` (administrador, nombre `admin`) y `user@isf.test`
(presupuestador, nombre `user`). Las contraseñas solicitadas están en el fichero
visible **`ACCESOS-PRUEBAS.local.md` de la raíz**, excluido de Git, con otra copia
en la carpeta original del proyecto.

El inicio de sesión requiere correo electrónico. La configuración se identifica
como «PRUEBAS — ISF (datos ficticios)», con numeración `TEST-{AAAA}{NNNNNN}-R{RR}`.
Se parte de las semillas de las migraciones y de clientes y borradores ficticios
nuevos; no se copia ningún dato de producción.

**Cookies:** los navegadores comparten cookies de una misma IP entre puertos.
Para mantener abiertas producción y pruebas a la vez, usar una ventana de
incógnito o un perfil distinto para pruebas; de otro modo, iniciar sesión en un
entorno puede cerrar aparentemente la sesión del otro.

**Seguridad:** acceso HTTP exclusivo de la red de oficina; contraseñas de prueba
conocidas y guardadas en claro por petición del usuario. No introducir datos
reales ni publicar el puerto en Internet.

## Actualizar un bloque

1. Trabajar y verificar el código en `mejoras-uso-real`.
2. Hacer commit y push **solo a esa rama**.
3. Crear una copia de pruebas antes de desplegar migraciones.
4. En Dokploy, entrar en **pruebas → Presupuestos - PRUEBAS** y desplegar.
5. Comprobar `/api/health`, entrada con ambos roles y el bloque modificado.
6. Registrar el commit y resultado en `docs/superpowers/progreso.md`.

Esto no fusiona en `master` ni despliega producción. Ambas acciones siguen
requiriendo el visto bueno explícito del usuario.

## Operación por SSH

```sh
ssh -i ~/.ssh/isf_dokploy isf@192.168.105.83
cd /etc/dokploy/compose/presupuestos-isf-pruebas-1uwipl/code
docker compose -p presupuestos-isf-pruebas-1uwipl -f compose.yaml ps -a
docker compose -p presupuestos-isf-pruebas-1uwipl -f compose.yaml exec backup /scripts/backup.sh now
```

El usuario SSH `isf` ya pertenece al grupo `docker` (comprobado el 2026-11-17).
Copias diarias, retención y restauración: mismas reglas de `docs/despliegue.md`,
pero **siempre con el proyecto, carpeta y copias de pruebas**. No ejecutar
`down -v` ni reinicializar datos para actualizar: los datos de prueba son persistentes.

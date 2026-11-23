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
- Despliegue automático activado. El servidor consulta `mejoras-uso-real`
  **cada 5 minutos** mediante cron; si hay cambios, hace una copia de pruebas
  y solicita su despliegue a Dokploy.
- `randomize` e `isolatedDeployment` desactivados: los volúmenes conservan
  nombres estables entre despliegues, exclusivos del proyecto de pruebas.
- PostgreSQL no publica ningún puerto. No se comparte base de datos, volumen,
  carpeta de copias ni secretos con producción.
- Las contraseñas técnicas se generan aleatoriamente y solo están en Dokploy.
- `BETTER_AUTH_COOKIE_PREFIX=isf-pruebas` en pruebas. Producción conserva su
  prefijo existente `better-auth`. El prefijo se pasa al contenedor mediante
  `compose.yaml` y lo usan tanto Better Auth como el proxy de acceso.

## Usuarios y datos ficticios

Usuarios `admin@isf.test` (administrador, nombre `admin`) y `user@isf.test`
(presupuestador, nombre `user`). Las contraseñas solicitadas están en el fichero
visible **`ACCESOS-PRUEBAS.local.md` de la raíz**, excluido de Git, con otra copia
en la carpeta original del proyecto.

El inicio de sesión requiere correo electrónico. La configuración se identifica
como «PRUEBAS — ISF (datos ficticios)», con numeración `TEST-{AAAA}{NNNNNN}-R{RR}`.
Se parte de las semillas de las migraciones y de clientes y borradores ficticios
nuevos; no se copia ningún dato de producción.

**Sesiones independientes (2026-11-17):** aunque los navegadores comparten
cookies de una misma IP entre puertos, cada entorno usa nombres distintos.
Se pueden abrir producción y pruebas simultáneamente en el mismo navegador,
sin incógnito ni perfiles separados. Entrar o salir en pruebas no sobrescribe
las cookies de producción. Tras este cambio hay que volver a entrar una vez
en pruebas; no se borran las cookies antiguas, pues pertenecen a producción.

**Seguridad:** acceso HTTP exclusivo de la red de oficina; contraseñas de prueba
conocidas y guardadas en claro por petición del usuario. No introducir datos
reales ni publicar el puerto en Internet.

## Actualizar un bloque

1. Trabajar y verificar el código en `mejoras-uso-real`.
2. Hacer commit y push **solo a esa rama**.
3. Esperar a la siguiente comprobación de cinco minutos y a la compilación.
   El servidor realiza la copia de pruebas antes de solicitar el despliegue.
4. Revisar el resultado en Dokploy → **pruebas → Presupuestos - PRUEBAS**.
5. Comprobar `/api/health`, entrada con ambos roles y el bloque modificado.
6. Registrar el commit y resultado en `docs/superpowers/progreso.md`.

Esto no fusiona en `master` ni despliega producción. Ambas acciones siguen
requiriendo el visto bueno explícito del usuario.

## Consulta automática cada cinco minutos

GitHub no puede llamar al webhook `http://192.168.105.83:3000/api/deploy/github`
porque es una dirección privada de oficina; la entrega del push del 2026-11-17
falló con «failed to connect to host». No se abre ningún puerto a Internet.
En su lugar, el servidor consulta GitHub a través de la API local de Dokploy y
su proveedor GitHub existente. No necesita que el portátil esté encendido.

- Crontab del usuario SSH `isf`: `*/5 * * * *` (minutos 00, 05, 10…).
- Programa instalado: `/home/isf/.local/lib/presupuestos-pruebas/poll-pruebas.py`.
  Fuente versionada: `scripts/deploy/poll-pruebas.py`; su instalación se
  actualiza de forma deliberada por SSH, no ejecutando código del checkout.
- Token de la API local: `/home/isf/.config/presupuestos-pruebas/dokploy-token`,
  permisos `600` dentro de una carpeta `700`; nunca en el repositorio ni logs.
- Estado: `/home/isf/.local/state/presupuestos-pruebas/state.json`.
- Log rotativo: `/home/isf/.local/state/presupuestos-pruebas/poll.log`
  (1 MB por archivo, tres rotaciones).
- Exclusión mutua con `flock`; no encola otro despliegue si ya hay uno pendiente
  o en marcha. Sin cambios no compila ni crea copias.
- Verifica servicio, rama, repositorio y persistencia antes de desplegar.
  Solo permite el Compose de pruebas; no actúa sobre `master` ni producción.
- Una copia fallida impide desplegar. Un despliegue fallido no se repite
  indefinidamente con el mismo commit: se espera un nuevo push o revisión manual.
- Solo confirma el éxito cuando Dokploy termina y `/api/health` responde bien.
- **Pausar:** desactivar «Auto Deploy» en el servicio de pruebas de Dokploy;
  el programa respeta ese interruptor. También se puede retirar únicamente
  su línea del crontab, conservando las demás tareas.

Comprobar y lanzar una consulta inmediata:

```sh
crontab -l
tail -n 30 ~/.local/state/presupuestos-pruebas/poll.log
python3 -B ~/.local/lib/presupuestos-pruebas/poll-pruebas.py
```

No hay que borrar el estado para actualizar. Si una solicitud queda pendiente
sin registrarse durante más de 15 minutos, el programa lo anota en el log y
no duplica despliegues; revisar las colas de Dokploy antes de intervenir.
Un despliegue manual sigue siendo posible desde Dokploy. Si cambian las
credenciales de API, sustituir el token privado del servidor.

Pruebas sin base de datos: `python -B -m unittest discover -s tests/deploy -v`.

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

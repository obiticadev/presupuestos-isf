# Despliegue en Dokploy

La aplicación se despliega en el servidor de la oficina (`192.168.105.83`) con Dokploy, como una aplicación Compose que construye `compose.yaml` desde la rama `master` del repositorio privado `obiticadev/presupuestos-isf`.

Se entra por **`http://192.168.105.83:3100`**, sin dominio ni HTTPS: el puerto 3000 del servidor es el panel de Dokploy, y el 80 y el 443 son de Traefik.

> **Coste aceptado:** sin HTTPS, las contraseñas viajan sin cifrar por la red de la oficina. Para pasar a un dominio con HTTPS, ver «Pasar a un dominio con HTTPS» más abajo.

## 1. Requisitos del servidor

- Dokploy 0.22 o posterior (el servidor tiene la 0.31).
- Unos **2 GB de RAM libres** para la app, porque genera los PDF con Chromium. PostgreSQL y el contenedor de copias usan poco.
- Espacio en disco para 30 copias diarias de la base de datos y de `appdata` en `/srv/presupuestos-backups`.

## 2. Aplicación Compose

En Dokploy: proyecto **Presupuestos ISF** → entorno `production` → Compose **Presupuestos** (`composeId F5SwbOFCyMb7tDSn0xQZk`, `appName presupuestos-isf-app-oy9un2`).

| Ajuste | Valor |
|---|---|
| Proveedor | GitHub (app de GitHub de Dokploy) |
| Repositorio y rama | `obiticadev/presupuestos-isf`, `master` |
| Compose Path | `./compose.yaml` |
| Isolated deployment / Randomize | desactivados (los volúmenes se llaman `presupuestos-isf-app-oy9un2_pgdata` y `presupuestos-isf-app-oy9un2_appdata`) |
| Dominios | ninguno |

Dokploy clona el código en `/etc/dokploy/compose/presupuestos-isf-app-oy9un2/code`, escribe allí el `.env` con las variables y ejecuta `docker compose -p presupuestos-isf-app-oy9un2 -f compose.yaml up -d --build`. Las órdenes a mano de este documento se ejecutan **en esa carpeta y con ese mismo `-p`**:

```sh
cd /etc/dokploy/compose/presupuestos-isf-app-oy9un2/code
alias dc='docker compose -p presupuestos-isf-app-oy9un2 -f compose.yaml'
```

Se entra por SSH con `ssh -i ~/.ssh/isf_dokploy isf@192.168.105.83`. Para usar `docker` sin `sudo`, el usuario `isf` tiene que estar en el grupo `docker` (`sudo usermod -aG docker isf`, y volver a entrar). Ese grupo equivale a ser root en el servidor.

Al desplegar, `migrate` aplica las migraciones (`prisma migrate deploy`) y termina con código 0. Después arranca `app`. Si `migrate` falla, la app no arranca.

## 3. Variables

En la pestaña **Environment** del Compose, nunca en el repositorio:

| Variable | Valor |
|---|---|
| `POSTGRES_PASSWORD` | larga y aleatoria (`openssl rand -hex 24`) |
| `BETTER_AUTH_SECRET` | 32 caracteres aleatorios o más (`openssl rand -hex 32`) |
| `BETTER_AUTH_URL` | `http://192.168.105.83:3100` (la dirección exacta desde la que se entra) |
| `BACKUP_DIR` | `/srv/presupuestos-backups` |
| `APP_PORT` | solo si hay que cambiar el 3100 |

`POSTGRES_PASSWORD` se fija en el primer despliegue: PostgreSQL la guarda en su volumen y cambiarla después en Dokploy no cambia la de la base de datos. Si se cambia `BETTER_AUTH_SECRET`, se cierran todas las sesiones.

Cada cambio de variables exige volver a desplegar.

## 4. Acceso

Desde cualquier equipo de la oficina: `http://192.168.105.83:3100`. La comprobación rápida es:

```sh
curl http://192.168.105.83:3100/api/health    # {"status":"ok"}
```

### Pasar a un dominio con HTTPS

Cuando haya un nombre interno (por ejemplo, `presupuestos.<dominio interno>`), sin tocar el código:

1. Certificado:
   - **CA interna** (por ejemplo, `step-ca` o `mkcert`): se sube en Dokploy → Certificates y su certificado raíz se instala una vez en cada equipo.
   - **Let's Encrypt con DNS-01**, si la empresa tiene un dominio público y acceso a su DNS: no hay que instalar nada en los equipos, pero hay que configurar Traefik.
2. En el Compose, pestaña **Domains**: servicio `app`, puerto 3000, HTTPS con ese certificado.
3. Quitar el `ports:` de `app` en `compose.yaml`, para que solo se entre por Traefik.
4. Cambiar `BETTER_AUTH_URL` a `https://presupuestos.<dominio interno>` y volver a desplegar.

## 5. Primer administrador

No hay registro público. Por SSH en el servidor:

```sh
cd /etc/dokploy/compose/presupuestos-isf-app-oy9un2/code
docker compose -p presupuestos-isf-app-oy9un2 -f compose.yaml exec app \
  node scripts/admin.mjs create --email admin@isf-esp.com --name "Administración"
```

La contraseña se pide por teclado. Sin terminal interactiva, se pasa con `-e ADMIN_PASSWORD=…` después de `exec`. Quien la reciba debe cambiarla al entrar. El resto de usuarios se crean desde **Administración → Usuarios**.

Para recuperar el acceso: `node scripts/admin.mjs reset-password --email …` de la misma forma.

## 6. Copias

El servicio `backup` del Compose hace cada día a las **02:00** (hora de Madrid; a las 03:00 el día del cambio de hora de primavera):

- `db/presupuestos-AAAAMMDD-HHMM.dump`: `pg_dump -Fc` de la base de datos;
- `appdata/appdata-AAAAMMDD-HHMM.tar.gz`: el volumen `appdata` (PDF emitidos y logos).

Quedan en **`/srv/presupuestos-backups/{db,appdata}`** del servidor, solo legibles por root, y se conservan las **30 más recientes de cada tipo**. Una copia a medias nunca tiene nombre válido. Si una copia falla, se ve en el log del contenedor y el bucle sigue:

```sh
docker logs presupuestos-isf-app-oy9un2-backup-1
```

Si un despliegue cambia `scripts/backup.sh` o `scripts/restore.sh`, el contenedor `backup` puede seguir con la versión anterior, porque Compose no lo recrea si su configuración no cambia. Después de desplegar: `dc up -d --force-recreate backup`.

**Copia en el momento** (obligatoria antes de desplegar una versión con migraciones):

```sh
dc exec backup /scripts/backup.sh now
```

> **Riesgo aceptado:** las copias están en el mismo disco que los datos. Si se pierde el disco o el servidor, se pierden también. Conviene llevar de vez en cuando la carpeta a otro sitio, por ejemplo con `rsync -a /srv/presupuestos-backups/ /mnt/nas/presupuestos-backups/` a un NAS montado, o con `scp -r` a un disco externo.

## 7. Restauración

Restaura la base de datos y `appdata` de una misma copia. La app tiene que estar parada: el script lo comprueba y no toca nada si no lo está, si hay conexiones abiertas o si la copia está incompleta o es ilegible.

```sh
cd /etc/dokploy/compose/presupuestos-isf-app-oy9un2/code
sudo ls /srv/presupuestos-backups/db                          # elegir la fecha AAAAMMDD-HHMM
dc stop app
dc -f compose.restore.yaml run --rm backup /scripts/restore.sh AAAAMMDD-HHMM
dc up -d                                                      # migrate antes que app; inocuo si no hay nada pendiente
```

La copia tiene que corresponder al código desplegado. Si se restaura una copia de antes de una actualización con migraciones, primero se despliega el commit anterior (ver «Revertir» en `docs/operacion.md`).

`compose.restore.yaml` solo cambia el montaje de `appdata` a escritura para esa orden. **Se usa con `run`, nunca con `up`, y siempre con el mismo `-p` que la app** (si no, restauraría otro volumen).

**Comprobación:** el último presupuesto emitido descarga su PDF y su SHA-256 coincide con el archivo de la copia:

```sh
dc exec app sha256sum /data/pdf/AAAA/PR-…-R00.pdf
```

Si solo se restaura la base de datos, la app regenera el PDF desde la instantánea al descargarlo y lo apunta en el historial.

### Prueba de restauración

Antes de dar el sistema por operativo, y de vez en cuando, se restaura una copia de producción en un proyecto aparte, sin tocar producción. Por SSH:

```sh
cd /etc/dokploy/compose/presupuestos-isf-app-oy9un2/code
# Entre paréntesis: las variables de la prueba no quedan en la sesión (si no, `dc` llevaría producción a ellas).
(
  P='docker compose -p presupuestos-restore -f compose.yaml'
  export POSTGRES_PASSWORD=$(openssl rand -hex 24) BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
    BETTER_AUTH_URL=http://192.168.105.83:3199 APP_PORT=3199 BACKUP_DIR=/srv/presupuestos-backups
  $P up -d db && $P run --rm --build migrate
  $P -f compose.restore.yaml run --rm --no-deps backup /scripts/restore.sh AAAAMMDD-HHMM
  $P up -d --build app
  sleep 20; curl http://192.168.105.83:3199/api/health
  $P exec app sha256sum /data/pdf/AAAA/PR-…-R00.pdf    # igual que en producción
  $P down -v --rmi local                                # retirar la prueba y sus imágenes
)
```

Usa la misma carpeta de copias que producción, pero no arranca su `backup`, así que no escribe ni borra copias. Es un proyecto Compose aparte creado por consola, no un proyecto de Dokploy: así no aparece en el panel ni se despliega por error.

| Fecha | Copia usada | Último PDF y SHA-256 | Resultado | Quién |
|---|---|---|---|---|
| | | | | |

## 8. Comprobaciones de aceptación

- [ ] `/api/health` responde `{"status":"ok"}` y `migrate` terminó con código 0.
- [ ] Emisión de un presupuesto desde un equipo de la oficina y descarga de su PDF.
- [ ] Reinicio del servidor: la app vuelve sola y conserva presupuestos, logo y PDF.
- [ ] Redespliegue desde Dokploy sin pérdida de datos.
- [ ] Prueba de restauración (apartado 7) con el SHA-256 del último PDF.
- [ ] Comparación del PDF con `PR-2026001029-R00.pdf` (en el equipo original).

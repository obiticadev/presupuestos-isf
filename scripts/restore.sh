#!/bin/sh
# Restaura una copia de backup.sh: la base de datos (pg_restore --clean --if-exists) y appdata.
# Con la app parada, y con appdata montado con escritura (el servicio backup lo monta en solo lectura):
#   docker compose stop app
#   docker compose run --rm -v appdata:/data backup /scripts/restore.sh AAAAMMDD-HHMM
#   docker compose start app
set -eu

stamp=${1:?uso: restore.sh AAAAMMDD-HHMM}
db=/backups/db/presupuestos-$stamp.dump
files=/backups/appdata/appdata-$stamp.tar.gz
[ -f "$db" ] || { echo "no existe $db" >&2; exit 1; }
[ -f "$files" ] || { echo "no existe $files" >&2; exit 1; }
[ -w /data ] || { echo "/data está en solo lectura: añade -v appdata:/data a docker compose run" >&2; exit 1; }

# Con la app en marcha habría conexiones abiertas a la base de datos.
others=$(psql -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")
[ "$others" -eq 0 ] || { echo "hay $others conexiones a la base de datos: para la app (docker compose stop app)" >&2; exit 1; }

pg_restore --clean --if-exists --exit-on-error -d "$PGDATABASE" "$db"
find /data -mindepth 1 -delete
tar -xzf "$files" -C /data
echo "restaurada la copia $stamp"

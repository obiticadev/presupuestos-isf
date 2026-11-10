#!/bin/sh
# Restaura una copia de backup.sh: la base de datos (pg_restore --clean --if-exists) y appdata.
# Con la app parada, y con appdata montado con escritura (el servicio backup lo monta en solo lectura):
#   docker compose stop app
#   docker compose -f compose.yaml -f compose.restore.yaml run --rm backup /scripts/restore.sh AAAAMMDD-HHMM
#   docker compose start app
# Usar siempre el mismo proyecto (-p) que la aplicación. El override mantiene el volumen correcto.
set -eu
umask 077

stamp=${1:?uso: restore.sh AAAAMMDD-HHMM}
echo "$stamp" | grep -Eq '^[0-9]{8}-[0-9]{4}$' || { echo "fecha no válida: usa AAAAMMDD-HHMM" >&2; exit 1; }
db=/backups/db/presupuestos-$stamp.dump
files=/backups/appdata/appdata-$stamp.tar.gz
[ -f "$db" ] || { echo "no existe $db" >&2; exit 1; }
[ -f "$files" ] || { echo "no existe $files" >&2; exit 1; }
[ -w /data ] || { echo "/data está en solo lectura: añade -f compose.restore.yaml después de -f compose.yaml" >&2; exit 1; }
exec 9>/backups/.operation.lock
flock -n 9 || { echo "hay otra copia o restauración en curso" >&2; exit 1; }
trap 'exit 1' TERM INT

# También rechaza una app encendida aunque su pool no tenga conexiones abiertas.
if bash -c 'exec 3<>/dev/tcp/app/3000' 2>/dev/null; then
  echo "la app sigue en marcha: ejecuta docker compose stop app" >&2
  exit 1
fi
others=$(psql -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()")
[ "$others" -eq 0 ] || { echo "hay $others conexiones a la base de datos: para la app (docker compose stop app)" >&2; exit 1; }

# Detectar copias ilegibles antes de modificar la base de datos o vaciar el volumen.
pg_restore --list "$db" >/dev/null
tar -tzf "$files" >/dev/null
pg_restore --clean --if-exists --exit-on-error --single-transaction -d "$PGDATABASE" "$db"
find /data -mindepth 1 -delete
tar -xzf "$files" -C /data
echo "restaurada la copia $stamp"

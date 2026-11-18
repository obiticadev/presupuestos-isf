#!/bin/sh
# Pruebas aisladas de los scripts, sin PostgreSQL ni datos reales:
# docker run --rm --env T7_SCRIPT_TEST_CONTAINER=1 --tmpfs /backups --tmpfs /data \
#   --mount type=bind,source=<repo>,target=/repo,readonly postgres:17 sh /repo/tests/docker/backup-scripts.sh
set -eu
[ "${T7_SCRIPT_TEST_CONTAINER:-}" = 1 ] || { echo "Ejecutar solo en el contenedor de pruebas" >&2; exit 1; }
export PGDATABASE=presupuestos
mkdir -p /backups/db /backups/appdata /data/uploads
bin=$(mktemp -d)
export PATH="$bin:$PATH"
cat >"$bin/date" <<'EOF'
#!/bin/sh
if [ "${DST_SKIP:-0}" = 1 ]; then
  case "$*" in
    '+%s') echo 10000; exit ;;
    '-d 02:00 +%s') echo 9000; exit ;;
    '-d tomorrow 02:00 +%s') exit 1 ;;
    '-d tomorrow 03:00 +%s') echo 13600; exit ;;
  esac
fi
if [ "${1:-}" = +%Y%m%d-%H%M ]; then echo 20261110-1200; else /bin/date "$@"; fi
EOF
cat >"$bin/pg_dump" <<'EOF'
#!/bin/sh
[ "${FAIL_DUMP:-0}" = 0 ] || exit 1
echo dump >"$3"
EOF
cat >"$bin/pg_restore" <<'EOF'
#!/bin/sh
if [ "$1" = --list ]; then cat "$2" >/dev/null; else echo restored >/data/db-restored; fi
EOF
cat >"$bin/psql" <<'EOF'
#!/bin/sh
echo "${OTHER_CONNECTIONS:-0}"
EOF
cat >"$bin/bash" <<'EOF'
#!/bin/sh
[ "${APP_RUNNING:-0}" = 1 ]
EOF
cat >"$bin/tar" <<'EOF'
#!/bin/sh
[ "${FAIL_TAR:-0}" = 0 ] || exit 2
# Código 1 de GNU tar: un archivo cambió mientras se leía, pero el archivo queda completo.
[ "${CHANGED_TAR:-0}" = 0 ] || { /bin/tar "$@"; exit 1; }
exec /bin/tar "$@"
EOF
chmod +x "$bin"/*
backup=/repo/scripts/backup.sh
restore=/repo/scripts/restore.sh
stamp=20261110-1200
db=/backups/db/presupuestos-$stamp.dump
files=/backups/appdata/appdata-$stamp.tar.gz
must_fail() { if "$@"; then echo "ERROR: debía fallar: $*" >&2; exit 1; fi; }
no_lock() { flock -n /backups/.operation.lock true; }
no_pair() { [ ! -e "$db" ] && [ ! -e "$files" ]; no_lock; }

echo logo >/data/uploads/logo.txt
must_fail env FAIL_DUMP=1 sh "$backup" now
no_pair
must_fail env FAIL_TAR=1 sh "$backup" now
no_pair
[ ! -e "$db.tmp" ] && [ ! -e "$files.tmp" ]
# Un archivo que cambia al leerlo no hace fallar la copia: queda guardada con un aviso.
env CHANGED_TAR=1 sh "$backup" now >/tmp/changed.log 2>&1 || { cat /tmp/changed.log >&2; echo "ERROR: la copia con un archivo cambiado debía salir bien" >&2; exit 1; }
[ -e "$db" ] && [ -e "$files" ] && grep -q AVISO /tmp/changed.log
rm -f "$db" "$files"
no_pair

# Retención independiente de ambos tipos, sin borrar archivos ajenos ni temporales.
i=1
while [ "$i" -le 31 ]; do
  old=$(printf '202601%02d-0200' "$i")
  touch "/backups/db/presupuestos-$old.dump" "/backups/appdata/appdata-$old.tar.gz"
  i=$((i + 1))
done
touch /backups/db/ajeno.txt
sh "$backup" now
no_lock
[ "$(find /backups/db -name '*.dump' | wc -l)" -eq 30 ]
[ "$(find /backups/appdata -name '*.tar.gz' | wc -l)" -eq 30 ]
[ -e /backups/db/ajeno.txt ]
[ "$(stat -c %a "$db")" = 600 ]
before=$(sha256sum "$db" "$files")
must_fail sh "$backup" now
[ "$before" = "$(sha256sum "$db" "$files")" ]
no_lock

exec 8>/backups/.operation.lock
flock -n 8
must_fail sh "$backup" now
must_fail sh "$restore" "$stamp"
flock -u 8
exec 8>&-
must_fail sh "$restore" ../invalida
must_fail sh "$restore" 19990101-0000
must_fail env APP_RUNNING=1 sh "$restore" "$stamp"
must_fail env OTHER_CONNECTIONS=1 sh "$restore" "$stamp"
no_lock
[ ! -e /data/db-restored ]

# Un tar corrupto no debe modificar la BD ni vaciar los archivos.
cp "$files" "$files.saved"
echo corrupto >"$files"
must_fail sh "$restore" "$stamp"
[ ! -e /data/db-restored ] && [ -e /data/uploads/logo.txt ]
mv "$files.saved" "$files"
echo posterior >/data/posterior.txt
sh "$restore" "$stamp"
[ ! -e /data/posterior.txt ]
[ "$(cat /data/uploads/logo.txt)" = logo ]
no_lock

# El bucle no sale al fallar una copia: vuelve a esperar y acepta SIGTERM.
cat >"$bin/sleep" <<'EOF'
#!/bin/sh
echo "$1" >/backups/sleep-seconds
if [ -e /backups/sleep-count ]; then
  echo 2 >/backups/sleep-count
  kill -TERM "$PPID"
else
  echo 1 >/backups/sleep-count
fi
EOF
chmod +x "$bin/sleep"
TZ=Europe/Madrid DST_SKIP=1 sh "$backup" loop >/backups/loop.log
grep -q 'ERROR: la copia ha fallado' /backups/loop.log
[ "$(cat /backups/sleep-count)" = 2 ]
[ "$(cat /backups/sleep-seconds)" = 3600 ]
echo "OK: fallos, temporales, retención, permisos, colisiones, exclusión mutua, restauración, bucle y cambio horario"

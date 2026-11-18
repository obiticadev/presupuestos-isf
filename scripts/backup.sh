#!/bin/sh
# Copias de la base de datos (pg_dump -Fc) y de appdata (tar.gz) en /backups; conserva las 30 más recientes de cada tipo.
#   backup.sh now    hace una copia ahora (antes de cada actualización con migraciones)
#   backup.sh loop   hace una copia cada día a las 02:00 (hora de TZ); un fallo queda en el log y no para el contenedor
set -eu
umask 077

KEEP=30

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Deja las $KEEP más recientes; el nombre lleva la fecha, así que el orden alfabético es el cronológico.
prune() { ls -1 "$1"/*"$2" 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | xargs -r rm -f --; }

backup_now() {
  mkdir -p /backups/db /backups/appdata
  # flock (incluido en postgres:17) se libera incluso si el contenedor muere con SIGKILL.
  exec 9>/backups/.operation.lock
  flock -n 9 || { log "ERROR: hay otra copia o restauración en curso"; exit 1; }
  stamp=$(date +%Y%m%d-%H%M)
  db=/backups/db/presupuestos-$stamp.dump
  files=/backups/appdata/appdata-$stamp.tar.gz
  trap 'rm -f "$db.tmp" "$files.tmp"' EXIT
  trap 'exit 1' TERM INT
  # No sobrescribir una copia del mismo minuto (ni durante la hora repetida del cambio de horario).
  [ ! -e "$db" ] && [ ! -e "$files" ] || { log "ERROR: ya existe una copia de $stamp; espera al siguiente minuto"; exit 1; }
  # Completar los dos temporales antes de publicar ninguno.
  pg_dump -Fc -f "$db.tmp"
  # GNU tar sale con 1 si un archivo cambió mientras se leía: el archivo queda completo y válido. Otro código, fallo.
  # exit explícito: set -e no corta dentro de un `||`.
  tar -czf "$files.tmp" -C /data . || { [ $? -eq 1 ] || exit 1; log "AVISO: un archivo de /data cambió mientras se copiaba; la copia se guarda igualmente"; }
  mv "$files.tmp" "$files"
  mv "$db.tmp" "$db"
  prune /backups/db .dump
  prune /backups/appdata .tar.gz
  log "copia hecha: $db y $files"
}

seconds_until_2am() {
  now=$(date +%s)
  # En el salto de primavera no existen las 02:00 de Madrid: copiar a las 03:00, sin matar el bucle.
  next=$(date -d '02:00' +%s 2>/dev/null) || next=$(date -d '03:00' +%s)
  if [ "$next" -le "$now" ]; then
    next=$(date -d 'tomorrow 02:00' +%s 2>/dev/null) || next=$(date -d 'tomorrow 03:00' +%s)
  fi
  echo $((next - now))
}

case "${1:-}" in
  now) backup_now ;;
  loop)
    trap 'exit 0' TERM INT
    log "copias diarias a las 02:00 ($TZ)"
    while :; do
      sleep "$(seconds_until_2am)" & wait $!
      # Proceso aparte: así set -e corta la copia que falla, y el bucle sigue.
      "$0" now || log "ERROR: la copia ha fallado"
    done
    ;;
  *) echo "uso: $0 now|loop" >&2; exit 2 ;;
esac

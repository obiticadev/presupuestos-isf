#!/bin/sh
# Copias de la base de datos (pg_dump -Fc) y de appdata (tar.gz) en /backups; conserva las 30 más recientes de cada tipo.
#   backup.sh now    hace una copia ahora (antes de cada actualización con migraciones)
#   backup.sh loop   hace una copia cada día a las 02:00 (hora de TZ); un fallo queda en el log y no para el contenedor
set -eu

KEEP=30

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Deja las $KEEP más recientes; el nombre lleva la fecha, así que el orden alfabético es el cronológico.
prune() { ls -1 "$1"/*"$2" 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | xargs -r rm -f --; }

backup_now() {
  stamp=$(date +%Y%m%d-%H%M)
  mkdir -p /backups/db /backups/appdata
  rm -f /backups/db/*.tmp /backups/appdata/*.tmp
  db=/backups/db/presupuestos-$stamp.dump
  files=/backups/appdata/appdata-$stamp.tar.gz
  # Primero a .tmp y después mv: nunca queda una copia a medias con nombre válido.
  pg_dump -Fc -f "$db.tmp"
  mv "$db.tmp" "$db"
  tar -czf "$files.tmp" -C /data .
  mv "$files.tmp" "$files"
  prune /backups/db .dump
  prune /backups/appdata .tar.gz
  log "copia hecha: $db y $files"
}

seconds_until_2am() {
  now=$(date +%s)
  next=$(date -d '02:00' +%s)
  [ "$next" -gt "$now" ] || next=$(date -d 'tomorrow 02:00' +%s)
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

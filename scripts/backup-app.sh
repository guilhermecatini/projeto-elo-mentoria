#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_config
if [[ "${ELO_LOCK_HELD:-0}" != 1 ]]; then acquire_operation_lock; fi
backup_root="${BACKUP_DIR:-$APP_ROOT/backups}"
[[ "$backup_root" == /* && ! -L "$backup_root" ]] || die 'BACKUP_DIR deve ser caminho absoluto e não pode ser link simbólico.'
mkdir -p -- "$backup_root"
backup_root="$(realpath -- "$backup_root")"
destination="$(mktemp -d "$backup_root/elo-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
log "Criando cópia consistente em $destination."
running="$("${COMPOSE[@]}" ps --services --status running)"
resume=()
for service in api worker; do
  if grep -qx "$service" <<< "$running"; then resume+=("$service"); fi
done
resume_services() {
  if [[ ${#resume[@]} -gt 0 ]]; then "${COMPOSE[@]}" start "${resume[@]}" >/dev/null; fi
}
trap resume_services EXIT
if [[ ${#resume[@]} -gt 0 ]]; then "${COMPOSE[@]}" stop "${resume[@]}" >/dev/null; fi
"${COMPOSE[@]}" exec -T db pg_dump -U elo_owner -d elo --format=custom --no-owner --no-acl > "$destination/database.dump"
"${COMPOSE[@]}" exec -T db pg_restore --list < "$destination/database.dump" > "$destination/database.list"
[[ -s "$destination/database.list" ]] || die 'O arquivo de banco não passou na validação.'
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint tar api -C /app/uploads -czf - . > "$destination/uploads.tar.gz"
tar -tzf "$destination/uploads.tar.gz" >/dev/null
printf 'application=elo-mentoria\ncreated_at=%s\npostgres_major=18\n' "$(date -u +%FT%TZ)" > "$destination/manifest.txt"
if command -v git >/dev/null && git -C "$APP_ROOT" rev-parse HEAD >/dev/null 2>&1; then git -C "$APP_ROOT" rev-parse HEAD >> "$destination/manifest.txt"; fi
(cd -- "$destination" && sha256sum database.dump uploads.tar.gz manifest.txt > SHA256SUMS && sha256sum -c SHA256SUMS >/dev/null)
log "Backup verificado: $destination. Copie-o para fora deste servidor; guarde .env/chaves separadamente em cofre seguro."
printf '%s\n' "$destination" > "$APP_ROOT/.local/latest-backup"

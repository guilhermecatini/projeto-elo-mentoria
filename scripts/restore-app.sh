#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# -eq 4 && "$2" == --project && "$4" == --confirm-isolated ]] || die 'Uso: bash scripts/restore-app.sh /caminho/backup --project elo-restore-nome --confirm-isolated'
source_dir="$(realpath -- "$1")"
project="$3"
[[ "$project" =~ ^elo-restore-[a-z0-9][a-z0-9-]{0,35}$ ]] || die 'O destino deve ter nome isolado elo-restore-...'
require_config
acquire_operation_lock
[[ -d "$source_dir" && -f "$source_dir/SHA256SUMS" ]] || die 'Diretório de backup inválido.'
for file in database.dump uploads.tar.gz manifest.txt SHA256SUMS; do [[ -f "$source_dir/$file" && ! -L "$source_dir/$file" ]] || die "Arquivo inseguro: $file"; done
[[ "$(wc -l < "$source_dir/SHA256SUMS")" -eq 3 ]] || die 'Manifesto de hashes inválido.'
while read -r hash name; do
  [[ "$hash" =~ ^[0-9a-f]{64}$ && "$name" =~ ^(database.dump|uploads.tar.gz|manifest.txt)$ ]] || die 'Manifesto contém entrada não permitida.'
done < "$source_dir/SHA256SUMS"
(cd -- "$source_dir" && sha256sum -c SHA256SUMS)
grep -qx 'application=elo-mentoria' "$source_dir/manifest.txt" || die 'Backup de outra aplicação.'
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$project")" ]] || die 'O destino já tem containers. Escolha outro nome; nada será sobrescrito.'
[[ -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$project")" ]] || die 'O destino já tem volumes. Escolha outro nome.'
if tar -tzf "$source_dir/uploads.tar.gz" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then die 'Arquivo de anexos contém caminhos inseguros.'; fi
if tar -tvzf "$source_dir/uploads.tar.gz" | grep -Eq '^[^d-]'; then die 'O arquivo de anexos contém links ou tipos especiais não permitidos.'; fi
COMPOSE+=(-p "$project")
"${COMPOSE[@]}" up -d --wait db redis
"${COMPOSE[@]}" exec -T db pg_restore -U elo_owner -d elo --no-owner --no-acl --exit-on-error < "$source_dir/database.dump"
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint tar api -C /app/uploads -xzf - < "$source_dir/uploads.tar.gz"
"${COMPOSE[@]}" up -d api worker
wait_health
log "Restauração isolada concluída no projeto $project, sem portas públicas. Banco e anexos validados; o ambiente original foi preservado."
log "Inspeção: docker compose -p $project ps. Para promover, planeje DNS/proxy, segredos e corte de escrita; este script não sobrescreve produção."

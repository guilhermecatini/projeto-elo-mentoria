#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_config
require_command git
acquire_operation_lock
git -C "$APP_ROOT" rev-parse --is-inside-work-tree >/dev/null || die 'O diretório precisa ser um checkout Git.'
[[ -z "$(git -C "$APP_ROOT" status --porcelain)" ]] || die 'Há alterações locais. Preserve-as antes de atualizar; nada será descartado.'
branch="$(git -C "$APP_ROOT" symbolic-ref --short HEAD)" || die 'Checkout sem branch ativa.'
git -C "$APP_ROOT" rev-parse --abbrev-ref '@{upstream}' >/dev/null || die "A branch $branch não tem origem configurada. Configure o repositório antes de usar este script."
previous="$(git -C "$APP_ROOT" rev-parse HEAD)"
printf '%s\n' "$previous" > "$APP_ROOT/.local/previous-version"
ELO_LOCK_HELD=1 bash "$APP_ROOT/scripts/backup-app.sh"
log "Versão anterior registrada: $previous. Atualizando $branch apenas com avanço direto."
git -C "$APP_ROOT" pull --ff-only
"${COMPOSE[@]}" build api worker frontend
"${COMPOSE[@]}" stop api worker
"${COMPOSE[@]}" run --rm --no-deps migrate
"${COMPOSE[@]}" up -d api worker frontend
wait_health
log 'Atualização concluída. O backup e as imagens anteriores não foram removidos.'

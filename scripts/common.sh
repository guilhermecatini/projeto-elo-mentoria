#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
ENV_FILE="$APP_ROOT/.env"
COMPOSE=(docker compose --project-directory "$APP_ROOT" --env-file "$ENV_FILE" -f "$APP_ROOT/compose.yml")
log() { printf '[Elo] %s\n' "$*"; }
die() { printf '[Elo] ERRO: %s\n' "$*" >&2; exit 1; }
trap 'printf "[Elo] Falha na linha %s. Dados e configuração foram preservados.\n" "$LINENO" >&2' ERR
require_command() { command -v "$1" >/dev/null || die "Instale o comando $1 antes de continuar."; }
require_config() {
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || die 'Configuração .env ausente ou é link simbólico.'
  [[ "$(stat -c '%a' "$ENV_FILE")" == 600 ]] || die 'Proteja .env com chmod 600 .env.'
  require_command docker
  docker info >/dev/null 2>&1 || die 'Docker não está acessível para este usuário.'
  docker compose version >/dev/null
  "${COMPOSE[@]}" config --quiet
}
env_value() { sed -n "s/^${1}=//p" "$ENV_FILE" | head -n 1 | tr -d '\r'; }
wait_health() {
  local attempt=0
  while (( attempt < 60 )); do
    attempt=$((attempt + 1))
    if "${COMPOSE[@]}" exec -T api node -e "fetch('http://127.0.0.1:3333/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      log 'API, banco, fila e worker disponíveis.'
      return 0
    fi
    sleep 2
  done
  "${COMPOSE[@]}" ps >&2
  die 'Saúde não confirmada. Consulte docker compose logs --tail 100 api worker; não restaure o banco automaticamente.'
}
acquire_operation_lock() {
  mkdir -p -- "$APP_ROOT/.local"
  exec 9>"$APP_ROOT/.local/operation.lock"
  flock -n 9 || die 'Outra instalação, atualização, cópia ou restauração está em execução.'
}

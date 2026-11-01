#!/usr/bin/env bash
set -Eeuo pipefail
# Execute no repositório já clonado. Sem git clone/pull implícito.
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ "$EUID" -eq 0 ]] || die 'Execute com sudo -E bash scripts/install-app.sh.'
[[ -f "$APP_ROOT/package-lock.json" && -f "$APP_ROOT/compose.yml" ]] || die 'Execute a partir de uma cópia completa do repositório.'
source /etc/os-release
[[ "$ID" == ubuntu ]] || die 'Distribuição suportada: Ubuntu Server 24.04 ou posterior.'
[[ "${VERSION_ID%%.*}" -ge 24 ]] || die 'Ubuntu 24.04 ou posterior é necessário.'
case "$(uname -m)" in x86_64|aarch64) ;; *) die 'Arquitetura suportada: amd64 ou arm64.';; esac
[[ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -ge 1900000 ]] || die 'São necessários pelo menos 2 GB de memória.'
[[ "$(df -Pk "$APP_ROOT" | awk 'NR==2 {print $4}')" -ge 8000000 ]] || die 'Reserve pelo menos 8 GB livres em disco.'
acquire_operation_lock
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  log 'Instalando dependências ausentes pelo repositório oficial do Docker.'
  apt-get update -q
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod 0644 /etc/apt/keyrings/docker.asc
  fi
  if ! grep -Rqs 'download.docker.com/linux/ubuntu' /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null; then
    printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
  fi
  apt-get update -q
  if command -v docker >/dev/null; then
    apt-get install -y docker-buildx-plugin docker-compose-plugin
  else
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi
  systemctl enable --now docker
fi
require_command openssl
require_command curl
if [[ ! -e "$ENV_FILE" ]]; then
  DOMAIN="${DOMAIN:-}"
  ADMIN_EMAIL="${ADMIN_EMAIL:-}"
  if [[ -z "$DOMAIN" && -t 0 ]]; then read -r -p 'Domínio público (DNS já apontando para este servidor): ' DOMAIN; fi
  if [[ -z "$ADMIN_EMAIL" && -t 0 ]]; then read -r -p 'E-mail do primeiro administrador: ' ADMIN_EMAIL; fi
  [[ "$DOMAIN" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]] || die 'Informe DOMAIN como domínio público válido, sem protocolo.'
  [[ "$ADMIN_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] || die 'Informe ADMIN_EMAIL válido.'
  getent ahosts "$DOMAIN" >/dev/null || die 'O domínio ainda não resolve por DNS.'
  for port in 80 443; do
    if ss -ltnH "sport = :$port" | grep -q .; then die "A porta $port já está ocupada. Libere-a ou adapte o proxy antes da instalação."; fi
  done
  {
    printf 'COMPOSE_PROJECT_NAME=elo-mentoria\nNODE_ENV=production\n'
    printf 'DB_OWNER_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'DB_APP_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'REDIS_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 48)"
    printf 'APP_ORIGIN=https://%s\nSITE_ADDRESS=%s\nADMIN_EMAIL=%s\nADMIN_NAME=Administrador\n' "$DOMAIN" "$DOMAIN" "$ADMIN_EMAIL"
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log 'Configuração criada com segredos exclusivos. Preserve uma cópia criptografada fora do servidor.'
else
  log 'Configuração existente preservada; credenciais não serão substituídas.'
fi
require_config
"${COMPOSE[@]}" build api worker frontend
"${COMPOSE[@]}" up -d --wait db redis
"${COMPOSE[@]}" run --rm --no-deps migrate
"${COMPOSE[@]}" up -d api worker frontend
wait_health
if [[ ! -f "$APP_ROOT/.local/bootstrap.complete" ]]; then
  "${COMPOSE[@]}" run --rm --no-deps migrate node apps/api/dist/cli.js bootstrap > "$APP_ROOT/.local/first-access.txt"
  chmod 600 "$APP_ROOT/.local/first-access.txt"
  touch "$APP_ROOT/.local/bootstrap.complete"
  log 'O acesso inicial de uso único está em .local/first-access.txt (validade 24 h). Defina a senha e configure o autenticador no primeiro acesso.'
fi
address="$(env_value APP_ORIGIN)"
curl --fail --silent --show-error --retry 10 --retry-delay 3 "$address/api/health/live" >/dev/null || die 'Serviços disponíveis internamente; HTTPS ainda não confirmou. Verifique DNS, portas 80/443 e logs do frontend.'
log "Instalação disponível em $address. Nenhum dado demonstrativo foi instalado."

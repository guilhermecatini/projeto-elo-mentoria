#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
mkdir -p /work
cp /source/.env /work/.env
sed -i 's/\r$//' /work/.env
chmod 600 /work/.env
grep -qx 'NODE_ENV=development' /work/.env || exit 1
cp /source/compose.yml /work/compose.yml
cp -r /source/scripts /work/scripts
source /work/scripts/common.sh
require_config
sql="SELECT 'notifications=' || count(*) FROM notifications; SELECT 'open_deadlines=' || count(*) FROM sla_events WHERE fulfilled_at IS NULL; SELECT id || ':' || due_at::text FROM sla_events WHERE fulfilled_at IS NULL ORDER BY id;"
snapshot() { "${COMPOSE[@]}" exec -T db psql -U elo_owner -d elo -Atc "$sql"; }
"${COMPOSE[@]}" exec -T api node apps/api/dist/cli.js reconcile
snapshot > /evidence/restart-before.txt
before_env="$(sha256sum /work/.env | cut -d ' ' -f 1)"
bash /work/scripts/restart-app.sh
"${COMPOSE[@]}" exec -T api node apps/api/dist/cli.js reconcile
"${COMPOSE[@]}" exec -T api node apps/api/dist/cli.js reconcile
snapshot > /evidence/restart-after.txt
cmp /evidence/restart-before.txt /evidence/restart-after.txt
[[ "$before_env" == "$(sha256sum /work/.env | cut -d ' ' -f 1)" ]]
printf 'Reinício completo: pronto\nNotificações: sem multiplicação\nPendências e prazos: preservados\nConfiguração: preservada\n' | tee /evidence/RESTART.txt

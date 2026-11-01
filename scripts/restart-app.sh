#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_config
acquire_operation_lock
log 'Reiniciando apenas os serviços desta aplicação.'
"${COMPOSE[@]}" restart db redis api worker frontend
wait_health

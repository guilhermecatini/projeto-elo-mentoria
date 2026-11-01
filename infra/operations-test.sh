#!/usr/bin/env bash
# Run only against seeded development data; requires a Docker socket and explicit
# host path for the init script. Never invoked by install/update.
set -Eeuo pipefail
umask 077
[[ -n "${HOST_WORKSPACE_PATH:-}" && -f /source/.env ]] || { echo 'Configure HOST_WORKSPACE_PATH e monte a origem em /source.' >&2; exit 1; }
[[ "$HOST_WORKSPACE_PATH" == /* && "$HOST_WORKSPACE_PATH" != *$'\n'* ]] || exit 1
mkdir -p /work/infra /work/.local /evidence
cp /source/.env /work/.env
sed -i 's/\r$//' /work/.env
chmod 600 /work/.env
grep -qx 'NODE_ENV=development' /work/.env || { echo 'Ensaio permitido apenas em NODE_ENV=development.' >&2; exit 1; }
cp /source/compose.yml /work/compose.yml
cp -r /source/scripts /work/scripts
cp /source/infra/postgres-init.sh /work/infra/postgres-init.sh
# A Docker daemon resolves bind paths in its own host, not this helper container.
sed -i "s|\./infra/postgres-init.sh|$HOST_WORKSPACE_PATH/infra/postgres-init.sh|" /work/compose.yml
# Match the running development network; public service ports remain absent in
# the base file, including for the isolated restore destination.
sed -i 's/^    internal: true$/    internal: false/' /work/compose.yml
source /work/scripts/common.sh
require_config
before_env="$(sha256sum /work/.env | cut -d ' ' -f 1)"
demo_password="$(env_value DEMO_PASSWORD)"
[[ ${#demo_password} -ge 12 ]] || { echo 'DEMO_PASSWORD é necessário para validar download autenticado.' >&2; exit 1; }
attachment_id="$(printf '%s' "$demo_password" | "${COMPOSE[@]}" exec -T api node -e '
const password=require("node:fs").readFileSync(0,"utf8");
(async()=>{
 const origin="http://127.0.0.1:3333/api";
 const login=await fetch(origin+"/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:process.env.APP_ORIGIN},body:JSON.stringify({email:"admin@demo.local",password})});
 if(!login.ok)throw new Error("Login do ensaio falhou: "+login.status);
 const cookie=login.headers.get("set-cookie").split(";")[0],auth=await login.json();
 const headers={Cookie:cookie,Origin:process.env.APP_ORIGIN,"X-CSRF-Token":auth.csrfToken};
 async function json(path,body){const response=await fetch(origin+path,{headers:{...headers,"Content-Type":"application/json"},...(body?{method:"POST",body:JSON.stringify(body)}:{})});if(!response.ok)throw new Error("Preparação do ensaio falhou: "+response.status);return response.json();}
 const client=(await json("/clients")).find(value=>value.status==="active");if(!client)throw new Error("Nenhuma contratação de demonstração ativa.");
 const ticket=await json("/tickets",{enrollmentId:client.enrollmentId,subject:"Ensaio de backup de anexo privado",description:"Registro demonstrativo criado para validar backup e restauração de arquivo via API.",priority:"standard"});
 const message=(await json("/tickets/"+ticket.id)).messages.find(value=>value.authorId===auth.user.id);
 if(!message)throw new Error("Mensagem do ensaio não encontrada.");
 const form=new FormData();form.append("file",new Blob(["Elo: arquivo real do ensaio de backup. "+new Date().toISOString()],{type:"text/plain"}),"validacao-backup.txt");
 const response=await fetch(origin+"/tickets/"+ticket.id+"/messages/"+message.id+"/attachments",{method:"POST",headers,body:form});
 if(!response.ok)throw new Error("Upload autenticado do ensaio falhou: "+response.status);
 console.log((await response.json()).id);
})().catch(error=>{console.error(error.message);process.exitCode=1;});')"
[[ "$attachment_id" =~ ^[a-f0-9-]{36}$ ]] || exit 1
before_rows="$("${COMPOSE[@]}" exec -T db psql -U elo_owner -d elo -Atc "SELECT count(*) FROM users; SELECT count(*) FROM tickets; SELECT count(*) FROM attachments WHERE status='ready';")"
attachment_record="$("${COMPOSE[@]}" exec -T db psql -U elo_owner -d elo -At -F '|' -c "SELECT id,sha256,storage_key FROM attachments WHERE id='$attachment_id' AND status='ready';")"
IFS='|' read -r attachment_id expected_hash storage_key <<< "$attachment_record"
[[ "$attachment_id" =~ ^[a-f0-9-]{36}$ && "$storage_key" =~ ^[a-f0-9-]{36}$ && "$expected_hash" =~ ^[a-f0-9]{64}$ ]] || exit 1
BACKUP_DIR=/evidence bash /work/scripts/backup-app.sh
backup="$(cat /work/.local/latest-backup)"
restore_project="elo-restore-check-$(date -u +%Y%m%d%H%M%S)"
bash /work/scripts/restore-app.sh "$backup" --project "$restore_project" --confirm-isolated
after_rows="$("${COMPOSE[@]}" -p "$restore_project" exec -T db psql -U elo_owner -d elo -Atc "SELECT count(*) FROM users; SELECT count(*) FROM tickets; SELECT count(*) FROM attachments WHERE status='ready';")"
[[ "$before_rows" == "$after_rows" ]] || { echo 'Contagens divergiram na restauração.' >&2; exit 1; }
restored_record="$("${COMPOSE[@]}" -p "$restore_project" exec -T db psql -U elo_owner -d elo -At -F '|' -c "SELECT id,sha256,storage_key FROM attachments WHERE id='$attachment_id' AND status='ready';")"
[[ "$restored_record" == "$attachment_record" ]] || { echo 'Metadado do anexo divergiu após restauração.' >&2; exit 1; }
printf '%s\n%s\n%s\n' "$demo_password" "$attachment_id" "$expected_hash" | "${COMPOSE[@]}" -p "$restore_project" exec -T api node -e '
const fs=require("node:fs"),crypto=require("node:crypto");
const [password,id,expected]=fs.readFileSync(0,"utf8").trimEnd().split("\n");
(async()=>{
 const login=await fetch("http://127.0.0.1:3333/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:process.env.APP_ORIGIN},body:JSON.stringify({email:"admin@demo.local",password})});
 if(!login.ok)throw new Error("Login de verificação falhou: "+login.status);
 const cookie=login.headers.get("set-cookie").split(";")[0];
 const response=await fetch("http://127.0.0.1:3333/api/attachments/"+id+"/download",{headers:{Cookie:cookie}});
 if(!response.ok)throw new Error("Download restaurado falhou: "+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(crypto.createHash("sha256").update(bytes).digest("hex")!==expected)throw new Error("Bytes restaurados divergiram do metadado.");
 if(!response.headers.get("cache-control").includes("no-store"))throw new Error("Download sem política privada.");
 console.log("Anexo real: metadado, autorização de download e SHA-256 verificados.");
})().catch(error=>{console.error(error.message);process.exitCode=1;});'
if bash /work/scripts/restore-app.sh "$backup" --project "$restore_project" --confirm-isolated >/evidence/repeat-restore.txt 2>&1; then
  echo 'Restauração repetida deveria ser recusada.' >&2; exit 1
fi
after_env="$(sha256sum /work/.env | cut -d ' ' -f 1)"
[[ "$before_env" == "$after_env" ]] || { echo 'A configuração foi alterada.' >&2; exit 1; }
"${COMPOSE[@]}" -p "$restore_project" stop api worker db redis
wait_health
printf 'Backup: %s\nProjeto restaurado e parado: %s\nBanco e anexo real: metadado, download autenticado e SHA-256 validados\nSobrescrita: recusada\nConfiguração: hash preservado\nVolumes: preservados\n' "$backup" "$restore_project" | tee /evidence/RESULT.txt

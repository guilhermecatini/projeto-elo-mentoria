# Operação do Elo

## Instalação em Ubuntu

Pré-requisitos: repositório já clonado, Ubuntu Server 24.04 ou posterior com suporte no repositório oficial do Docker, amd64/arm64, mínimo 2 GB RAM e 8 GB livres (dimensionar dados e backups separadamente), domínio apontando ao servidor e portas TCP 80/443 liberadas. Não executar os scripts com arquivos de origem desconhecida. O instalador não clona nem atualiza o Git.

```sh
sudo DOMAIN=mentoria.suaempresa.com.br ADMIN_EMAIL=admin@suaempresa.com.br bash scripts/install-app.sh
```

O instalador gera `.env` com permissão 600, verifica recursos, instala apenas dependências ausentes por fontes oficiais, compila, migra e sobe os serviços. Nova execução preserva todas as credenciais. O link inicial de uso único fica no arquivo protegido `.local/first-access.txt`; expire ou remova essa cópia após usá-lo. A primeira senha é definida pelo usuário. Não são instalados dados demonstrativos. Configure o aplicativo autenticador no fluxo inicial do administrador.

Não é possível garantir HTTPS se DNS, firewall ou o provedor de certificado não estiverem disponíveis. O instalador verifica acesso interno e externo e explica a diferença em caso de falha. Não exponha o Docker socket. Restrinja SSH e mantenha host, imagens e dependências atualizados.

Fontes de configuração: [Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [volume do PostgreSQL 18](https://hub.docker.com/_/postgres), [HTTPS automático do Caddy](https://caddyserver.com/docs/automatic-https).

## Ambientes e serviços

- `compose.yml`: produção; somente frontend/proxy expõe 80/443. API e worker usam usuário Linux `node`; PostgreSQL inicia pelo entrypoint oficial e reduz privilégios. Caddy precisa das portas baixas e gerencia certificados. Redis usa senha, persistência AOF e rede interna.
- `compose.dev.yml`: sobreposição explícita para desenvolvimento; frontend `127.0.0.1:18088`, API `127.0.0.1:3333`, banco `127.0.0.1:55432`, Redis `127.0.0.1:56379`. A rede deixa de ser `internal` para permitir mapeamentos locais. Use `docker compose -f compose.yml -f compose.dev.yml ...`.
- Os scripts em `scripts/` operam o Compose de produção no Ubuntu. Não execute os scripts de backup/restauração diretamente sobre uma instalação criada com outra combinação de arquivos Compose; o ensaio de desenvolvimento abaixo ajusta uma cópia isolada da configuração para a rede local.
- O nome padrão é `elo-mentoria`. Outros projetos e volumes não são alterados. Não use `down -v`.
- Banco armazena instantes UTC; aplicação apresenta o fuso do programa, inicialmente São Paulo.
- Role `elo_owner` fica somente na inicialização/migrations; a API e o worker usam `elo_app`, sem permissões de DDL, criação de banco ou superusuário. O usuário owner não está no ambiente do serviço API.
- Health do frontend confirma processo Caddy; health da API confirma liveness; `/api/health/ready` verifica banco, Redis e heartbeat do worker. API pode iniciar antes do worker e só depois ficar pronta.
- Todos os serviços possuem rotação de logs. Trate logs como dados operacionais com acesso limitado.

## Reinício e atualização

```sh
bash scripts/restart-app.sh
bash scripts/update-app.sh
```

Reinício não executa Git, build, migration ou mudanças de configuração. Atualização exige checkout limpo, branch com upstream e exclusão mútua. Registra SHA anterior em `.local/previous-version`, faz backup consistente, executa `git pull --ff-only`, build, interrompe API/worker, migra e verifica prontidão. O script existe para operação futura; sua criação não executa ações no Git.

O servidor único terá interrupção durante backup consistente, migrations e reinício. Uma falha de build mantém a versão em execução; falha de migration exige diagnóstico antes de reiniciar. Não há rollback automático de schema. Favoreça alterações aditivas compatíveis com a versão anterior; documente migrations destrutivas e planeje a recuperação antes da execução. Para voltar código, prepare checkout da versão anterior em diretório separado, revise compatibilidade do schema e restaure primeiro em ambiente isolado. Não faça reset ou restauração sobre o banco ativo.

## Backup e recuperação

```sh
bash scripts/backup-app.sh
bash scripts/restore-app.sh /caminho/backup --project elo-restore-ensaio --confirm-isolated
```

O backup pausa API/worker, preserva o estado de execução anterior, captura dump PostgreSQL e volume privado de anexos, verifica catálogo/tar e grava SHA-256. O `trap` reinicia os serviços que estavam ativos mesmo em falha. Isso evita inconsistência entre metadados e arquivos. Não captura Redis: filas e alertas são reconstruídos pela reconciliação persistida. O volume contém os arquivos privados vinculados aos atendimentos e tarefas, enquanto os metadados ficam no dump.

Backups ficam em `backups/` por padrão, com permissões restritas. Defina `BACKUP_DIR` absoluto se necessário. O backup contém dados pessoais e deve ser criptografado antes de uma cópia externa. A política de agendamento, retenção e exclusão depende da operação; nada é apagado automaticamente.

`.env`, certificados e chaves não são incluídos. Preserve-os separadamente em cofre seguro e fora do servidor. Perder a chave de criptografia da aplicação pode inviabilizar recuperação de segredos, inclusive MFA, mesmo com o banco íntegro. Não compartilhe backups ou arquivos `.local` em Git.

Restauração exige projeto novo `elo-restore-*`, sem containers ou volumes existentes. Valida hashes, arquivos e caminhos, restaura em volumes novos, inicia API/worker e verifica prontidão. Não publica portas, não inicia proxy e não substitui produção. As imagens devem corresponder à versão compatível com o backup. A restauração usa a configuração atual; forneça as chaves originais antes de validar dados criptografados. Inspecione com `docker compose -p elo-restore-ensaio exec ...`; a promoção posterior deve incluir congelamento de escrita e plano de DNS/proxy.

## Anexos privados

Anexos de atendimento/tarefa usam o volume `uploads` da API em `/app/uploads`.
O proxy não monta esse volume. A aplicação usa nomes gerados, metadados no banco e
hashes; preserve banco e volume juntos. Os downloads são sempre autenticados.
O proxy limita o corpo da requisição a 11 MB, incluindo multipart; a API limita o
arquivo a 10 MiB. Formatos e limites de produto constam em `docs/anexos-privados.md`.
Não há antivírus configurado: validar o formato não garante ausência de malware.

## Limites de verificação

Scripts devem passar no ShellCheck. A validação sintática não equivale a executar instalação em servidor Ubuntu, emissão pública de certificado ou recuperação completa. Registre os ensaios realmente executados no relatório de entrega. Nunca anuncie disponibilidade sem interrupção ou conformidade automática com LGPD.

## Ensaios executados em 30/10/2026

O ensaio de anexos privados restaurou `elo-20261031T004431Z-ekTgNE` no projeto
`elo-restore-check-20261031004435`, com arquivo criado via upload autenticado e vínculo
real no banco. Metadados, download autenticado no destino e SHA-256 foram conferidos;
sobrescrita foi recusada, configuração preservada e destino parado sem apagar volumes.
O auxiliar `operations-test.sh` usa dados demonstrativos e nunca é executado pelo
instalador ou atualizador. Nenhum processo Git foi utilizado nesse ensaio.

Builds Docker da API/worker e frontend executados com sucesso; os cinco serviços iniciaram e os verificadores confirmaram prontidão. ShellCheck passou para os scripts operacionais e os ensaios. Os scripts reais de backup, restauração e reinício foram executados por um auxiliar Ubuntu 24.04 com acesso temporário ao Docker local, somente sobre os dados de desenvolvimento do projeto Elo.

Backup PostgreSQL e anexo foram restaurados no projeto separado `elo-restore-check-20261030232250`. Foram comparadas contagens de usuários/atendimentos e os bytes de um anexo de teste. Uma segunda tentativa no mesmo destino foi recusada. O ambiente restaurado foi parado; todos os seus volumes foram preservados. O arquivo de configuração manteve o mesmo hash.

O reinício completo preservou 17 notificações e 13 eventos de prazo abertos, incluindo seus IDs e datas. Duas reconciliações adicionais não multiplicaram alertas. Esses números são evidência de um ensaio específico, não métricas fixas do produto. `/api/health/ready` confirmou banco, Redis e worker disponíveis depois do reinício.

Evidências locais, ignoradas pelo Git: `.local/operation-evidence/RESULT.txt`, `RESTART.txt`, snapshots antes/depois e backup completo em subdiretório próprio. O auxiliar está definido por `infra/Dockerfile.operations-test`, `operations-test.sh` e `restart-test.sh`; ele recusa ambientes que não declarem `NODE_ENV=development`. Em Docker Desktop, `HOST_WORKSPACE_PATH` deve corresponder ao caminho Linux real do bind do diretório, obtido por inspeção do container do banco. Monte o repositório somente para leitura em `/source`, uma pasta privada de evidências em `/evidence` e o socket Docker somente durante o ensaio. Esse socket concede administração do Docker; não é montado em nenhum serviço da aplicação.

Não foram executados instalação do Docker em um servidor Ubuntu limpo, atualização de um remoto Git nem emissão de certificado com domínio público. Essas verificações exigem o ambiente correspondente; não são inferidas do sucesso dos ensaios locais.

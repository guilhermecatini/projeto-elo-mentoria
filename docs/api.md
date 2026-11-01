# API

Base `/api`. JSON UTF-8, datas ISO 8601 com fuso, UUIDs e validação no servidor.
Listagens são arrays. Erros retornam `message` e, em validação, `errors` por campo.
Dados nunca são retornados fora da organização/carteira autorizada.

## Autenticação

- `POST /auth/login` `{email,password,otp?}` → `{user,csrfToken}`, cookie HttpOnly.
- `GET /auth/me` → `{user,csrfToken}`. Não autenticado: 401.
- `POST /auth/logout` revoga sessão; `POST /auth/refresh` gira cookie e CSRF.
- `POST /auth/activate` `{token,password}` consome convite/recuperação.
- Para admin: ativação retorna `mfaSetupRequired,setupToken,secret,otpAuthUrl`.
- `POST /auth/mfa/confirm` `{setupToken,otp}` finaliza o TOTP.

Nas escritas autenticadas: enviar cookie e `X-CSRF-Token`. Browser usa a mesma origem.
Senhas de pelo menos 12 caracteres na ativação. Login não é uma chave de API.

## Operação

| Método/rota | Corpo ou resultado |
|---|---|
| GET /dashboard | `{stats,attention,portfolio}` |
| GET /clients | Carteira visível por matrícula |
| GET /clients/:id | Perfil, matrículas, atribuições, atendimentos e histórico autorizado |
| GET /clients/export | CSV da mesma carteira, fórmulas neutralizadas |
| POST /clients | `{name,contactName,email,programId,mentorId?,startsAt?,endsAt?}` → `{id,enrollmentId}` |
| GET /mentors | Mentores e contagem de carteira/capacidade |
| GET /programs | Programas autorizados e calendário |
| POST /programs | Admin: `{name,durationDays?}` |
| PATCH /programs/:id | `{name,calendar,firstStandardMinutes,firstUrgentMinutes,followupDays}` |
| POST /enrollments/:id/assignments | `{mentorId,kind:"primary" ou "coverage",endsAt?}` |
| PATCH /enrollments/:id | `{expectedVersion,status?,stage?,endsAt?,reason}`; mesma validação da jornada |
| POST /enrollments/:id/followups | `{summary,nextStep,nextStepAt}` |
| POST /enrollments/:id/interventions | Admin: `{body,ownerId,reviewAt}` |
| GET /tickets | Atendimentos e prazos pendentes |
| GET /tickets/:id | Mensagens autorizadas e eventos de prazo |
| POST /tickets | `{enrollmentId,subject,description,priority:"standard" ou "urgent"}` |
| POST /tickets/:id/messages | `{body,kind:"public" ou "internal",replyToId?,promisedAt?,completePromise?}` |
| PATCH /tickets/:id | `{status,summary?,questionMessageId?}` |
| PATCH /tickets/:id/priority | `{priority,reason}` |
| GET /notifications | Alertas próprios ainda autorizados |
| POST /notifications/:id/ack | Ciência individual |
| GET /users | Admin: usuários da organização, incluindo `capacityVersion` |
| PATCH /users/:id | Admin: `{name?,capacity?,expectedCapacityVersion?,active?}`; versão obrigatória ao informar capacidade; desativação revoga sessões |
| POST /users/invite | Admin: `{name,email,role,clientId?}` → URL de ativação |
| POST /users/:id/recovery | Admin: URL temporária de recuperação |

As URLs de ativação são segredos: mostrar somente ao administrador emissor, compartilhar
por canal confiável, não registrar em logs. O sistema não envia e-mail automaticamente;
o adaptador Resend exige configuração e validação externa antes da ativação.

`calendar`: `{timezone,days:[1,2,3,4,5],startHour:9,endHour:18,holidays:["2026-12-25"]}`.
Cobertura exige término futuro. A consulta a uma matrícula fora da carteira retorna
404 para evitar revelar sua existência. Uma operação proibida ao perfil retorna 403.

## Planos e tarefas

| Método/rota | Corpo ou resultado |
|---|---|
| GET /plans | Planos da carteira autorizada, contagens e progresso |
| POST /plans | `{enrollmentId,title,objective,baseline?,target?,priority?,staleDays?}` |
| GET /plans/:id | Plano, tarefas e histórico autorizado |
| PATCH /plans/:id | Metadados ou `{status,reason?}` |
| GET /tasks | Tarefas da carteira autorizada |
| GET /tasks/:id | Tarefa, evidência e histórico |
| POST /plans/:id/tasks | `{title,description?,assigneeId,dueAt,completionCriteria,priority?}` |
| PATCH /tasks/:id | Campos de cadastro, responsável e prazo; equipe autorizada |
| POST /tasks/:id/transition | `{status,evidenceText?,evidenceUrl?,blockReason?,reviewNote?,reason?}` |
| GET /enrollments/:id/task-assignees | Responsáveis ativos e autorizados, com papel |

Prioridade: `low`, `normal`, `high`. Estados e autorização em `planos-e-tarefas.md`.
URLs de evidência aceitam HTTPS; nenhum conteúdo externo é baixado pelo servidor.
`GET /dashboard` inclui `clientsWithoutPlan`, `stalledPlans`, `overdueTasks`,
`blockedTasks`, `pendingTaskReviews` e `orphanTasks` em `stats`. Sinais de atenção
incluem `planId`, `taskId` e `actionUrl` conforme o destino. Notificações possuem
`planId`/`taskId` opcionais e mantêm verificação de acesso vigente.

## Arquivos privados

| Método/rota | Requisição/resultado |
|---|---|
| GET /tickets/:id/attachments | Metadados das mensagens autorizadas, sem anexos internos para mentorados |
| POST /tickets/:ticketId/messages/:messageId/attachments | Multipart, campo único `file`, somente mensagem própria |
| GET /tasks/:id/attachments | Metadados da tarefa na carteira autorizada |
| POST /tasks/:id/attachments | Multipart, campo único `file`, executor ou equipe autorizada, antes da revisão |
| GET /attachments/:id/download | Sessão válida e autorização atual; resposta de download sem cache |

Uploads exigem `X-CSRF-Token` e aceitam `Idempotency-Key` UUID por tentativa lógica.
O browser define o `Content-Type` e seu boundary; não enviar `application/json`.
Metadados: `id,ticketId?,messageId?,taskId?,originalName,mimeType,sizeBytes,createdAt,
createdById,createdByName,visibility,downloadUrl`. Caminhos físicos não são retornados.
Limites e autorização estão em `anexos-privados.md`. Download de um anexo interno
ou de outra carteira é recusado mesmo quando seu identificador é conhecido.

## Reuniões e atas

| Método/rota | Requisição/resultado |
|---|---|
| GET /meetings | Agenda autorizada; filtros opcionais `enrollmentId,status,from,to` |
| POST /meetings | `{enrollmentId,title,startsAt,endsAt,hostId,participantIds,location?,agenda?}` |
| GET /meetings/:id | Participantes, presença, ata publicada; rascunho/histórico somente equipe |
| PATCH /meetings/:id | Metadados/horário/participantes; `reason` para remarcar ou alterar participantes/responsável |
| GET /enrollments/:id/meeting-participants | Equipe: usuários ativos autorizados, incluindo administradores |
| POST /meetings/:id/outcome | `{status:"held" ou "no_show" ou "cancelled",reason?}` |
| PATCH /meetings/:id/attendance | `{participants:[{userId,status:"pending" ou "present" ou "absent" ou "excused",note?}]}` |
| PATCH /meetings/:id/minutes | `{summary,nextSteps,decisions:[{id?,body}]}` salva rascunho privado |
| POST /meetings/:id/minutes/publish | Publica uma revisão; conteúdo idêntico retorna a versão existente |
| POST /meetings/:id/decisions/:decisionId/task | `{planId,assigneeId,dueAt,completionCriteria,priority?,title?}` → `{id,taskId,created}` |

Escritas são da equipe autorizada e exigem contratação ativa. Conversão repetida da
mesma decisão retorna a tarefa já vinculada; outro plano recebe conflito. A decisão
precisa estar publicada e sem alterações pendentes em rascunho.
O detalhe para mentorado nunca inclui `draftMinutes`, histórico ou observações internas
de presença. `publishedMinutes` é a última revisão publicada, independente do rascunho.

`GET /dashboard` inclui `clientsWithoutNextMeeting`, `overdueMeetings`,
`unpublishedMeetingMinutes`, `orphanMeetings` e `meetingsToday`. Sinais de atenção
podem incluir `meetingId` e `actionUrl`; notificações incluem `meetingId` opcional
ou `actionUrl` para agendar quando falta próxima reunião.
Regras de presença, publicação, contato e alertas em `reunioes-e-atas.md`.

## Diagnósticos técnicos

| Método/rota | Requisição/resultado |
|---|---|
| GET /diagnosis-templates | Equipe: modelos autorizados da organização |
| POST /diagnosis-templates | Admin: cria modelo com nome, descrição e áreas/perguntas |
| PATCH /diagnosis-templates/:id | Admin: altera modelo ou o inativa, com versão de edição |
| GET /diagnoses | Diagnósticos da carteira; mentorado recebe somente os já publicados |
| POST /diagnoses | Equipe: cria rascunho para contratação ativa, com modelo opcional |
| GET /diagnoses/:id | Detalhe autorizado; `?version=N` seleciona revisão publicada |
| PATCH /diagnoses/:id | Equipe: `{expectedVersion,title,context,maturity,findings}` salva rascunho |
| POST /diagnoses/:id/publish | Equipe: `{expectedVersion}` publica revisão |
| POST /diagnoses/:id/status | Equipe: `{expectedVersion,status:"archived" ou "active",reason}` |
| POST /diagnoses/:id/plans | Equipe: `{version,planId,findingId?}` vincula plano ativo da mesma contratação |
| POST /diagnoses/:id/findings/:findingId/plan | Equipe: `{version,title?,objective?,target?,priority?,staleDays?}` gera plano da área publicada |

`findings`: áreas com identificadores estáveis, avaliação, observação, recomendação,
prioridade e evidência HTTPS opcional. Áreas: `catalog,pricing,stock,logistics,
reputation,advertising,operations,priorities`. Avaliações: `not_assessed,adequate,
attention,critical,not_applicable`. Maturidade informada pela equipe:
`not_informed,starting,organizing,scaling`.

Mentorados não recebem rascunho, histórico da equipe ou campos em edição; um
diagnóstico ainda não publicado retorna 404 para esse perfil. Versões publicadas
preservam os dados originais mesmo após salvar novo rascunho. A versão de edição
desatualizada produz 409 e exige revisão das alterações recentes.
O vínculo de um plano à mesma versão é único: repetir a mesma origem é idempotente;
informar outra área para esse vínculo retorna 409 e preserva a origem anterior.

`GET /plans/:id` inclui `diagnostics:[{diagnosisId,title,version,findingId?,
findingArea?,linkedAt?}]`, com título da versão publicada que originou o vínculo.
Notificações de publicação podem incluir `diagnosisId`. Regras em
`diagnosticos-tecnicos.md`.

## Indicadores mensais e metas

| Método/rota | Requisição/resultado |
|---|---|
| GET /indicators | Registros autorizados; filtros `enrollmentId,status,from,to` |
| POST /indicators | Equipe: `{enrollmentId,period,...data}` inicia registro mensal único |
| GET /indicators/:id | Publicação, versões e, para equipe, rascunho/histórico; `?version=N` seleciona publicação |
| PATCH /indicators/:id | Equipe: `{expectedVersion,reason?,...data}` salva rascunho; razão obrigatória após primeira publicação |
| POST /indicators/:id/publish | Equipe: `{expectedVersion}`; conteúdo idêntico não duplica revisão |
| POST /indicators/:id/status | Equipe: `{expectedVersion,status:"active" ou "archived",reason}` |
| GET /indicators/evolution | `{enrollmentId,from,to}` na query, até 36 meses; pontos, lacunas, cálculos, comparação e metas públicas |
| GET /indicators/evolution/export.csv | Mesma query e permissões da evolução para os três perfis; CSV publicado por contratação, BOM, unidades, lacunas e download privado sem cache |
| GET /indicator-goals | Metas autorizadas; filtros `enrollmentId,period,status,planId` |
| GET /indicator-goals/:id | Meta, avaliação e histórico somente para equipe |
| POST /indicator-goals | Equipe: `{enrollmentId,period,metricKey,target,direction,planId?,notes?}` |
| PATCH /indicator-goals/:id | Equipe: `{expectedVersion,reason,...campos}` |
| POST /indicator-goals/:id/status | Equipe: `{expectedVersion,status:"active" ou "archived",reason}` |
| GET /indicators/csv-template | Equipe: modelo CSV UTF-8 com BOM, ponto e vírgula, versão 1 |
| POST /indicators/csv-preview | Equipe: `{enrollmentId,csvText}`; prévia sem qualquer gravação |
| POST /indicators/csv-import | Equipe: confirma as linhas novas válidas da prévia; cria rascunhos e relatório atomicamente |
| GET /indicators/imports | Equipe: histórico autorizado; filtro obrigatório `enrollmentId` |
| GET /indicators/imports/:id | Equipe: resultado original por linha, autoria e contagens |
| GET /indicators/imports/:id/report.csv | Equipe: download autenticado do relatório UTF-8 com BOM, sem cache |

`period`, `from` e `to`: `AAAA-MM`. `data`: `{periodStatus:"partial" ou "closed",
sourceLabel,notes?,basisConfirmed,adsAttributionConfirmed,costsComplete,values}`.
Os 13 campos de `values` são `revenue,orders,visits,adSpend,attributedRevenue,totalCosts,
claims,cancellations,lateShipments,skuCount,outOfStockSkus,activeListings,completeListings`.
Dinheiro é string decimal com ponto e duas casas; contagens são inteiros. Omitidos
ou null ficam ausentes, sem conversão para zero. `sourceType` é gerado pelo servidor,
`manual` no cadastro direto e `csv` na importação; a requisição de cadastro direto
não pode declarar dados importados/sincronizados.

Derivados: `averageTicket,conversionRate,roas,acos,tacos,estimatedMargin`.
Cada leitura retorna `{value,reason,unit}`, com valor null e motivo quando indisponível.
As metas têm alvo canônico por unidade e direção `at_least`/`at_most`. A avaliação
retorna `{status,actual,target,difference,currentlyMeets,reason}`; mês parcial é
`in_progress`, sem resultado é `not_informed`, fechado é `achieved`/`not_achieved`.

A evolução usa a última publicação não arquivada de cada mês. A comparação exige
meses adjacentes completos e mesma base confirmada. Diferenças de taxas são em pontos
percentuais; base anterior zero impede variação relativa. O plano retorna
`indicatorGoals:[{id,metricKey,period,target,direction,status}]` para abrir a meta no painel.

A prévia CSV retorna `{version,columns,rows,errors,counts,previewToken,expiresAt}`. Cada linha inclui
`line,period,data,errors,classification`, opcionalmente `existingId,existingStatus`.
Classificação: `create,conflict,invalid`. `create` significa candidato ainda não gravado.
Meses repetidos no arquivo têm todas as ocorrências inválidas. O token é assinado,
vinculado a usuário, organização, contratação, conteúdo e estado relevante da prévia,
com validade de 30 minutos. Sem candidatos novos ou com erros globais, é null.

Confirmação: `{enrollmentId,csvText,previewToken,requestKey,confirmed:true,
duplicatePolicy:"skip_existing",fileName?}`. `requestKey` é UUID; `fileName` é opcional,
com até 150 caracteres. Não aceita instruções de sobrescrita, publicação ou IDs de
indicadores fornecidos pelo cliente. Novos registros são rascunhos `sourceType:"csv"`.
Linhas inválidas e meses existentes são ignorados e documentados no resultado.

O retorno de confirmação é o mesmo detalhe de relatório de GET:
`{id,enrollmentId,clientName,createdAt,createdByName,fileName,duplicatePolicy,
counts:{total,imported,skipped,invalid},rows,errors}`. As linhas têm
`{line,period?,status:"imported" ou "skipped" ou "invalid",indicatorId?,existingId?,
existingStatus?,errors:[{field,message}]}`. O histórico lista metadados e contagens.
O relatório preserva nomes/contexto da confirmação; não contém o CSV bruto nem o token.

A mesma chave e o mesmo payload retornam o lote já confirmado sem duplicação, depois
de revalidar o usuário e sua autorização. Outra utilização da chave retorna 409.
Se a prévia expirou ou os meses relevantes mudaram, a primeira confirmação retorna
409 e exige validar novamente, sem gravar lote/indicadores. Uma falha de gravação
desfaz também auditoria e relatório. Todas essas rotas são recusadas para mentorados.
Detalhes de formato e limites em `indicadores-manuais.md` e `importacao-csv.md`.

## Comercial, relacionamento, materiais e relatórios

| Módulo | Rotas e regras |
|---|---|
| CRM e diagnóstico comercial | `/commercial/options`, `/commercial/stages`, `/commercial/opportunities`, mudanças de etapa e `/opportunities/:id/win`; somente administração |
| Financeiro da mentoria | `/commercial/contracts`, `/contracts/:id/payments`, `/payments/:id/reverse`; valores explícitos, chave da tentativa e auditoria |
| Relatórios comerciais | `/commercial/reports?from&to`, `/commercial/reports/export.csv`; somente administração |
| Jornada | `/journey/enrollments`, `/enrollments/:id/checklist`, `/reviews`, `/renewals`, `/timeline`; âmbito da carteira/empresa e notas comerciais só administração |
| Satisfação | `/journey/satisfaction`, `/satisfaction/:id`; autor mentorado responde/corrige; mentor recebe somente compartilhadas |
| Capacidade e ausências | `/journey/mentors`, `/mentors/:id/capacity`, `/mentors/:id/absences`, `/absences/:id`; aprovação administrativa, sem atribuição automática de cobertura |
| Materiais privados | `/materials`, `/materials/search`, detalhe, publicação, arquivamento e arquivos autenticados; versões e escopo antes do conteúdo |
| Relatórios operacionais | `/reports/operations?from&to&programId?&enrollmentId?&mentorId?`, `/reports/operations/export.csv`; equipe, organização/carteira vigente |
| Preparação de integrações | `GET /integrations`, `PATCH /integrations/:provider/preferences`; administração, sem segredos retornados ou canais simulados |

Detalhes dos corpos, formatos e denominadores em `comercial.md`,
`jornada-relacionamento.md`, `materiais-privados.md`, `relatorios-gerenciais.md` e
`integracoes.md`. Datas dos relatórios são `AAAA-MM-DD`; intervalos operacionais
limitados a 366 dias. A fila atual é retornada separadamente dos resultados do
período para preservar pendências antigas. Percentis têm amostra e unidade explícitas.

As rotas antigas de alteração de contratação e capacidade agora exigem a versão
atual, como as telas de jornada. Clientes da API precisam consultar `journeyVersion`
ou `capacityVersion` antes de editar; versão desatualizada retorna 409.

## Saúde e prontidão

`GET /health/live`: processo disponível. `GET /health/ready`: banco, Redis e último
heartbeat do worker (até 120 segundos). Retorna 503 quando incompleto. Não expõe
credenciais. Não confundir liveness do processo com prontidão da operação.

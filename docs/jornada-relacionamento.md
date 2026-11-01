# Jornada e relacionamento

## Ciclos e permissões

A jornada fica em `#/journey`. A situação contratual (`active`, `paused`, `closed`, `cancelled`) é independente da etapa de acompanhamento (`onboarding`, `diagnosis`, `action_plan`, `execution`, `review`, `renewal`, `closure`). Alterar a etapa não conclui tarefas, publica documentos, responde mensagens ou registra contato relevante.

- Administração: todos os ciclos da organização; situação, vigência, renovação, capacidade, aprovação de ausências e intervenções reservadas.
- Mentor: carteira principal e coberturas vigentes; checklist, revisão e feedback atualmente compartilhado. Sua disponibilidade pode ser consultada e uma ausência pode ser solicitada; não pode aprovar a própria solicitação ou aumentar a capacidade.
- Mentorado: empresas autorizadas, checklist compartilhado, revisões e linha do tempo pública; responde e corrige apenas suas avaliações.

As mutações reconsultam a autorização dentro da transação após bloquear a contratação. Trocas de carteira retiram imediatamente o acesso. A ausência não concede cobertura, e o responsável de uma intervenção não recebe novas permissões automaticamente.

## Entrada com estado efetivo

O checklist existe para qualquer contratação, inclusive criada diretamente ou pelo CRM. A leitura não cria registros de confirmação. A tabela auxiliar só é criada na primeira edição, ou na renovação.

| Item | Condição para mostrar confirmação |
|---|---|
| Contatos | Confirmação explícita e contato/e-mail cadastrados |
| Programa e vigência | Programa, datas válidas e entregáveis informados |
| Mentor principal | Atribuição vigente de mentor ativo |
| Política | Confirmação explícita e calendário do programa |
| Primeira reunião | Reunião realizada ou agendada válida, com responsável autorizado |
| Acessos | Confirmação explícita e ao menos uma pessoa mentorada ativa autorizada à empresa |
| Contexto | Informações iniciais registradas |

Confirmações têm data e autoria. O checklist mantém entregáveis e contexto compartilhados. Notas comerciais são reservadas à administração e não são enviadas no DTO do mentor ou mentorado. Senhas e tokens não devem ser registrados nesses campos.

Revisões do ciclo têm resumo compartilhado, autoria, data e próxima revisão opcional. Elas atualizam `reviewed_at`, mas não `last_contact_at`. O acompanhamento relevante continua sendo registrado pelo fluxo específico de acompanhamento.

## Renovação e encerramento

A renovação é administrativa e exige programa, mentor, início, fim, motivo, `expectedVersion` e `requestKey` UUID. A nova vigência deve começar no fim do ciclo anterior ou depois. Uma contratação cancelada exige avaliação administrativa antes de um novo cadastro; não é renovada por esta operação.

A transação cria uma nova contratação, uma atribuição principal na nova vigência e um checklist novo. Não copia avaliações, mensagens, planos, indicadores ou confirmações do ciclo anterior. A empresa cliente e suas pessoas autorizadas permanecem vinculadas à mesma empresa.

`journey_renewals` garante uma única renovação por origem e uma única contratação de destino. A chave de tentativa, o autor e o hash do conteúdo permitem repetir uma confirmação sem duplicar o ciclo. A mesma chave com outro conteúdo retorna conflito. O frontend mantém a tentativa de renovação na sessão do navegador.

O ciclo anterior mantém sua situação até uma alteração administrativa explícita. Encerrar ou cancelar exige motivo e preserva o conteúdo histórico. A nova contratação pode começar no futuro; sua atribuição é exibida como programada e não concede acesso ao mentor antes do início. Carga e sinais operacionais consideram apenas ciclos ativos já iniciados.

## Satisfação

Cada resposta pertence a uma pessoa e a um contexto único:

- Atendimento: criado pela própria pessoa e atualmente resolvido no momento da primeira avaliação.
- Ciclo: a contratação está em revisão/renovação/encerramento, possui revisão registrada ou já foi encerrada/cancelada.

A escala é de 1 a 5, com comentário opcional. Compartilhar com o mentor é uma escolha explícita, desmarcada inicialmente. A administração sempre pode consultar as respostas da organização. O mentor consulta somente a versão atual compartilhada da sua carteira; versões anteriormente privadas não são expostas. O autor e a administração podem consultar as revisões.

Uma correção exige `expectedVersion` e motivo. Não cria outra resposta no denominador: a nota atual substitui a anterior nos agregados, preservando as versões. A data usada no período é a primeira resposta, não a data de correção.

Média = soma das notas atuais / número de respostas (`n`). A tela informa `n` geral e separado para atendimento e ciclo. Sem respostas, a média é `null`/“Não informado”. Não é calculada taxa de resposta sobre uma população presumida, nem ranking de mentores. O período padrão é de 90 dias; filtros aceitam até dois anos. Avaliações não são negociadas nem produzidas pela equipe em nome do mentorado.

## Capacidade, ausência e cobertura

A capacidade é a quantidade administrativa de ciclos simultâneos, de zero a 500. Zero é uma decisão explícita de não ter vagas; ausência de capacidade é “Não informado”. A carga conta contratações distintas, ativas e já iniciadas com atribuição principal ou cobertura vigente. Uma contratação com os dois vínculos é contada uma vez na carga total. As quantidades principais e de cobertura também são exibidas como contexto.

Capacidade usa `users.capacity_version` e motivo auditado. Uma solicitação de ausência tem período e motivo. Estados: solicitada, aprovada, rejeitada e cancelada. O mentor só ajusta/cancela uma solicitação pendente; aprovação e alterações de uma ausência aprovada são administrativas. Aprovações sobrepostas do mesmo mentor são rejeitadas. O período máximo é de 366 dias.

O detalhe de ausência lista os clientes afetados e a cobertura registrada para o período restante. A ação de cobertura usa a atribuição existente: começa agora, concede acesso temporário e exige fim futuro. Cancelar uma ausência não remove silenciosamente uma atribuição de cobertura; a vigência da atribuição continua explícita e preservada no histórico.

## Saúde explicável e central de alertas

A saúde não é uma pontuação. Estados possíveis: atenção, informação incompleta, sem sinal ativo nas regras e fora do acompanhamento ativo. A ausência de diagnóstico, plano ou satisfação disponível é tratada como informação incompleta. Não é rotulada como saúde favorável.

Motivos operacionais combinam as regras existentes de prazos, planos, tarefas e reuniões com:

- Ciclo a até 30 dias do fim, sem revisão nos 30 dias que antecedem seu vencimento.
- Ausência aprovada vigente sem cobertura disponível até o fim do período restante.
- Carteira do mentor acima da capacidade administrativa.
- Atendimento aguardando mentorado por mais que `programs.followup_days`. O relógio usa o início mais antigo da pausa de resolução; `updated_at` é apenas a alternativa quando não há evento de pausa. Notas internas não reiniciam a espera.
- Avaliação de 1 ou 2 enviada nos últimos 90 dias.

Os sinais usam a mesma reconciliação de `action_signal_states`, sem reconciliador paralelo. Repetir a reconciliação não duplica alertas. Tratar a causa encerra o episódio; reaparecer inicia outro episódio. Cada alerta contém contexto e uma ação concreta.

Feedback não compartilhado gera sinal somente para administradores, sem comentário ou identificação do respondente na notificação. A listagem de notificações reconsulta o compartilhamento vigente, inclusive quando a pessoa retira a autorização depois de um alerta. Alertas de capacidade/ausência restringem o destinatário mentor à própria disponibilidade.

Intervenções administrativas utilizam a tabela existente, agora com versão, estado, tratamento e conclusão. Corpo e tratamento não aparecem na jornada do mentor/mentorado ou na linha do tempo pública.

## Linha do tempo pública

Agrega mensagens públicas, atas publicadas, versões publicadas de indicadores, revisões de ciclo e últimas atualizações de planos/tarefas em planos ativos ou concluídos. As consultas continuam vinculadas à contratação autorizada. Notas internas, rascunhos de atas/indicadores, observações comerciais e intervenções não entram nessa lista. O endpoint retorna no máximo 100 eventos, com limites por origem; o detalhe de cada contexto preserva seu histórico completo.

## Contratos de API

Todos os caminhos abaixo usam o prefixo `/api/journey` e as mutações usam autenticação e CSRF existentes.

| Método e rota | Operação |
|---|---|
| GET `/enrollments`, `/enrollments/:id` | Lista/detalhe, checklist efetivo e saúde autorizada |
| PATCH `/enrollments/:id` | Administração: `expectedVersion`, situação/etapa/fim e motivo |
| PATCH `/enrollments/:id/checklist` | `expectedVersion`, confirmações e contexto; notas comerciais só admin |
| POST `/enrollments/:id/reviews` | `expectedVersion`, resumo, próxima revisão opcional |
| POST `/enrollments/:id/renewals` | Renovação idempotente administrativa |
| GET `/enrollments/:id/timeline` | Eventos compartilhados da contratação |
| GET `/enrollments/:id/satisfaction-contexts` | Contextos próprios elegíveis do mentorado |
| GET/POST `/satisfaction` | Consulta por período/contratação; resposta própria |
| GET/PATCH `/satisfaction/:id` | Versão autorizada; correção própria versionada |
| GET `/mentors` | Capacidade/disponibilidade autorizada |
| PATCH `/mentors/:id/capacity` | Administração: versão, capacidade e motivo |
| POST `/mentors/:id/absences` | Solicitação de ausência própria/admin |
| GET/PATCH `/absences/:id` | Impacto e mudança versionada da ausência |
| POST `/enrollments/:id/interventions` | Intervenção administrativa |
| PATCH `/interventions/:id` | Versão, tratamento, estado e próxima revisão opcional |

Mudança do contrato legado: `PATCH /api/enrollments/:id` agora exige `expectedVersion` e usa o mesmo serviço da jornada. `PATCH /api/users/:id` exige `expectedCapacityVersion` ao alterar capacidade. O frontend e os testes legados enviam as versões consultadas; chamadas antigas sem versão são rejeitadas.

## Banco e verificação

Migration `011_journey.js`: campos de versão/revisão/encerramento em contratações; versão de capacidade em usuários; `journey_checklists`, `journey_reviews`, `journey_renewals`, `satisfaction_responses`, `satisfaction_revisions`, `mentor_absences`; estado e versão em intervenções. Relacionamentos compostos protegem a organização. Não há exclusão destrutiva ou rollback automático de histórico.

Verificações:

```powershell
node node_modules/tsx/dist/cli.mjs --test apps/api/test/journey.test.ts apps/api/test/journey-signals.test.ts
node --test tests/journey-acceptance.mjs
```

A suíte usa exclusivamente `elo_journeycheck`, API `3343`, Redis `10`, com usuários/empresas isolados por execução. Ela pressupõe o build central da API e as migrations atuais. Cobre isolamento entre perfis e organizações, versões, notas privadas, resposta/correção própria, renovação concorrente idempotente, ausência/cobertura, capacidade, checklist real, linha do tempo pública, revogação de carteira e episódios de sinais do worker. Não remove volumes ou bancos existentes.

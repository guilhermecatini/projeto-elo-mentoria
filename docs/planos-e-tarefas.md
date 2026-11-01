# Planos de ação e tarefas

## Produto e responsabilidades

Um plano pertence a uma contratação. Registra objetivo, situação inicial, meta,
prioridade, estado e limite de dias sem progresso. A vigência da contratação continua
independente do estado do plano. Podem existir vários planos por ciclo e o histórico
não é apagado ao arquivar ou concluir.

Administrador gerencia todos os planos da organização. Mentor gerencia planos e
tarefas das atribuições vigentes, incluindo cobertura. Mentorado consulta os planos
das empresas explicitamente autorizadas e executa somente tarefas atribuídas a ele.
O backend repete essas verificações nas listagens, detalhes, responsáveis e escritas.

Cada tarefa tem responsável individual, papel (mentor ou mentorado), prazo de entrega,
prioridade, critério de conclusão, evidência e estado. Administradores gerenciam, mas
não são oferecidos como executores. A lista de responsáveis considera usuários ativos
com atribuição vigente ou autorização à empresa. A autoria anterior fica preservada.

## Fluxos

1. Administrador/mentor cria plano e tarefas, selecionando responsável e prazo.
2. Executor inicia, registra um bloqueio justificado ou envia sua entrega.
3. Mentorado entrega com evidência; isso não aprova automaticamente a tarefa.
4. Mentor/admin aceita a entrega com revisão ou devolve para execução com orientação.
5. Tarefa do mentor pode ser concluída pela equipe com evidência e critério registrado.
6. Reabrir uma tarefa encerrada ou cancelar exige motivo e ação da equipe.
7. Concluir plano exige tarefas e nenhuma pendência; arquivar exige motivo.

Evidência inclui texto, link HTTPS opcional e arquivos privados vinculados à tarefa.
O servidor armazena links sem buscar conteúdo externo; o acesso ao destino depende
das permissões dele. Os anexos respeitam as regras de `anexos-privados.md` e ficam
congelados após entrega para revisão ou encerramento.

## Estados e cálculos

Plano: `draft` (rascunho), `active` (ativo), `completed` (concluído), `archived`
(arquivado). Tarefa: `todo`, `in_progress`, `blocked`, `submitted`, `done`, `cancelled`.
Os rótulos visíveis são em português. Mudanças são auditadas por autor e instante.

**Progresso:** tarefas concluídas / tarefas não canceladas × 100. Plano sem tarefas
válidas tem progresso `null`, exibido como “não informado”. Tarefas entregues aguardam
revisão e ainda não integram o numerador. Quantidade total e canceladas são informações
distintas; cancelamento não equivale a execução.

O relógio de estagnação usa `last_progress_at`, atualizado por entrega com evidência
ou conclusão. Edição de título, prazo, prioridade e cancelamento não reiniciam esse
relógio. O intervalo é configurável por plano e contado em dias corridos de 24 horas.

## Sinais e notificações

Todos consideram somente contratações ativas, dentro da carteira autorizada:

| Sinal | Critério | Próxima ação |
|---|---|---|
| Cliente sem plano ativo | Nenhum plano com estado ativo na contratação | Abrir/criar plano |
| Plano parado | Agora ≥ último progresso + limite de dias | Revisar tarefas e bloqueios |
| Tarefa vencida | Prazo anterior a agora; estado a fazer, em execução ou bloqueado | Abrir tarefa |
| Tarefa bloqueada | Estado bloqueado, com motivo obrigatório | Tratar bloqueio |
| Entrega aguardando revisão | Estado entregue | Aceitar ou orientar ajustes |
| Reatribuir responsável | Executor desativado ou sem acesso vigente | Escolher novo responsável |

Entrega cumpre o prazo de entrega. Enquanto aguarda revisão ela aparece em indicador
próprio, em vez de continuar classificada como entrega atrasada. A aprovação não
apaga os instantes e a auditoria das etapas anteriores. Não há prazo automático de
revisão definido neste bloco.

O painel consulta as condições atuais; a reconciliação usa as mesmas regras.
Administrador e mentores vigentes recebem sinais operacionais. O mentorado recebe
avisos de atraso/bloqueio das próprias tarefas e o resultado da revisão.

`action_signal_states` persiste episódios: repetir processamento/reiniciar mantém a
chave da notificação. Depois de a reconciliação observar a condição resolvida, nova
ocorrência abre outro episódio. Ler ou dar ciência não resolve tarefa nem plano.
O histórico de notificações permanece, e o painel reflete as pendências atuais.
Essa avaliação ocorre a cada 30 segundos. Uma condição que desaparece e reaparece
inteiramente entre duas avaliações pode permanecer no mesmo episódio; o histórico
das transições da tarefa continua na auditoria.

## Limites

Sem recorrência automática de tarefas, dependências entre tarefas, estimativas de
esforço, chat em tarefa ou arrastar cartões. Diagnósticos técnicos podem originar ou
fundamentar planos, preservando o vínculo à versão publicada da avaliação; reuniões
podem originar tarefas a partir de decisões. Os prazos são instantes UTC, exibidos
inicialmente em São Paulo.

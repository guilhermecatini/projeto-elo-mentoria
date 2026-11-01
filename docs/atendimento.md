# Estados e prazos de atendimento

Os rótulos exibidos são em português; os valores da API são:

| Valor | Rótulo | Requisito |
|---|---|---|
| new | Novo | Reservado para entrada |
| waiting_mentor | Aguardando mentor | Entrada de pergunta pública do mentorado |
| in_progress | Em tratamento | Resposta pública humana ou mudança pelo atendente |
| waiting_mentee | Aguardando mentorado | Pergunta pública do atendente e dúvidas anteriores tratadas |
| resolved | Resolvido | Resumo de solução e todas as dúvidas respondidas explicitamente |
| reopened | Reaberto | Assunto anteriormente resolvido; cria novo prazo |

Primeira resposta humana pode ser confirmação de recebimento. Para tratar a dúvida,
a resposta deve selecionar a mensagem em `replyToId`. Uma confirmação genérica não
marca todas as perguntas como respondidas. Notas internas não satisfazem prazos nem
podem ser referenciadas por mensagens públicas. Tipos automático e evento são
reservados ao servidor.

Nova pergunta gera obrigação própria sem mudar a mais antiga. Ler não altera
obrigações. Resolver sem resumo ou com dúvidas abertas é recusado. Reabrir preserva
histórico e cria novos prazos de resposta e resolução. Troca de responsável preserva
obrigações; reclassificação não elimina violações já detectadas.

Promessas possuem data absoluta escolhida pelo atendente. Uma nova resposta só cumpre
promessas quando isso é explicitamente assinalado. Resolução encerra obrigações,
mantendo violações anteriores. O painel mostra promessas vencidas mesmo depois de uma
confirmação de recebimento.

## Calendário

Programa define fuso, dias da semana (1=segunda), início/fim do expediente e feriados.
O cálculo avança exclusivamente em minutos úteis, incluindo mudança de dia e fuso.
Padrões iniciais são hipóteses internas: 240 minutos primeira resposta padrão,
60 urgente, 240 próxima resposta, 1.080 resolução (dois expedientes de nove horas),
acompanhamento a cada sete dias corridos. Nada disso é regra do Mercado Livre.

Esperar o mentorado pausa a obrigação de resolução, com justificativa pública, autor
e instante. A próxima resposta do mentorado retoma os minutos úteis restantes e
reativa o mentor. Promessa de retorno permanece exigível. A situação contratual
pausada exige motivo, mas não congela silenciosamente atendimentos já abertos.

Alterar a política vale para novas obrigações; não reescreve prazos antigos. Não há
editor de turnos múltiplos, intervalos, exceções por data ou ausências nesta etapa.

## Reconciliação

Worker separado usa BullMQ a cada 30 segundos e executa uma reconciliação ao iniciar.
O banco mantém eventos e violações. Bloqueio transacional serializa reconciliações;
unicidade de notificações impede repetir o mesmo alerta após retry/reinício.

Ao atingir 75% do prazo útil, avisa mentores vigentes. Ao vencer, avisa também
administradores. A persistência após o limite de escalonamento gera novo nível de
alerta. Se o worker esteve indisponível, retoma pelo estado atual; não precisa reproduzir
cada alerta intermediário. O acompanhamento é independente de chamados abertos.
Notificações são internas; e-mail/WhatsApp ainda não estão conectados.

Ciência do alerta é individual e não resolve o atendimento. Intervenções da
administração são privadas e não aparecem no histórico público do mentorado ou mentor.

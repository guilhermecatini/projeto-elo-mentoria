# Comercial e financeiro da mentoria

Este módulo pertence à empresa que presta a mentoria. Seus valores não são faturamento das lojas atendidas. Administradores acessam o funil, o diagnóstico comercial, os relatórios e o financeiro; mentores e mentorados recebem 403 em todas as rotas, inclusive exportações. Consultas e vínculos são isolados por organização.

## Funil e diagnóstico comercial

`#/commercial` oferece quadro de etapas e lista pesquisável. Cada cartão possui botão para abrir e mover; não depende de arrastar. As etapas iniciais são Lead recebido, Em qualificação, Diagnóstico agendado, Diagnóstico realizado, Proposta enviada, Negociação, Ganho e Perdido. A administração pode criar etapas abertas, renomear, ordenar e desativar etapas desocupadas. Ganho e perda permanecem ativos e os nomes históricos ficam preservados.

A oportunidade começa com nome, empresa, contato e responsável administrativo ativo. É necessário e-mail ou telefone. Origem, interesse em programa, proposta e próxima ação podem ser informados progressivamente. A ação e seu prazo devem ser preenchidos juntos. O diagnóstico comercial registra situação do vendedor, maturidade, faixa de faturamento **informada**, dificuldades e objetivo. Ele não substitui o diagnóstico técnico da contratação e não transforma informações ausentes em avaliação.

Edições e movimentos exigem `expectedVersion`. A atualização concorrente que encontra versão antiga recebe 409. Perda exige motivo; reabertura também. As mudanças de fase registram autor, horário, etapa anterior, nome utilizado e permanência anterior. Não há exclusão de oportunidades.

## Ganho e entrada

`POST /api/commercial/opportunities/:id/win` recebe `expectedVersion`, `programId`, `startsAt`, `endsAt`, `mentorId` opcional e **um** de `clientId` ou `newClient:{name,contactName,email}`. O ganho cria uma nova contratação ativa em `onboarding`, vinculada ao cliente da mesma organização, e atribui mentor quando informado. Cliente com o mesmo nome e e-mail não é duplicado silenciosamente: a operação orienta vincular o existente. Cada oportunidade só cria uma contratação.

A transação preserva a conversão inteira. A repetição com as mesmas condições devolve os mesmos vínculos, inclusive quando usa a versão original. Parâmetros materiais diferentes recebem 409. `expectedVersion` não participa do hash de conversão. Ganhos ficam preservados; encerramento ou renovação pertencem à jornada da contratação.

A resposta fornece `clientId`, `enrollmentId`, `mentorAssigned`, passos de entrada sugeridos e `journeyUrl`. A jornada confere contatos, participantes explicitamente autorizados, programa e vigência, entregáveis, política e primeira reunião. Sem mentor, o ciclo permanece uma exceção administrativa. A conversão não cria usuário, senha, autorização de acesso, contrato financeiro ou recebimento. Clientes continuam podendo ser cadastrados diretamente.

## Financeiro explícito

`#/commercial/finance` permite registrar um valor contratado por matrícula, sua data de assinatura e observações. Aceita matrículas existentes, inclusive aquelas originadas fora do CRM. Valores são strings decimais em BRL, com até duas casas e limite de R$ 1 trilhão. O valor contratado pode ser zero quando isso foi explicitamente registrado. Correções exigem versão e motivo, mantendo auditoria.

Recebimentos são registros de valores **já recebidos**, com data efetiva, vencimento acordado opcional, forma, referência e observações. Não há cobrança, emissão fiscal, processamento de cartão, recorrência presumida ou agenda de parcelas automática. Recebimentos devem ser positivos e não podem ter data futura. Cada envio usa `requestKey` UUID: repetição exata retorna o registro, enquanto reutilização para outro conteúdo recebe 409.

Um recebimento não é sobrescrito: a administração registra estorno com motivo e, se necessário, lança outro recebimento. Estornos preservam valor, data, autoria e histórico. Total recebido considera apenas registros válidos; se nenhum recebimento foi informado, fica **não informado**. Quando existem registros, mas todos foram estornados, o total é zero confirmado. A diferença contratado menos recebido é apresentada sem truncar valores negativos: pagamentos excedentes aparecem como crédito. Correções financeiras não alteram condições registradas no CRM nem indicadores das lojas.

## Relatórios e critérios

`#/commercial/reports` utiliza datas locais de São Paulo, com intervalo inclusivo de até 366 dias e horário de atualização explícito.

- **Coorte:** oportunidades criadas no intervalo, segundo a situação atual da consulta. Conversão = ganhas atualmente / total criado. Sem denominador, o resultado é não informado.
- **Etapas:** oportunidades distintas da coorte que passaram por cada fase. Conversão da fase = ganhas atualmente entre as que passaram pela fase / oportunidades que passaram. Não é uma conversão artificial para a próxima posição configurável do quadro.
- **Tempo em etapa:** mediana das visitas encerradas, em horas corridas, com número de visitas. Permanências em aberto aparecem separadamente com quantidade e mediana. Renomear ou ordenar fases não reescreve a trajetória.
- **Tempo de fechamento:** mediana entre criação e último fechamento das oportunidades atualmente ganhas ou perdidas da coorte, com amostra. Reabertas ainda em andamento ficam fora dessa mediana.
- **Sem próxima ação e ações vencidas:** oportunidades abertas da coorte; cada item abre seu cadastro para providência.
- **Vendas por origem/programa:** ganhos confirmados dentro do intervalo, independentemente da data de criação. Soma de propostas é identificada como valor proposto, com amostra de valores informados; não representa receita contratada.
- **Perdas:** motivos atuais das oportunidades perdidas da coorte.
- **Contratado:** soma dos registros financeiros com assinatura no intervalo, com quantidade de contratos.
- **Recebido:** soma dos recebimentos efetivos datados no intervalo e ainda válidos, com quantidade de recebimentos e estornos. Sem registros, mantém ausência; registros todos estornados produzem zero confirmado. Esses totais são fluxos em datas diferentes e não representam automaticamente saldo da mesma coorte.

Não há classificação de venda como receita recorrente. Os relatórios usam uma visão transacional consistente e não calculam receitas a partir da proposta. O CSV exige a mesma autenticação e perfil, utiliza UTF-8 e protege células que poderiam ser interpretadas como fórmula.

## Rotas e armazenamento

Todas as rotas estão sob `/api/commercial`: `options`; `stages` (GET/POST/PATCH e `stages/defaults`); `opportunities` (GET/POST/GET detalhe/PATCH, `:id/stage`, `:id/win`); `contracts` (GET/POST/GET detalhe/PATCH, `:id/payments`); `payments/:id/reverse`; `reports` e `reports/export.csv?from=AAAA-MM-DD&to=AAAA-MM-DD`.

Migration 010 cria `commercial_stages`, `commercial_opportunities`, `commercial_stage_events`, `mentorship_contracts` e `mentorship_payments`. Chaves compostas impedem ligações financeiras e comerciais entre organizações ou ciclos incompatíveis. Eventos de etapas são somente inseridos pelo papel de runtime. Registros financeiros não têm exclusão automática. Auditoria comercial usa entidades próprias, para não aparecer nas linhas do tempo visíveis aos mentores. O evento público de criação da contratação contém somente a entrada na jornada.

Validação: `apps/api/test/commercial.test.ts` cobre dinheiro, ausência, datas locais, intervalos, medianas, hashes e CSV; `tests/commercial-acceptance.mjs` usa PostgreSQL e API isolados em `elo_commercialcheck`, porta 3342 e Redis 9, incluindo os três perfis, concorrência, conversão, pagamentos, estornos, relatórios e FKs. Resultados executados são consolidados pelo responsável da entrega.

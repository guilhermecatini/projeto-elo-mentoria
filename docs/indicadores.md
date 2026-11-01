# Indicadores e critérios

## Painel operacional da etapa 1

Todos os números são calculados no banco para a organização e o escopo autorizado do
usuário no instante da consulta. Não são estimativas nem avaliação por IA.

- **Clientes ativos**: matrículas com situação ativa na carteira visível; conferir
  distinção entre empresas únicas e matrículas antes de comparação comercial.
- **Aguardando resposta**: atendimentos com dúvida pública do mentorado não vinculada
  explicitamente a uma resposta humana. Uma nota interna não encerra a pendência.
- **Prazo vencido**: atendimento com prazo de resposta, retorno prometido ou resolução
  vencido e ainda aplicável. O mesmo atendimento não deve virar múltiplos atendimentos
  no total, embora possa ter vários motivos.
- **Sem acompanhamento**: matrícula ativa cujo último contato humano relevante é
  anterior ao limite do programa (inicialmente 7 dias corridos), ou entrada sem contato
  após esse limite. A existência de chamado aberto não é requisito.
- **Sem mentor**: matrícula ativa sem atribuição principal vigente. Cobertura não
  elimina a necessidade de um principal.

Não há ranking por volume de mensagens. A fila mostra motivos e permite abrir o
atendimento ou perfil correspondente. Não confundir alertas de prazo com faturamento.

## Fórmulas e condições

Ticket médio, conversão, ROAS, ACOS, TACOS e margem estimada estão implementados
nos registros mensais manuais, com pré-condições e razões de indisponibilidade.
Regras completas em `indicadores-manuais.md`. Critérios dos relatórios operacionais
e comerciais estão em `relatorios-gerenciais.md` e `comercial.md`.

| Indicador | Fórmula e condições |
|---|---|
| Ticket médio | Receita de vendas / pedidos, mesmo período e origem; sem pedidos = não informado |
| Conversão | Pedidos / visitas × 100, se visitas e pedidos compatíveis |
| ROAS | Vendas atribuídas / investimento publicitário, mesma janela de atribuição |
| ACOS | Investimento / vendas atribuídas × 100 |
| TACOS | Investimento / receita total × 100 |
| Margem estimada | (Receita − custos completos) / receita × 100; omitir se custos insuficientes |
| Cumprimento de prazo | Obrigações respondidas no prazo / obrigações com prazo vencido ou resposta no período; mostrar abertas vencidas separadamente |
| Mediana/p90 | Percentis 0,50/0,90 dos minutos úteis de respostas humanas vinculadas no período; publicar amostra e pendências ainda abertas |
| Reabertura | Atendimentos reabertos / atendimentos resolvidos da coorte de resolução definida |
| Renovação | Ciclos elegíveis renovados / ciclos elegíveis encerrados no período |
| Conversão comercial | Oportunidades que avançaram / oportunidades que entraram na etapa, por coorte definida |

Valores ausentes são `null`/“não informado”, não zero. Razões agregadas são recalculadas
pelos totais, nunca pela média simples dos percentuais das lojas. Comparações usam
períodos equivalentes, fuso consistente e mesma origem. Receita contratada e recebida
exigem registros distintos; venda de mentoria não é automaticamente receita recorrente.

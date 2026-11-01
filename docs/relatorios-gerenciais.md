# Relatórios gerenciais

A tela `#/reports` e a API `/api/reports/operations` apresentam a operação da mentoria. Administradores consultam a organização; mentores consultam sua carteira autorizada no momento da requisição. Mentorados não acessam esse relatório. Dados financeiros da mentoria e comentários de satisfação não entram no retorno.

## Filtros e listas de ação

Empresa/contratação, programa e, pela API, mentor são aplicados ao mesmo conjunto autorizado. O filtro de mentor de um mentor só aceita seu próprio identificador. As opções de programa permanecem disponíveis ao selecionar uma empresa; as opções de empresa acompanham o programa selecionado.

Cada card abre sua lista no próprio relatório, preservando os filtros:

- Contratações ativas: situação ativa e início de vigência até a consulta, mesmo sem chamados. A linha informa empresa, programa, responsável atual e link para a jornada.
- Atendimentos abertos: assuntos ainda não resolvidos, independentemente da data de abertura.
- Atendimentos vencidos: assuntos abertos com pelo menos uma obrigação não cumprida, não pausada e vencida. Assuntos resolvidos não voltam à fila por obrigações residuais de dados antigos.
- Sem acompanhamento recente: contratações ativas que ultrapassaram o prazo de acompanhamento do programa, contado em dias corridos desde o último contato ou, se não houver, desde o início do ciclo. A lista inclui clientes sem chamados e apresenta motivo, prazo e responsável.

Contratação cujo fim da vigência passou continua no retrato ativo enquanto sua situação não for alterada. Cobertura vigente tem preferência na identificação do responsável da fila. Tarefas submetidas para revisão não contam como atraso de execução; tarefas abertas, em andamento ou bloqueadas com prazo vencido contam.

## Períodos e amostras

As datas usam `America/Sao_Paulo`, com início inclusivo e fim exclusivo no dia seguinte ao campo Até. O intervalo anterior tem a mesma quantidade de dias e termina imediatamente antes do atual. São aceitos de 1 a 366 dias, sem data final futura. A fila atual e a carga não são limitadas à data de abertura dos assuntos no período.

Primeira e próximas respostas usam minutos úteis do calendário atualmente configurado no programa. Só entram eventos de SLA cumpridos no mesmo instante de uma mensagem pública de um administrador ou mentor; notas internas e mensagens automáticas ficam fora. Mediana e p90 usam interpolação linear e sempre exibem `n`. Amostra vazia resulta em “Não informado”, preservando zero quando há uma observação real de zero minutos.

Cumprimento de prazo usa obrigações cujo vencimento já ocorreu dentro do período ou cujo cumprimento ocorreu no período. Obrigações pausadas, sem cumprimento ou violação, são excluídas. O numerador exige cumprimento até o prazo e ausência de violação; a interface mostra numerador e denominador para cada modalidade.

Resolução usa minutos corridos desde a abertura original até cada resolução auditada dentro do período. Registros antigos sem auditoria usam a data de resolução preservada. Um assunto pode produzir mais de um episódio. Reabertura usa assuntos distintos resolvidos na coorte que tiveram reabertura posterior até a consulta, divididos pelos assuntos distintos resolvidos na coorte. Não representa a probabilidade de reabertura futura.

Reuniões são agrupadas pela data prevista de início e discriminadas por resultado. Conclusões de tarefas usam auditoria e contam uma tarefa uma vez por período, mesmo se reaberta; dados antigos sem evento usam a data de conclusão preservada. Acompanhamentos contam registros humanos explícitos de acompanhamento. Mensagens públicas humanas são outra contagem, não uma medida de qualidade.

## Satisfação, renovação e carga

Satisfação usa a versão atual de avaliações criadas no intervalo, com média na escala de 1 a 5 e tamanho da amostra. Para mentores, somente avaliações explicitamente compartilhadas entram no SQL e no denominador. Não é exibido o tamanho da amostra privada, nem comentários individuais. A comparação exige considerar mudanças de amostra e visibilidade.

Renovação usa ciclos com situação encerrada e fim da vigência no período: quantos possuem vínculo de renovação dividido por quantos ciclos encerrados são elegíveis. Ciclos cancelados ou ainda ativos ficam fora. Denominador zero mantém a taxa indisponível.

A tabela de mentores usa atribuições vigentes, inclusive coberturas, e informa contratações/capacidade, coberturas, urgências abertas, vencidos, falta de contato e existência de ausência aprovada em andamento. Uma mesma contratação pode aparecer em mais de uma linha, portanto os totais por mentor não devem ser somados. Ausência aprovada é informação de disponibilidade; não redistribui a carteira automaticamente.

Não há soma de faturamento entre lojas, média de taxas financeiras de lojas ou ranking de mentores por volume de mensagens.

## Exportação e verificação

`GET /api/reports/operations/export.csv` aplica os mesmos filtros e permissões. Exporta resumo do período selecionado, fila atual, contratações ativas, carga e critérios. O arquivo usa UTF-8 com BOM, ponto e vírgula, escape de aspas e neutralização de fórmulas. A resposta é privada e não armazenável em cache.

`tests/reports-acceptance.mjs` usa banco `elo_reportscheck`, API 3345 e Redis 12. Verifica amostras, coortes, listas correspondentes aos cards, filtros, acesso atual, privacidade, exportação, renovação, ausência, tarefas reabertas e obrigações residuais. O processo encerra a API e preserva seus dados isolados. `apps/api/test/report-math.test.ts` cobre datas, percentis e CSV.

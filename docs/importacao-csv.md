# Importação CSV de indicadores em lote

O lote atende uma empresa/contratação por vez. Administradores importam na organização;
mentores, na carteira vigente. Mentorados consultam somente os resultados publicados
e não recebem arquivos, prévias, relatórios de importação ou rascunhos.

## Conferir e confirmar

1. Selecione a contratação e abra **Importar CSV**.
2. Baixe o modelo, preencha-o e selecione o arquivo ou cole seu conteúdo.
3. Valide a prévia. Ela mostra os meses novos válidos, os existentes e os erros por linha.
4. Confira o resumo e confirme a criação dos rascunhos privados das linhas válidas.
5. Consulte o relatório do lote. Abra os registros importados para revisar e publicar.

A validação não grava indicadores ou lotes. A confirmação aceita somente a prévia
emitida para aquele usuário, contratação e conteúdo, válida por 30 minutos. Alterar
o conteúdo exige validar de novo. Uma mudança relevante nos meses cadastrados entre
prévia e confirmação exige nova conferência, sem gravação parcial do lote antigo.
Erros da prévia também podem ser baixados em CSV, inclusive quando nenhuma linha
pode ser importada. Esse arquivo é gerado na própria tela a partir da validação e
não cria um lote nem guarda o arquivo original no servidor.

A confirmação cria registros com origem de gravação `csv` e mantém a origem dos
dados declarada no arquivo. São rascunhos privados: não aparecem na evolução, nas
metas ou para o mentorado até a publicação normal de cada registro. A importação não
simula contato com o cliente nem altera progresso de planos/tarefas.

## Duplicidades e erros

| Situação | Tratamento |
|---|---|
| Mês novo com valores válidos | Cria um rascunho após confirmação |
| Mês já cadastrado, inclusive arquivado | Ignora a linha e preserva integralmente o registro existente |
| Mês aparece mais de uma vez no arquivo | Todas as ocorrências são inválidas; corrija a duplicidade antes de importar esse mês |
| Campo/valor/período inválido | Não importa essa linha; informa o motivo no relatório |
| Erro de estrutura, cabeçalho ou limite do arquivo | Bloqueia a confirmação do arquivo inteiro |
| Nenhuma linha nova válida | Não cria lote nem registros |

É possível confirmar as linhas novas válidas mesmo quando outras linhas têm erros.
O resumo apresenta essa escolha antes da gravação. Não há substituição silenciosa de
dados existentes. Correções exigem abrir o registro, justificar a alteração e publicar
uma nova versão pelo fluxo normal.

Não é escolhida uma ocorrência arbitrária entre meses repetidos. Após corrigir o
arquivo, valide-o novamente. Reenviar um arquivo já importado apresenta os meses
anteriores como existentes, preservando os rascunhos e as publicações.

## Gravação e repetição de uma tentativa

Os rascunhos válidos, sua auditoria e o relatório são gravados na mesma transação.
Uma falha de gravação desfaz todo o conjunto, permitindo nova tentativa. A matrícula
é bloqueada durante a operação e o servidor reavalia permissões e situação ativa.

Cada tentativa lógica tem uma chave única. Repetir a mesma confirmação com essa
chave devolve o mesmo relatório, inclusive se a primeira resposta se perdeu, sem
duplicar registros ou auditoria. Reutilizar a chave para outro conteúdo, contratação
ou usuário produz conflito. A leitura do resultado continua sujeita à autorização
vigente; a chave não concede acesso ao lote.

## Relatório e histórico

O histórico é da contratação, acessível à equipe autorizada, com autoria, data,
nome informado do arquivo e contagens. O detalhe preserva o resultado original de
cada linha: importada, ignorada ou inválida, os motivos e os identificadores dos
registros envolvidos. Alterar um indicador depois não reescreve esse relatório.

O download autenticado gera CSV UTF-8 com BOM e ponto e vírgula, com neutralização
de fórmulas nos campos exportados. Não há endereço público para baixar relatórios.
Troca de mentor, fim de cobertura e mudança de autorização revogam o acesso também
ao histórico e ao download. Contratações pausadas/encerradas permitem consulta da
equipe autorizada, mas impedem novas importações.

## Formato e limites

Permanecem os limites de 64 KiB e 200 registros por arquivo. Cabeçalhos em português,
separação por ponto e vírgula e texto UTF-8. Aspas permitem separadores e quebras de
linha dentro de um campo. Dinheiro admite ponto ou vírgula decimal sem separador de
milhar; contagens são inteiras. Campo vazio permanece ausente e não vira zero.

Cada linha precisa informar pelo menos um resultado. Valem as mesmas validações dos
indicadores manuais: meses futuros recusados, mês atual parcial, relações consistentes
de estoque/catálogo e confirmações de custos/base/atribuição. As regras e fórmulas
completas estão em `indicadores-manuais.md`.

Este fluxo não importa metas, tarefas ou dados de marketplaces automaticamente. Não
há publicação automática, sincronização externa ou importação em segundo plano.

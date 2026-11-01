# Indicadores manuais, metas e evolução mensal

Os resultados pertencem à empresa cliente e a uma contratação. Não representam
receita da empresa de mentoria nem demonstram, por si só, efeito causado pela mentoria.
Este bloco registra dados manuais em reais, sem sincronização externa.

## Registro e publicação

Existe um registro consolidado por contratação e mês (`AAAA-MM`). A origem identifica
a conta, o relatório e a base utilizada. Contas múltiplas precisam ser consolidadas
antes do preenchimento ou ter o recorte descrito na origem. Não há séries paralelas
por conta de marketplace dentro do mesmo mês nesta entrega.

Administrador e mentor com carteira vigente preparam o registro. O mentorado consulta
somente versões publicadas da empresa autorizada. Rascunhos, motivo de correção e
histórico da equipe ficam privados. Editar o rascunho não muda os números, a origem
ou os cálculos da publicação atual.

O mês atual só pode ser parcial. Um mês anterior pode ser fechado quando seus dados
estiverem consolidados; a passagem do calendário não o fecha automaticamente. Não
se registram resultados futuros. Dados históricos anteriores à contratação são
permitidos para estabelecer uma referência inicial, mantendo o vínculo ao ciclo.

Publicar exige ao menos um valor informado, inclusive zero real. Correções de dados
já publicados exigem justificativa e geram nova versão quando publicadas. Salvar,
publicar, arquivar e reativar verificam a versão de edição para evitar sobrescritas.
O rascunho local é separado por usuário e registro. Arquivar preserva as publicações,
mas retira o mês da evolução e da avaliação corrente das metas.

## Valores e cálculos

Campos vazios são `null` e aparecem como “não informado”. Zero só é registrado quando
foi efetivamente observado. Valores monetários aceitam duas casas decimais e até
R$ 1 trilhão; contagens são inteiras, não negativas, até um bilhão.

São informados faturamento de vendas, pedidos, visitas, investimento publicitário,
vendas atribuídas, custos totais, reclamações, cancelamentos, envios atrasados,
SKUs e SKUs sem estoque, anúncios ativos e completos. Estoque e catálogo representam
a posição no fim do período; os demais campos seguem o universo declarado na origem.

| Cálculo | Fórmula | Condições adicionais |
|---|---|---|
| Ticket médio | Faturamento / pedidos | Mesma base confirmada |
| Conversão | Pedidos / visitas × 100 | Mesma base confirmada |
| ROAS | Vendas atribuídas / investimento publicitário | Base e janela de atribuição confirmadas |
| ACOS | Investimento publicitário / vendas atribuídas × 100 | Base e janela de atribuição confirmadas |
| TACOS | Investimento publicitário / faturamento × 100 | Mesma base confirmada |
| Margem estimada | (Faturamento − custos totais) / faturamento × 100 | Base confirmada e custos completos |

Os custos totais já devem incluir publicidade e os demais custos necessários. Não
se subtrai o investimento publicitário novamente. Margem negativa permanece negativa.
Sem denominador, com denominador zero ou sem as confirmações necessárias, o cálculo
fica indisponível com o motivo. Nenhuma média entre percentuais de lojas é calculada.

## Comparação e metas

A evolução mostra até 36 meses, preservando lacunas sem inventar valores. A comparação
usa o mês imediatamente anterior, ambos publicados e fechados, mesma origem e base
confirmada. Não busca outro mês mais antigo quando falta o anterior. Mês parcial e
mudança de origem ficam identificados e não recebem comparação com o mês completo.
O gráfico só liga pontos comparáveis; a tabela fornece os valores e seus motivos.

Taxas e margem são comparadas em pontos percentuais. Para valores em reais, contagens
e múltiplos, a variação relativa só existe se a base anterior for diferente de zero;
a diferença absoluta continua disponível. Uma alta ou baixa não é classificada
automaticamente como melhora ou piora do negócio.

Cada indicador pode ter uma meta por contratação/mês, inclusive mês futuro. A equipe
define valor e sentido: pelo menos ou no máximo. A meta pode apontar para um plano
ativo da mesma contratação. A edição exige motivo, preserva auditoria e usa versão
esperada; metas arquivadas podem ser reativadas.

A avaliação usa a última publicação não arquivada do mês. Com dados parciais, fica
“em acompanhamento”, mesmo que o valor já cumpra o alvo naquele momento. Com mês
fechado, fica atingida ou não atingida. Sem resultado calculável, fica não informado.
Não há percentual artificial de progresso nem divisão pelo alvo: uma meta de zero
cancelamentos é válida. Somente metas de margem estimada admitem valor negativo.

## Exportação da evolução por loja

Na aba Evolução mensal, “Exportar evolução CSV” baixa os meses selecionados da
contratação atual, no mesmo intervalo de até 36 meses. Administrador, mentor e
mentorado usam as mesmas permissões da consulta. Não há consolidação entre lojas.

O arquivo UTF-8 com BOM e ponto e vírgula contém período, situação, base, versão
publicada, 13 valores informados e seis derivados, com unidades nos cabeçalhos e
vírgula decimal. Só entram as publicações atuais não arquivadas: rascunhos,
correções ainda privadas e histórico da equipe ficam fora. Meses sem publicação
continuam na série; valores ausentes são “Não informado” e zeros são preservados.
Conteúdo semelhante a fórmula é neutralizado para abertura em planilhas. O download
exige sessão e autorização atual e não deve ser armazenado em cache.

## Importação CSV

A tela oferece modelo UTF-8 com BOM, separado por ponto e vírgula, prévia sem gravação
e confirmação de importação em lote como rascunhos privados.
O arquivo aceita até 64 KiB e 200 linhas de dados. Aspas, aspas duplicadas e quebras
de linha em campos delimitados são interpretadas; conteúdo de células é sempre dado.

Cabeçalhos obrigatórios: `periodo`, `situacao`, `origem`. Os demais são opcionais e
seguem o modelo baixado. Situação: `parcial` ou `fechado`; confirmações: `sim`/`não`.
Dinheiro admite vírgula ou ponto decimal, sem separador de milhar. Contagens não
admitem casas decimais. Valores vazios permanecem ausentes; confirmações vazias são
falsas. Cabeçalhos desconhecidos ou repetidos, arquivos sem dados e formatos ambíguos
produzem erro explícito.

A prévia aplica as mesmas regras de negócio do cadastro manual, aponta a linha do
erro e diferencia meses novos, inválidos ou já existentes, inclusive arquivados.
Não grava registros, revisões, metas, lotes ou auditoria. Todas as ocorrências de um
mês repetido no arquivo ficam inválidas. A confirmação importa somente linhas novas
válidas; existentes e inválidas são preservadas no relatório sem substituir dados.
Os registros importados recebem origem `csv` e precisam ser publicados pela equipe.
O cadastro manual grava `manual`; `sync` continua reservado. Confirmação, repetição
de tentativa e relatórios estão detalhados em `importacao-csv.md`.

## Permissões e limites

Administrador gerencia a organização, mentor gerencia a carteira vigente e mentorado
consulta suas empresas autorizadas. A regra vale para registros, versões, evolução,
metas, planos e prévia. Contratação pausada/encerrada permite consulta, sem escrita.
Troca de mentor, expiração de cobertura e retirada de autorização revogam acesso nas
requisições seguintes, preservando autoria e histórico.

Não há sincronização com marketplaces, conversão de
moeda, indicadores diários/semanais, relatório agregado da carteira ou alertas automáticos
de meta neste bloco. Indicadores qualitativos continuam nos diagnósticos técnicos.
Registrar/publicar resultados e metas não simula contato nem progresso de tarefas.

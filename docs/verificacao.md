# Verificação e limites da entrega

Atualização: 31/10/2026. Ambiente: Windows, Node 24.18.0, Docker Desktop Linux.
Containers usam Node 24.22.2 e PostgreSQL 18 com pgvector 0.8.7.

## Executado

- `npm ci`/instalação com lockfile, builds TypeScript da API e React/Vite.
- Auditoria npm: zero vulnerabilidades conhecidas no momento da execução.
- 10 testes unitários de calendário: horários úteis, fim do expediente, fim de semana,
  feriados consecutivos, limite de 75% e mudança de horário de verão.
- 9 testes de aceitação (suite principal incluída) contra PostgreSQL e Redis reais,
  banco `elo_acceptance`, API 3334, Redis DB1: autorização por recurso e CSV,
  CSRF, mensagens adicionais sem reinício de prazo, notas internas privadas,
  automações sem cumprimento de resposta, vínculos explícitos, promessa vencida,
  espera justificada, resolução/reabertura, reconciliação idempotente, ausência de
  acompanhamento sem chamado, troca de mentor e expiração de cobertura,
  convite de uso único e logout.
- 9 testes de segurança (suite incluída), banco `elo_authcheck`, API 3335 e Redis DB2:
  bootstrap com hash e uso único, MFA obrigatório em produção, código TOTP,
  cookies HttpOnly/Secure/SameSite, origem/CSRF, refresh concorrente com único
  vencedor, privacidade de intervenções, chaves estrangeiras entre organizações,
  recuperação invalida tokens/sessões e desativação revoga sessões.
- Migrations e seed executados no banco de desenvolvimento; papéis separados de
  execução e migrations; extensão pgvector habilitada.
- Build Docker de API, worker e frontend/proxy. Serviços próprios do projeto
  `elo-mentoria`; projetos existentes preservados.
- Scripts passaram em ShellCheck e Compose passou na validação de configuração.
- Backup e restauração executados por harness Ubuntu 24.04 com Docker: banco e
  anexo de teste conferidos em projeto isolado, sobrescrita recusada e hash da
  configuração preservado. Destino restaurado foi parado, volumes preservados.
  Evidência local: `.local/operation-evidence/RESULT.txt`.
- Reinício de todos os serviços da aplicação executado: prontidão completa restaurada,
  17 notificações antes/depois sem multiplicação, 13 obrigações com os mesmos IDs e
  datas, reconciliação repetida e configuração preservada. Evidência:
  `.local/operation-evidence/RESTART.txt`.

## Navegador

Dados de demonstração persistidos, sem mock de API:

- Administrador entrou, consultou painel e cadastrou `Loja Horizonte · validação`
  com matrícula e mentor principal.
- Mentorado entrou, viu somente Casa Aurora e abriu `Validação no navegador:
  revisão de catálogo`; prazo e dúvida apareceram na conversa.
- Mentor entrou, respondeu com vínculo à pergunta, registrou resumo de solução e
  resolveu o atendimento. O mentorado acessou a resposta e solicitou reabertura.
- Corrigido o atalho de pular navegação para focar o conteúdo sem alterar a rota;
  eventos de mudança de situação passam a gravar rótulos em português.
- Layout móvel inspecionado em 390 × 844, sem transbordamento horizontal observado.
  Captura local em `artifacts/atendimento-mobile.png`.

Os registros de validação permanecem identificados no banco de desenvolvimento.
Os bancos de teste não são automaticamente apagados.

## Bloco de planos e tarefas — 30/10/2026

- Migrations 002/003 aditivas aplicadas após cópia do banco de desenvolvimento em
  `.local/pre-plans/database.dump`. Dados anteriores preservados.
- Módulo NestJS, migrations e React compilados; imagens Docker de API, worker e
  frontend construídas. Prontidão confirmou banco, Redis e worker disponíveis.
- 18 testes unitários passaram, incluindo oito cenários novos do avaliador de sinais.
- `tests/plans-acceptance.mjs`: 12/12 resultados passaram (11 cenários e o grupo).
  PostgreSQL real `elo_planscheck`, Redis DB3 e API isolada 3336. Cobertura: escopo por
  organização/carteira, responsáveis autorizados, entrega/evidência, revisão e ajustes,
  reabertura, progresso sem canceladas, concorrência entre aprovar/devolver e entre
  concluir plano/adicionar tarefa, troca de mentor, expiração da cobertura, remoção de
  autorização do mentorado, alertas e episódios persistidos.
- Regressão de atendimento: 9/9 resultados passaram. Segurança/MFA: 9/9 passaram.
  Esses totais incluem os grupos reportados pelo executor, não são 30 cenários distintos.
- `tests/run-acceptance.mjs` prepara e encerra a API isolada automaticamente. Os
  bancos de teste permanecem para inspeção; nenhuma escrita desses testes em `elo`.
- Seed de planos aplicado somente no desenvolvimento e repetível sem substituir
  registros existentes. Auditoria npm continuou sem vulnerabilidades reportadas.
- Navegador: administrador criou `Validação — rotina de catálogo` e uma tarefa para
  Ana Ribeiro. Mentorada enviou evidência; mentor Lucas revisou/aprovou. Progresso
  passou a 100% sem marcar o plano concluído automaticamente. Mentorada abriu a
  notificação da aprovação e conferiu evidência/revisão/histórico.
- Indicador de tarefas vencidas abriu lista filtrada da carteira do mentor. Layout
  da tarefa foi inspecionado em 390 × 844, sem transbordamento horizontal observado.
  Captura: `artifacts/tarefa-mobile.png`.
- Lista final de planos inspecionada como administrador, com progresso de 100% do
  fluxo executado no navegador e planos demonstrativos persistidos de 25%. Captura:
  `artifacts/planos-acao.png`. Aplicação deixada aberta em `/#/plans`.

Limites na entrega inicial desse bloco: evidências eram texto/link HTTPS. O bloco
de anexos privados descrito abaixo acrescenta arquivos. O prazo de revisão
não é automático; episódios de alertas são reconciliados em intervalos de 30 segundos.
Regras completas em `planos-e-tarefas.md`.

## Bloco de anexos privados — 30/10/2026

- Migration 004 aditiva aplicada depois de cópia do banco em
  `.local/pre-attachments/database.dump`, preservando registros existentes.
- Dependências multipart fixadas no manifest/lockfile; instalação e auditoria npm
  sem vulnerabilidades conhecidas reportadas na execução.
- 26 testes unitários passaram, incluindo oito novos de validação de arquivos:
  nome/caminho/Unicode, PDF, PNG, texto UTF-8, CSV do Windows, MIME e tamanho.
- `tests/attachments-acceptance.mjs`: 13/13 resultados passaram (12 cenários e grupo),
  PostgreSQL `elo_filescheck`, Redis DB4, API 3337 e diretório de arquivos isolado.
  Verificou upload/download real, notas internas sem metadados expostos, IDs de outra
  carteira/empresa/organização, reclassificação interna, CSRF/origem, formatos falsos,
  limite de tamanho, nomes com travessia, Unicode, deduplicação e chave idempotente.
- Também verificou autoria e bloqueio de evidência após entrega, contrato pausado,
  plano em rascunho, atendimento resolvido, troca de mentor, fim de cobertura, logout,
  limite de contexto em envios concorrentes, falha real de gravação e recuperação
  após reinício. Arquivos prontos conservaram os mesmos bytes; arquivos desconhecidos
  foram preservados sem disponibilização pública.
- A configuração do Caddy com limite do corpo de 11 MB foi validada pela imagem real.
  Arquivos continuam limitados a 10 MiB na API, independentemente do proxy.
- Backup/restauração executados com um anexo criado por upload autenticado. No projeto
  `elo-restore-check-20261031004435`, metadados, download autenticado e SHA-256 foram
  conferidos; tentativa de sobrescrita foi recusada e hash da configuração preservado.
  O destino foi parado, com volumes preservados. Evidência local em
  `.local/operation-evidence/RESULT.txt` e backup `elo-20261031T004431Z-ekTgNE`.
- Regressões após o módulo: planos 12/12, atendimento 9/9 e segurança/MFA 9/9.
- Navegador: mentorada abriu `Validação de anexos privados no atendimento`, anexou
  `roteiro-catalogo.txt` à própria mensagem e baixou o arquivo. SHA-256 do download
  conferiu com o arquivo de origem. Mentor adicionou `observacao-equipe.txt` a uma
  nota interna; depois o acesso de mentorado mostrou zero nomes/links desse anexo.
- Na tarefa `Confirmar disponibilidade com o estoque`, mentorada anexou
  `conferencia-estoque.csv` e entregou evidência textual. Mentor baixou o CSV com bytes
  idênticos, registrou revisão e aprovou. Arquivo continuou disponível, sem opção de
  adicionar novos anexos ao estado entregue/concluído.
- Administrador consultou os anexos públicos e internos e baixou o arquivo interno
  autorizado com hash idêntico à origem. Layout móvel inspecionado em 390 × 844,
  sem transbordamento horizontal observado, incluindo o cartão de download.
  Capturas: `artifacts/anexos-privados.png` e `artifacts/anexo-tarefa-mobile.png`.
  Aplicação deixada no atendimento de validação com acesso administrativo local.

Os testes de arquivos não escrevem no banco ou volume de desenvolvimento. Não há
antivírus integrado; o produto valida formato e integridade, sem afirmar ausência de
malware. Regras, tipos aceitos e quotas em `anexos-privados.md`.

## Bloco de reuniões e atas — 30/10/2026

- Migration 005 aditiva aplicada após cópia do banco em
  `.local/pre-meetings/database.dump`, com catálogo do backup conferido.
- Build TypeScript/React e imagens Docker de API, worker e frontend aprovados.
  Aplicação local reiniciada preservando banco e anexos. Prontidão confirmou banco,
  fila e worker disponíveis. Auditoria das dependências de execução: zero
  vulnerabilidades conhecidas reportadas no momento da execução.
- 40 testes unitários passaram, incluindo oito cenários de sinais de reuniões e
  seis de duração, vigência e registro de resultado.
- `tests/meetings-acceptance.mjs`: 12/12 resultados passaram (11 cenários e grupo),
  com PostgreSQL `elo_meetingscheck`, API 3338, Redis DB5 e arquivos isolados.
  Verificou três perfis, organização/carteira, CSRF, responsável/participantes
  autorizados, vigência/duração, alteração justificada, presença e estados finais.
- Rascunhos, observações internas e histórico ficaram ausentes das respostas ao
  mentorado. Alterar rascunho preservou a versão pública; publicação repetida foi
  idempotente. Decisões convertidas não puderam ser apagadas ou reescritas.
- Conversões simultâneas produziram uma única tarefa, no plano e contratação
  corretos, com responsável autorizado e origem consultável. Criar tarefa não
  alterou `last_progress_at`. Troca de mentor e expiração da cobertura revogaram
  acesso a reuniões/decisões sem apagar registros históricos.
- Alertas de falta de próxima reunião, encontro sem resultado e ata pendente
  foram reconciliados repetidamente e após reinício real da API e do worker
  isolados, sem duplicação de episódio. O alerta sem próxima reunião oferece
  destino para a contratação correta; chaves internas de deduplicação não saem
  na resposta. Um erro com alertas antigos sem chave foi corrigido e retestado.
- Regressões finais: anexos 13/13, planos 12/12, atendimento 9/9 e segurança 9/9.
  Com reuniões, são 55 resultados do executor, incluindo cinco grupos, correspondendo
  a 50 cenários de integração. Os bancos de teste permanecem para inspeção e os
  processos isolados foram encerrados.
- Navegador: administrador criou `Validação — revisão de catálogo e decisões`;
  Lucas registrou realização, duas presenças, resumo, decisão e próximos passos,
  publicou a versão 1 e gerou a tarefa de atualização de fotos para Ana.
- A tarefa manteve texto da decisão e link de retorno à reunião. Um novo rascunho
  sobreviveu à recarga e foi salvo sem publicação. Ana continuou vendo somente
  a versão 1, sem o novo texto, observações internas ou editor da equipe; abriu
  a tarefa vinculada e recebeu as ações permitidas para sua execução.
- Painel administrativo conferido com contagem de hoje, reunião sem desfecho,
  clientes sem próxima reunião e ata pendente. O botão de alerta abriu a agenda
  filtrada para o cliente correto.
- Inspeção móvel em 390 × 844, incluindo decisão, tarefa e presença, sem
  transbordamento horizontal observado. Capturas:
  `artifacts/reuniao-ata-publicada.png` e `artifacts/reuniao-ata-mobile.png`.

Regras e limites deste bloco em `reunioes-e-atas.md`. Agenda interna e atas manuais;
sem calendário externo, recorrência, gravação ou transcrição de chamadas.

## Bloco de diagnósticos técnicos — 30/10/2026

- Migration 006 aditiva aplicada após backup em
  `.local/pre-diagnostics/database.dump`, com catálogo conferido. Módulos anteriores,
  reuniões e anexos preservados.
- API e frontend compilaram; imagens Docker atualizadas e aplicação local reiniciada.
  Prontidão confirmou banco, fila e worker disponíveis. Nenhuma dependência adicionada;
  instalação das imagens reportou zero vulnerabilidades conhecidas na execução.
- 48 testes unitários passaram, incluindo oito novos de avaliações incompletas,
  publicação parcial, justificativa de não aplicabilidade, hash independente da ordem
  de chaves JSONB, identificadores, links HTTPS e tamanho agregado UTF-8.
- `tests/diagnostics-acceptance.mjs`: 13/13 resultados passaram (12 cenários e grupo),
  com PostgreSQL `elo_diagnosticscheck`, API 3339, Redis DB6 e diretório isolado.
  Verificou organização, carteira, três perfis, CSRF, modelos administrativos,
  cópia do modelo na instância, contratação pausada, arquivamento e reativação.
- Rascunhos privados não alteraram o DTO público, inclusive título, contexto,
  avaliações e metadados. Mentorados não receberam modelos, rascunhos ou histórico
  da equipe; IDs não publicados retornaram 404. Troca de mentor, fim da cobertura e
  retirada de autorização do mentorado revogaram acesso.
- Saves concorrentes com a mesma versão tiveram um vencedor e um conflito; publicação
  repetida preservou a revisão e sua notificação. Versões anteriores conservaram
  conteúdo após edição/publicação posterior.
- Vínculo e criação de plano exigiram mesma organização/contratação e revisão
  publicada. Solicitações simultâneas produziram um plano por achado/versão. Repetir
  o vínculo da mesma origem foi idempotente; tentar substituir sua origem retornou
  conflito. Situação inicial e recomendação foram reaproveitadas e o detalhe do plano
  retornou o título da revisão de origem, sem título do novo rascunho.
- Diagnósticos não alteraram contato nem progresso de planos existentes. Limite de
  64 KiB foi validado antes de gravação; requisição acima do limite do parser JSON
  retornou 413 com mensagem compreensível, sem erro interno genérico.
- Regressões finais: anexos 13/13, planos 12/12, atendimento 9/9, segurança/MFA 9/9
  e reuniões 12/12. Com diagnósticos, foram 68 resultados, incluindo seis grupos,
  correspondentes a 62 cenários de integração. APIs de teste 3334–3339 foram encerradas;
  bancos e arquivos de teste foram preservados, sem escrita na demonstração.
- Navegador: Marina criou modelo curto de catálogo/margem e diagnóstico da Casa Aurora.
  Lucas avaliou catálogo, manteve margem como não avaliada e publicou a versão 1.
  O rascunho sobreviveu à recarga antes de ser salvo. A recomendação gerou o plano
  `Validação — padronizar os anúncios prioritários` com situação inicial, objetivo e
  prioridade reaproveitados; um plano existente também foi vinculado.
- O plano existente manteve seu instante anterior de progresso. Lucas publicou uma
  segunda versão com novo título/contexto e preparou um terceiro rascunho privado.
  Ana recebeu somente a versão 2 na lista e no detalhe; pôde selecionar a versão 1,
  consultar os planos de origem e abrir a publicação pela notificação. Nenhum editor,
  título privado, contexto privado ou cliente de outra carteira apareceu.
- Inspeção visual em desktop e 390 × 844: contexto, avaliação incompleta, seletor de
  versões e planos vinculados legíveis, sem transbordamento horizontal observado.
  Capturas: `artifacts/diagnostico-publicado.png` e `artifacts/diagnostico-mobile.png`.

As regras e os limites estão em `diagnosticos-tecnicos.md`. Avaliação manual, sem
diagnóstico comercial, indicadores importados, IA ou anexos próprios de diagnóstico.

## Bloco de indicadores manuais e metas — 31/10/2026

- Migrations 007/008 aplicadas após backup em `.local/pre-indicators/database.dump`,
  com catálogo conferido. Registros anteriores preservados. A 008 corrige a expressão
  da restrição de formato de metas em instalações que já aplicaram a primeira 007;
  a 007 também foi corrigida para bancos novos. Nenhum valor foi apagado ou convertido.
- 76 testes unitários passaram: calendário, alertas, arquivos, reuniões, diagnósticos,
  cálculos, comparação mensal, metas, regras de publicação e parser CSV. A verificação
  de entrada numérica do frontend também passou em 17 casos de formato e precisão.
- `tests/indicators-acceptance.mjs`: 15/15 resultados passaram (14 cenários e grupo),
  com PostgreSQL `elo_indicatorscheck`, Redis DB7 e API isolada 3340. Cobertura: três
  perfis, organização/carteira, revogação de acesso, contratação pausada, rascunho
  privado, revisões imutáveis, publicação concorrente e controle de versão.
- Verificados 13 campos informados e seis cálculos, zero versus ausência, denominador
  zero, margem negativa, confirmações de base/atribuição/custos, lacunas e mudança
  de origem, comparação de meses consecutivos fechados e metas futuras/zero/negativas.
  Vínculos a planos exigiram a mesma contratação; metas e resultados não alteraram
  contato nem progresso de planos. Restrições do banco também foram exercitadas.
- CSV: modelo UTF-8 com BOM, aspas e campos multilinha, cabeçalhos, precisão, arquivo
  sem dados, limites de 64 KiB/200 linhas, duplicatas e conflitos foram verificados.
  A prévia não mudou registros, revisões, metas ou auditoria, conferidos por hashes.
- Regressões: diagnósticos 13/13, reuniões 12/12, anexos 13/13, planos 12/12,
  atendimento 9/9 e segurança/MFA 9/9. Com indicadores, são 83 resultados reportados,
  incluindo sete grupos, correspondentes a 76 cenários de integração. APIs isoladas
  3334–3340 encerradas; bancos e arquivos de teste preservados.
- Builds TypeScript/React e imagens Docker aprovados. API, worker e frontend
  atualizados; prontidão confirmou banco, fila e worker. Instalação das imagens
  reportou zero vulnerabilidades conhecidas; nenhuma dependência foi acrescentada.
- Navegador: administradora iniciou setembro da Casa Aurora. Mentor preencheu os
  dados, confirmou a base e publicou R$ 60 mil/300 pedidos; ticket R$ 200, conversão
  3%, ROAS 5, ACOS 20%, TACOS 8,3333% e margem estimada 20%. O rascunho sobreviveu
  à recarga antes do salvamento. A evolução mostrou +R$ 12 mil/+25% contra agosto e
  conversão -0,2 ponto percentual, preservando meses ausentes sem valor zero.
- A meta de setembro de R$ 55 mil ficou atingida e abriu o plano vinculado; o detalhe
  do plano também apresentou o atalho para a meta, sem alterar seu progresso.
  Meta futura de novembro ficou sem resultado; metas de outubro, inclusive zero
  cancelamentos com zero observado, permaneceram em acompanhamento no mês parcial.
- Mentor preparou correção privada de R$ 61 mil com motivo. Mentorada continuou
  recebendo R$ 60 mil, origem e contexto da versão 1, sem editor, texto privado ou
  histórico da equipe. Outubro parcial não recebeu comparação com mês fechado.
- Administradora validou CSV com uma linha nova, um mês existente e duas linhas
  inválidas (repetição/formato monetário). A tela informou que nada foi gravado.
  Download real do modelo conferido com BOM `EF BB BF` e cabeçalhos esperados.
- Revisão em 390 × 844 encontrou e corrigiu o posicionamento do texto acessível da
  tabela. Nova inspeção confirmou página sem transbordamento horizontal; somente
  a tabela mantém rolagem própria. Metas também ficaram contidas no viewport.
  Capturas: `artifacts/indicadores-evolucao.png`, `artifacts/indicadores-mobile.png`
  e `artifacts/indicadores-csv-previa.png`.

Regras em `indicadores-manuais.md`. Na entrega inicial, o CSV oferecia modelo e prévia;
a confirmação em lote foi acrescentada no bloco seguinte. Dados do navegador são fictícios e estão
identificados no desenvolvimento. Nenhum processo ou comando Git foi executado.

## Bloco de importação CSV em lote — 31/10/2026

- Migration 009 aditiva aplicada depois do backup em
  `.local/pre-csv-imports/database.dump`, com catálogo conferido. Antes da migração:
  cinco indicadores, quatro revisões, cinco metas, seis atendimentos e quatro planos.
  A migração apenas acrescentou a tabela de lotes; não executou seed nem alterou esses
  registros. O papel da aplicação pode consultar/inserir lotes, sem atualizar/excluir
  seus relatórios históricos.
- 87 testes unitários passaram, incluindo dez novos de assinatura/expiração da
  prévia, vínculo ao usuário/conteúdo, classificação de duplicidades, hash de estado,
  valores explícitos, mensagens em português, nome de arquivo e CSV protegido. O
  parser preserva o mês de linhas com número incorreto de campos para identificar
  todas as ocorrências de uma duplicidade. Onze verificações do frontend cobriram
  datas inválidas e exportação dos erros da prévia, incluindo fórmulas/aspas/quebras.
- `tests/indicator-imports-acceptance.mjs`: 15/15 resultados passaram (14 cenários e
  grupo), com PostgreSQL `elo_importscheck`, Redis DB8 e API isolada 3341. Prévia
  permaneceu sem gravação; confirmação exigiu token assinado, usuário/contratação
  corretos e consentimento explícito. Arquivo alterado, token adulterado/expirado,
  política de sobrescrita, falta de confirmação e conteúdo sem candidatos foram
  recusados sem criar lote.
- Confirmados lotes mistos: meses novos válidos viram rascunhos `csv`; existentes
  publicados, privados ou arquivados permanecem intactos. Todas as ocorrências de
  mês repetido ficam inválidas, inclusive quando uma linha tem coluna excedente.
  Ausência de valores não virou zero; nenhum resultado foi publicado automaticamente.
- Envios concorrentes com a mesma chave retornaram um único lote e a mesma autoria;
  outra utilização da chave retornou conflito. Reenvio exato depois da expiração
  recuperou o resultado anterior. Chaves diferentes para o mesmo estado foram
  serializadas e a prévia que ficou desatualizada recebeu 409, sem gravação parcial.
- Uma falha real induzida por trigger de auditoria no banco isolado reverteu todos
  os indicadores, auditoria e relatório do lote. A trigger de teste foi removida.
  Relatórios não foram reescritos após edição/publicação dos indicadores.
- Verificadas organização, carteira, perfis, CSRF, contratação pausada, troca de
  mentor, cobertura expirada e retirada de acesso. Mentorados não receberam lotes,
  relatórios, downloads ou rascunhos; publicações posteriores ficaram disponíveis.
- CSV de aproximadamente 54 KiB com envelope JSON acima de 100 KiB foi validado e
  importado. O parser permite envelope de até 160 KiB apenas nas duas rotas CSV;
  limite de 64 KiB do arquivo e 200 registros continua independente. Demais rotas
  mantêm limite JSON de 100 KiB, incluindo o teste anterior de diagnóstico com 413.
- Regressões: indicadores 15/15, diagnósticos 13/13, reuniões 12/12, anexos 13/13,
  planos 12/12, atendimento 9/9 e segurança/MFA 9/9. Junto da nova suíte, foram
  98 resultados reportados, incluindo oito grupos: 90 cenários de integração.
  APIs 3334–3341 encerradas; bancos/arquivos isolados preservados.
- Builds TypeScript/React e imagens Docker aprovados. API, worker e frontend
  atualizados; prontidão confirmou banco, fila e worker. Instalação reportou zero
  vulnerabilidades conhecidas; nenhuma dependência foi acrescentada.
- Navegador: administradora selecionou o CSV fictício de sete linhas da Casa Aurora;
  prévia apresentou dois candidatos, um mês existente e quatro linhas inválidas.
  Conteúdo e prévia sobreviveram à recarga. Confirmação permaneceu desabilitada até
  marcar a ciência sobre rascunhos privados. O envio criou dois registros e um lote;
  metas, atendimentos e planos conservaram as contagens anteriores.
- Relatório foi reaberto por URL e pelo mentor da carteira, preservando autoria da
  administradora. Downloads reais dos erros da prévia e do relatório conferidos com
  BOM `EF BB BF` e período `=1+1` neutralizado como texto.
- Mentorada não acessou o ID privado de junho, nem recebeu nome de arquivo, controles
  CSV ou relatório. Mentor revisou os valores de junho e publicou R$ 38 mil/190
  pedidos. Mentorada passou a consultar a versão 1 com origem CSV e ticket R$ 200,
  mantendo editor e histórico da equipe ausentes. Março permaneceu em rascunho.
- Layout de confirmação e resultado conferido em 390 × 844, sem transbordamento
  horizontal da página; tabela tem rolagem própria. Relatório passou a aparecer
  antes do formulário na abertura de um lote. Capturas:
  `artifacts/importacao-confirmacao-mobile.png`,
  `artifacts/importacao-relatorio-mobile.png` e `artifacts/importacao-csv-relatorio.png`.

Regras em `importacao-csv.md`. Importação limitada a indicadores e uma contratação
por lote; publicação continua por mês. Nenhum comando ou processo Git foi executado.

## Comercial, jornada, materiais, relatórios e preparação de integrações — 31/10/2026

- Migrations 010–014 aplicadas no desenvolvimento após backup em
  `.local/pre-management-modules/database.dump`, com catálogo conferido. A migration
  final é `014_integration_marketplace_accounts.js`. As 14 migrations constam no
  banco `elo`; API, worker e frontend foram reconstruídos e atualizados. Prontidão
  confirmou banco, fila e worker; os cinco serviços do Compose ficaram saudáveis.
- 124 testes unitários passaram. A rodada integrada totalizou
  **164 resultados: 151 cenários e 13 grupos**, sem falhas. Reexecuções de uma mesma
  suíte não foram somadas a esse total.

| Suíte de integração | Resultados, incluindo grupo |
|---|---:|
| Atendimento | 9 |
| Segurança/MFA | 9 |
| Planos e tarefas | 12 |
| Anexos privados | 13 |
| Reuniões e atas | 12 |
| Diagnósticos técnicos | 13 |
| Indicadores e exportação da evolução | 16 |
| Importação CSV em lote | 15 |
| Comercial e financeiro da mentoria | 15 |
| Jornada, satisfação e capacidade | 14 |
| Materiais privados | 12 |
| Relatórios operacionais | 12 |
| Preparação de integrações | 12 |

- Comercial: separação administrativa de oportunidades e financeiro, conversão
  concorrente sem duplicação, justificativas e histórico, recebimentos/estornos,
  denominadores de relatórios, CSV protegido e chaves compostas entre organizações.
- Jornada: checklist e revisão, encerramento versionado, renovação idempotente em
  novo ciclo, satisfação com compartilhamento explícito, capacidade e ausências,
  intervenções privadas, linha do tempo e alertas persistidos com escopo atual.
- Materiais: públicos administrativos/equipe/cliente, rascunho separado de publicação,
  arquivos privados com integridade e quotas, falha real de disco, reinício, versões
  anteriores e revogação imediata. Busca textual autorizada antes dos trechos, sem
  chamada externa ou vetores inventados; consultar não simula acompanhamento.
- Relatórios: amostras e percentis, coortes de resolução/reabertura/renovação,
  satisfação privada fora da amostra do mentor, listas correspondentes aos cards,
  filtros preservados, clientes sem chamados, carga atual e exportação autorizada.
  Tarefas reabertas mantêm conclusão histórica; entregas em revisão não contam
  como atraso de execução. Não há consolidação financeira de lojas.
- Exportação da evolução mensal: três perfis no próprio escopo, até 36 meses,
  somente publicações, 13 campos e seis derivados com unidades. Lacunas, zeros,
  margem negativa, BOM, escape de fórmulas, cache privado e revogação foram
  conferidos; nenhuma consulta alterou dados ou auditoria.
- Integrações: preferências administrativas, escopo por organização/conta, state
  de uso único, rotação serial de credenciais, cifra, deduplicação de eventos e
  intenções de saída. Adaptadores e assinaturas foram ensaiados com transporte
  local, sem conta externa ou mensagem real. Não há webhook público, consumidor
  de envio ou sincronização externa ativada.
- APIs isoladas encerradas após os testes; bancos e arquivos de teste preservados.
  A rodada das 11 suítes anteriores não escreveu na demonstração. As novas suítes
  de jornada e integrações também usam seus bancos isolados.

### Preservação do desenvolvimento

Às 14:54 de 31/10/2026 (São Paulo), uma transação somente de leitura com `elo_owner`
comparou contagens e IDs UUID ao conteúdo do backup anterior às migrations. Nenhum
ID anterior conferido estava ausente. Contagens principais antes/depois:

| Registros | Antes | Depois |
|---|---:|---:|
| Empresas | 6 | 7 |
| Contratações | 6 | 8 |
| Atendimentos / mensagens | 6 / 12 | 6 / 12 |
| Planos / tarefas | 4 / 10 | 4 / 10 |
| Anexos privados | 4 | 4 |
| Reuniões / revisões de ata | 5 / 2 | 5 / 2 |
| Diagnósticos / revisões | 3 / 3 | 3 / 3 |
| Indicadores / revisões / metas / lotes CSV | 7 / 5 / 5 / 1 | 7 / 5 / 5 / 1 |
| Obrigações de SLA | 21 | 21 |

Os totais posteriores incluem registros acrescentados durante a validação da
aplicação. Evidência detalhada com horário e tabelas:
`.local/pre-management-modules/preservation-check.json`. A leitura do arquivo de
backup não executou suas instruções SQL no banco. **Não foi repetida uma restauração
completa após as migrations 010–014**; o ensaio de restauração anterior permanece
documentado no bloco de anexos e não comprova, por si só, essa nova versão.

### Navegador dos novos módulos

- Administração criou a oportunidade fictícia “Validação — Expansão Horizonte”,
  com origem, contato, proposta de R$ 1 mil e próxima ação com prazo. O ganho criou
  uma empresa e uma contratação, com mentor principal e ligação para a entrada.
  Nenhuma conta de acesso, cobrança ou recebimento foi criada pela conversão.
- Registro financeiro fictício separado: R$ 1 mil contratado, R$ 500 recebido e
  diferença de R$ 500. A inspeção identificou conversão indevida de datas sem horário;
  corrigidos DTO e apresentação para preservar `YYYY-MM-DD`. A suíte comercial
  foi repetida (15/15), incluindo datas de assinatura, recebimento, vencimento,
  replay e CSV. Na tela, assinatura e recebimento permaneceram em 31/10/2026.
- Checklist guardou contexto e entregáveis sem confirmar reuniões ou acessos
  inexistentes. Renovação criou o ciclo seguinte (29/01 a 29/04/2027), preservou o
  anterior e apresentou a atribuição futura do mentor, sem somá-la à carga atual.
- Administração registrou revisão fictícia da Casa Aurora e próxima revisão.
  A mentorada avaliou o ciclo com nota 4 e marcou explicitamente o compartilhamento;
  o mentor recebeu a avaliação compartilhada com amostra de uma resposta. A tela
  da mentorada permaneceu sem intervenções ou notas administrativas.
- Mentor solicitou ausência fictícia em 10/11/2026. Administração aprovou e recebeu
  a lista dos cinco clientes afetados e as ações de cobertura individual. Aprovar
  não criou cobertura nem alterou permissões automaticamente.
- Material compartilhado da Casa Aurora: criação, texto, tags, upload privado de
  TXT e publicação da versão 1. Mentor consultou a publicação. Mentorada encontrou
  o material por “catálogo”, abriu a origem e baixou o arquivo, sem editor ou histórico
  da equipe. SHA-256 do download idêntico ao arquivo enviado:
  `dcdf391cc6a4c410cd8dc066911f508f82015cfda50bcbf911e65df5900f896b`.
- Relatórios abriram para administração e mentor. Filtro da Casa Aurora reduziu
  a fila aos seus três atendimentos; o card de vencidos abriu o assunto correspondente.
  CSV real preservou o escopo e o BOM UTF-8. Mentorados receberam orientação para
  sua evolução, sem acesso ao relatório operacional. Comercial e integrações ficaram
  ausentes da navegação do mentor; URL direta de integrações apresentou acesso
  indisponível. Seletores de materiais e relatórios passaram a mostrar a vigência,
  distinguindo contratações renovadas da mesma empresa.
- A mentorada exportou a evolução de maio a outubro. CSV com 23 colunas e BOM;
  junho publicado em R$ 38 mil, setembro em R$ 60 mil e maio sem publicação como
  “Não informado”. A correção privada de setembro (R$ 61 mil) não apareceu.
- Integrações exibiram Mercado Livre, WhatsApp Business e e-mail com Resend como
  configuração pendente, sem última sincronização ou conta validada inventadas.
  Não foram informadas credenciais nem acionados provedores externos.
- Materiais, satisfação, disponibilidade e relatórios conferidos em 390 × 844.
  Medição da página de relatório: 390 px de viewport e 375 px de conteúdo/rolagem,
  sem transbordamento horizontal. Menu móvel permitiu navegação e troca dos perfis;
  o tamanho temporário foi removido ao terminar. Capturas em `artifacts/`:
  `comercial-conversao.png`, `comercial-financeiro.png`,
  `materiais-mentorada.png`, `materiais-mobile.png`,
  `jornada-revisao.png`, `jornada-satisfacao-mobile.png`, `ausencia-aprovada-mobile.png`,
  `relatorios-mobile.png`, `relatorios-gerenciais.png` e `integracoes-pendentes.png`.

Dados acrescentados pelo navegador são fictícios, identificados como validação.
Após a última atualização de API, worker e frontend, a prontidão confirmou banco,
fila e worker. Nenhum comando ou processo Git foi executado.

## O que não foi validado ou ainda não está pronto

- Instalação completa em servidor Ubuntu virgem, DNS e certificado HTTPS público
  não foram executados. O harness valida os scripts de operação, não substitui um
  ensaio de implantação em servidor real.
- Não há garantia de disponibilidade contínua, teste de carga, auditoria externa
  de segurança ou avaliação formal completa de acessibilidade.
- Atualização da interface usa consultas periódicas; não há canal de eventos em
  tempo real via WebSocket/SSE.
- Integrações Mercado Livre/WhatsApp/e-mail têm preparação e ensaios locais, mas
  ainda precisam de contas, permissões, callbacks/consumidores e validação externa
  autorizada. Configurar uma chave não ativa um canal. Não há recuperação por IA;
  a biblioteca oferece busca textual autorizada, sem extração automática de arquivos.
- Calendários de SLA aceitam expediente único e feriados, sem turnos múltiplos ou
  exceções diárias de horário. Ausências de mentores estão implementadas para
  planejar coberturas; não pausam o SLA automaticamente. Feriados brasileiros
  precisam ser configurados.
- As datas da interface usam São Paulo; programas aceitam outros fusos para cálculo,
  mas exibição com fuso selecionável por programa é evolução pendente.
- Recuperação por link é administrada, sem envio automático por e-mail. Recuperação
  de administrador único sem acesso requer intervenção operacional no servidor.
- Política de retenção/anonimização e atendimento LGPD está documentada, sem rotina
  automatizada de exclusão/exportação de todos os dados pessoais.
- `otplib` 12 e o `cron-parser` transitivo apresentam avisos de deprecação; nenhuma
  vulnerabilidade foi reportada pela auditoria executada. Migrar APIs em manutenção
  futura e repetir testes MFA e de fila.
- A aceitação emitiu aviso de `node-pg` sobre consultas concorrentes no mesmo
  cliente, comportamento a revisar antes de eventual atualização para pg 9.
  A versão 8 utilizada passou na rodada atual.

Esta entrega reúne atendimento, diagnósticos, planos/tarefas, anexos, reuniões/atas,
indicadores/metas/importação e exportação CSV, comercial/financeiro administrativo,
jornada/renovação/satisfação/capacidade, materiais, relatórios e preparação de
integrações. Os limites acima permanecem; a validação local não constitui uma
declaração de prontidão irrestrita para dados reais em produção.

## Central de ajuda e manual de uso — 04/11/2026

- Central disponível em `#/help`, no menu dos três perfis e no botão de ajuda do
  cabeçalho. São 42 guias em oito capítulos, com roteiros por perfil, pré-requisitos,
  passos numerados, resultado esperado, orientações para dificuldades, glossário,
  referências relacionadas e atalhos para os módulos correspondentes.
- A apresentação filtra os guias conforme o perfil: Administração, 39; Mentor, 30;
  Mentorado, 16. O manual em `docs/manual-usuario.md` reúne os três perfis. A fonte
  compartilhada é `apps/web/src/help-content.ts`; `npm run docs:manual` regenera o
  documento e `npm run docs:manual -- --check` verifica sua sincronização.
- A busca combina as palavras, ignora caixa/acentos e procura no procedimento
  completo. Usa início de palavra para evitar que “ata” corresponda apenas a um
  trecho de “contratação”. Categorias, busca e guia podem ser abertos por URL.
- Build TypeScript/Vite do frontend aprovado. `npm test` executou 124 testes da
  API e quatro verificações novas do manual, todos aprovados. Depois dos ajustes
  finais de conteúdo e busca, as quatro verificações do manual, seu gerador e o
  build do frontend foram executados novamente, sem falhas. Há aviso do Vite de
  tamanho do bundle principal acima de 500 kB; a central usa carregamento separado.
- Frontend Docker reconstruído e atualizado isoladamente na instalação local.
  Nenhuma migration ou seed foi necessário para o manual.
- Navegador: entrada com as três contas de demonstração; central e roteiros de
  cada perfil; busca por “publicar ata”; orientação sem resultados; limpeza e
  filtro de reuniões; leitura de guia; cópia do link sem filtros; bloqueio de guia
  administrativo na apresentação do mentorado; atalho do guia de execução para
  a tela real de tarefas do mentorado.
- Página inicial e leitura de artigo inspecionadas em desktop e em 390 × 844.
  No celular, a largura da página foi 375 px para viewport de 390 px, sem
  transbordamento horizontal; capítulos têm rolagem própria. Override temporário
  removido após a conferência. Capturas em `artifacts/wiki-central-ajuda.png`,
  `artifacts/wiki-guia-ata.png` e `artifacts/wiki-guia-mobile.png`.
- Impressão de guia ou manual por perfil tem apresentação própria em CSS. Não foi
  realizado ensaio de impressão física ou revisão de um PDF gerado pelo navegador.

## Transições da plataforma — 04/11/2026

- Padrão central em `apps/web/src/motion.css`, com tempos de 120, 180 e 220 ms,
  feedback de controles, cartões, campos, avisos, menu móvel e entrada/saída de
  diálogos. A navegação do workspace aplica o efeito em todos os módulos.
- As abas de acompanhamento, planos, atas, diagnósticos, indicadores, jornada,
  materiais, comercial e relatórios usam `useMotionRegion`. O efeito atua no nó
  existente, sem remontar formulários para animar. Buscas e filtros não reiniciam
  a transição da página inteira. Animações interrompidas são canceladas.
- Seções expansíveis usam `Disclosure`/`Collapse`. Campos antes contidos em
  `details` permanecem montados ao recolher; conteúdo fechado fica inerte e fora da
  árvore acessível. Diálogos condicionais aguardam a saída com `useDialogDismiss`.
  O componente compartilhado de diálogo restaura o foco ao controle que o abriu.
- Menu móvel: fundo e painel têm transições coordenadas; navegação fechada fica
  inerte. Aberto, o menu foca o item atual, limita o Tab ao menu, bloqueia o fundo
  e a rolagem da página e devolve o foco ao acionador ao fechar com Escape.
- `prefers-reduced-motion` desativa os efeitos CSS e impede a animação de regiões.
  Alterar a preferência durante uma animação cancela o efeito. Os testes cobrem
  esses dois casos e a remoção de observadores. Não foi alterada a preferência
  de acessibilidade do Windows durante a validação.
- `npm test`: 124 testes da API e nove do frontend aprovados (133 no total).
  Após os ajustes finais, build e nove testes do frontend repetidos com sucesso;
  manual de 42 guias continua sincronizado. O build mantém o aviso de tamanho do
  bundle principal, agora aproximadamente 503 kB antes de gzip.
- Navegador: abertura dos módulos da operação e administração sem erros de console;
  troca entre ata compartilhada e preparação; abertura/fechamento de formulários;
  recolher/reabrir diagnóstico comercial preservando o texto e o vínculo do campo
  ao formulário; retorno do foco após cancelar sem salvar.
- Em 390 × 844, conferidos abertura/fechamento do menu, item atual, Tab/Shift+Tab,
  Escape e retorno do foco. Funil com 343 px visíveis e rolagem interna de 2.338 px;
  página com 375 px de largura para viewport de 390 px, sem transbordamento horizontal.
  O override de viewport foi removido após a conferência.
- Frontend Docker reconstruído e atualizado. A conferência usou a conta
  administrativa de demonstração, sem confirmar cadastros ou alterações de negócio.

## Perfil pessoal, foto e dados de acesso — 04/11/2026

- Área `#/profile` disponível nos três perfis, pelo menu, pelo nome e pelo avatar.
  Nome/telefone, prévia de foto, envio/remoção e aba Segurança para e-mail e senha.
  Transições compartilhadas, abas com teclado e campos de senha com rótulo próprio.
  O manual agora reúne 43 guias, incluindo o uso do perfil.
- Migration 015 aplicada após backup PostgreSQL em
  `.local/pre-profile-88dab327/database.dump` (265.914 bytes). Contagens conferidas
  antes/depois: usuários 5; empresas 7; contratações 8; atendimentos 6; mensagens 13;
  planos 4; tarefas 10. Não foi executado seed na instalação local.
- Foto regravada como WEBP privado no banco, com limitação de bytes/pixels e remoção
  dos metadados originais. A prévia local usa URL temporária, liberada após descarte.
  A aplicação mantém iniciais quando não há foto.
- E-mail/senha exigem reautenticação e MFA quando ativo. A sessão atual é substituída
  e as outras sessões e links pendentes são revogados atomicamente. Login concorrente
  com credenciais antigas não produz sessão que sobreviva à troca. Trocas preservam
  espaços significativos na senha e não desativam MFA.
- 137 testes unitários/verificações passaram: 128 da API e nove do frontend.
  Integração de perfil: 11 resultados (dez cenários e grupo); segurança: nove;
  atendimento: nove. Todos aprovados em bancos/API/Redis isolados. Os últimos ajustes
  de rótulos e carga inicial passaram no build Docker do frontend.
- Navegador na demonstração: abertura pelo nome; dados atuais; aba Segurança;
  campos pessoais preservados ao trocar de aba; recarga explícita sem salvar;
  escolha de PNG de teste, prévia e descarte sem enviar; revisão de layout em
  390 × 844 com página de 375 px, sem transbordamento horizontal. Alterações reais
  de senha, e-mail, dados pessoais e foto foram exercitadas somente pelos testes
  isolados. Não foi alterada a senha da conta usada no navegador.
- API, worker e frontend reconstruídos e atualizados. Prontidão confirmou banco,
  fila e worker. Instalação de dependências reportou zero vulnerabilidades.
  Dependência nova: `sharp@0.35.5`. O aviso de bundle principal do Vite permanece.

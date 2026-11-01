# Diagnósticos técnicos da mentoria

Um diagnóstico registra a avaliação da operação do cliente em uma contratação.
É distinto do diagnóstico comercial de uma oportunidade de venda. A avaliação é
preenchida pela equipe, com contexto e evidências; não é produzida automaticamente
por integrações ou IA.

## Modelos e avaliação

Os modelos da organização podem selecionar áreas e orientar a avaliação com perguntas
editáveis. A administração gerencia esses modelos; mentores escolhem um modelo e
adaptam o diagnóstico do cliente. Alterar um modelo não reescreve diagnósticos já
criados: cada instância preserva o modelo utilizado.

O modelo inicial contempla catálogo/anúncios/fotos/ficha técnica, preços/custos/margem,
estoque, logística/Mercado Envios/Full, reputação, publicidade/desempenho, processos
e equipe, além de bloqueios e prioridades. É possível começar com menos áreas,
de acordo com a maturidade e o objetivo do cliente.

Cada área registra avaliação, observação, recomendação, prioridade e um link HTTPS
opcional de evidência. Avaliações: não avaliado, adequado, precisa de atenção,
crítico ou não se aplica. Uma área avaliada exige observação; “não se aplica” exige
o motivo. Campos sem avaliação continuam explícitos como informação incompleta.
Não há nota global, média de maturidade ou suposição de saúde por ausência de dados.

## Rascunho e versões publicadas

Administrador e mentor autorizado preparam o rascunho. O mentorado consulta somente
versões publicadas das empresas às quais tem acesso. Título, contexto e avaliações
em edição também são privados: uma alteração no rascunho não aparece antecipadamente
na listagem nem no detalhe público.

Publicar exige contexto e ao menos uma área avaliada; as outras áreas podem ficar
para uma revisão posterior. Cada publicação preserva conteúdo, autor, versão e data.
As versões anteriores continuam consultáveis e não são reescritas pela revisão nova.
Salvar e publicar verificam a versão de edição para evitar sobrescrever alterações
de outra pessoa. A interface preserva alterações locais por usuário e diagnóstico.

Arquivar e reativar exigem justificativa. Contratações pausadas ou encerradas
preservam consulta ao histórico e não aceitam novas alterações de diagnóstico.

## Ligação com os planos de ação

A equipe pode vincular uma versão publicada a um plano ativo da mesma contratação.
Também pode gerar um plano a partir da recomendação de uma área publicada. A
observação é reaproveitada como situação inicial e a recomendação como objetivo,
com revisão do título, meta e prioridade antes de confirmar.

O vínculo registra qual versão e área motivaram a ação. O plano oferece um link
de volta àquela avaliação; o diagnóstico oferece acesso aos planos vinculados.
Uma publicação posterior não altera silenciosamente o plano existente. Repetir
a mesma criação ou enviar solicitações simultâneas não multiplica o plano da mesma
área e versão. Vincular um plano existente também é idempotente.
Cada plano mantém uma origem por versão do diagnóstico. Tentar associá-lo a outra
área da mesma versão retorna conflito, preservando a origem já registrada.

Editar/publicar o diagnóstico e vincular planos não registra contato com o cliente
nem reinicia o relógio de progresso de planos já existentes. A execução continua
pelas tarefas, evidências e revisões do módulo de planos.

## Permissões

| Ação | Administrador | Mentor | Mentorado |
|---|---|---|---|
| Gerenciar modelos | Organização | Consulta modelos | Sem acesso |
| Criar e editar diagnóstico | Organização | Carteira vigente | Sem acesso |
| Consultar rascunho/histórico da equipe | Organização | Carteira vigente | Nunca recebe |
| Publicar, arquivar ou reativar | Organização | Carteira vigente | Sem acesso |
| Consultar versões publicadas | Organização | Carteira vigente | Empresa autorizada |
| Vincular ou gerar plano | Mesma contratação | Mesma contratação da carteira | Consulta vínculo publicado |

A atribuição atual, incluindo coberturas válidas, é verificada em cada requisição.
Autoria antiga e participação anterior não concedem acesso após a substituição do
mentor. As mesmas regras valem para versões, vínculos, planos e notificações.

## Limites

Avaliação e evidências são manuais. O link de evidência não é baixado pelo servidor.
Cada diagnóstico aceita até 80 achados e 64 KiB de conteúdo JSON; avaliações muito
longas devem ser resumidas ou separadas em diagnósticos distintos.
Arquivos continuam nos atendimentos e tarefas; não há anexos próprios de diagnóstico
neste bloco. Indicadores numéricos, importação e diagnóstico comercial têm módulos
separados previstos no plano do produto.

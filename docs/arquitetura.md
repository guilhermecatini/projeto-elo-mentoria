# Arquitetura e decisões

## Escopo desta entrega

Etapa 1: identidade, autorização, cadastro direto, carteira, atribuição de mentor,
atendimento interno, prazos persistidos, reconciliação de alertas e painéis.
Os blocos da etapa 2 acrescentam planos, tarefas, evidências, alertas, reuniões/atas
e diagnósticos técnicos versionados vinculados aos planos. Resultados mensais manuais,
metas e evolução usam avaliador comum no servidor. CSV tem prévia assinada sem gravação,
confirmação transacional e relatório persistido por linha. Chave da tentativa impede
duplicação em reenvios; relatórios e downloads reavaliam organização e carteira.
Anexos privados complementam mensagens e tarefas. Os módulos comercial, jornada,
materiais e relatórios acrescentam funil, diagnóstico comercial separado, contratos
e recebimentos explícitos, renovação em novo ciclo, satisfação, capacidade/ausências
e conteúdo privado versionado. Os contratos de integração e a configuração ficam
preparados para as contas oficiais; nenhum canal externo é apresentado como ativo
sem validação real. Resend foi escolhido como provedor de e-mail.
Nome provisório do produto: Elo Mentoria. Nenhum vínculo com Mercado Livre é afirmado.

## Estrutura

- `apps/api`: monólito NestJS em TypeScript; consultas e migrations com Knex.
- Módulo de planos/tarefas separado e avaliador comum de sinais para painel e worker.
- `apps/web`: React, Vite, Tailwind e componentes de interface baseados em shadcn/ui.
- Processo worker separado: BullMQ/Redis; reconciliação de dados persistidos em PostgreSQL.
- PostgreSQL com pgvector: fonte de verdade. Redis não é fonte de verdade dos prazos.
- `infra` e Compose: imagens, proxy e configuração operacional.
- `scripts`: instalação, reinício, atualização, backup e restauração Ubuntu.
- `docs`: decisões, contratos, regras, segurança e verificação.
- `tests`: testes de aceitação contra serviços reais.

O frontend só conversa com a API da mesma origem. O proxy encaminha `/api`;
PostgreSQL e Redis não são publicados em produção. O worker não possui porta pública.
Instantes ficam em UTC; calendários e exibição usam inicialmente America/Sao_Paulo.

## Hipóteses

Uma organização inicialmente, com identificador nos registros e escopo em cada consulta.
Cada acesso é reavaliado no banco: a perda de atribuição retira o acesso na próxima requisição.
Coberturas são permissões temporárias, avaliadas pela vigência, sem substituir autoria.
Não há autosserviço multitenant, cobrança ou sincronização externa nesta etapa.
Anexos usam rotas autenticadas com autorização por recurso e visibilidade da mensagem.
O volume de arquivos não é servido pelo proxy. Canais de eventos continuam pendentes.

## Compatibilidade

Node 24 é uma linha LTS com suporte previsto até abril de 2028. O ambiente local tem
24.18.0. NestJS 11 exige Node 20 ou posterior; Vite exige pelo menos Node 20.19/22.12.
As versões exatas efetivamente instaladas ficam nos manifests e no `package-lock.json`.
As imagens usadas pelo Compose são fixadas separadamente. Não trocar automaticamente
de versão major em produção.

Fontes consultadas em 30/10/2026:

- https://github.com/nodejs/Release/blob/main/README.md
- https://docs.nestjs.com/migration-guide
- https://vite.dev/guide/
- Registro npm: versões, engines e resolução efetiva do lockfile.

## Implantação

Um único servidor com volumes persistentes. Atualizações podem causar indisponibilidade.
Backup antecede migration. Rollback de imagem não desfaz automaticamente mudanças de
schema. Testar restauração antes da adoção em produção e manter cópia fora do servidor.

Git foi apenas inicializado a pedido do usuário. Não há commits, branches adicionais,
remotos, pull requests ou automação de publicação configurados nesta entrega.

# Elo Mentoria

Plataforma independente para a operação de mentoria de vendedores do Mercado Livre.
Carteira, atendimento interno, diagnósticos, planos, tarefas, anexos privados, reuniões,
atas, indicadores manuais, metas e evolução mensal. Inclui CRM, diagnóstico comercial,
financeiro da mentoria, jornada/renovação, satisfação, capacidade/ausências,
materiais privados e relatórios gerenciais. Integrações externas têm configuração e
contratos preparados, com ativação condicionada às contas oficiais.
Não representa vínculo ou certificação do Mercado Livre.

## Abrir a instalação local

Endereço: **http://localhost:18088** quando o Compose de desenvolvimento estiver ativo.
Os dados de demonstração são registros reais no PostgreSQL, exclusivos do desenvolvimento.

| Perfil | E-mail |
|---|---|
| Administração | admin@demo.local |
| Mentor | mentor@demo.local |
| Mentorado | mentorado@demo.local |

A senha desses acessos é o valor `DEMO_PASSWORD` do `.env` local. Não usar essas contas
em produção. O seed recusa `NODE_ENV=production` e preserva dados ao ser repetido.

## Iniciar em outra máquina

Requisitos: Docker Engine/Desktop com Compose ≥2.24.4 (`!override`) e Git somente
para obter os arquivos. Node 24 LTS e npm são necessários apenas para desenvolver
fora dos containers. As dependências têm versões fixas e `package-lock.json`.

1. Copie `.env.example` para `.env`.
2. Defina senhas aleatórias independentes para banco e Redis e `SESSION_SECRET` longo.
   Para desenvolvimento: `NODE_ENV=development`, `APP_ORIGIN=http://localhost:18088`,
   `SITE_ADDRESS=:80`, `DEMO_PASSWORD` de ao menos 12 caracteres.
3. Execute:

```sh
docker compose -f compose.yml -f compose.dev.yml build
docker compose -f compose.yml -f compose.dev.yml up -d --wait db redis
docker compose -f compose.yml -f compose.dev.yml run --rm migrate
docker compose -f compose.yml -f compose.dev.yml run --rm migrate node apps/api/dist/cli.js seed
docker compose -f compose.yml -f compose.dev.yml up -d api worker frontend
```

O seed é opcional. Em uma instalação sem demonstração, use o bootstrap descrito em
`infra/OPERATIONS.md`. Não remova volumes para atualizar ou reiniciar.

## Desenvolver com recarga local

Mantenha banco e Redis do Compose nas portas 55432 e 56379. Não execute API local e
API Docker simultaneamente na porta 3333. Pare apenas `api worker frontend` deste
projeto antes de trocar para desenvolvimento fora dos containers.

```sh
npm ci
npm run db:migrate
npm run db:seed
npm run dev:api
# Em outro terminal:
npm run dev:worker
# Em outro terminal:
npm run dev:web
```

Acesse http://localhost:5173. O helper carrega `.env`, monta conexões locais e ajusta
a origem para o Vite. Senhas não são impressas. Não use esse helper em produção.

## Verificar

```sh
npm run build
npm test
npm audit
# Com banco/Redis locais ativos: teste isolado de MFA e sessões
npm run test:security
npm run test:plans
npm run test:attachments
npm run test:meetings
npm run test:diagnostics
npm run test:indicators
npm run test:indicator-imports
npm run test:commercial
npm run test:journey
npm run test:materials
npm run test:reports
npm run test:integrations
```

Aceitação real usa banco isolado `elo_acceptance`, API na porta 3334 e Redis DB1.
O runner prepara migrations/seed, inicia a API e a encerra ao terminar. Os testes de
planos usam `elo_planscheck`, porta 3336 e Redis DB3; segurança usa `elo_authcheck`,
porta 3335 e Redis DB2. Banco e Redis locais devem estar ativos. Execute na raiz:
Os testes de anexos usam `elo_filescheck`, API 3337, Redis DB4 e diretório de arquivos
isolado; conferem uploads, downloads e recuperação sem escrever nos dados da aplicação.
Reuniões usam `elo_meetingscheck`, API 3338, Redis DB5 e diretório isolado;
verificam presença, atas privadas/publicadas, conversão e alertas após reinício.
Diagnósticos usam `elo_diagnosticscheck`, API 3339 e Redis DB6; verificam modelos,
rascunhos, versões publicadas e vínculos com planos, respeitando os três perfis.
Indicadores usam `elo_indicatorscheck`, API 3340 e Redis DB7; verificam cálculos,
metas, versões e prévia CSV sem gravação. Regras em `docs/indicadores-manuais.md`.
Importação em lote usa `elo_importscheck`, API 3341 e Redis DB8; verifica confirmação,
duplicidades, relatório, concorrência e privacidade. Regras em `docs/importacao-csv.md`.
Comercial usa `elo_commercialcheck`/3342/DB9; jornada `elo_journeycheck`/3343/DB10;
materiais `elo_materialscheck`/3344/DB11; relatórios `elo_reportscheck`/3345/DB12;
contratos de integração `elo_integrationscheck`/3346/DB13. Os transportes externos
nos testes são simulados e identificados como tal; não representam contas conectadas.

```sh
npm run test:acceptance
npm run test:plans
```

O banco de teste é preservado para inspeção; não há limpeza destrutiva automática.
O teste cria registros identificados como aceite e reavalia autorização no banco.
Veja `docs/verificacao.md` para o que foi efetivamente executado nesta entrega.

## Produção e recuperação

Leia [operação e scripts](infra/OPERATIONS.md) antes de executar a instalação em Ubuntu.
Os scripts incluem instalação, reinício, atualização, backup e restauração isolada.
Somente o proxy publica portas em produção. HTTPS exige domínio, DNS e emissão válida.
Atualização em servidor único pode interromper atendimento; backup de banco e anexos
não substitui a cópia segura e separada dos segredos.

## Documentação

- [Arquitetura](docs/arquitetura.md) e [plano de etapas](docs/plano.md).
- [Modelo de dados](docs/modelo-dados.md) e [permissões](docs/permissoes.md).
- [Estados e prazos](docs/atendimento.md), [API](docs/api.md) e [indicadores](docs/indicadores.md).
- [Planos, tarefas, evidências e regras de alertas](docs/planos-e-tarefas.md).
- [Anexos privados, limites e recuperação](docs/anexos-privados.md).
- [Reuniões e atas](docs/reunioes-e-atas.md) e [diagnósticos técnicos](docs/diagnosticos-tecnicos.md).
- [Indicadores manuais, metas e evolução mensal](docs/indicadores-manuais.md).
- [Importação CSV em lote, confirmação e relatório de erros](docs/importacao-csv.md).
- [Comercial e financeiro](docs/comercial.md), [jornada e relacionamento](docs/jornada-relacionamento.md).
- [Materiais privados](docs/materiais-privados.md) e [relatórios gerenciais](docs/relatorios-gerenciais.md).
- [Integrações oficiais e Resend](docs/integracoes.md).
- [Verificações e limitações](docs/verificacao.md).

A ativação de Mercado Livre, WhatsApp Business e Resend depende das contas e credenciais
externas, ainda não configuradas. A busca de materiais é textual e autorizada;
pgvector está habilitado, sem IA ou vetores artificiais. A aplicação funciona sem
chave de IA ou conta de integração.

O Git local foi apenas inicializado. Não foram criados commits, remotos, branches
adicionais ou pull requests. O script de atualização contém o procedimento futuro
solicitado, mas nenhuma atualização pelo Git foi executada nesta entrega.

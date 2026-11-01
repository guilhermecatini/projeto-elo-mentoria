# Plano de implementação

## Etapa 1 — operação e atendimento

Fluxo conectado: entrar → ver carteira autorizada → cadastrar cliente/matrícula →
atribuir mentor → abrir dúvida → responder dúvida específica → prometer retorno →
resolver/reabrir → acompanhar exceções. Alertas precisam sobreviver a reinícios.
Verificar com PostgreSQL e Redis reais, os três perfis e inspeção no navegador.

## Etapa 2 — jornada e dados

Planos, tarefas, anexos privados, reuniões/atas e diagnósticos técnicos implementados nos primeiros blocos
desta etapa; regras em `planos-e-tarefas.md`, `anexos-privados.md` e
`reunioes-e-atas.md` e `diagnosticos-tecnicos.md`. Indicadores manuais, metas mensais e
evolução estão implementados em `indicadores-manuais.md`; o CSV tem modelo, prévia,
confirmação em lote e relatório por linha em `importacao-csv.md`. Relatórios operacionais
com períodos equivalentes, amostras, fila atual e exportação autorizada estão em
`relatorios-gerenciais.md`.

Diagnósticos técnicos editáveis; objetivos e planos; tarefas com evidência e critérios;
reuniões com ata e conversão de decisões em tarefas; preenchimento manual de indicadores;
importação CSV com prévia, duplicidade e relatório de erros; exportações autorizadas.
Diagnóstico comercial é entidade distinta do diagnóstico técnico, no módulo comercial.

## Etapa 3 — comercial e relacionamento

Implementados: CRM lista/Kanban com histórico de etapas; ganho transacional idempotente, cadastro ou
vínculo do cliente e criação de matrícula; renovação em um novo ciclo; capacidade,
ausências, satisfação, intervenções administrativas e materiais privados. Contratos e
recebimentos da empresa de mentoria exigem registros próprios; não são deduzidos de
indicadores das lojas nem tratados automaticamente como recorrência. Regras em
`comercial.md`, `jornada-relacionamento.md` e `materiais-privados.md`.

## Etapa 4 — integrações e recuperação textual

Contratos de adaptadores para Mercado Livre OAuth, WhatsApp Business e Resend, escolhido
pelo usuário para e-mail; preparação de caixa de entrada/saída com deduplicação,
estados, erros e configuração sem segredos na interface. Ativação externa depende das
contas oficiais, credenciais, domínio público e validação dos recursos disponíveis.
Credenciais de terceiros são pré-requisito. Não existe integração simulada apresentada
como real. Nenhuma dependência em WhatsApp pessoal ou grupos existentes.

Documentos e trechos possuem organização, cliente/matrícula, visibilidade, origem,
versão, hash, data e metadados de embedding. pgvector fica habilitado, mas embeddings
e dimensão não são inventados. A autorização deve anteceder a busca; exclusões e
mudança de fonte invalidam vetores. IA não decide cumprimento de prazos nem calcula
relatórios numéricos. Conteúdo recuperado é dado, nunca instrução de sistema.

## Portões de entrega

1. Build e testes de calendário/transições/autorização.
2. Migrations, seed exclusivamente de desenvolvimento e API com serviços reais.
3. Fluxos de administrador, mentor e mentorado no navegador.
4. Compose e verificações de saúde; backup e restauração em destino isolado.
5. Registro explícito dos testes executados e limitações em `verificacao.md`.

Não considerar a plataforma completa ou pronta para produção apenas porque a etapa 1
inicia. Os requisitos avançados de segurança, operação e as etapas seguintes precisam
passar pelos respectivos portões antes da adoção com dados reais.

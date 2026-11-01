# Preparação das integrações oficiais

A plataforma funciona sem contas externas. Este bloco entrega configurações, contratos de adaptadores, persistência e ensaios isolados para Mercado Livre, WhatsApp Business e Resend. **Não há conta conectada, webhook público, envio automático ou sincronização externa ativada.** Nenhuma mensagem real foi enviada na implementação. Credenciais e confirmação das permissões da aplicação são pré-requisitos para a ativação futura.

## Interface e permissões

`#/integrations` é exclusivo da administração. `GET /api/integrations` mostra os três provedores, preferência da empresa, requisitos preparados, próximos passos, falhas seguras e datas de operações reais quando existirem. `PATCH /api/integrations/:provider/preferences` aceita somente `{expectedVersion,enabled}`. O campo representa interesse em ativar e não autoriza um envio, não valida credenciais e não muda a conexão para “conectada”. Concorrência utiliza versão; mentores e mentorados recebem 403.

As capacidades retornadas permanecem `publicWebhooks:false`, `automaticSending:false` e `automaticSynchronization:false`. Mesmo com variáveis preenchidas, o estado é configuração pendente, preferência desativada ou aguardando validação. Um registro efetivamente verificado pode aparecer como validação concluída com ativação ainda pendente. Ausência de sincronização é exibida como nenhum registro. Falhas mostram mensagem controlada, nunca resposta bruta do provedor.

## Configuração somente no servidor

Não cole chaves, senhas ou tokens nos formulários da plataforma. O operador configura variáveis no servidor, protege o arquivo de ambiente e reinicia os processos. Não inclua segredos em URLs, comandos compartilhados, logs ou capturas.

| Variável | Finalidade |
| --- | --- |
| `INTEGRATION_ORGANIZATION_ID` | Organização que pode utilizar as credenciais do ambiente; impede herança por outra organização. |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET` | Aplicativo oficial do Mercado Livre. |
| `ML_REDIRECT_URI` | Endereço HTTPS estático, correspondente ao cadastrado no aplicativo. Ainda não há callback público habilitado. |
| `WHATSAPP_ACCESS_TOKEN` | Credencial oficial da conta comercial. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | Número e conta comercial autorizados. |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Verificação das notificações e do futuro endereço de recepção. |
| `WHATSAPP_API_VERSION` | Versão suportada da API, a conferir antes da ativação; nenhuma versão corrente é presumida. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Credencial e endereço remetente autorizado. |
| `RESEND_WEBHOOK_SECRET` | Segredo de assinatura do endpoint Resend, quando cadastrado. |
| `SESSION_SECRET` | Chave da aplicação já obrigatória em produção; também deriva uma chave separada para cifrar segredos dos provedores. |

Nenhum valor dessas variáveis aparece na API de consulta. Ela informa apenas requisitos em linguagem humana e presença da configuração vinculada à organização. Presença não significa credencial válida, domínio verificado ou recurso permitido.

## Mercado Livre

O contrato de autorização usa o host oficial brasileiro, `state` aleatório e PKCE com S256. O endereço de retorno deve coincidir com o aplicativo. O adaptador troca código em `https://api.mercadolibre.com/oauth/token` e utiliza o prazo retornado pelo provedor. A documentação informa renovação com refresh token de uso único, substituído a cada renovação; não se reutiliza um refresh token consumido. A consulta oficial foi confirmada por conteúdo indexado; a abertura direta da página retornou 403 neste ambiente. [Autenticação e autorização oficial](https://developers.mercadolivre.com.br/autenticacao-e-autorizacao).

`beginMercadoLivreAuthorization` e `consumeMercadoLivreAuthorization` são contratos internos, não rotas disponíveis: persistem hash do state, autor, organização, conexão, endereço de retorno e verificador cifrado. O state expira em dez minutos e é usado uma vez. `rotateMercadoLivreCredentials` bloqueia a conexão e exige a geração esperada antes de chamar o adaptador; duas renovações simultâneas não reutilizam o mesmo token. A nova credencial é cifrada com AES-256-GCM e vínculo à organização/conexão. Falha que deixa a rotação incerta exige nova autorização; não há repetição cega.

Antes de habilitar: confirmar conta principal autorizadora, permissões, recursos disponíveis, métricas efetivamente acessíveis, retorno OAuth, revogação e tratamento de notificações. Autorização de API não representa certificação ou vínculo comercial com o Mercado Livre. Nenhuma métrica financeira de loja é sincronizada nesta entrega. [Orientações oficiais sobre autorização e state](https://developers.mercadolivre.com.br/en_us/android/authentication-and-authorization), [notificações oficiais](https://developers.mercadolivre.com.br/pt_br/produto-consulta-de-usuarios/produto-receba-notificacoes).

As preferências são registradas por organização e provedor, separadas das autorizações das lojas. A migration 014 associa cada conexão do Mercado Livre a uma conta de marketplace explícita, com FK composta por organização e conta e unicidade por provedor/conta. Cada conta pode ter seu próprio token, geração de renovação e state; a cifra é vinculada à conexão. Os contratos OAuth e refresh rejeitam o registro genérico de preferências. A API `/integrations` consulta e altera somente registros sem conta e não agrega nem revela dados das conexões das lojas. Não existe cadastro público de autorização de vendedores nesta preparação, e os indicadores manuais/CSV permanecem independentes dessas autorizações.

## WhatsApp Business Platform

O contrato do adaptador utiliza exclusivamente `graph.facebook.com`, número comercial, versão explicitamente configurada e modelo de mensagem. A assinatura de recebimento é verificada sobre os bytes originais com HMAC-SHA256; payload alterado não é aceito pelo verificador. Esse contrato foi testado com transporte e assinaturas locais, sem conta real. A documentação da Meta retornou 429 ou não pôde ser aberta neste ambiente; versão, elegibilidade, modelos, custos, permissões, comportamento dos eventos e suporte a grupos devem ser reconfirmados na documentação oficial e na conta antes de ativar. [Cloud API oficial](https://developers.facebook.com/docs/whatsapp/cloud-api/), [webhooks oficiais](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/).

Não há automação de WhatsApp pessoal, leitura de grupos existentes ou mecanismo não oficial. Uma ativação precisa de consentimento aplicável, número autorizado, ensaio de mensagens permitidas e confirmação da origem dos eventos antes de qualquer processamento. O `verify_token` de inscrição e a assinatura HMAC do corpo são controles distintos. Nenhum endpoint público de recepção foi habilitado.

## Resend

O adaptador prepara `POST https://api.resend.com/emails` com remetente autorizado, destinatários, assunto e texto. Usa `Idempotency-Key` estável para a mesma tentativa, sem repetição automática. A janela de idempotência informada pelo Resend é de 24 horas; tentativas ambíguas após essa janela exigem reconciliação, não reenvio automático. Configurar uma chave não verifica o domínio nem autoriza envio real. [Enviar e-mail](https://resend.com/docs/api-reference/emails/send-email), [idempotência](https://resend.com/changelog/idempotency-keys).

O verificador mantém o corpo original e verifica os cabeçalhos `svix-id`, `svix-timestamp` e `svix-signature`. A implementação manual segue o contrato oficial Svix: concatenação id/timestamp/corpo, HMAC-SHA256 com segredo decodificado, comparação em tempo constante e tolerância de cinco minutos. Duplicatas continuam sendo deduplicadas pela persistência, pois uma assinatura válida não implica evento inédito. [Verificação Resend](https://resend.com/docs/webhooks/verify-webhooks-requests), [especificação manual Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual).

## Persistência, falhas e limites

Migration 013 cria `integration_connections`, `integration_oauth_states`, `integration_inbox`, `integration_event_cursors` e `integration_outbox`, sempre com organização e relacionamentos compostos. Migration 014 adiciona `marketplace_account_id` opcional à conexão e separa os índices de preferências sem conta e de autorizações por conta. Registros existentes não são reatribuídos automaticamente. Não há dados externos de demonstração apresentados como reais.

`persistVerifiedProviderEvent` é uma fronteira interna: seu chamador deve validar assinatura, parsear o corpo autenticado, conferir conta/provedor e produzir identificador, recurso e instante confiáveis **antes** de chamá-la. Não é um endpoint de webhook. A função exige conexão verificada, habilitada e não revogada; deduplica identificador externo, rejeita conteúdo divergente e preserva eventos estritamente anteriores ao último instante como `ignored_out_of_order`. Esses eventos permanecem disponíveis para reconciliação futura, sem regredir o estado. IDs distintos com o mesmo timestamp permanecem pendentes; a deduplicação depende do identificador externo, não do instante. O cursor atual registra apenas o evento recebido mais recente, não um evento aplicado ao domínio. Na ativação futura, aplicação do evento e avanço do cursor de processamento precisam ocorrer na mesma transação com as alterações do domínio. Eventos aceitos ficam `pending`, sem cumprir SLA, marcar acompanhamento ou alterar mensagens automaticamente.

`prepareProviderOutbox` persiste uma intenção cifrada e idempotente em `prepared`. Não existe consumidor automático ou rota de envio. Antes de ligar um consumidor será necessário conferir autorização explícita, destinatário, opt-out, janela de envio, templates, limite do provedor, ambiguidade de tentativas e reconciliação de entrega. Payloads persistidos são limitados a 64 KiB e cifrados; a interface mostra somente contagens e datas, não corpos ou tokens.

Adaptadores têm timeout de dez segundos, proíbem redirecionamento e utilizam hosts HTTPS fixos. Respostas têm limite de 64 KiB. Erros são reduzidos a códigos controlados, sem conteúdo bruto ou credenciais; `Retry-After` é interpretado e limitado a uma hora. Informar espera não agenda tentativa. Revogação, erro de autorização e resultado de transporte incerto não são tratados como sucesso.

## Verificação e ativação posterior

`provider-adapters.test.ts` testa PKCE, cifragem, hosts, timeout configurado, respostas limitadas, erros redigidos, idempotência Resend e verificadores de assinatura com respostas locais. `tests/integrations-acceptance.mjs` usa API 3346, banco `elo_integrationscheck` e Redis 13 para verificar perfis, organização, preferência concorrente, state de uso único, rotação serial, inbox, outbox e ausência de rotas públicas. Nenhum teste envia conteúdo ao provedor.

A ativação externa permanece uma etapa de implantação: fornecer e validar contas reais, conferir a documentação vigente, definir destinatários de teste autorizados, implementar os callbacks/consumidores específicos e executar ensaio de ponta a ponta autorizado. A preparação atual não deve ser anunciada como canal em produção.

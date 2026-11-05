# Matriz de acesso e segurança

| Recurso | Administrador | Mentor | Mentorado |
|---|---|---|---|
| Perfil, foto e dados de acesso | Somente próprios; mudanças de acesso exigem reautenticação | Somente próprios; mesmas verificações | Somente próprios; mesmas verificações |
| Carteira e painel | Organização inteira | Atribuições vigentes | Empresas autorizadas |
| Cadastro de clientes e atribuições | Gerencia | Consulta sua carteira | Consulta própria empresa |
| Atendimento público | Intervém | Atende sua carteira | Abre e acompanha próprios assuntos |
| Notas internas | Consulta/escreve | Consulta/escreve na carteira | Nunca recebe |
| Resolução e espera pelo cliente | Gerencia | Gerencia sua carteira | Pode reabrir |
| Exportação da carteira | Organização | Somente carteira vigente | Somente escopo autorizado |
| Notificações | Próprias notificações | Próprias notificações | Próprias notificações |
| Planos e tarefas | Gerencia na organização | Gerencia na carteira vigente | Consulta empresas autorizadas |
| Execução de tarefa | Gerencia/revisa | Executa/revisa na carteira | Executa somente as próprias |
| Aprovação e reabertura | Revisa com justificativa | Revisa com justificativa | Entrega para revisão |
| Download de anexos | Organização | Carteira vigente | Empresa autorizada, sem notas internas |
| Upload em mensagem própria | Atendimento aberto | Carteira vigente | Somente mensagem pública própria |
| Upload em tarefa | Tarefa editável | Carteira vigente, tarefa editável | Somente própria tarefa editável |
| Reuniões e presença | Gerencia na organização | Gerencia na carteira vigente | Consulta empresa autorizada |
| Rascunho de ata e histórico | Consulta/edita | Consulta/edita na carteira | Nunca recebe |
| Ata publicada | Consulta/publica | Consulta/publica na carteira | Consulta última versão publicada |
| Converter decisão em tarefa | Plano ativo da mesma contratação | Plano ativo na carteira vigente | Consulta tarefa gerada |
| Modelos de diagnóstico técnico | Gerencia na organização | Consulta modelos | Sem acesso |
| Diagnósticos técnicos | Gerencia na organização | Gerencia na carteira vigente | Consulta versões publicadas |
| Rascunho e histórico do diagnóstico | Consulta/edita | Consulta/edita na carteira | Nunca recebe |
| Vincular diagnóstico a plano | Plano ativo da mesma contratação | Plano ativo da carteira | Consulta vínculo publicado |
| Indicadores mensais e metas | Gerencia na organização | Gerencia na carteira vigente | Consulta versões publicadas e metas |
| Rascunho/correção de indicadores | Consulta/edita | Consulta/edita na carteira | Nunca recebe |
| Modelo e prévia CSV de indicadores | Contratação autorizada | Carteira vigente | Sem acesso |
| Confirmar importação CSV | Contratação ativa da organização | Contratação ativa na carteira vigente | Sem acesso |
| Histórico/relatório/download do lote | Organização | Carteira vigente | Sem acesso |
| Relatórios operacionais e CSV | Organização | Carteira vigente; feedback compartilhado | Usa evolução individual |
| CRM e diagnóstico comercial | Gerencia na organização | Sem acesso | Sem acesso |
| Contratos e recebimentos da mentoria | Registros explícitos e estornos auditados | Sem acesso | Sem acesso |
| Checklist e revisões de ciclo | Gerencia | Gerencia na carteira | Consulta contexto compartilhado |
| Renovar, encerrar ou cancelar contratação | Cria novo ciclo; preserva histórico | Consulta ciclos autorizados | Consulta ciclos autorizados |
| Satisfação | Consulta organização | Somente avaliações compartilhadas da carteira | Responde/corrige as próprias |
| Capacidade e ausências | Define capacidade e aprova ausência | Consulta própria carga e solicita ausência | Sem acesso |
| Materiais e arquivos | Organização, inclusive privados administrativos | Equipe e carteira; sem privado administrativo | Somente publicações explicitamente indicadas |
| Busca de materiais | Organização | Escopo aplicado antes dos trechos | Escopo aplicado antes dos trechos |
| Configuração de integrações | Administração; segredos somente no servidor | Sem acesso | Sem acesso |
| Credenciais, convites | Administração | Própria identidade | Própria identidade |
| Condições comerciais e notas privadas administrativas | Reservadas | Não expostas | Não expostas |

Consultas sempre aplicam organização e escopo, inclusive detalhe por identificador e
exportação. Identificadores opacos não substituem autorização. O servidor consulta
vigência de atribuições a cada requisição; não armazena a carteira no cookie.
Retirar um mentor não apaga mensagens anteriores, atribuições ou autoria.

## Sessões

Senhas com Argon2id. Cookie HttpOnly, SameSite=Lax e Secure em produção. Token de
sessão opaco, somente hash persistido, expiração e revogação no logout. Escritas
autenticadas exigem X-CSRF-Token e verificação de origem quando enviada pelo navegador.
Os tokens de ativação são aleatórios, de uso único, armazenados por hash e expiram.
O primeiro administrador define sua senha; autenticação TOTP é exigida em produção.

## Arquivos, exportações e atualização

Anexos são baixados somente por rotas autenticadas; nenhum diretório de uploads é
publicado no proxy. Arquivos de notas internas herdam a privacidade da mensagem.
Permissões vigentes são reavaliadas também nos downloads. Tarefas entregues ou
encerradas congelam novos anexos. Regras em `anexos-privados.md`.
Não existe canal de eventos nesta etapa. CSV neutraliza fórmulas e respeita o mesmo
escopo da consulta. Atualização da interface é por novas consultas autenticadas.

## Retenção e privacidade

Política proposta, sujeita à aprovação da empresa antes do uso real: arquivar
contratações encerradas mantendo autoria e trilha operacional; definir um prazo
contratual para mensagens, anexos e backups; excluir sessões e tokens expirados em
rotina administrativa; anonimizar dados pessoais quando não houver justificativa
de retenção. Prazos legais não são presumidos pelo software.

Solicitação de titular: verificar identidade e escopo, produzir exportação autorizada,
avaliar retenções necessárias, executar anonimização/exclusão controlada e auditar o
atendimento. A automação desse procedimento fica pendente; não há promessa de LGPD
automática. Excluir fontes também deve excluir futuros trechos/embeddings.

Segredos não pertencem ao Git ou aos logs. Preservar SESSION_SECRET separadamente do
backup: ele protege segredos TOTP. A senha do banco de execução não permite criar
schema, extensão ou roles; migrations usam credencial administrativa separada.

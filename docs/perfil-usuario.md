# Perfil pessoal e dados de acesso

Todos os perfis acessam `#/profile` pelo menu **Meu perfil**, pelo nome no rodapé da
navegação ou pelo avatar do cabeçalho. A tela permite editar nome e telefone opcional,
adicionar/trocar/remover foto e alterar e-mail e senha. Os formulários permanecem
montados ao trocar de aba. Nome, foto e e-mail atualizam o contexto da pessoa conectada.

## Segurança e concorrência

As rotas operam exclusivamente sobre `req.user`, sem aceitar outro identificador,
papel, organização ou autorização no corpo. Dados pessoais usam `expectedVersion`;
edições administrativas de nome também incrementam essa versão. Foto possui versão
independente. Conflitos pedem recarga explícita em vez de substituir alterações.

Alterar e-mail ou senha exige a senha atual e TOTP quando a conta tem MFA ativo.
Há limite de tentativas por usuário. Senhas têm 12–128 caracteres; confirmação e
diferença da senha atual são verificadas no servidor. Espaços pertencem à senha e
são preservados também no login. A política de MFA permanece ativa após a mudança.

A mudança de acesso, a auditoria, a invalidação de links pendentes e a substituição
das sessões acontecem na mesma transação. O dispositivo atual recebe outro cookie
HttpOnly e CSRF; as outras sessões deixam de funcionar. A emissão de sessões no
login reavalia as credenciais sob bloqueio para impedir que uma verificação antiga
crie sessão válida após a troca. Ativação e MFA seguem a mesma ordem de bloqueio.
Auditoria não contém senha, hash, token, código TOTP ou bytes da foto.

O novo e-mail entra em vigor após a reautenticação. Esta versão não envia confirmação
automática por e-mail; o formulário e o manual orientam a conferir o endereço.

## Recorte e exibição de fotos

Antes de enviar, a pessoa ajusta a foto em um diálogo com arraste, zoom de 1× a
4×, reposicionamento por teclado, redefinição e prévia circular. “Usar este recorte”
prepara um WEBP quadrado local; “Salvar foto” confirma o envio. É possível reajustar
o recorte enquanto a seleção não foi salva. Cancelar preserva a seleção anterior.
O original fica apenas na memória do navegador e é liberado ao descartar/salvar.
A imagem quadrada enviada já contém o enquadramento escolhido; o servidor a
valida e regrava antes de persistir.

A foto acompanha a identidade nas mensagens públicas e internas autorizadas,
responsáveis, participantes, carteiras, mentores, administração e históricos.
Empresas mantêm sua identificação própria. Sem foto, ou se ela não puder ser
carregada, aparecem as iniciais. Seletores nativos preservam os nomes em texto.

## Armazenamento e acesso

Entradas: PNG, JPEG ou WEBP estático, até 2 MiB e 20 megapixels. A assinatura e o tipo
são conferidos antes da decodificação. Sharp decodifica, orienta, recorta e limita a
512 × 512, regravando em WEBP sem os metadados originais. Há limite de envios e de
processamentos simultâneos. A biblioteca está fixada em `sharp@0.35.5`; referências:
[construtor e limites](https://sharp.pixelplumbing.com/api-constructor/),
[saída e metadados](https://sharp.pixelplumbing.com/api-output/).

O original não é armazenado. O WEBP tem até 256 KiB e fica em `user_avatars`, com
vínculo composto de organização/pessoa e restrições no banco. O backup PostgreSQL já
inclui esse conteúdo. A própria conta usa `/api/profile/avatar`. As demais
identificações recebem `/api/people/:id/avatar` com assinatura vinculada à pessoa
que consulta, organização, papel, contexto autorizado e versão da foto. Conhecer
um UUID ou copiar a URL para outra conta não concede acesso. Cada leitura verifica
novamente a carteira/atendimento/material ou permissão administrativa; avaliações
revalidam também o compartilhamento. Apenas IDs e nomes de DTOs controlados pelo
servidor recebem URLs: rascunhos, conteúdo e detalhes livres da auditoria não são
interpretados como pessoas. As imagens usam `private, no-store`; não há endereço
público ou diretório de fotos. A remoção apaga a imagem atual e preserva o contador de versão e a auditoria.
As iniciais continuam como alternativa quando não existe foto.

## Rotas

| Método | Endereço | Operação |
|---|---|---|
| GET | `/api/profile` | Dados da própria pessoa, versão e situação do MFA |
| PATCH | `/api/profile` | Nome, telefone e versão esperada |
| POST | `/api/profile/email` | Reautenticação, novo e-mail e sessão renovada |
| POST | `/api/profile/password` | Senha atual/nova/confirmação e sessão renovada |
| POST | `/api/profile/avatar?expectedVersion=N` | Multipart `file` com foto |
| DELETE | `/api/profile/avatar?expectedVersion=N` | Remover foto própria |
| GET | `/api/profile/avatar` | WEBP privado da pessoa conectada |
| GET | `/api/people/:id/avatar` | WEBP de identidade autorizada, com contexto e assinatura |

## Verificação

`npm run test:profile` usa `elo_profilecheck`, API 3347 e Redis DB14. Não altera as
contas da instalação local. Verifica os três perfis, CSRF, origem, dados estritos,
concorrência, versões, validação/remoção de imagem, MFA, sessão atual, outros acessos,
links antigos e login com espaços significativos na senha. Testes unitários de
validação e imagem estão em `apps/api/test/profile.test.ts`.


`npm run test:avatars` usa `elo_avatarscheck`, API 3348 e Redis DB15 para verificar
fotos em mensagens, carteiras, tarefas, participantes e históricos, isolamento entre
contas/organizações, adulteração de URL, retirada de compartilhamento, visibilidade
de materiais, transferência de carteira, troca/remoção de foto e dados livres da
auditoria. A geometria do recorte é testada em `apps/web/test/photo-crop.test.ts`.

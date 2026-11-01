# Anexos privados de atendimentos e tarefas

## Vinculação e permissões

Cada arquivo pertence à organização e a um único recurso: uma mensagem de atendimento
ou uma tarefa. O navegador não escolhe a organização, o caminho físico ou a visibilidade.
O servidor deriva esses dados do recurso autorizado.

| Ação | Administrador | Mentor | Mentorado |
|---|---|---|---|
| Consultar/baixar anexos públicos do atendimento | Organização | Carteira vigente | Empresa autorizada |
| Consultar/baixar anexos de nota interna | Organização | Carteira vigente | Nunca |
| Anexar à mensagem | Própria mensagem no atendimento aberto | Própria mensagem na carteira | Própria mensagem pública |
| Consultar/baixar anexos da tarefa | Organização | Carteira vigente | Empresa autorizada |
| Anexar à tarefa em execução | Gerencia | Carteira vigente | Somente tarefa atribuída a si |
| Alterar arquivos após entrega/conclusão | Bloqueado | Bloqueado | Bloqueado |

Tarefa entregue para revisão, concluída ou cancelada não recebe novos arquivos. Para
corrigir a evidência, a equipe devolve ou reabre a tarefa com justificativa; os anexos
anteriores e sua autoria permanecem. Os arquivos não têm exclusão pelo produto nesta
versão. A futura política de retenção deve tratar remoção controlada, auditoria e
backups em conjunto.

A troca de mentor, fim de cobertura, desativação de sessão/usuário ou remoção da
autorização à empresa é reavaliada em cada consulta e download. Uma URL copiada não
concede acesso. Bytes já baixados ou enviados por uma transferência autorizada em
andamento não podem ser recolhidos remotamente.

## Envio e entrega

No atendimento, envie a mensagem ou nota antes de anexar o arquivo a ela. Isso garante
o vínculo e a visibilidade corretos. Arquivos de notas internas têm indicação visual
explícita. O mentorado não recebe seus nomes, metadados ou links.

Na tarefa, os arquivos complementam a descrição da evidência. Anexar não entrega nem
aprova a tarefa. O executor ainda descreve o que foi feito e envia para revisão; o
mentor registra a avaliação conforme o critério de conclusão.

Upload não cumpre prazo de resposta humana, não resolve atendimento e não atualiza
acompanhamento ou progresso do plano por si só.

## Tipos e limites

Formatos iniciais: PDF, PNG, JPEG, WebP, texto UTF-8 e CSV UTF-8. O servidor confere
extensão, tipo informado e assinatura/estrutura mínima ou validade de texto.
Arquivos vazios, executáveis, HTML, SVG, compactados e documentos Office não são
aceitos nesta versão. A lista é intencionalmente restrita.

Limite de 10 MiB por arquivo, um arquivo por requisição, 20 arquivos por atendimento
ou tarefa, 200 MiB por contexto e 2 GiB por organização. O servidor também limita
tentativas e uploads simultâneos. Quotas são verificadas com bloqueios de banco para
evitar ultrapassagem em envios concorrentes.
São permitidos até 60 envios por usuário por hora, um upload simultâneo por usuário
e quatro por organização. Repetir uma tentativa com a mesma chave de idempotência,
ou o mesmo conteúdo no mesmo contexto e autor, devolve o arquivo já pronto em vez
de criar outra cópia.

A validação de tipo não equivale a uma análise antimalware. Não há antivírus ou
garantia de ausência de conteúdo nocivo nesta entrega. A interface oferece download,
sem executar ou apresentar automaticamente conteúdo de PDF, texto ou imagem.

## Armazenamento e acesso

Metadados ficam no PostgreSQL: organização, contratação, mensagem/tarefa, visibilidade,
nome de exibição, tipo, tamanho, hash, autor, instante e estado de persistência.
Os bytes ficam no volume privado `uploads`, montado em `/app/uploads` para a API.
Em desenvolvimento fora do Docker, `UPLOAD_DIR` aponta para uma pasta local privada.

O nome original é somente um rótulo sanitizado; o nome de armazenamento é gerado pelo
servidor. O proxy não publica esse volume. Nenhum caminho físico ou segredo de sessão
é devolvido ao navegador. O download exige cookie de sessão e autorização atual e usa
`Content-Disposition: attachment`, `nosniff` e política sem cache.

Somente arquivos prontos no banco podem ser listados ou baixados. A escrita usa
temporário e mudança atômica de nome; falhas não tornam um arquivo parcial público.
A rotina de recuperação deve tratar somente temporários/persistências pendentes
expiradas conhecidos, preservando anexos prontos.
A reconciliação roda ao iniciar a API e a cada 15 minutos, tratando pendências com
mais de uma hora. Arquivos desconhecidos sem metadados são preservados para inspeção
operacional, sem exposição no produto. Arquivos prontos são verificados por tamanho
e SHA-256 antes do download; falhas de integridade não devolvem conteúdo.

## Backup e recuperação

Banco e volume privado devem ser copiados como uma unidade consistente. O script de
backup pausa API/worker, captura dump e arquivos, verifica os artefatos e retoma os
serviços anteriormente ativos. Restauração continua restrita a destino isolado novo.
O ensaio deve comparar metadados, hash e download autenticado de um anexo real.

Backups contêm dados pessoais e comerciais: preserve a cópia fora do servidor com
proteção apropriada. Guarde as chaves de aplicação separadamente. Não copie apenas
o banco nem apenas o diretório de arquivos para recuperar a operação.

## API

- `GET /tickets/:id/attachments`: anexos que o usuário pode consultar.
- `POST /tickets/:ticketId/messages/:messageId/attachments`: multipart, campo `file`.
- `GET /tasks/:id/attachments`: anexos da tarefa autorizada.
- `POST /tasks/:id/attachments`: multipart, campo `file`.
- `GET /attachments/:id/download`: download privado autenticado.

Escritas exigem `X-CSRF-Token`; o navegador define o cabeçalho multipart com o boundary.
A resposta contém somente metadados seguros e uma rota de download relativa à API.
Não há URL pública permanente, link assinado ou listagem geral de arquivos.

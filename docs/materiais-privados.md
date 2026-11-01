# Materiais privados e fontes para consulta

A biblioteca permite preparar orientação textual, indicação de uso, tags, um link HTTPS e um arquivo privado por versão. A interface fica em `#/materials`.

## Público e contratação

O destino e o público são definidos na criação e permanecem fixos para evitar que uma edição exponha versões antigas a outro público. Para mudar o público, crie outro material e revise o conteúdo antes de publicar.

- `admin_private`: somente administradores da organização, inclusive no histórico e na busca.
- `team`: administradores e mentores autorizados; sem contratação, funciona como biblioteca da equipe da organização.
- `shared`: exige contratação. Mentorado autorizado vê somente versões publicadas. Rascunhos, arquivos ainda não publicados e histórico de preparação permanecem privados da equipe.

Mentores são reavaliados a cada requisição, incluindo troca do responsável e expiração de cobertura. A retirada do vínculo do mentorado com a empresa revoga leitura e download. Contratação pausada permite leitura, mas impede alterações. Arquivamento preserva os arquivos e revisões para a equipe, retirando o material da busca e das consultas do cliente.

## Versões e arquivos

Salvar e anexar alteram o rascunho, com `expectedVersion` para evitar sobrescrita concorrente. Publicar produz uma revisão imutável; publicar o mesmo conteúdo novamente não duplica a revisão. O cliente pode consultar versões anteriores de materiais ainda disponíveis. A revisão pública permanece igual enquanto outro rascunho é preparado.

Os arquivos usam o diretório privado `UPLOAD_DIR/materials`, fora da raiz pública. São aceitos PDF, PNG, JPEG, WEBP, TXT e CSV, até 10 MiB, com validação de extensão, MIME e conteúdo. Essa validação não constitui antivírus. O download exige sessão e autorização atual, usa `attachment` e `private, no-store` e confere tamanho e SHA-256 antes de devolver bytes.

Limites: 20 arquivos e 200 MiB por material, 2 GiB por organização na biblioteca, 60 tentativas por usuário/hora, um envio simultâneo por usuário e quatro por organização. Versões anteriores contam na quota e não são apagadas automaticamente.

A gravação reserva metadados `pending`, sincroniza o arquivo e só então publica metadados `ready` e a nova referência do rascunho em transação. Falhas removem o arquivo incompleto e marcam a tentativa `failed`. Na inicialização e a cada 15 minutos, tentativas conhecidas `pending`/`failed` com mais de uma hora são reconciliadas. Arquivos `ready` e objetos desconhecidos são preservados. Backups devem continuar incluindo banco e o volume completo de uploads.

## Busca e preparação das fontes

A publicação divide o texto fornecido em fragmentos de até 1.200 caracteres Unicode, com sobreposição de 200. Cada fragmento registra organização, contratação, visibilidade, versão da fonte, posição, hash e data. A busca textual aplica as permissões no SQL antes de selecionar conteúdo ou trecho e consulta apenas a última versão publicada de materiais disponíveis.

Os campos `embedding`, `embedding_model` e `embedding_dimension` permanecem nulos. Não há chamadas a IA externa, geração de vetores ou leitura remota de URLs. O conteúdo de PDFs/imagens e outros arquivos não é extraído automaticamente; a busca usa título, indicação, tags e texto inserido pela equipe. Consultar um material não atualiza último contato, tarefas, metas ou progresso.

## API

| Método | Rota | Uso |
|---|---|---|
| GET / POST | `/api/materials` | Lista autorizada / criar rascunho |
| GET | `/api/materials/search?q=...&enrollmentId=...` | Buscar fontes publicadas |
| GET / PATCH | `/api/materials/:id` | Detalhe, `?version=N`, ou salvar conteúdo completo com `expectedVersion` |
| POST | `/api/materials/:id/publish` | Publicar com `expectedVersion` |
| POST | `/api/materials/:id/status` | Arquivar/reativar com versão esperada e motivo |
| POST | `/api/materials/:id/file` | Multipart `file`, cabeçalho `X-Material-Version` e CSRF |
| GET | `/api/materials/files/:id/download` | Download privado verificado |

A migração `012_materials.js` estende `documents` e `document_chunks`, preservando dados legados. Novas revisões ficam em `material_revisions`; arquivos, em `material_files`. Registros legados sem rascunho não entram na biblioteca até uma migração explícita.

## Verificação

`tests/materials-acceptance.mjs` usa banco `elo_materialscheck`, API 3344, Redis 11 e diretório de uploads isolado. Os cenários verificam três perfis, isolamento por organização/carteira, versões, busca, uploads, falha real de disco, integridade, pausa, arquivamento e revogação de acesso. O processo encerra a API e preserva os dados de teste. Testes unitários de conteúdo estão em `apps/api/test/materials.test.ts`.

# Relatório — F2 — API: modelo de dados e cadastro de documentos (parte servidor)

- **Data:** 2026-09-29
- **Agente / modelo:** agente-arquitetura-dados + agente-integridade-sincronizacao / Fable
- **Fatia:** F2 (parte servidor: `packages/compartilhado` e `apps/api`; `apps/web` ficou com outro agente)

## O que foi feito

**Compartilhado (`packages/compartilhado/src/documentos.ts`, exportado no `index.ts`)**
- `FASES`/`Fase`, `ROTULO_FASE` (Recebido, Em Revisão, Devolvido à Área, Em Aprovação, Aprovado, Cancelado).
- `STATUS_DOCUMENTO`/`StatusDocumento`: os 11 status com o texto exato do doc 02, seção 3.1, inclusive o 'Em Revisão' genérico (só para dados migrados). `FASE_DO_STATUS` gravado explicitamente, sem heurística. `STATUS_INICIAL = 'Recebido'`. Extra: `ehStatusDocumento`.
- `TipoDocumento`, `Documento`, `TipoAcaoHistorico`, `EventoHistorico`, `NovoDocumento` com os nomes e campos combinados. Extras: `DetalheDocumento` (`{ documento, eventos }`, resposta de `GET /documentos/:id`) e `novoIdDocumento()` ('DOC-' + UUID, funciona no navegador e no Node).
- `LIMITES_ARQUIVO` (pdf, doc, docx, xls, xlsx, png, jpg, jpeg; 20 MB por arquivo; 100 MB no total; 20 anexos), `validarArquivo(nome, tamanhoBytes)` (extensão, arquivo vazio, 20 MB) e, como extras, `validarConjuntoArquivos(qtdAnexos, totalBytes)` e `extensaoArquivo(nome)`.
- `sanitizarNomePasta(titulo)`: troca `~ " # % & * : < > ? / \ { | }` por hífen, reduz espaços, apara as pontas, limita a 100 caracteres. Passa nos 3 casos do doc 03, seção 7.
- `pessoas.ts`: `Acao` ganhou `'cadastrarDocumento'`; `pode(pessoa, acao, contexto?: { areaId?: string })` (tipo `ContextoPermissao`). Regras: cadastrar = Administrador e Qualidade em qualquer área, Solicitante **só com `contexto.areaId` igual à sua área** (sem contexto → não), Leitor nunca; `verDocumentos` = todos com acesso, Solicitante só da sua área quando há contexto. As chamadas antigas (`pode(eu, 'gerenciarPessoas')`) continuam iguais. `CodigoErroApi` ganhou `codigo_revisao_existente` e `id_existente`.

**Banco — migração `0002_documentos.sql`** (plano de volta no topo)
- `tipos_documento` (`TIPO-uuid`, nome único, ativo) com os 8 tipos, inclusive "Memorial Descritivo" (P-10: lista única).
- `documentos`: todos os campos de `Documento`; `id` 'DOC-…' PK; `status` com CHECK nos 11 valores; `versao` ≥ 1; FKs para tipo, área, usuário e documento de origem; **índice único `(lower(codigo), revisao)` quando há código** (decisão 0004, sem diferenciar maiúsculas); `hash_cadastro` (resumo SHA-256 do pedido, para a idempotência).
- `eventos_historico` (`HIST-uuid`, `ordem` sequencial, `detalhes` JSONB, `autor_id` + `autor_nome` como era no momento), **imutável**: gatilho recusa UPDATE, DELETE e TRUNCATE (função nova e genérica `impedir_alteracao_registro_imutavel`, já que a 0001 não pode ser editada).
- `arquivos_documento` (`ARQ-uuid`, papel 'principal'|'anexo', nome original, nome armazenado, tamanho, tipo MIME, criado_em); um único principal por documento (índice parcial).

**Armazenamento de arquivos (`apps/api/src/armazenamento/arquivos.ts`)**
- Interface `ArmazenamentoArquivos { salvar(idDocumento, arquivos); remover(idDocumento, nomes); ler(idDocumento, nome) }`, com `salvar` tudo-ou-nada.
- `ArmazenamentoLocal` em `ARMAZENAMENTO_PASTA` (relativa à raiz; padrão `./armazenamento-local`, já no `.gitignore`): pasta por **ID** do documento (P-07), principal na raiz, anexos em `Anexos/`; grava em temporário ao lado e renomeia; nomes sanitizados (`sanitizarNomeArquivo`: sem pastas, sem caracteres inválidos/de controle, sem nomes reservados do Windows, até 120 caracteres), nomes repetidos ganham " (2)"; dupla proteção contra path traversal (formato do ID + caminho resolvido tem de ficar dentro da pasta).
- `ArmazenamentoEmMemoria` para testes, com falha simulável.

**Rotas (sem prefixo, no escopo autenticado)**

| Rota | Quem | Resposta |
|---|---|---|
| `GET /tipos-documento` | autenticado | `TipoDocumento[]` ativos, ordem alfabética pt-BR |
| `POST /documentos` (multipart: `dados`, `arquivoPrincipal`, `anexos`) | `pode(eu,'cadastrarDocumento',{areaId})` | 201 `Documento`; 200 `Documento` no reenvio igual; 400 `dados_invalidos` com `campos`; 403 `sem_permissao`; 409 `codigo_revisao_existente` / `id_existente`; 500 `erro_interno` se o disco falhar |
| `GET /documentos/recentes` | `verDocumentos` | até 10 `Documento`, mais recentes primeiro (Solicitante: só da sua área) |
| `GET /documentos/:id` | `verDocumentos` | `{ documento, eventos }`; 404 `nao_encontrado` se não existe **ou** se a pessoa não pode ver |

Detalhes do `POST /documentos`:
- `@fastify/multipart` (10.1.2). Pré-checagem de permissão **antes** de receber os arquivos (Leitor e sem perfil param ali, sem subir 100 MB).
- Esquema fechado com mensagens pt-BR por campo, inclusive `arquivoPrincipal` (P-02: ausente, mais de um, formato, tamanho) e `anexos` (formato e tamanho com o nome do arquivo, mais de 20, total acima de 100 MB). `status` no corpo é recusado com mensagem própria (P-03); o status gravado é sempre `Recebido`.
- Tipo e área precisam existir e estar ativos. `remetente` vem do formulário (editável, doc 03); o autor do evento vem sempre do token.
- **Idempotência:** mesmo `id` + mesmo autor + mesmo resumo do pedido (dados normalizados + papel, nome e conteúdo de cada arquivo) → 200 com o documento existente, sem novo evento nem novos arquivos. Qualquer diferença → 409 `id_existente`. O resumo fica gravado, então continua valendo depois de edições futuras do documento.
- **Uma transação:** documento → arquivos (linhas) → evento CRIACAO → gravação no disco como último passo. Disco falhou → o banco é desfeito e `salvar` apaga o que gravou; falha depois do disco (ex.: COMMIT) → a rota apaga os arquivos. Corrida por violação de unicidade (PostgreSQL com várias conexões) é tratada decidindo de novo.
- `criadoEm` e `dataModificacao` pelo servidor; `nomePasta = sanitizarNomePasta(titulo)` só para exibição; `versao = 1`.
- Visibilidade derivada da própria `pode` (sem regra de perfil repetida na rota), com conferência final por documento.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `packages/compartilhado/src/documentos.ts` | Novo: domínio de documentos, limites de arquivo, `sanitizarNomePasta` |
| `packages/compartilhado/src/documentos.test.ts` | Novo: status/fases, sanitização (3 casos do doc 03), arquivos |
| `packages/compartilhado/src/pessoas.ts` | `cadastrarDocumento`, `pode` com contexto, novos códigos de erro |
| `packages/compartilhado/src/pessoas.test.ts` | Linha nova na tabela + testes com contexto de área |
| `packages/compartilhado/src/index.ts` | Exporta o módulo de documentos |
| `apps/api/migracoes/0002_documentos.sql` | Nova migração |
| `apps/api/src/armazenamento/arquivos.ts` (+ `.test.ts`) | Novo: interface, implementação local e em memória |
| `apps/api/src/banco/documentos.ts` | Novo: acesso a tipos, documentos, arquivos e eventos |
| `apps/api/src/rotas/documentos.ts` | Novo: rotas da F2 |
| `apps/api/src/documentos.test.ts` | Novo: 27 testes de API |
| `apps/api/src/validacao.ts` | `validarNovoDocumento`, `ehDataSoDia` |
| `apps/api/src/app.ts`, `servidor.ts`, `config.ts` | Registro do multipart, das rotas e do armazenamento (`ARMAZENAMENTO_PASTA`) |
| `apps/api/src/apoio-testes.ts` | Armazenamento em memória no ambiente e `enviarFormulario` (multipart montado à mão) |
| `apps/api/package.json`, `package-lock.json` | Dependência `@fastify/multipart` |
| `CLAUDE.md` (seção 7), `CHANGELOG.md` | IDs novos, convenções de documentos/arquivos, `pode` com contexto |

## O que ficou pendente

- **Arquivos ficam na memória durante o envio** (até ~100 MB por requisição) e o disco é gravado dentro da transação; com PGlite (uma conexão) isso segura outras gravações enquanto os arquivos são escritos. Aceitável no ambiente local; antes de uso real, gravar primeiro em pasta temporária por streaming.
- Só a **extensão** é conferida; não há checagem do conteúdo (assinatura do arquivo) nem antivírus.
- Não há rota para baixar/listar arquivos do documento (fica para a F4, detalhes).
- `idDocumentoOrigem` existe no banco, mas o cadastro de revisão vinculada (P-06, "selecionar o documento a revisar") não está no contrato desta fatia: `NovoDocumento` não aceita o campo.
- Arquivos órfãos no disco só surgem se o processo cair entre gravar e confirmar; o reenvio com o mesmo ID sobrescreve. Não há varredura de órfãos.
- `dataRevisao` anterior a `dataRecebimento` é aceita (a especificação não proíbe); ver decisões abaixo.

## Como validar

1. Na raiz: `npm run typecheck`, `npm test` (165 testes, todos passando), `npm run build`, `npm run segredos`. Rodei os quatro com sucesso em 2026-09-29, já com o código em paralelo de `apps/web`.
2. `npm run dev`, entrar como Administrador e cadastrar um documento pela tela Novo documento (agente da interface). Conferir `armazenamento-local/DOC-<id>/` com o principal na raiz e os anexos em `Anexos/`.
3. Reenviar o mesmo cadastro (ex.: repetir a requisição nas ferramentas do navegador): resposta 200, sem segundo evento.
4. Entrar como Leitor: o cadastro é recusado (403). Como Solicitante: só na própria área; `GET /api/documentos/recentes` mostra só documentos da área dele.
5. Tentar cadastrar código + revisão já existentes: 409 com mensagem.

## Decisões tomadas ou necessárias

- **Tomadas (dentro do que as decisões já dizem):** unicidade de código sem diferenciar maiúsculas (`IT-001` = `it-001`), para evitar quase-duplicatas; idempotência pelo resumo do pedido (inclui o conteúdo dos arquivos); `criadoPor` é o ID `USR-…` de quem cadastrou; o nome do autor fica gravado no evento como era no momento.
- **Contrato com a interface:** para o Solicitante, `pode(eu, 'cadastrarDocumento')` **sem contexto é falso**; a interface pergunta com `{ areaId: eu.areaId }`. Conferi que `apps/web/src/permissoes.ts` já faz isso.
- A pergunta sobre prazo anterior ao recebimento foi resolvida pela decisão 0010 (o prazo sai do cadastro; a API continua aceitando `dataRevisao` opcional, sem mudança).

## Ajuste posterior — decisão 0010, parte 2 (área do Administrador)

- `AREA_ADMINISTRADOR_INICIAL` (nome da área; padrão `Qualidade`; vazio ou placeholder também vira `Qualidade`) lida em `apps/api/src/config.ts` e incluída no `.env.example` e no `.env` local.
- No bootstrap (`apps/api/src/autenticacao/identificacao.ts`), na mesma transação da promoção a Administrador: se a pessoa não tem área, recebe a área configurada e a auditoria registra `area: null → <nome>` com autor `sistema`. Pré-cadastro que já tinha área mantém a sua.
- Área inexistente ou inativa: fica sem área e a API registra aviso no log (`warn`); o acesso continua liberado (Administrador dispensa área).
- Só o bootstrap define a área: Administrador ativo já existente e sem área **não** é alterado no login (ajuste pela tela Pessoas).
- Arquivos: `config.ts`, `autenticacao/identificacao.ts`, `autenticacao/plugin.ts` (log do aviso), `banco/pessoas.ts` (`buscarAreaAtivaPorNome`), `apoio-testes.ts` (opção `areaAdministradorInicial`), `app.test.ts` (6 testes novos), `.env.example`.

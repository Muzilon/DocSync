# Relatório — F4 — API: detalhes, download, visualização com marca d'água e registro de acesso

- **Data:** 2026-09-29
- **Agente / modelo:** agente de arquitetura e dados / Fable
- **Fatia:** F4 (parte servidor), contrato [f4-detalhes-historico.md](../contratos/f4-detalhes-historico.md) (seções 7 e 9) e decisão [0013](../decisoes/0013-visualizador-marca-dagua-e-registro-de-acesso.md)

## O que foi feito

**`packages/compartilhado` (entregue primeiro; marcador `.f4-tipos-prontos` criado e removido no fim)**

- `ArquivoDocumento` e `DetalheDocumento` estendido (`arquivos`, `eventos`, `hoje`).
- `TIPO_MIME_POR_EXTENSAO` (tabela fechada, cobre toda `LIMITES_ARQUIVO.extensoes`), `tipoMimePorExtensao`, `TIPO_MIME_GENERICO`, `ehPdf`, `formatarTamanho` (pt-BR, base 1024), `TEXTO_MARCA_DAGUA`, `PREFIXO_COPIA_NAO_CONTROLADA`.
- Tipos do registro de acesso: `TipoAcessoArquivo`, `RegistroAcessoArquivo` (`ACS-uuid`).
- `historico.ts` novo: `ROTULO_TIPO_ACAO`, `ROTULO_CAMPO_HISTORICO`, `descreverEvento`, `contarDevolucoes`, `formatarValorHistorico`, `rotuloCampoHistorico`, `DescricaoEvento`, `DiferencaExibida`.
- `pode`: ação `baixarArquivo` (Administrador, Qualidade e Leitor: sim; Solicitante: só da sua área). `CodigoErroApi`: `arquivo_indisponivel`.

**`apps/api`**

- Dependência nova: `pdf-lib` 1.17.1 (sem chamada externa).
- Migração `0004_registros_acesso_arquivos.sql`: tabela `registros_acesso_arquivos` (`ACS-uuid`, `ordem`, documento, arquivo, tipo VISUALIZACAO|DOWNLOAD, autor do token, `data_hora`), gatilhos que bloqueiam UPDATE, DELETE e TRUNCATE (reaproveita `impedir_alteracao_registro_imutavel` da 0002); plano de volta no topo.
- `banco/documentos.ts`: `listarArquivos` devolve `id` e `criadoEm` (principal primeiro, anexos em pt-BR), `paraArquivoDocumento` (tira `nomeArmazenado`/`idDocumento`; `tipoMime` nunca sai), `buscarArquivoDoDocumento(db, idDocumento, idArquivo)` (`WHERE id = $1 AND id_documento = $2`), `registrarAcessoArquivo`, `listarAcessosArquivos`.
- `armazenamento/download.ts`: `cabecalhosDownload(nomeOriginal, nomeArmazenado, tamanho, { disposicao, prefixo })` — tipo pela extensão do nome armazenado, `Content-Disposition` com `filename` ASCII e `filename*` UTF-8, `nosniff`, `private, no-store`, CSP `default-src 'none'; sandbox`.
- `armazenamento/marca-dagua.ts`: `aplicarMarcaDagua(bytes)` com pdf-lib — "CÓPIA NÃO CONTROLADA" em Helvetica-Bold (WinAnsi cobre Ó e Ã; confirmado em teste), diagonal ao longo da diagonal da página, ~70% dela, cinza, opacidade 0,4, em **todas** as páginas; devolve bytes novos, o original nunca muda. PDF cifrado, corrompido ou sem árvore de páginas → `ErroMarcaDagua`.
- `GET /documentos/:id`: resposta `DetalheDocumento` completa; query fechada (`?x=1` → 400 `dados_invalidos`).
- `GET /documentos/:id/arquivos/:arquivoId` (download) e `GET /documentos/:id/arquivos/:arquivoId/visualizacao` (inline): ordem de decisão do contrato 4.2 (403 → 404 documento/visibilidade → 403 `baixarArquivo` → 404 arquivo de outro documento → 404 `arquivo_indisponivel` sem conteúdo → 409 `arquivo_indisponivel` se a marca falhar → registro de acesso → 200). PDF sempre com marca; não PDF sem marca e com prefixo `COPIA-NAO-CONTROLADA_` no nome; visualização só de PDF (não PDF → 409 `acao_nao_permitida`). `ErroArmazenamento` (ex.: `nome_armazenado` adulterado) → 500 sem ler fora da pasta. Logs só com IDs.
- `apoio-testes.ts`: opção `logger` em `criarAmbiente` (para o teste "o log não contém o token").
- `migracao-0003.test.ts`: fixado em `aplicarMigracoes(banco, '0003')` (agora existe a 0004).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `packages/compartilhado/src/documentos.ts` | `ArquivoDocumento`, `DetalheDocumento` estendido, `TIPO_MIME_POR_EXTENSAO`, `tipoMimePorExtensao`, `ehPdf`, `formatarTamanho`, constantes da marca, tipos do registro de acesso |
| `packages/compartilhado/src/pessoas.ts` | ação `baixarArquivo`; código `arquivo_indisponivel` |
| `packages/compartilhado/src/historico.ts` (novo) | descrição de eventos e contagem de devoluções |
| `packages/compartilhado/src/index.ts` | exportações novas |
| `packages/compartilhado/src/{documentos,pessoas,historico}.test.ts` | testes da seção 6 do contrato |
| `apps/api/package.json` | `pdf-lib` |
| `apps/api/migracoes/0004_registros_acesso_arquivos.sql` (novo) | registro imutável de acesso |
| `apps/api/src/banco/documentos.ts` | arquivos por ID, registro de acesso |
| `apps/api/src/armazenamento/download.ts` (novo) | cabeçalhos da entrega |
| `apps/api/src/armazenamento/marca-dagua.ts` (novo) | marca d'água com pdf-lib |
| `apps/api/src/rotas/documentos.ts` | `GET /documentos/:id` estendido; rotas de download e visualização |
| `apps/api/src/validacao.ts` | `validarQueryVazia` |
| `apps/api/src/apoio-testes.ts` | opção `logger` |
| `apps/api/src/armazenamento/{download,marca-dagua}.test.ts`, `apps/api/src/arquivos.test.ts` (novos) | testes da tabela (seção 6) + marca + registro |
| `apps/api/src/migracao-0003.test.ts` | fixado na versão 0003 |
| `CHANGELOG.md`, `CLAUDE.md`, `docs/estado-atual.md` | registro da entrega |

## O que ficou pendente

- **Confirmar com o Eric (posição da marca):** a marca é desenhada por cima do conteúdo, semitransparente (opacidade 0,4), e não "atrás" no sentido literal. Motivo: pdf-lib não desenha sob o conteúdo existente sem reordenar fluxos, e, em página digitalizada (imagem que cobre a página inteira, comum no SGI), uma marca atrás ficaria invisível. Com 0,4 o texto da página continua legível. Se o Eric quiser atrás de verdade, é um ajuste pequeno em `marca-dagua.ts` (reordenar os fluxos de conteúdo), registrado como lacuna decidida pelo menor risco.
- Decisão 0013, item 5 ("a confirmar"): implementado como proposto (não PDF sem marca, prefixo `COPIA-NAO-CONTROLADA_`, download registrado).
- Tela de consulta dos registros de acesso (Administração/Auditoria): fatia futura; `listarAcessosArquivos` já existe no banco.
- Streaming do download e da marca (hoje o PDF fica em memória; limite de 20 MB por arquivo mantém aceitável); rota paginada de histórico para documentos importados (F12).
- Falhas na parte web (`apps/web/src/componentes/DetalhesDocumento.test.tsx`, 5 testes) pertencem ao agente de interface, que trabalha em paralelo; não são da API.

## Como validar

1. `npm run typecheck` (limpo nos três workspaces), `npm run segredos` (limpo), `npx vitest run --project @docsync/compartilhado --project @docsync/api` (compartilhado 111, API 168, todos passando).
2. Subir a API (`npm run dev`), cadastrar um documento com PDF principal e anexo XLSX; `GET /documentos/<id>` traz `arquivos` (principal primeiro, sem `nomeArmazenado`), `eventos` e `hoje`.
3. `GET /documentos/<id>/arquivos/<ARQ do PDF>` com token: abre com "CÓPIA NÃO CONTROLADA" em diagonal em todas as páginas; o arquivo em `ARMAZENAMENTO_PASTA/<id>/` continua idêntico ao enviado. O XLSX baixa como `COPIA-NAO-CONTROLADA_<nome>.xlsx`.
4. `SELECT tipo, autor_nome, data_hora FROM registros_acesso_arquivos` mostra uma linha por acesso; `UPDATE`/`DELETE` falham com "imutável".
5. Com um Solicitante de outra área, o download responde 404; com Leitor, 200.

## Decisões tomadas ou necessárias

- Lacunas decididas pelo menor risco (registrar ou reverter conforme o Eric): marca por cima com opacidade 0,4 (ver pendências); visualização de não PDF → 409 `acao_nao_permitida`; PDF baixado sem prefixo no nome (a marca já identifica a cópia); registro de acesso gravado só quando a entrega acontece (recusas 403/404/409 não geram registro); query fechada também nas rotas de arquivo.
- Nenhuma mudança de modelo de dados existente: a 0004 só cria a tabela nova prevista na decisão 0013.

## Correção pela decisão 0014 (2026-09-29)

A decisão [0014](../decisoes/0014-download-nome-e-versoes-de-arquivo.md) substituiu a 0013 (marca d'água e visualizador eram do repositório do Vigen, não da tramitação). A seção 10 do [contrato](../contratos/f4-detalhes-historico.md) prevalece sobre a 9. Aplicado só o que a decisão pede:

**Removido**

- `apps/api/src/armazenamento/marca-dagua.ts` e `marca-dagua.test.ts`; dependência `pdf-lib` (`apps/api/package.json` e `package-lock.json` via `npm install`, 5 pacotes a menos).
- Rota `GET /documentos/:id/arquivos/:arquivoId/visualizacao` e seus testes (agora responde 404 e não grava acesso; teste de regressão mantido).
- `TEXTO_MARCA_DAGUA` e `PREFIXO_COPIA_NAO_CONTROLADA` do compartilhado (sem uso restante). `ehPdf` ficou como utilitário puro.
- Opções `disposicao`/`prefixo` e `nomeDeDownload` de `download.ts`: `cabecalhosDownload(nome, nomeArmazenado, tamanho)` recebe o nome final e só o codifica (`filename` ASCII + `filename*` UTF-8, `nosniff`, `no-store`, CSP sandbox). O erro 409 `arquivo_indisponivel` (marca) deixou de existir; o 404 continua.
- A migração 0004 **não** foi editada: o tipo `VISUALIZACAO` fica previsto na tabela e sem uso.

**Alterado**

- `pode(..., 'baixarArquivo', ctx)`: Administrador e Qualidade sim; Solicitante só na sua área; **Leitor não** (tabela de testes em `pessoas.test.ts` atualizada). Na API o Leitor recebe 403 `sem_permissao` no download e continua vendo `GET /documentos/:id`; recusas não geram registro de acesso.
- Nome do download do arquivo **principal**: função pura `nomeDownloadPrincipal(documento, nomeArquivo, versao = 1)` em `packages/compartilhado/src/documentos.ts` → `${codigo ?? 'SEM-CODIGO'}-${titulo}_${revisao}=${versao}.${extensao}`. Título inteiro, só sem `\ / : * ? " < > |` e caracteres de controle (viram hífen), sem ponto/espaço nas pontas; extensão minúscula pelo nome armazenado; corte em 200 caracteres preservando código, sufixo e extensão (`TAMANHO_MAXIMO_NOME_DOWNLOAD`). Versão fixa em 1 (`VERSAO_ARQUIVO_INICIAL`) até a F7. Testes: exemplo da decisão, acentos, sem código, caracteres proibidos, título longo.
- **Anexos** baixam com o nome original (sanitizado só para segurança: sem pasta, sem controle, nome reservado do Windows com `_`), sem prefixo.
- Registro de acesso `DOWNLOAD` igual (autor do token, imutável).
- Interface (ajuste mínimo): `DetalhesDocumento.test.tsx` e `e2e/detalhes.spec.ts` passam a esperar o Leitor **sem** botões Baixar (a tela já usava `pode`, então nada mudou no componente); a vitrine simula o nome do principal com a mesma `nomeDownloadPrincipal`.
- `CLAUDE.md` (seção 7, item "Arquivos na entrega") e `docs/estado-atual.md` alinhados à 0014.

**Validação:** `npm run typecheck`, `npm test` (19 arquivos, 359 testes), `npm run build` e `npm run segredos` limpos. Manual: baixar o principal de um documento com código `PR-QUA-0010`, título `Procedimento de auditoria interna`, revisão 1 → `PR-QUA-0010-Procedimento de auditoria interna_1=1.pdf`, conteúdo idêntico ao enviado; anexo baixa com o nome original; com Leitor, sem botão Baixar e API 403.

**Pendências herdadas:** ver "O que ficou pendente" acima, exceto os itens da marca d'água (encerrados). Versionamento de arquivos (versão > 1 no nome) é da F7.

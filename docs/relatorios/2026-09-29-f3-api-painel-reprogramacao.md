# Relatório — F3 — API: prazo automático, reprogramação e leitura do Painel

- **Data:** 2026-09-29
- **Agente / modelo:** agente de arquitetura e dados / Fable
- **Fatia:** F3 (parte servidor, seção 7 do [contrato](../contratos/f3-painel-kanban.md))

## O que foi feito

**`packages/compartilhado` (etapa 1, entregue primeiro para a interface)**

- `documentos.ts`: `DIAS_PRAZO_PADRAO`, `somarDias`, `diferencaEmDias`, `calcularPrazoAutomatico`, `ehDataSoDia` (movida da API para ser a mesma regra nos dois lados); `NovoDocumento` sem `dataRecebimento` e sem `dataRevisao`; `Documento` com `reprogramado` e `qtdReprogramacoes`; `TipoAcaoHistorico` com `'REPROGRAMACAO'`; `NovaReprogramacao`, `ResultadoReprogramacao`, `LIMITES_JUSTIFICATIVA`, `validarJustificativa`, `validarNovoPrazo` (só adia: posterior ao prazo atual e não anterior a hoje), `lerReprogramacao`.
- `pessoas.ts`: ação `reprogramarPrazo` (Administrador e Qualidade); códigos `conflito_versao` e `acao_nao_permitida`; `ErroApi.documento?` para o 409 de versão.
- `painel.ts` (novo): `CartaoPainel`, `RespostaPainel`, `Kpis` (sem "Aprovados no mês"), `DIAS_JANELA_VENCENDO`, `calcularKpis`, `FiltroPainel`, `filtrarCartoes`, `normalizarBusca`, `TomPrazo`, `EtiquetaPrazo`, `etiquetaPrazo`, `formatarDataCurta`.
- Testes: 80 no pacote (tabela de `pode` com a linha nova, virada de mês/ano/29-02, limites da janela, textos singular/plural, busca sem acento, validações).

**`apps/api` (etapa 2)**

- Migração `0003_prazo_e_reprogramacao.sql` exatamente como no contrato (2.3), com o plano de volta no topo; a 0002 não foi tocada. `aplicarMigracoes` ganhou o parâmetro opcional `ateVersao` (só para o teste da migração preparar dados na 0002 antes de aplicar a 0003).
- `datas.ts`: `hojeNoFuso(agora?)` com fuso constante `America/Sao_Paulo` (não vai para o `.env`). Única fonte de "hoje" da API.
- Cadastro (`POST /documentos`): grava `data_recebimento = hojeNoFuso()` e `data_revisao = hoje + 30`; `dataRecebimento`/`dataRevisao` no corpo → 400 `Campo não permitido.`; evento `CRIACAO` com `detalhes: [{ campo: 'dataRevisao', antes: null, depois }]`; o resumo de idempotência não inclui o prazo.
- `GET /painel?busca&areaId&cancelados`: esquema fechado na query; `areaId` precisa existir (ativa ou não); visibilidade derivada de `pode` (`areaVisivel` + `podeVer` por cartão); busca e área aplicadas com o mesmo `filtrarCartoes` da interface; `qtdCancelados` já filtrado; `hoje` na resposta; ordem prazo crescente (nulos por último), cadastro, id. `qtdDevolucoes` e `dataAprovacao` vêm de subconsultas sobre `eventos_historico`.
- `POST /documentos/:id/reprogramacoes`: ordem de decisão do contrato (403 → 404 → 403 → 409 `acao_nao_permitida` → 400 → transação com `FOR UPDATE`); idempotência por versão + último evento; `409 conflito_versao` com o documento atual; grava prazo, `reprogramado`, contagem, versão + 1; evento `REPROGRAMACAO` com autor do token; 201 com `ResultadoReprogramacao`.
- Banco: `listarCartoes`, `buscarDocumentoParaAtualizar`, `aplicarReprogramacao` (UPDATE condicionado à versão), `ultimoEvento`, `buscarEvento`, `buscarArea`; `inserirDocumento` recebe as datas do servidor.
- Validação: `validarNovaReprogramacao` e `validarQueryPainel` em `validacao.ts`.
- Testes: `migracao-0003.test.ts`, `painel.test.ts`, `datas.test.ts`, ajustes em `documentos.test.ts`. `apps/api/vitest.config.ts` novo com `hookTimeout` maior (o clone do PGlite estourava os 10 s padrão quando os arquivos rodam em paralelo).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `packages/compartilhado/src/documentos.ts` | Prazo, datas só-dia, reprogramação, `Documento.reprogramado/qtdReprogramacoes`, `NovoDocumento` sem datas, tipo de evento |
| `packages/compartilhado/src/pessoas.ts` | Ação `reprogramarPrazo`, códigos de erro novos, `ErroApi.documento` |
| `packages/compartilhado/src/painel.ts` | Novo: contrato do painel e funções puras |
| `packages/compartilhado/src/index.ts` | Exportações novas |
| `packages/compartilhado/src/{documentos,pessoas}.test.ts`, `painel.test.ts` | Testes |
| `apps/api/migracoes/0003_prazo_e_reprogramacao.sql` | Nova migração |
| `apps/api/src/datas.ts`, `datas.test.ts` | `hojeNoFuso()` |
| `apps/api/src/banco/conexao.ts` | `aplicarMigracoes(banco, ateVersao?)` |
| `apps/api/src/banco/documentos.ts` | Cartões, reprogramação, eventos, datas do servidor no INSERT |
| `apps/api/src/banco/pessoas.ts` | `buscarArea` (ativa ou não) |
| `apps/api/src/validacao.ts` | Cadastro sem datas; reprogramação; query do painel; `ehDataSoDia` reexportada do compartilhado |
| `apps/api/src/rotas/documentos.ts` | Cadastro com prazo, `GET /painel`, `POST /documentos/:id/reprogramacoes` |
| `apps/api/src/documentos.test.ts`, `painel.test.ts`, `migracao-0003.test.ts` | Testes da tabela da seção 6 |
| `apps/api/vitest.config.ts` | Novo: tempo dos hooks |
| `CHANGELOG.md` | Linha da entrega |

## O que ficou pendente

- **Interface (`apps/web`)**: a cargo do agente de UX/UI. Ela precisa parar de enviar `dataRevisao`/`dataRecebimento` no cadastro (agora é 400) e consumir `GET /painel` e a rota de reprogramação.
- **CLAUDE.md**, seção 7 ("Documentos (F2)" e "Prazo"): registrar que `dataRecebimento` e `dataRevisao` são do servidor e que existe `hojeNoFuso()`, `GET /painel` e `POST /documentos/:id/reprogramacoes`. Deixei para o Claude principal (não altero o arquivo de regras por conta própria).
- **`docs/estado-atual.md`**: atualizar quando a fatia inteira (API + web + QA) fechar.
- Filtragem de busca/área em SQL quando a base crescer (hoje é em memória, como o contrato pede, para a interface e a F10 filtrarem igual).
- Verificação integrada API + web, `agente-qa-revisao`, capturas e roteiro para o Eric.

## Como validar

1. `npm run typecheck` (três workspaces sem erro), `npm test` (256 testes, 15 arquivos), `npm run segredos` (limpo). Feito em 2026-09-29.
2. Subir a API com um banco já na 0002 e conferir no log que a 0003 foi aplicada; `SELECT id, data_revisao FROM documentos` mostra prazo = cadastro + 30 nos documentos que não tinham; `SELECT * FROM migracao_0003_prazos` lista só esses.
3. `POST /documentos` (multipart) sem datas → 201 com `dataRecebimento` = hoje (São Paulo) e `dataRevisao` = hoje + 30; com `dataRevisao: null` → 400 `campos.dataRevisao = 'Campo não permitido.'`.
4. `GET /painel` como Administrador → `{ cartoes, qtdCancelados, hoje }`; `?ordem=x` → 400; como Solicitante com `?areaId=<outra>` → `cartoes: []`.
5. `POST /documentos/:id/reprogramacoes` com `{ novoPrazo, justificativa, versao }` → 201; repetir o mesmo corpo → 200 sem evento novo; com `versao` velha e corpo diferente → 409 `conflito_versao` com `documento`; em Aprovado/Cancelado → 409 `acao_nao_permitida`; Solicitante → 403 na própria área, 404 em área alheia.

## Decisões tomadas ou necessárias

Lacunas do contrato resolvidas pelo menor risco (nenhuma é decisão de negócio; ajusto se o Eric ou o Claude principal preferirem outra leitura):

1. **Idempotência antes da validação do corpo.** Como a reprogramação só adia, um reenvio idêntico (fila do cliente) reprovaria na regra "posterior ao prazo atual" se a validação viesse antes (ordem literal do contrato, 3.3, passos 5 e 6). A rota detecta o reenvio (versão = enviada + 1, último evento `REPROGRAMACAO` do mesmo autor com o mesmo prazo e justificativa) **antes** de validar e responde 200 com o estado atual; a conferência é repetida dentro da transação com a linha bloqueada. O mesmo corpo enviado por **outro** autor não é reenvio: cai na validação normal (400) e nada é gravado.
2. **`Documento` ganhou `reprogramado` e `qtdReprogramacoes`.** O contrato só os lista em `CartaoPainel`, mas a interface substitui o cartão pelo `documento` devolvido pela reprogramação (seção 5) e precisaria desses dois campos para a etiqueta "Reprogramado". São colunas criadas pela migração aprovada; a adição é só aditiva.
3. **`cancelados=true` devolve os cancelados junto com os demais** (superconjunto), e a interface lista só a fase `cancelado` na janela, como o contrato descreve em 5. `qtdCancelados` é sempre calculado, com ou sem o parâmetro.
4. **`dataAprovacao`** considera só eventos `STATUS` com status `Aprovado` (o dia da transição), e **`qtdDevolucoes`** conta eventos `STATUS`/`CANCELAMENTO` cujo status está na fase `devolvido` e cujo `statusAnterior` não está (mudança dentro da fase não conta). Dia no fuso de São Paulo.
5. **Mensagem por campo das datas recusadas no cadastro:** `Campo não permitido.` (esquema fechado genérico), como o contrato pede em 2.2.
6. `ehDataSoDia` saiu de `apps/api/src/validacao.ts` para `packages/compartilhado` (a API reexporta), para `validarNovoPrazo` valer igual nos dois lados.

# Relatório — F6 — Edição de dados (parte servidor)

- **Data:** 2026-09-29
- **Agente / modelo:** agente-arquitetura-dados / **Opus** (o Fable estava sem créditos; nota de processo do contrato, seção 9)
- **Fatia:** F6 ([contrato](../contratos/f6-edicao-de-dados.md), seção 9 prevalece)

## O que foi feito

1. **`packages/compartilhado`** (entregue primeiro; marcador `.f6-tipos-prontos` criado para a interface e apagado no fim):
   - `edicao.ts` (novo): `CAMPOS_EDITAVEIS`, `CampoEditavel`, `DadosDocumento`, `LIMITES_TEXTO_DOCUMENTO`, `REVISAO_MAXIMA`, `ValidacaoDados`, `validarDadosDocumento` (a única regra dos 8 campos: cadastro, edição e telas), `DetalheEdicao`, `diferencasDocumento` (ordem de `CAMPOS_EDITAVEIS`; tipo/área pelo ID, gravando o nome; revisão como texto; comparação exata), `podeEditarAgora` (= `emTramitacao`), `EdicaoDocumento`, `ResultadoEdicao`.
   - `documentos.ts`: `NovoDocumento` passa a ser `DadosDocumento + id` (mesmos campos).
   - `pessoas.ts`: ação `editarDados` (Administrador e Qualidade sim; Solicitante regra nova `daSuaAreaSeDevolvido`; Leitor não) e `ContextoPermissao.status`.
   - `historico.ts`: `resumoEdicao` ("Título alterado", "Título, Área e Disciplina alterados", "5 campos alterados: Título, Área, Disciplina e mais 2", sem detalhes → "Dados editados"), usado por `descreverEvento`. Teste da F4 que esperava "3 campos alterados" ajustado, como previsto no contrato.
2. **`apps/api`**:
   - `validacao.ts`: `validarNovoDocumento` = esquema fechado + `id` + `validarDadosDocumento` (mesmas mensagens; testes da F2 passam sem alteração); `validarEdicaoDocumento` = esquema fechado (`status` com "O status muda só por Atualizar etapa.") + `validarDadosDocumento` + `versao` ≥ 1.
   - `banco/documentos.ts`: `aplicarEdicao` (`UPDATE … WHERE id = $1 AND versao = $2`, só os 8 campos, `nome_pasta`, `versao`, `data_modificacao`) e `existeOutroComCodigoRevisao(codigo, revisao, excetoId)`.
   - `rotas/edicao.ts` (novo), registrado em `app.ts`: `PUT /documentos/:id/dados` na ordem 4.2 do contrato (403 → 404 → 403 por perfil/fase → 409 estado final salvo possível reenvio → 400 corpo → transação com `FOR UPDATE`: idempotência → `conflito_versao` → estado e perfil → tipo/área só quando mudam (e área nova com `pode`) → código+revisão só quando mudam → sem diferença 200 `evento: null` → gravação → evento `EDICAO`). Violação do índice `documentos_codigo_revisao` numa corrida → 409 `codigo_revisao_existente`.
   - `rotas/documentos.ts`: corpo do 409 de código+revisão exportado (`corpoErroCodigoRevisao`) para cadastro e edição usarem o mesmo.
   - `apoio-testes.ts`: `chamar` aceita `PUT`.
   - Nenhuma migração (seção 6). Nenhuma leitura nova (GET), então não houve HEAD a desligar; o teste confirma que `POST …/dados` e `PATCH /documentos/:id` não existem.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `packages/compartilhado/src/edicao.ts` | Novo: tipos e regras puras da edição |
| `packages/compartilhado/src/edicao.test.ts` | Novo: validação, diferenças, `podeEditarAgora` |
| `packages/compartilhado/src/documentos.ts` | `NovoDocumento` sobre `DadosDocumento` |
| `packages/compartilhado/src/pessoas.ts` / `pessoas.test.ts` | Ação `editarDados`, `ContextoPermissao.status`, linha na tabela e bloco próprio |
| `packages/compartilhado/src/historico.ts` / `historico.test.ts` | `resumoEdicao` e testes |
| `packages/compartilhado/src/index.ts` | Exportações novas |
| `apps/api/src/validacao.ts` | Cadastro sobre a função compartilhada; `validarEdicaoDocumento` |
| `apps/api/src/banco/documentos.ts` | `aplicarEdicao`, `existeOutroComCodigoRevisao` |
| `apps/api/src/rotas/edicao.ts` | Novo: rota `PUT /documentos/:id/dados` |
| `apps/api/src/rotas/documentos.ts` | `corpoErroCodigoRevisao` exportado |
| `apps/api/src/app.ts` | Registro da rota |
| `apps/api/src/apoio-testes.ts` | `PUT` em `chamar` |
| `apps/api/src/edicao.test.ts` | Novo: 27 testes da seção 7.1 (API) |
| `CLAUDE.md`, `CHANGELOG.md`, `docs/estado-atual.md` | Convenção, linha e estado |

## Lacunas resolvidas pelo menor risco (registradas)

- **Revisão ausente no cadastro:** antes, `revisao` ausente virava 0 na API; agora é obrigatória (tabela 2.1 do contrato: "obrigatório: sim"). A interface sempre envia o campo (padrão "0"), então nada muda para quem usa a tela. Mensagem única para qualquer revisão inválida ou ausente: "O número de revisão deve ser um inteiro de 0 a 999." (a da API hoje). **Atenção interface:** a tela Novo documento mostrava "Informe um número inteiro igual ou maior que 0."; ao passar a usar `validarDadosDocumento`, passa a mostrar a mensagem acima (nenhum teste da web conferia o texto antigo).
- **`DadosDocumento`** foi declarado como interface em `edicao.ts` (e `NovoDocumento extends DadosDocumento`), em vez de `Pick<NovoDocumento, …>`, para evitar tipo circular; forma idêntica à do contrato.
- **Recebido → sem permissão (403) com mensagem** só quando o motivo é a fase (Solicitante da área); Leitor recebe 403 sem mensagem.
- **Perfil conferido de novo dentro da transação**, sobre o documento bloqueado (além do passo 3), para o caso de o estado mudar entre a leitura e o bloqueio.
- **`buscarTipo`/`buscarArea` para nomes atuais** (contrato 7.2) não foram necessários: o nome atual vem do próprio documento (JOIN), e o novo de `buscarTipoAtivo`/`buscarAreaAtiva`.

## O que ficou pendente

- Parte interface (outro agente): no momento da verificação, `npm run typecheck` falha em `apps/web/e2e/vitrine/vitrine.tsx` (falta `editarDados` na API simulada da vitrine) e, na execução completa, 2 testes de `TelaNovoDocumento.test.tsx` estouraram o tempo de 5 s sob carga (o arquivo sozinho passa, 18/18). Nada disso vem da parte servidor.
- Chave de idempotência por evento gerada pelo cliente: F9 (como na F5).
- Travar código/revisão de documento que já tem revisão vinculada: F8.

## Como validar

1. `npm run typecheck -w @docsync/compartilhado` e `npm run typecheck -w @docsync/api`: sem erros.
2. `npx vitest run packages/compartilhado` (219 testes) e `npx vitest run apps/api/src/edicao.test.ts` (27 testes): verdes. `npm test` completo: só as 2 falhas de tempo da web acima.
3. `npm run segredos`: sem achados.
4. Roteiro manual (com a interface pronta): editar título e área → linha do tempo com "antes → depois"; apagar o remetente → 400; enviar `status` por fora da tela → 400 "O status muda só por Atualizar etapa."; duas abas → a segunda recebe `409 conflito_versao` com o documento atual.

## Decisões tomadas ou necessárias

Nenhuma decisão grande nova; tudo dentro do contrato aprovado. Nota de processo: implementado com Opus por falta de créditos do Fable.

## Correções pós-QA (2026-09-29, agente-visao-minimalista / Opus)

- **B1:** dois casos novos em `apps/api/src/documentos.test.ts` ("POST /documentos — cadastro"), sem mudar código da API: cadastro sem `revisao` → `400 dados_invalidos` com `campos` só em `revisao`; `revisao: "2"` (texto numérico, como o formulário envia) → `201` com `revisao: 2` (número) no documento gravado. Comportamento conferido antes: a API já aceitava "2" (contrato 2.1).
- Validação: `npx vitest run apps/api/src/documentos.test.ts` e `npm test` verdes.

## Ajuste da validação: reprogramar vencendo (2026-09-29, agente-arquitetura-dados)

Decisão [0015](../decisoes/0015-cartao-estilo-planner.md), atualização de 2026-09-29.

- **O que mudou:** `podeReprogramarAgora(documento, hoje)` aceita prazo vencido **ou vencendo** (`dataRevisao <= hoje + DIAS_JANELA_VENCENDO`, 5 dias, a mesma janela do KPI "Vencendo"). Mantido: documento sem prazo pode; Aprovado e Cancelado não. Com o prazo ainda no futuro, a regra "só adia" (`validarNovoPrazo`) volta a ter efeito: novo prazo igual ou anterior ao atual → 400 `dados_invalidos`.
- `DIAS_JANELA_VENCENDO` passou a ser definida em `documentos.ts` (para não criar importação circular com `painel.ts`); `painel.ts` a reexporta, e o `index.ts` continua exportando o mesmo nome. Valor inalterado (5).
- API: mensagem do 409 `acao_nao_permitida` agora é "O prazo (dd/mm/aaaa) ainda não está vencendo: só é possível reprogramar prazo vencido ou que vence em até 5 dias." (número vindo da constante). Posição na ordem de decisão inalterada (depois da idempotência e do conflito de versão).
- **Arquivos:** `packages/compartilhado/src/documentos.ts`, `packages/compartilhado/src/painel.ts`, `packages/compartilhado/src/documentos.test.ts`, `apps/api/src/rotas/documentos.ts`, `apps/api/src/painel.test.ts`, `apps/api/src/arquivos.test.ts` (só comentário).
- **Testes novos/ajustados:** puro: vencido, hoje, hoje+5 aceitam; hoje+6 recusa; com prazo vencendo, `validarNovoPrazo` recusa novo prazo igual ou anterior. API: hoje+30 e hoje+6 → 409 com a nova mensagem; hoje+5, hoje e ontem → 201; prazo em hoje+3 com novo prazo hoje+2 ou igual → 400 "só adia", hoje+4 → 201.
- **Web:** não alterada. Na primeira execução de `npm test`, 18 testes da web falharam por causa da edição em andamento do outro agente (rodapé do modal); na execução seguinte, com a edição dele concluída (os testes da web já esperam hoje+5 visível e hoje+6 oculto), a suíte inteira passou.
- **Validação:** `npm run typecheck` sem erros; `npm test` 26 arquivos, 572 testes verdes; `npm run segredos` sem achados.

# Relatório — F5 — API: mudança de status, cancelamento, reativação e responsável

- **Data:** 2026-09-29
- **Agente / modelo:** agente de arquitetura e dados / Fable
- **Fatia:** F5 (parte servidor), contrato [f5-mudanca-de-status.md](../contratos/f5-mudanca-de-status.md) (seções 2, 3, 5, 7, 8 e 9; a seção 11 prevalece) e decisões [0004](../decisoes/0004-revisoes-e-reativacao.md), [0011](../decisoes/0011-prazo-automatico-e-reprogramacao.md), [0012](../decisoes/0012-recebimento-automatico-e-metas-de-ciclo.md) e [0015](../decisoes/0015-cartao-estilo-planner.md)

## O que foi feito

**`packages/compartilhado` (entregue primeiro; marcador `.f5-tipos-prontos` criado quando compilou e passou, removido no fim)**

- `transicoes.ts` (novo): `DESTINOS_POR_FASE` (com os três atalhos mantidos pelo Eric), `destinosPermitidos`, `transicaoPermitida`, `podeSerCancelado`; `exigeResponsavel`, `sugerirResponsaveis`, `ehResponsavelSugerido`, `PERFIS_RESPONSAVEL`, `PessoaResumo`; `statusDeReativacao`, `ultimoCancelamento`, `STATUS_REATIVACAO_RESERVA`, `SUFIXO_REATIVACAO_RESERVA`; `AcaoStatus`, `acoesDeStatus` (máquina ∩ perfil), `ROTULO_TRANSICAO`, `ROTULO_TRANSICAO_SOLICITANTE`, `rotuloTransicao`, `ACAO_PRINCIPAL`, `acaoPrincipal` (a "principal" agora só marca o botão primário do modal: pela decisão 0015 o cartão não tem botão); `NovaTransicao`, `NovoCancelamento`, `NovaReativacao`, `ResultadoTransicao`, `LIMITES_OBSERVACAO`, `OBSERVACAO_CANCELAMENTO_DESFEITO`, `validarMotivoCancelamento`, `validarObservacao`, `normalizarObservacao`.
- `pessoas.ts`: `Acao` ganha `mudarStatus`, `cancelarDocumento`, `reativarDocumento`; `ContextoPermissao.transicao`; `TRANSICOES_SOLICITANTE` (fica aqui, e não em `transicoes.ts`, para evitar importação circular; `transicoes.ts` reexporta). Regra nova `daSuaAreaETransicaoPermitida`: Solicitante sem contexto ou na sua área → sim; com `transicao` → só se o par estiver na lista; Leitor não.
- `documentos.ts`: `Documento.responsavelId/responsavel`, `EventoHistorico.responsavelId`; `FUSO_SAO_PAULO`, `diaEmSaoPaulo(instante)`, `emTramitacao`, `podeReprogramarAgora(documento, hoje)` (decisão 0015: prazo anterior a hoje; "vence hoje" ainda não venceu; Aprovado/Cancelado nunca; sem prazo pode receber um).
- `metas.ts` (novo): `META_DIAS_INICIO_REVISAO` 14, `META_DIAS_CONCLUSAO` 40, `avaliarMetas(doc, hoje)` (textos prontos e tom; Cancelado → não se aplica; Aprovado sem revisão → início não se aplica), `concluidoNaMeta`.
- `painel.ts`: `CartaoPainel` + `dataInicioRevisao`, `responsavelId`, `responsavel`, `statusAntesDoCancelamento`; `Kpis` + `aprovadosNoMes`, `aprovadosNoMesNaMeta` (cartões Aprovados com `dataAprovacao` no mês/ano de `hoje`); `filtrarCartoes` busca também no responsável; `iniciais(nome)` para o círculo do cartão (decisão 0015).
- `historico.ts`: `dataInicioRevisao(eventos)`, `dataAprovacao(eventos)` (mesma regra do SQL, dia de São Paulo); `rotuloObservacao = 'Motivo'` em CANCELAMENTO.
- `index.ts`: tudo exportado. Testes: `transicoes.test.ts` (matriz 11×11 transcrita à mão + gerada de `DESTINOS_POR_FASE`, ações por perfil, sugestão de responsáveis, reativação, validações), `metas.test.ts`, e linhas novas em `pessoas.test.ts`, `painel.test.ts`, `historico.test.ts`, `documentos.test.ts`.

**`apps/api`**

- Migração `0005_responsavel.sql`: `documentos.responsavel_id` e `eventos_historico.responsavel_id` (FK para `usuarios`), índice `eventos_historico_documento_tipo_status`; plano de volta no topo; nada a preencher.
- `banco/documentos.ts`: `SELECT_DOCUMENTO` com `LEFT JOIN usuarios` (nome atual do responsável); `aplicarTransicao`, `aplicarCancelamento`, `aplicarReativacao` (todos `UPDATE … WHERE versao = $n`; só `status`, `responsavel_id`, `versao`, `data_modificacao` mudam — P-14); `registrarEvento`/`listarEventos` com `responsavelId`; `listarCartoes` com `data_inicio_revisao` (min de STATUS em fase revisao), responsável e `status_antes_do_cancelamento` (último CANCELAMENTO, só quando Cancelado).
- `banco/pessoas.ts`: `ehResponsavelElegivel` (usa `acessoLiberado` + `PERFIS_RESPONSAVEL`), `paraPessoaResumo`, `listarResponsaveis`, `buscarResponsavelElegivel`.
- `datas.ts`: `hojeNoFuso` passa a delegar a `diaEmSaoPaulo` (uma conversão só).
- `validacao.ts`: `validarNovaTransicao` (esquema fechado; `para` ≠ 'Em Revisão'/'Cancelado'; responsável obrigatório/proibido conforme destino; `USR-uuid`; observação ≤ 500 aparada), `validarNovoCancelamento`, `validarNovaReativacao`.
- `rotas/transicoes.ts` (novo, registrado em `app.ts`): `POST /documentos/:id/transicoes`, `/cancelamentos`, `/reativacoes` na ordem de decisão do contrato; idempotência por versão + último evento do mesmo autor (transição: mesmo `para`, `responsavelId` e observação, e não reativação; cancelamento: mesmo motivo; reativação: último STATUS com `statusAnterior = 'Cancelado'` e mesma observação sem o sufixo); 409 `conflito_versao` com `documento` e mensagem com o status atual; máquina → 409 `acao_nao_permitida` com mensagem; perfil da transição → 403 com mensagem; responsável não elegível → 400 por campo; eventos STATUS/CANCELAMENTO com autor do token e responsável (id + nome no momento). Reativação usa `statusDeReativacao` sobre `listarEventos` (mesma função da interface); reserva 'Recebido' com sufixo na observação.
- `rotas/pessoas.ts`: `GET /responsaveis` (preHandler `exigir('mudarStatus')`, HEAD desligado, query fechada, sem e-mail).
- `rotas/documentos.ts`: reprogramação recusa prazo não vencido com 409 `acao_nao_permitida` (decisão 0015), **dentro da transação, depois da idempotência e do conflito de versão** (o reenvio de uma reprogramação já aplicada encontra o prazo no futuro e ainda responde 200); eventos CRIACAO/REPROGRAMACAO gravam `responsavelId: null`.
- Testes: `transicoes.test.ts` (26 casos da tabela da seção 8: rotas, permissões por perfil e área, idempotência, conflito, responsável elegível, imutabilidade, `GET /responsaveis`, painel e detalhes com os campos novos, nome atual × nome histórico, regressão de cadastro/download, fluxo completo com Solicitante e conferência das funções puras contra o SQL), `migracao-0005.test.ts`; `painel.test.ts` (F3) ajustado à regra de prazo vencido (`cadastrarVencido`/`vencerPrazo`; caso B1 refeito; teste novo para "hoje ainda não venceu" e "sem prazo"); `arquivos.test.ts` (F4) vence o prazo antes de reprogramar.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `packages/compartilhado/src/transicoes.ts` (novo) | máquina de estados, ações, responsável, reativação, corpos das rotas |
| `packages/compartilhado/src/metas.ts` (novo) | metas de 14/40 dias |
| `packages/compartilhado/src/pessoas.ts` | ações novas, `contexto.transicao`, `TRANSICOES_SOLICITANTE` |
| `packages/compartilhado/src/documentos.ts` | responsável em `Documento`/`EventoHistorico`, `diaEmSaoPaulo`, `emTramitacao`, `podeReprogramarAgora` |
| `packages/compartilhado/src/painel.ts` | `CartaoPainel` e `Kpis` estendidos, busca por responsável, `iniciais` |
| `packages/compartilhado/src/historico.ts` | `dataInicioRevisao`, `dataAprovacao`, rótulo "Motivo" |
| `packages/compartilhado/src/index.ts` | exportações |
| `packages/compartilhado/src/{transicoes,metas}.test.ts` (novos), `{pessoas,painel,historico,documentos}.test.ts` | testes |
| `apps/api/migracoes/0005_responsavel.sql` (novo) | responsável pela etapa |
| `apps/api/src/banco/documentos.ts` | transições, cancelamento, reativação, cartões e eventos com responsável |
| `apps/api/src/banco/pessoas.ts` | responsáveis elegíveis |
| `apps/api/src/datas.ts` | delega a `diaEmSaoPaulo` |
| `apps/api/src/validacao.ts` | três corpos fechados |
| `apps/api/src/rotas/transicoes.ts` (novo) | as três rotas |
| `apps/api/src/rotas/pessoas.ts` | `GET /responsaveis` |
| `apps/api/src/rotas/documentos.ts` | prazo vencido na reprogramação; `responsavelId` nos eventos |
| `apps/api/src/app.ts` | registra as rotas novas |
| `apps/api/src/{transicoes,migracao-0005}.test.ts` (novos), `painel.test.ts`, `arquivos.test.ts` | testes |
| `docs/contratos/f5-mudanca-de-status.md` | nota de implementação em 3.2 (estado × reenvio) |
| `CLAUDE.md`, `CHANGELOG.md`, `docs/estado-atual.md` | regras, linha datada, pendências |

## O que ficou pendente

- **Interface (`apps/web`, outro agente):** `npm run typecheck` da web falha até ela absorver `Documento.responsavelId/responsavel` nas fixtures (`TelaNovoDocumento.test.tsx`) e completar o tipo `Api` com `mudarStatus`/`cancelarDocumento`/`reativarDocumento` (`TelaPessoas.test.tsx`, `TelaNovoDocumento.test.tsx`). Nenhuma falha é do compartilhado ou da API.
- **Lacunas decididas pelo menor risco (registrar ou reverter conforme o Eric):**
  1. Documento em tramitação **sem prazo** (só importados; a migração 0003 preencheu todos os existentes) pode ser reprogramado mesmo sem prazo vencido: não há prazo a esperar vencer e é a única forma de ele ganhar um. Mudar é uma linha em `podeReprogramarAgora`.
  2. A checagem de estado final antes do corpo é pulada quando o pedido pode ser reenvio (nota no contrato, 3.2). Sem isso o duplo clique em "Aprovar"/"Cancelar" e o "Desfazer" repetido dariam 409 em vez de 200.
  3. `statusDeReativacao` trata `statusAnterior` = 'Cancelado' ou 'Aprovado' (dado corrompido) como reserva 'Recebido', além de nulo/ausente.
  4. A busca do Painel procura também no responsável (proposta da seção 4, não vetada na 11); a interface deve trocar o rótulo do campo de busca.
  5. `EventoHistorico` ganhou `responsavelId` (o contrato só cita a coluna); a idempotência da transição precisa dele.
- Regra "só adia" (decisão 0012) ficou inalcançável pela API depois da 0015 (anotado em `estado-atual.md`).
- F9: chave de idempotência por evento gerada pelo cliente (contrato 3.6; anotado em `estado-atual.md`).
- `descreverEvento` não muda para STATUS/CANCELAMENTO além do rótulo "Motivo": "De X para Y", "Cancelado (estava em X)" e o responsável já saíam certos (testes acrescentados).

## Como validar

1. `npm run typecheck -w @docsync/compartilhado -w @docsync/api` (verde) e `npm test` (23 arquivos, 490 testes verdes; os testes da web passam, só o typecheck dela pende).
2. `npm run segredos` (limpo).
3. Com a API de pé, forçando o corpo por fora da tela (critério do plano):
   - `POST /documentos/:id/transicoes` com `{ "para": "Aprovado", "responsavelId": null, "observacao": null, "versao": 1 }` num documento Recebido → `409 acao_nao_permitida` "Não é possível ir de Recebido para Aprovado.".
   - Mesmo corpo com `"autorId"` → `400 dados_invalidos` `campos.autorId`.
   - Solicitante da área em Devolvido: `{ "para": "Em revisão da qualidade", "responsavelId": "<USR da Qualidade>", ... }` → 201; `{ "para": "Em revisão junto à área", ... }` → 403 "Seu perfil não pode aplicar esta etapa."; documento de outra área → 404.
   - Repetir o mesmo `POST` → 200 com o mesmo `evento.id`; enviar de novo com `versao` velha e outro destino → `409 conflito_versao` com `documento`.
   - `POST .../cancelamentos` com motivo de 10–500 → 201 (`responsavelId` mantido); `POST .../reativacoes` com `{ "observacao": "Cancelamento desfeito.", "versao": <devolvida> }` → 201 e volta ao status anterior.
   - `POST .../reprogramacoes` num documento com prazo no futuro → `409 acao_nao_permitida` "ainda não venceu"; `UPDATE documentos SET data_revisao = '2026-01-01'` e repetir → 201.
   - `GET /responsaveis` como Leitor → 403; como Qualidade → lista sem `email`.
   - `GET /painel`: cartão com `responsavel`, `dataInicioRevisao`, `statusAntesDoCancelamento` (com `?cancelados=true`).

## Decisões tomadas ou necessárias

- Nenhuma decisão de negócio nova; as lacunas acima foram fechadas pelo menor risco e estão listadas para o Eric confirmar ou reverter. A contradição interna do contrato (passo 4 × 6.1) virou nota de implementação no próprio contrato.

# Relatório — F5 — Interface da mudança de status (cartão Planner, ações nos detalhes)

- **Data:** 2026-09-29
- **Agente / modelo:** agente-ux-ui (acumulando agente-visao-minimalista) / Opus
- **Fatia:** F5

## O que foi feito

Parte interface da F5, só em `apps/web`, pelo contrato [f5-mudanca-de-status.md](../contratos/f5-mudanca-de-status.md) (seções 11 e 12 prevalecem) e a decisão [0015](../decisoes/0015-cartao-estilo-planner.md).

- **Cartão no estilo do Planner, sem botões.** Etiquetas no topo (status; "Reprogramado" quando houver), título, área e rodapé com o prazo curto ("10/09") e o responsável (iniciais em círculo, nome como texto acessível; nada quando não há). Prazo neutro em dia, laranja vencendo (hoje até 5 dias), vermelho vencido; cor nunca sozinha: ícone diferente por estado e texto acessível "Vence em N dias, prazo dd/mm/aaaa" / "Atrasado há N dias, …" (também no `title`). O estado vem de `etiquetaPrazo` (a mesma regra dos KPIs). Código, revisão, remetente, devoluções e "Recebido em" saíram do cartão. O único controle é o título (botão), e clique, Enter ou Espaço abrem os detalhes. O Reprogramar saiu do cartão.
- **Colunas com rolagem vertical própria.** A coluna tem altura máxima pela janela (`--kanban-coluna-altura-max`) e a lista rola por dentro. A rolagem horizontal interna do quadro continua.
- **Modal de detalhes: rodapé de ações**, sempre por `acoesDeStatus`/`pode` (via `permissoes.ts`), sem nenhum botão desabilitado de enfeite. São até 3 ações rápidas (a principal primeiro, estilo primário), "Atualizar etapa…", Cancelar (perigo), Reativar, Reprogramar (só com prazo vencido, por `podeReprogramarAgora`) e Fechar. Leitor, Solicitante de outra área e Aprovado ficam só com Fechar.
  - **`DialogoAtualizarEtapa`** (empilhado): Etapa (opções de `acoesDeStatus`), Responsável (`GET /responsaveis`, grupos "Sugeridos"/"Outras pessoas" por `sugerirResponsaveis` + `ehResponsavelSugerido`, pré-seleção da primeira sugerida; estados carregando/erro com "Tentar de novo") e Observação (N/500). Validação por script, resumo focável e erros inline. Em 409 `conflito_versao` mostra "Alguém alterou este documento: agora está em X.", refaz as opções e fica aberto.
  - **Aprovar** com confirmação ("A aprovação é final e encerra a tramitação."), enviando `responsavelId: null`.
  - **`DialogoCancelar`**: motivo de 10 a 500 caracteres (`validarMotivoCancelamento`), com foco inicial no motivo. No sucesso o modal fecha, o cartão sai do quadro, "Cancelados (N)" sobe 1 e aparece o toast "Documento cancelado." com **Desfazer** (8 s). O Desfazer chama `reativarDocumento` com `OBSERVACAO_CANCELAMENTO_DESFEITO` e a `versao` devolvida pelo cancelamento, e o cartão volta. Em 409 aparece o toast de erro "Não foi possível desfazer: o documento foi alterado. Veja em Cancelados."
  - **Reativar** (`DialogoConfirmar`): "Ele volta para <`statusDeReativacao(eventos)`>". Usa a mesma rota e a mesma função do cliente que o Desfazer (P-17).
  - **Metas do ciclo** (seção nova abaixo de Dados), por `avaliarMetas` + `dataInicioRevisao`/`dataAprovacao` dos eventos. O estado vai por extenso ("Cumprida", "Estourada", "No prazo", "Não se aplica") nos tons sucesso/erro/neutro. Em Dados entrou o par "Responsável atual".
  - Depois de cada ação, a recarga dos detalhes é silenciosa e o aviso fica dentro do modal (`role="status"`). Se o botão usado some (ex.: Reprogramar depois do prazo novo), o foco vai para o ✕ e nunca se perde.
- **Janela de cancelados:** os cartões também não têm botões. O cartão abre os detalhes por cima e o **Reativar** fica lá. Depois de reativar, a janela recarrega a lista, o título atualiza a contagem e o Painel recebe o cartão.
- **Painel:** quarto KPI "Aprovados no mês", com "Concluídos em <mês de aaaa>" e "N dentro da meta de 40 dias" ("—" enquanto carrega). Os KPIs ficam em 4 colunas, 2 abaixo de 1200px e 1 abaixo de 600px. Uma etapa registrada move o cartão de coluna na hora e recarrega o painel em silêncio (devoluções e datas do ciclo vêm do servidor). O rótulo da busca virou "Buscar por título, código, remetente ou responsável".
- **Cliente e erros:** `api/cliente.ts` ganhou `mudarStatus`, `cancelarDocumento`, `reativarDocumento` e `responsaveis` (e `Sessao.tsx` os vigia). `ErroApi` guarda a `mensagem` do servidor, que substitui a padrão só em `acao_nao_permitida` e `sem_permissao`. O toast ganhou o tom `erro` (ícone de alerta em vez do ✓).
- **Vitrine** (`e2e/vitrine/vitrine.tsx`): responsáveis fictícios, cartões com responsável e datas do ciclo, dois aprovados no mês (um fora da meta), cancelado com `statusAntesDoCancelamento`, e as rotas de status simuladas com as **mesmas regras puras** da API (`transicaoPermitida`, `pode`, `exigeResponsavel`, `podeSerCancelado`, `statusDeReativacao`, `podeReprogramarAgora`). Parâmetros novos: `?status=conflito`, `?responsaveis=erro` e `?desfazer=conflito`.

Nenhum tipo novo foi criado fora de `packages/compartilhado`; não houve divergência de tipo. Usei também `ehResponsavelSugerido`, `podeReprogramarAgora`, `podeSerCancelado`, `iniciais` e `OBSERVACAO_CANCELAMENTO_DESFEITO`, que o agente do servidor exportou.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `apps/web/src/componentes/CartaoDocumento.tsx` / `.module.css` | Cartão Planner sem botões; `prazoDoCartao` (tom + texto acessível) |
| `apps/web/src/componentes/ColunaKanban.module.css` | Altura máxima e rolagem vertical interna da lista |
| `apps/web/src/componentes/DetalhesDocumento.tsx` / `.module.css` | Rodapé de ações, diálogos empilhados, Metas do ciclo, Responsável atual, recuperação de foco |
| `apps/web/src/componentes/DialogoAtualizarEtapa.tsx` | Novo |
| `apps/web/src/componentes/DialogoCancelar.tsx` | Novo |
| `apps/web/src/componentes/DialogoConfirmar.tsx` | Novo (Aprovar e Reativar) |
| `apps/web/src/componentes/DialogoStatus.module.css` | Novo (estilos dos três diálogos) |
| `apps/web/src/componentes/JanelaCancelados.tsx` | Cartões sem botões; prop `recarga` (recarga silenciosa depois de reativar) |
| `apps/web/src/componentes/Toast.tsx` / `.module.css` | Tom `erro` opcional |
| `apps/web/src/telas/TelaPainel.tsx` / `.module.css` | 4º KPI, cancelar/Desfazer, reativação, recarga silenciosa, busca com responsável; Reprogramar saiu do Painel |
| `apps/web/src/api/cliente.ts`, `api/erros.ts`, `autenticacao/Sessao.tsx` | Rotas da F5; mensagem do servidor |
| `apps/web/src/permissoes.ts` | `podeReprogramar(eu, doc, hoje)` (prazo vencido), `podeCancelar`, `podeReativar`, `acoesDeStatusPara` |
| `apps/web/src/formatacao.ts` | `formatarDiaMes`, `formatarMesAno` |
| `apps/web/src/estilos/tokens.css` | `--kanban-coluna-altura-max`, `--avatar-cartao` |
| `apps/web/src/**/*.test.tsx` | Testes do cartão, do rodapé, dos diálogos, das metas, do KPI, de cancelar/Desfazer e de reativar; fixtures com os campos novos |
| `apps/web/e2e/status.spec.ts` | Novo: 19 testes (768/1024/1440, claro/escuro, axe, foco preso, toque 44px) |
| `apps/web/e2e/painel.spec.ts`, `detalhes.spec.ts`, `capturas.spec.ts`, `vitrine/vitrine.tsx` | Ajustes ao cartão Planner, Reprogramar nos detalhes, rolagem por coluna, capturas novas |
| `docs/relatorios/capturas/painel-planner-{768,1024,1440}-{claro,escuro}.png`, `detalhes-acoes-*.png` | Capturas novas; `painel-reprogramar-*` refeitas (Reprogramar agora pelos detalhes) |
| `CHANGELOG.md` | Linha da F5 (interface) |

## O que ficou pendente

- **Diferenças pequenas em relação à seção 6 do contrato** (a registrar, se o Eric concordar):
  1. As ações rápidas do rodapé põem a **principal primeiro**, e não "as três primeiras de `acoesDeStatus`". Em revisão, a principal ("Enviar à aprovação da área") é a 5.ª da lista e ficaria escondida.
  2. **Janela de cancelados:** o Reativar fica nos detalhes abertos por cima e não no cartão (seção 11.5 e decisão 0015: nenhum botão no cartão). A rota, a função e o resultado são os mesmos do Desfazer (P-17).
  3. KPIs em 2 colunas abaixo de 1200px, não de 980px: em 1024px, com a barra lateral, 4 colunas deixavam os rótulos em 2 ou 3 linhas.
  4. A vitrine não tem `?toast=cancelado`. O e2e faz o fluxo real (cancelar → Desfazer pelo teclado).
- **Proposta de visão minimalista (não aplicada, exige mudar o contrato):** no documento em revisão, o rodapé chega a 7 botões e quebra em duas linhas mesmo em 1440px (captura `detalhes-acoes-claro.png`). A proposta é deixar só a principal e "Atualizar etapa…" (que já oferece todas as etapas), além de Cancelar/Reprogramar/Fechar.
- **CLAUDE.md** (o Claude principal atualiza): cartão Planner sem botões e colunas com rolagem própria; Reprogramar só nos detalhes e com prazo vencido (`podeReprogramarAgora`); `DialogoConfirmar`/`DialogoCancelar`/`DialogoAtualizarEtapa`; toast com tom `erro`; `ErroApi` com a mensagem do servidor em `acao_nao_permitida`/`sem_permissao`.
- `docs/estado-atual.md` não foi alterado (fica com o Claude principal ao fechar a fatia). Revisão do `agente-qa-revisao` pendente.
- `npm run test:e2e` nesta máquina precisa da config temporária para o Chromium de `/opt/pw-browsers`, que foi apagada no fim. Na máquina do Eric, o comando normal deve funcionar.

## Como validar

1. `npm run typecheck`, `npm test` (490 testes; 119 em `apps/web`), `npm run build` e `npm run segredos`: todos passaram.
2. `npm run test:e2e`: 99 passaram e 39 foram pulados (capturas). O `status.spec.ts` tem 19 testes. Rodei com uma config local ignorada pelo Git apontando para o Chromium de `/opt/pw-browsers`, apagada no fim.
3. Capturas: `CAPTURAS=<pasta> npx playwright test e2e/capturas.spec.ts -g "planner|acoes"`, já geradas em `docs/relatorios/capturas/` (`painel-planner-*`, `detalhes-acoes-*`).
4. À mão na vitrine (`npm run dev -w apps/web`, depois `/e2e/vitrine/index.html?rota=%2Fpainel`):
   - abra "Procedimento de auditoria interna" → "Iniciar revisão" → "Registrar etapa": o cartão vai para Em Revisão com as iniciais;
   - "Relatório de satisfação de clientes" → Cancelar → Desfazer: o cartão sai e volta;
   - "Cancelados (2)" → "Ata da reunião…" → Reativar: "volta para Em revisão da qualidade";
   - teste também `&perfil=Leitor` e `&perfil=Solicitante`.

## Decisões tomadas ou necessárias

- Nenhuma decisão grande. As diferenças 1 a 3 acima e a proposta de rodapé enxuto ficam para o Eric aprovar ou recusar (registro no contrato ou numa decisão, se aprovadas).

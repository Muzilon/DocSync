# Relatório — F3 — Painel Kanban (parte interface)

- **Data:** 2026-09-29
- **Agente / modelo:** agente-ux-ui / Opus
- **Fatia:** F3 (seções 5, 6 e 7 do [contrato](../contratos/f3-painel-kanban.md), parte `apps/web`)

## O que foi feito

- **Cliente da API:** `painel(consulta)` (`GET /painel`, só manda na query os parâmetros preenchidos) e `reprogramarPrazo(id, dados)` (`POST /documentos/:id/reprogramacoes`). O `ErroApi` da interface passou a levar o `documento` que vem no 409 `conflito_versao`. Códigos novos em `api/erros.ts`: `conflito_versao`, `acao_nao_permitida` e `nao_encontrado`, todos com mensagem em pt-BR. A sessão real (`Sessao.tsx`) também vigia as duas chamadas novas para detectar sessão expirada.
- **Permissão de tela:** `podeReprogramar(eu, cartao)` em `permissoes.ts`. Usa `pode(eu, 'reprogramarPrazo', { areaId })` e esconde o botão em Aprovado e Cancelado.
- **Tela Painel** (`/painel`, protegida por `verDocumentos`):
  - três KPIs com rótulo e subtítulo do contrato; mostram "—" enquanto carrega;
  - busca `type="search"` filtrada no cliente com `filtrarCartoes`, e contagem "N documentos encontrados" em `aria-live`;
  - filtro "Área" com todas as áreas ativas em ordem pt-BR;
  - botão "Cancelados (N)";
  - quadro `<section aria-label="Quadro de tramitação">` com 5 colunas (`<section>` + `<h2>` + `<ul>`) na ordem do servidor;
  - estados: carregando (esqueleto com `aria-busy`), vazio geral (com link para Novo documento quando a pessoa pode cadastrar), vazio por filtro (com "Limpar filtros") e erro/sem conexão (com "Tentar novamente");
  - as setas ↑ ↓ ← → movem o foco entre cartões e colunas (opcional no contrato). O Tab sozinho já alcança tudo.
- **Componentes novos:**
  - `CartaoDocumento`: código ou "S/ código", revisão, título, badge, tipo, etiqueta de prazo, "Reprogramado", "↺ N×", remetente, "Revisão até" ou "Recebido em" e o botão Reprogramar. Não tem nenhum outro botão.
  - `EtiquetaPrazo` e `EtiquetaReprogramado`.
  - `ColunaKanban`.
  - `DialogoReprogramar`:
    - mostra o prazo atual;
    - o campo data tem `min` = o maior entre o hoje do servidor e o dia seguinte ao prazo atual;
    - a justificativa tem contador "N/500" e a dica "Mínimo 10 caracteres";
    - valida por script com `validarNovoPrazo` e `validarJustificativa`, com resumo de erros focável;
    - trata o 409 `conflito_versao`: mostra o prazo atual vindo do erro, atualiza o cartão e reenvia com a versão nova;
    - trata `acao_nao_permitida`, 403 e 404 com as mensagens de `erros.ts`.
  - `JanelaCancelados`: `Dialogo` largo que faz a própria chamada `painel({ cancelados: true })` e aplica a busca e a área em vigor. Os cartões não têm Reprogramar.
- **Depois de reprogramar:** o cartão é trocado pelo `documento` devolvido pela API, sem recarregar o painel, e aparece o toast "Prazo reprogramado para dd/mm/aaaa".
- **Barra lateral e Início:** item "Painel" (ícone `LayoutDashboard`) logo abaixo de Início, para quem tem `verDocumentos`. O Início ganhou o cartão com o link "Abrir o painel".
- **Cores:** Cancelado em grafite (#334155 / #E2E8F0 / #64748B, contraste 8,5:1). No tema escuro: #E2E8F0 sobre `rgba(100,116,139,.32)`, com borda #94A3B8. O `BadgeStatus` já lia os tokens. Devolvido continua vermelho.
- **Novo documento:**
  - o campo "Data de recebimento" saiu da tela e da validação;
  - o envio não manda mais nem `dataRevisao` nem `dataRecebimento`;
  - o toast agora é "Documento registrado. Prazo: dd/mm/aaaa." (prazo tirado da resposta);
  - a dica do status fixo avisa que a data de recebimento e o prazo são gravados automaticamente.
- **`Dialogo` (melhoria em todos os diálogos):**
  - foco preso de verdade: o `<dialog>` nativo deixava o Tab escapar para a interface do navegador, e agora ele volta ao primeiro controle;
  - variante `larga` com conteúdo rolável.
- **Toque:** em telas de toque (`pointer: coarse`), todos os botões passam a ter altura mínima de 44px.
- **Formatação de datas:** `formatarData` foi para `src/formatacao.ts`, junto com `plural`, e é reaproveitada pelo Painel e pelo Novo documento.
- **Testes:**
  - `TelaPainel.test.tsx` (20 testes): query, `prazoMinimo`, carregando, KPIs e colunas, etiquetas, busca, área em ordem pt-BR, vazio por filtro, janela de cancelados, Reprogramar por perfil, envio de `{ novoPrazo, justificativa, versao }`, 409 com o prazo atual, `acao_nao_permitida`/403, vazio geral, Leitor, erro e setas;
  - e2e `painel.spec.ts` (18 testes): 768/1024/1440 × claro/escuro com axe e sem rolagem horizontal da página (em 768 o quadro rola por dentro); diálogo com foco preso, Esc e foco devolvido; janela de cancelados; sucesso; 409; filtros; ordem do Tab; estados; menu e Início;
  - ajustes em `TelaNovoDocumento.test.tsx`, `TelaPessoas.test.tsx`, `novo-documento.spec.ts` e `capturas.spec.ts`.
- **Vitrine:** 10 cartões fictícios nas 5 fases mais 2 cancelados, com "hoje" fixo em 29/09/2026. Parâmetros: `?painel=vazio|erro|carregando` e `?reprog=conflito`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| apps/web/src/api/cliente.ts | `painel`, `reprogramarPrazo`, `queryPainel`, `documento` do 409 no erro |
| apps/web/src/api/erros.ts | `conflito_versao`, `acao_nao_permitida`, `nao_encontrado`; campo `documento` |
| apps/web/src/permissoes.ts | `podeReprogramar` |
| apps/web/src/autenticacao/Sessao.tsx | vigia `painel` e `reprogramarPrazo` |
| apps/web/src/App.tsx | rota `/painel` (só quem vê documentos) |
| apps/web/src/telas/TelaPainel.tsx, .module.css, .test.tsx | tela nova e testes |
| apps/web/src/componentes/CartaoDocumento.tsx, .module.css | novo |
| apps/web/src/componentes/ColunaKanban.tsx, .module.css | novo |
| apps/web/src/componentes/EtiquetaPrazo.tsx, .module.css | novo |
| apps/web/src/componentes/DialogoReprogramar.tsx, .module.css | novo |
| apps/web/src/componentes/JanelaCancelados.tsx, .module.css | novo |
| apps/web/src/componentes/Dialogo.tsx, .module.css | foco preso e variante `larga` |
| apps/web/src/componentes/Botao.module.css | 44px em `pointer: coarse` |
| apps/web/src/estilos/tokens.css | Cancelado grafite (claro e escuro), medidas do Kanban e do diálogo largo |
| apps/web/src/formatacao.ts | novo (`formatarData`, `plural`) |
| apps/web/src/telas/Casca.tsx | item "Painel" |
| apps/web/src/telas/TelaInicio.tsx, Pagina.module.css | cartão "Abrir o painel" |
| apps/web/src/telas/TelaNovoDocumento.tsx, .test.tsx | sem "Data de recebimento" nem `dataRevisao`; toast com prazo |
| apps/web/src/telas/TelaPessoas.test.tsx | API simulada com os métodos novos |
| apps/web/e2e/painel.spec.ts | novo |
| apps/web/e2e/vitrine/vitrine.tsx | Painel, dados e modos de teste |
| apps/web/e2e/novo-documento.spec.ts | sem a data de recebimento (3 erros em vez de 4) |
| apps/web/e2e/capturas.spec.ts | capturas do Painel, localidade pt-BR |
| docs/relatorios/capturas/painel-*.png | 8 capturas (1,4 MB) |
| CHANGELOG.md | linha de 2026-09-29 |

Nada foi alterado em `packages/compartilhado` nem em `apps/api`.

## O que ficou pendente

- **Diferenças em relação ao contrato. Precisam de aprovação ou de registro:**
  1. **Largura mínima da coluna: 216px, não 220px.** Com a barra de 236px e o respiro de 40px de cada lado, 5 colunas de 220px mais os espaços entre elas precisam de 1.148px de conteúdo. Em 1440px sobram 1.124px, e com 220px o quadro rolaria cerca de 24px mesmo em 1440. Com 216px e espaço de 8px as colunas cabem a partir de ~1.430px de largura de tela. Em 1024px não cabem com nenhum valor razoável (sobram 708px), então nessa largura o quadro também rola por dentro. A página nunca rola. O contrato diz que "a partir de 1024px cabem lado a lado", o que não é possível com a barra lateral do documento 04. Proposta: registrar no contrato "cabem lado a lado a partir de ~1430px; abaixo disso, rolagem interna". O valor fica no token `--kanban-coluna-min`.
  2. **`aria-label` nas etiquetas não foi usado.** `aria-label` num `<span>` sem papel é proibido pela ARIA 1.2 (o axe acusa). O texto visível já é o nome acessível. No "↺ N×", o símbolo fica oculto do leitor de tela e há um texto só para leitor "Devolvido N vezes", além de `title`. O resultado para quem usa leitor de tela é o mesmo.
  3. **"Cancelados (N)" com filtros:** o quadro é filtrado no cliente, mas `qtdCancelados` precisa refletir a busca e a área. Quando algum filtro está ativo, a tela faz um `GET /painel?busca=&areaId=` com espera de 400 ms só para atualizar esse número. Se essa chamada falhar, o botão mostra só "Cancelados".
  4. **Janela de cancelados:** chama `painel({ cancelados: true })` sem busca nem área e filtra no cliente com `filtrarCartoes` (mesma função da API). O contrato não diz se `cancelados=true` devolve só os cancelados ou todos; a tela funciona nos dois casos.
  5. O botão dos estados de erro diz "Tentar novamente" (texto do componente `Estados` já existente), não "Tentar de novo".
- **`Documento` ganhou `reprogramado` e `qtdReprogramacoes`** (feito pela parte servidor). Com isso a tela atualiza o cartão depois da reprogramação e do 409 sem precisar deduzir a contagem. Nenhum tipo da fronteira faltou nem divergiu.
- **`npm run test:e2e` como está não roda nesta máquina:** o Playwright instalado procura `chromium_headless_shell-1243`, que não existe em `/opt/pw-browsers`. Rodei com uma configuração temporária (`playwright.local.config.ts`, ignorada pelo Git por `*.local.*`) que só aponta `executablePath` para `/opt/pw-browsers/chromium`. Apaguei o arquivo depois. Na máquina do Eric, o comando normal deve funcionar.
- **Datas nas capturas:** no Chromium sem janela, o campo de data aparece como "mm/dd/yyyy" mesmo com localidade pt-BR. Em navegador em português aparece dd/mm/aaaa.
- **Não implementado (desejável no contrato):** roving tabindex. Cada cartão continua sendo uma parada do Tab; as setas funcionam por cima disso.
- **Para o Claude principal:**
  - atualizar o CLAUDE.md (seção 7, Interface): o `Dialogo` agora prende o foco e tem a variante `larga`, datas saem de `src/formatacao.ts`, e há a convenção do Painel (filtra no cliente com `filtrarCartoes`, "hoje" sempre de `RespostaPainel.hoje`);
  - atualizar `docs/estado-atual.md`.
- O aviso do build sobre bloco maior que 500 kB já existia e não foi tratado.

## Como validar

1. Na raiz: `npm run typecheck` (sem erros), `npm test` (15 arquivos, 256 testes, todos passando, incluindo os da parte servidor), `npm run build` (ok), `npm run segredos` (sem achados).
2. `npm run test:e2e`: 54 passando e 9 capturas ignoradas (casca, login, Novo documento e os 18 do Painel). Nesta máquina rodei com a configuração temporária descrita acima.
3. Capturas: `CAPTURAS=<pasta> npx playwright test capturas -g painel` em `apps/web`. As 8 já geradas estão em `docs/relatorios/capturas/`: `painel-1440-claro`, `painel-1440-escuro`, `painel-768-claro`, `painel-768-escuro`, `painel-reprogramar-claro`, `painel-reprogramar-escuro`, `painel-cancelados-claro` e `painel-cancelados-escuro`.
4. Com a API real (`npm run dev`), entrar como Qualidade ou Administrador:
   - abrir Painel pelo menu ou por "Abrir o painel";
   - conferir que um documento recém-cadastrado aparece em Recebido com "Prazo: dd/mm/aaaa" (cadastro + 30 dias);
   - reprogramar com justificativa de pelo menos 10 caracteres e ver o toast e a etiqueta "Reprogramado".
   - Com Solicitante e Leitor, o botão Reprogramar não aparece.
5. Para ver o 409, abrir o Painel em duas abas, reprogramar o mesmo documento na primeira e depois na segunda. A segunda mostra "Alguém alterou este documento" com o prazo atual.

## Decisões tomadas ou necessárias

- **Necessária (Eric ou Claude principal):** aceitar a largura mínima de 216px e a rolagem interna abaixo de ~1430px (item 1 das pendências), ou definir outra solução.
- **Tomadas dentro do escopo de UX, sem mudar o contrato de dados:**
  - foco preso implementado no `Dialogo`, valendo para todos os diálogos;
  - 44px nos botões em telas de toque;
  - chamada com espera para a contagem de cancelados com filtros;
  - texto oculto no lugar de `aria-label` nas etiquetas.

## Correções pós-QA

Defeitos do [relatório de QA](2026-09-29-f3-qa.md) corrigidos só em `apps/web`. Largura das colunas (M1) e texto de prazo do cartão (B3) **não** foram alterados: aguardam decisão do Eric.

- **B4:** `JanelaCancelados` recebe `quantidadeInicial: number | null`; sem contagem o título é "Documentos cancelados", sem número (antes aparecia "(0)"). Ao fechar, o estado volta para "carregando", então a reabertura nunca mostra a lista anterior.
- **B5:** sem documentos em tramitação mas com cancelados (`qtdCancelados > 0`), o vazio diz "Nenhum documento em tramitação" e o botão Cancelados continua disponível; "Nenhum documento cadastrado ainda" só quando não há nenhum.
- **B6:** `ordenarCartoesPainel` (em `TelaPainel.tsx`) reordena os cartões depois da reprogramação (ou do 409 com estado atual) pela chave do servidor: prazo crescente com nulos no fim, `criadoEm`, `id` (comparação por unidade de código).
- **B10:** e2e com toque emulado (`hasTouch: true`, `isMobile: false`, confere `pointer: coarse`) em 768px: todo botão visível do Painel (e o link "Novo documento") com altura ≥ 44px. O teste achou um defeito real: `.botaoCancelados` (40px) sobrescrevia a regra de toque do `Botao`; corrigido com `@media (pointer: coarse)` em `TelaPainel.module.css`.

Arquivos: `apps/web/src/componentes/JanelaCancelados.tsx`, `apps/web/src/telas/TelaPainel.tsx`, `apps/web/src/telas/TelaPainel.module.css`, `apps/web/src/telas/TelaPainel.test.tsx` (testes de B4, B5, B6 e de `ordenarCartoesPainel`), `apps/web/e2e/painel.spec.ts` (B10), `CHANGELOG.md`.

Validação: `npm run typecheck` ok; `npm test` 15 arquivos, 262 testes passando; `npm run build` ok; `npm run segredos` limpo; e2e 55 passando e 17 ignorados (capturas), com configuração temporária apontando para o Chromium de `/opt/pw-browsers` (apagada depois).

## Ajustes pedidos pelo Eric

Só em `apps/web`; API e pacote compartilhado intocados.

- **Cartão enxuto, como o Planner:** mantém código ou "S/ código" + "Rev. N", título e `BadgeStatus`. Na linha de etiquetas entra a nova **etiqueta de área** (neutra: `--bg-hover`, `--text-strong` e borda `--border-subtle`; #1E293B sobre #F1F5F9 no claro e #F1F5F9 sobre #193942 no escuro, ambas acima de 4,5:1; prefixo "Área: " só para leitor de tela), seguida das etiquetas de prazo, "Reprogramado" e "↺ N×". Rodapé sempre "Recebido em dd/mm/aaaa". Saíram tipo de documento, remetente e "Revisão até" (a data do prazo já está na etiqueta). A busca continua procurando no remetente (`filtrarCartoes` intocada). Responsável atual não foi criado (vem na F5).
- **Filtro de área do Solicitante:** a seleção "Área" não aparece para o Solicitante; no lugar, o texto "Área: <área dele>" (de `eu.area`), sem controle. Os demais perfis seguem com "Todas as áreas" + áreas ativas em ordem pt-BR. Provisório até existir um painel próprio para quem só acompanha (decisão futura).
- **Vitrine:** com `?perfil=Solicitante`, o painel simulado devolve só os documentos da área da pessoa, como a API.
- **Testes:** `TelaPainel.test.tsx` (cartão enxuto sem tipo, remetente e "Revisão até"; Solicitante sem a seleção e com "Área: Engenharia"); `e2e/painel.spec.ts` (cartão enxuto; Solicitante claro e escuro com axe).
- **Capturas regeneradas:** `painel-1440-*`, `painel-768-*`, `painel-cancelados-*` e `painel-reprogramar-*` (claro e escuro).

Arquivos: `apps/web/src/componentes/CartaoDocumento.tsx` e `.module.css`, `apps/web/src/telas/TelaPainel.tsx` e `.module.css`, `apps/web/src/telas/TelaPainel.test.tsx`, `apps/web/e2e/painel.spec.ts`, `apps/web/e2e/vitrine/vitrine.tsx`, `docs/contratos/f3-painel-kanban.md` (seção 5), capturas, `CHANGELOG.md`.

# Relatório — F4 — Interface de detalhes e histórico

- **Data:** 2026-09-29
- **Agente / modelo:** agente-ux-ui / Opus
- **Fatia:** F4 (parte interface, `apps/web`)

## O que foi feito

Fiz a parte interface do [contrato da F4](../contratos/f4-detalhes-historico.md), seguindo as respostas do Eric na seção 9. Houve uma mudança do Eric no meio do trabalho: **o visualizador de PDF e a marca d'água saíram da F4.** O visualizador chegou a ser feito (pdfjs-dist, worker local) e depois foi removido por inteiro: componente, módulo `src/pdf/`, dependência `pdfjs-dist` e package-lock. Em Arquivos fica só o botão **Baixar**. Não há botão Visualizar nem "abrir no Office".

- **Cartão:** o título virou um `<button>` dentro do `<h3>`. Clique no corpo do cartão, Enter ou Espaço abrem os detalhes. O clique em Reprogramar não abre. O nome acessível é o título mais um texto oculto ", abrir detalhes". O `aria-describedby` aponta para código e revisão, status e prazo. O `<article>` deixou de ser focável: o botão do título passou a ser o alvo do foco e das setas (`data-cartao-id` foi para ele). Em tela de toque o título tem 44px de altura.
- **Modal `DetalhesDocumento`:** usa o `Dialogo` com a variante nova `tamanho="detalhes"` (token `--dialogo-largura-detalhes: 980px`). Tem ✕ "Fechar detalhes" no cabeçalho, com o foco inicial, e o cabeçalho fixo mostra código, revisão, badge, etiqueta de prazo, "Reprogramado", "Devolvido N vezes" (calculado por `contarDevolucoes`) e o `DOC-uuid`.
  - Três `<section>`: Dados, Arquivos e Linha do tempo. São duas colunas a partir de 860px e uma coluna abaixo disso.
  - O rodapé tem **Reprogramar** (mesma regra do cartão, `DialogoReprogramar` reaproveitado) e Fechar. Depois de reprogramar, o modal recarrega sem piscar e o cartão do quadro se atualiza. Isso vale também no 409 de conflito.
  - Estados: carregando (esqueleto com `aria-busy`), erro com "Tentar novamente", 404 e 403 com mensagem e sem repetir. Um `?documento=` que não seja `DOC-…` nem chega à API.
- **Linha do tempo única** (`LinhaDoTempo` e `EventoLinhaDoTempo`): todos os eventos, do mais recente para o mais antigo. Todo o texto vem de `descreverEvento`.
  - Cada evento mostra a pílula do tipo, o autor como foi gravado, a data e hora em São Paulo (`<time dateTime>`), o resumo e os badges "de → para".
  - O botão "Detalhes" (`aria-expanded`) mostra as diferenças, a observação ou justificativa, o destino e o responsável.
  - O ponto do evento mais recente tem um anel animado, que fica parado com `prefers-reduced-motion`.
- **Arquivos (`ListaArquivos`):** o principal vem primeiro, com ícone por extensão, etiqueta "Principal"/"Anexo" e tamanho por `formatarTamanho`.
  - O botão Baixar aparece conforme `pode(eu, 'baixarArquivo', { areaId })` (`podeBaixarArquivo` em `permissoes.ts`).
  - O download faz fetch com Bearer e recebe um blob. O nome vem do `Content-Disposition` (`nomeDoCabecalho`: `filename*` e depois `filename`, sem barras). O download dispara por um `<a download>` temporário dentro do diálogo.
  - Enquanto baixa, o botão mostra "Baixando…" e há um anúncio educado para leitor de tela.
- **Cliente da API:** `baixarArquivo(id, arquivoId, nomeOriginal)` usa um caminho binário separado de `chamar()`. O erro vem em JSON e é lançado como `ErroApi`. Também entrou em `Sessao.tsx`, que leva ao login se a sessão tiver expirado.
- **Outros:** `arquivo_indisponivel` entrou em `api/erros.ts` e `formatarDataHora` em `formatacao.ts`.
- **Link direto:** `/painel?documento=<id>` abre o modal. Abrir e fechar gravam e removem o parâmetro (com `replace`), e recarregar a página reabre o modal. Quando o modal foi aberto pela URL, fechar leva o foco ao `<h1>`. A rota `/documentos/:id` redireciona (`RedirecionarDocumento` em `App.tsx`).
- **Cancelados:** os cartões da janela de cancelados abrem os detalhes por cima dela (modal sobre modal). Esc fecha só o modal de cima, e o foco volta ao cartão dentro da janela.
- **Dialogo:** ganhou as props `tamanho`, `botaoFechar`, `cabecalho` e `classeConteudo`. O foco preso e o Esc agora ignoram eventos de um diálogo aninhado, e o foco só volta a quem abriu se esse elemento ainda existir.
- **Novo documento:** a ação do toast agora é "Abrir detalhes" e leva a `/documentos/<id>`. O "Ver na lista" do aviso "já registrado" continua.
- **Vitrine:** o DOC-P6 tem 9 eventos de todos os tipos (CRIACAO, STATUS, ANEXO, EDICAO, REPROGRAMACAO), 1 principal e 3 anexos e uma observação longa. O DOC-P9, cancelado, tem um evento CANCELAMENTO. Parâmetros: `?detalhes=erro|404|carregando`, `?download=erro` e `?perfil=Leitor|Solicitante`. Um documento cadastrado na vitrine entra no quadro e nos detalhes.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| apps/web/src/componentes/DetalhesDocumento.tsx / .module.css / .test.tsx | Novo: modal, estados e testes (21). |
| apps/web/src/componentes/LinhaDoTempo.tsx, EventoLinhaDoTempo.tsx, LinhaDoTempo.module.css | Novo: linha do tempo. |
| apps/web/src/componentes/ListaArquivos.tsx / .module.css | Novo: arquivos e download. |
| apps/web/src/componentes/Dialogo.tsx / .module.css | Variante `detalhes`, ✕, cabeçalho fixo, proteção para diálogos aninhados. |
| apps/web/src/componentes/CartaoDocumento.tsx / .module.css | Título-botão, `aoAbrir`, 44px no toque. |
| apps/web/src/componentes/DialogoReprogramar.tsx | Tipo `AlvoReprogramacao`, que aceita cartão ou `Documento`. |
| apps/web/src/componentes/JanelaCancelados.tsx | `aoAbrirDetalhes`. |
| apps/web/src/telas/TelaPainel.tsx | `?documento=`, modal, foco no `<h1>`. |
| apps/web/src/telas/TelaNovoDocumento.tsx | Toast com "Abrir detalhes". |
| apps/web/src/App.tsx | Rota `/documentos/:id` → `RedirecionarDocumento`. |
| apps/web/src/api/cliente.ts, api/erros.ts, autenticacao/Sessao.tsx | `baixarArquivo`, `nomeDoCabecalho`, `arquivo_indisponivel`. |
| apps/web/src/permissoes.ts, formatacao.ts | `podeBaixarArquivo`, `formatarDataHora`. |
| apps/web/src/estilos/tokens.css | `--dialogo-largura-detalhes`, `--detalhes-coluna-direita-min`, `--linha-tempo-ponto`, `--linha-tempo-linha`. |
| apps/web/src/telas/*.test.tsx | Simulações com `baixarArquivo`; testes novos do Painel (F4) e do toast. |
| apps/web/e2e/detalhes.spec.ts | Novo: 20 testes e2e com axe. |
| apps/web/e2e/painel.spec.ts, novo-documento.spec.ts, capturas.spec.ts, vitrine/vitrine.tsx | Ajustes e dados da F4. |
| docs/relatorios/capturas/detalhes-*.png | 8 capturas: 768, 1024 e 1440 nos dois temas, e detalhes sobre cancelados. |
| CHANGELOG.md | Uma linha. |

Não mexi em `packages/compartilhado` nem em `apps/api`. O `pdfjs-dist` entrou e saiu de `apps/web/package.json`, e o package-lock voltou ao estado anterior.

## O que ficou pendente

- **Visualizador de PDF e marca d'água:** saíram da F4 por decisão do Eric (mensagem de 2026-09-29, durante a fatia). O contrato (seção 9, pontos 2 a 4) e a decisão 0013 ainda falam do visualizador e da marca: precisam ser atualizados pelo Claude principal. A API (commit 8cd5ee7) ainda tem a rota de visualização e aplica a marca. A interface não chama essa rota.
- **Divergências do contrato, a registrar:**
  1. O erro de download aparece como alerta dentro do modal, não como toast: com o modal aberto, o toast fica atrás do fundo inerte e não é anunciado.
  2. O sucesso da reprogramação feita pelo modal é anunciado dentro do modal (status oculto), e a etiqueta de prazo muda na hora. Não há toast, pelo mesmo motivo.
  3. O ícone de imagem é o `FileImage` do Lucide (o `Image` colide com o `Image` global).
  4. "Revisa o documento …" mostra o ID de origem, porque o `Documento` não traz o código do documento de origem. Isso fica para a F8.
- **Download com acento no Chromium headless:** nos testes, o Chromium headless ignora nome com acento no `<a download>` e grava "download". O e2e confere o nome pedido no próprio link, e um arquivo com nome ASCII baixa com o nome certo. Falta conferir à mão no Edge/Chrome do Eric, com a API real, um arquivo com acento no nome.
- **Tamanho do pacote:** o aviso de pacote principal acima de 500 kB no build parece anterior a esta fatia (MSAL e React); o que a F4 acrescenta é pequeno. Não verifiquei.
- **`docs/estado-atual.md`:** não atualizei; fica com o Claude principal.

## Como validar

1. `npm run typecheck`, `npm test` (364 testes), `npm run build` e `npm run segredos`: todos passaram.
2. `npm run test:e2e`: 78 passaram e 25 foram pulados (capturas); o `detalhes.spec.ts` tem 20 testes. Rodei com uma config local ignorada pelo Git que aponta para o Chromium de `/opt/pw-browsers`; ela foi apagada no fim.
3. Na vitrine: `/e2e/vitrine/index.html?rota=%2Fpainel%3Fdocumento%3DDOC-P6`, e o mesmo com `&perfil=Leitor`, `&detalhes=404` ou `&download=erro`.
4. Roteiro para o Eric, com a API real:
   - Abra um cartão pelo teclado (Tab até o título, depois Enter).
   - Confira o autor e a data e hora de cada evento.
   - Baixe o principal e um anexo e confira o nome.
   - Reprograme pelo modal e veja o cartão mudar.
   - Abra um cancelado pela janela de cancelados.
   - Abra `/documentos/<id>` direto.
   - Repita como Leitor e como Solicitante.
5. Capturas em `docs/relatorios/capturas/detalhes-*.png`.

## Decisões tomadas ou necessárias

- **Necessária:** atualizar o contrato da F4 e a decisão 0013 com a retirada do visualizador e da marca d'água, e decidir o que fazer com a rota `/visualizacao` e a marca que já estão na API.
- **Tomada, dentro do contrato:** abrir e fechar os detalhes usam `replace` na URL, então o histórico do navegador não ganha uma entrada por modal.

> Nota (2026-09-29): a rota `/visualizacao` e a marca d'água citadas acima já foram removidas da API pela decisão 0014.

## Ajustes finais (validação)

Pedidos do Eric na validação (contrato F4, seção 11, itens 2 e 6), só em `apps/web`:

1. **"Revisa o documento" escondido até a F8:** o bloco Dados não renderiza o par "Revisão de" nem com `idDocumentoOrigem` preenchido (comentário no código citando a F8). Isso substitui a divergência 4 acima.
2. **Frase para quem não baixa:** na seção Arquivos, quando `podeBaixarArquivo` é falso (Leitor, Solicitante de outra área) e há arquivos, aparece "Seu perfil pode ver, mas não baixar arquivos." em texto secundário (`--text-secondary`, `--fs-body-sm`, `--space-2`). Sem arquivos, fica só "Nenhum arquivo anexado".

Arquivos: `apps/web/src/componentes/DetalhesDocumento.tsx`, `ListaArquivos.tsx`, `ListaArquivos.module.css`, `DetalhesDocumento.test.tsx` (3 testes novos e 1 conferência a mais no caso Leitor/Solicitante), `apps/web/e2e/detalhes.spec.ts` (a frase conferida para Leitor e ausente para Solicitante, com axe).

Capturas não regeneradas: elas usam o perfil Administrador (baixa) e o DOC-P6 sem documento de origem, então nada muda nelas.

Validação: `npm run typecheck`, `npm test` (365 testes), `npm run build` e `npm run segredos` passaram; `npm run test:e2e` com 78 aprovados e 25 pulados (capturas), por uma config local ignorada pelo Git apontando para o Chromium de `/opt/pw-browsers`, apagada no fim.

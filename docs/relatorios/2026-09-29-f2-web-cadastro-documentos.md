# Relatório — F2 — Interface do cadastro de documentos

- **Data:** 2026-09-29
- **Agente / modelo:** agente-ux-ui + agente-feedback-acessibilidade / Opus
- **Fatia:** F2 (parte interface)

## O que foi feito

- **Rota `/documentos/novo`** com a tela "Novo documento". O link "Novo documento" fica no grupo **Tramitação** da barra lateral e só aparece para quem passa em `pode(eu, 'cadastrarDocumento', { areaId: eu.areaId })` (`apps/web/src/permissoes.ts`). O Leitor não vê o link e, se digitar a rota, volta ao Início.
- **Formulário** (doc 03, seção 6), só na modalidade Novo documento, sem a aba Revisão Técnica (fica para a F8):
  - Campos: Título\*, Código, Tipo\* (vindo de `GET /tipos-documento`, só os ativos), Data de recebimento\*, Data de revisão (prazo), Remetente/solicitante\* (preenchido com o nome do usuário e editável), Área\*, Disciplina, N° de revisão (padrão 0, inteiro ≥ 0, nada sobrescreve o que foi digitado, P-05) e Observações.
  - Status fixo "Recebido", em badge e sem edição (P-03).
  - Área: lista em ordem alfabética pt-BR com `ordenarAlfabetico`, só com as áreas em que `pode(..., { areaId })` é verdadeiro. Para o Solicitante vira um campo só de leitura com a própria área e uma dica.
  - Grade de 2 colunas, 1 coluna abaixo de 640px, cartão com no máximo 860px e rodapé em `--bg-subtle`.
- **Arquivos** (`componentes/ZonaArquivo.tsx`, doc 04, 7.3):
  - Dropzone com arrastar e soltar. O input nativo fica oculto só visualmente, recebe o foco e é rotulado por `aria-labelledby`. Os botões "Procurar arquivo", "Trocar" e "Adicionar anexos" são `<label>` e mostram o anel de foco do input.
  - A dica de formatos e limites sai de `LIMITES_ARQUIVO`, e cada arquivo passa por `validarArquivo` ao ser escolhido e de novo no envio.
  - Arquivo principal: um único arquivo, com nome, tamanho, "Trocar" e ✕ "Remover arquivo {nome}". Se a pessoa soltar mais de um arquivo, aparece a mensagem do doc 04.
  - Anexos: somam a cada seleção e aparecem como etiquetas removíveis com alvo de 44px. Quantidade e total são checados com `validarConjuntoArquivos`.
- **Envio** (P-01, P-02, P-04, doc 05 1.2):
  - Validação por script (`noValidate`). O resumo de erros é focável e cada link leva o foco ao campo. As mensagens aparecem junto de cada campo, ligadas por `aria-describedby`.
  - O ID `DOC-uuid` (`novoIdDocumento()`) é gerado quando o formulário abre e é **reutilizado** em "Tentar novamente". Ele só muda depois de um sucesso, depois de Limpar ou depois de um 409 `id_existente`.
  - Durante o envio o botão mostra "Registrando…" e fica desabilitado, com trava contra duplo envio.
  - Em sucesso aparece o toast "Documento registrado" com a ação "Ver na lista", que rola até o item, dá foco a ele e o destaca por 4s. O formulário só é limpo depois disso, com remetente e área preenchidos de novo.
  - Em erro aparece um banner (`role="alert"`, recebe foco) com "Tentar novamente", e dados e arquivos continuam no formulário.
  - Os `campos` do 400 vão para os campos, inclusive `arquivoPrincipal` e `anexos`. O 409 `codigo_revisao_existente` aparece no campo Código.
  - "Limpar formulário" pede confirmação no diálogo customizado quando há algo preenchido.
- **Documentos registrados recentemente** (`GET /documentos/recentes`): tabela com código (ou "S/ código"), revisão, título, tipo, área, badge de status (`componentes/BadgeStatus.tsx`, tokens `--status-{fase}-*` a partir de `FASE_DO_STATUS`) e data de recebimento. Tem estados de carregando, vazio e erro com "Tentar novamente". A tabela ocupa a largura toda, e o contêiner dela recebe foco para rolar pelo teclado no tablet (regra do axe `scrollable-region-focusable`).
- **Componentes estendidos:**
  - `Toast` passou a aceitar uma ação: 8s na tela, pausa no hover e no foco.
  - Os componentes `Campo*` ganharam `dica`, `larguraTotal` e o novo `CampoAreaTexto`.
  - O cliente da API ganhou suporte a multipart (`FormData`) e os métodos `tiposDocumento`, `criarDocumento` e `documentosRecentes`, também repassados pela sessão, que continua detectando sessão expirada.
  - `erros.ts` ganhou os códigos `codigo_revisao_existente` e `id_existente`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| apps/web/src/telas/TelaNovoDocumento.tsx / .module.css / .test.tsx | Tela nova com 13 testes Vitest |
| apps/web/src/componentes/ZonaArquivo.tsx / .module.css | Dropzone, arquivo escolhido e etiquetas de anexos |
| apps/web/src/componentes/BadgeStatus.tsx / .module.css | Badge de status pelo conjunto único de tokens |
| apps/web/src/componentes/Campo.tsx / .module.css | `dica`, `larguraTotal`, `CampoAreaTexto`, estilo de desabilitado |
| apps/web/src/componentes/Toast.tsx / .module.css | Ação opcional no toast |
| apps/web/src/api/cliente.ts, api/erros.ts | Multipart, rotas de documentos, códigos 409 |
| apps/web/src/autenticacao/Sessao.tsx | Repassa os métodos novos com a vigilância de sessão |
| apps/web/src/permissoes.ts | `podeCadastrarDocumento(eu)` |
| apps/web/src/App.tsx, telas/Casca.tsx | Rota protegida e link no grupo Tramitação |
| apps/web/src/estilos/tokens.css | `--area-texto-altura`, `--formulario-max`, `--dropzone-altura` |
| apps/web/src/telas/TelaPessoas.test.tsx | API simulada com os métodos novos |
| apps/web/e2e/vitrine/vitrine.tsx | Tipos, recentes, envio simulado (`?envio=falha`, `?perfil=`) e rota nova |
| apps/web/e2e/casca.spec.ts, e2e/novo-documento.spec.ts, e2e/capturas.spec.ts | axe nos dois temas, 768/1024/1440, fluxos e capturas |
| CHANGELOG.md, CLAUDE.md | Linha datada e convenções de formulário, arquivos e toast |

## O que ficou pendente

- Sem teste de ponta a ponta com a API real: a API de documentos está sendo feita em paralelo. A tela foi testada contra o contrato de `@docsync/compartilhado` e a API simulada.
- Modo offline com rascunho e o estado "Registro pendente" (doc 05 1.2) não entraram nesta fatia.
- A aba "Revisão Técnica" fica para a F8.
- O toast diz "Ver na lista" em vez de "Ver no painel", porque o Painel (F3) ainda não existe. Trocar quando existir.
- Na captura de página inteira, a barra lateral não chega ao fim da página. Esse comportamento já existia (altura da barra) e não mudou nesta fatia.

## Como validar

1. Na raiz: `npm run typecheck`, `npm test` (165 testes), `npm run build`, `npm run segredos` e `npm run test:e2e` (36 passando e 9 capturas ignoradas). Todos passaram.
2. Capturas em `…/scratchpad/capturas/`: `novo-documento-claro.png`, `novo-documento-erros-claro.png` e `novo-documento-escuro.png`, geradas com `CAPTURAS=<pasta> npx playwright test capturas` em `apps/web`.
3. Com a API da F2 no ar, entrar como Qualidade:
   - enviar vazio: devem aparecer o resumo e o foco;
   - anexar um arquivo `.exe`: deve ser recusado;
   - registrar: devem aparecer o toast e o item destacado na lista;
   - derrubar a API e enviar: deve aparecer o banner; religar e clicar em "Tentar novamente": o documento deve ser gravado uma única vez.
4. Entrar como Solicitante: o campo Área deve estar travado. Entrar como Leitor: o link não aparece e `/documentos/novo` volta ao Início.

## Decisões tomadas ou necessárias

- O rótulo do link e o título da tela ficaram "Novo documento", em caixa de frase como os demais itens da barra ("Início", "Pessoas").
- No 409 `id_existente`, o ID é renovado antes de "Tentar novamente", porque reenviar o mesmo ID repetiria o conflito. Nenhuma decisão nova de arquitetura foi necessária.

## Correções pós-QA

- **M1 (R5):** quando a API devolve 409 `id_existente`, a tela não gera mais um ID novo sem verificar. Primeiro ela chama `GET /documentos/:id` (método novo `api.documento`, tipo `DetalheDocumento`):
  - **O documento existe e `criadoPor === eu.id`:** a tela trata como já registrado. Mostra o aviso informativo "Este documento já tinha sido registrado. As alterações feitas depois do primeiro envio não foram gravadas." com o botão "Ver na lista", coloca o documento vindo da API na lista de recentes e o destaca, limpa o formulário e só então gera um ID novo.
  - **Não existe (404) ou é de outra pessoa (colisão):** a tela gera um ID novo e mostra o banner de erro pedindo "Tentar novamente", com os dados preservados.
- 2 testes Vitest novos, um para cada caminho: o primeiro simula a gravação com resposta perdida, a edição de um campo e o reenvio com 409; o segundo simula a colisão. A vitrine ganhou `documento()`.
- **B2:** a linha do CHANGELOG ficou no mesmo formato da linha da API, sem repetir a data.
- Verificações: typecheck, `npm test` (167), build, segredos e test:e2e (36 passando e 9 ignorados) passaram.

## Ajuste da decisão 0010 (prazo fora do cadastro)

- O campo "Data de revisão (prazo)" e a dica dele saíram do formulário. A validação correspondente também saiu, e `NovoDocumento.dataRevisao` é sempre enviado como `null`.
- A tabela de recentes não tem coluna de prazo (conferido).
- Novo teste Vitest confirma que a tela não mostra o campo de prazo, e o teste de sucesso passou a conferir `dataRevisao: null` no envio.
- A captura `novo-documento-erros-claro.png` foi gerada de novo.
- Verificações: typecheck, `npm test` (168), build, segredos e test:e2e (36 passando e 9 ignorados) passaram.

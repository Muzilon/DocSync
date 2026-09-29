# CLAUDE.md — Regras do projeto DocSync

DocSync é o SaaS interno do SGI (Qualidade, Meio Ambiente, Segurança e Saúde Ocupacional) do Grupo Monto. É a reconstrução, do zero, do antigo DocFlow (tramitação de documentos). O código é novo; as regras de negócio e as lições das tentativas anteriores estão em [docs/especificacao/](docs/especificacao/) e devem ser respeitadas.

Idioma: tudo em português do Brasil (código de domínio, textos da interface, commits, documentação).

> **Ao começar uma sessão, leia [docs/estado-atual.md](docs/estado-atual.md)**: onde o trabalho parou, o que falta e as perguntas em aberto. Atualize-o ao fim de cada fatia ou ao parar no meio de uma.

> **Mantenha este arquivo atualizado.** Sempre que uma regra, tecnologia ou convenção mudar, atualize o CLAUDE.md na mesma entrega. Um CLAUDE.md desatualizado é defeito.

---

## 1. Papéis

| Papel | Quem | O que faz |
|---|---|---|
| Dono do produto | **Eric** | **Decide.** Prioridades, aprovação de decisões grandes (stack, modelo de dados, fonte da verdade, apagar ou mover arquivos em massa) e validação de cada entrega. |
| Codificação e UX/UI | **Claude** | Implementa telas, componentes, regras e dados, seguindo o design system ([04](docs/especificacao/04-design-system.md)). Coordena os subagentes. |
| Ideias e automações | **Antigravity** | Apoio para novas ideias e automações. Não implementa. |

O Claude **não toma decisões grandes sozinho**: propõe por escrito, o Eric aprova, a decisão é registrada e só então o código muda.

## 2. Delegação por módulo

O Claude principal não implementa tudo numa resposta só. Cada módulo ou tarefa vai para um subagente de [.claude/agents/](.claude/agents/), com o modelo escolhido pela complexidade:

| Modelo | Uso |
|---|---|
| **Fable** | Arquitetura e lógica complexa: modelo de dados, sincronização, permissões, regras de transição. |
| **Opus** | Implementação e UI: telas, componentes, estilos, testes de tela. |
| **Haiku** | Pesquisa: documentação de bibliotecas, APIs da Microsoft, levantamentos rápidos. |

**Toda tarefa delegada termina com um relatório em Markdown**, salvo em `docs/relatorios/AAAA-MM-DD-<fatia>-<assunto>.md` (modelo em [docs/relatorios/_modelo.md](docs/relatorios/_modelo.md)), com: o que foi feito, arquivos alterados, o que ficou pendente e como validar.

Ao fim de cada fatia, o `agente-qa-revisao` revisa antes de a entrega ir para o Eric.

## 3. Regra mais importante: fatias pequenas, nunca substituir tudo de uma vez

- Trabalhar em **fatias pequenas e verificáveis**: uma tela ou um fluxo por vez, cada fatia funcionando de ponta a ponta (tela, regra, dados, permissão) e **validada pelo Eric antes da próxima**.
- **Nunca** fazer reescrita total. Nunca substituir tudo de uma vez.
- A versão nova de qualquer coisa **convive com a antiga até ser validada**. Remover a antiga é um **passo separado, aprovado pelo Eric** e registrado.
- **Nada decorativo apresentado como pronto**: menu sem destino, botão sem ação, valor fixo no lugar de dado real. Um link só aparece quando o destino existe.
- Motivo: uma migração anterior substituiu tudo de uma vez, apagou uma versão que funcionava e entregou um protótipo incompleto ([01, seção 3.2](docs/especificacao/01-visao-produto-e-licoes-aprendidas.md)).

O plano de fatias da Fundação está em [docs/plano-fundacao.md](docs/plano-fundacao.md).

## 4. Segredos: fora do código desde o primeiro commit

- Webhooks, URLs assinadas, senhas, tokens, client secrets, cadeias de conexão e demais segredos **nunca** entram em arquivo versionado, nem provisoriamente, nem em teste, nem em documentação.
- Segredos ficam em **variáveis de ambiente** (arquivo `.env` local, não versionado) ou num cofre, e **só no servidor** (`apps/api`). O navegador nunca recebe segredo. Variáveis `VITE_*` são públicas por definição: só identificadores não sensíveis (ex.: client ID e tenant ID do Entra).
- O `.gitignore` cobre `.env`, `.env.*` e `*.local.*`. O [.env.example](.env.example) é versionado **só com placeholders** (`<...>`).
- **Verificação automática de segredos**: `secretlint` no pre-commit (husky) e `gitleaks` no CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)). Nunca pular o hook (`--no-verify`).
- Usuários e dados de teste usam valores fictícios, gerados por script ou em arquivos locais fora do Git.
- Os endereços e senhas do repositório antigo (`tramitacao_de_documentos`) são considerados **vazados**: nada dele é copiado.

## 5. CHANGELOG

[CHANGELOG.md](CHANGELOG.md) desde o primeiro commit: **uma linha por mudança relevante, na data em que aconteceu**, com link para a decisão ou o relatório. Vale para qualquer agente.

## 6. Registro de decisões

Toda decisão de arquitetura, tecnologia, modelo de dados ou escopo vira um arquivo em [docs/decisoes/](docs/decisoes/) (`NNNN-titulo.md`: data, status, contexto, opções, decisão, consequências) **antes** do código correspondente. Diferença intencional em relação à especificação é registrada como decisão; diferença não registrada é defeito.

## 7. Stack e convenções (decisão [0001](docs/decisoes/0001-stack.md))

- Monorepo com npm workspaces: `apps/web` (React + TypeScript + Vite), `apps/api` (Node + TypeScript + Fastify), `packages/compartilhado` (tipos e regras usados pelos dois).
- Estilos: variáveis CSS + CSS Modules. Cores pela [decisão 0009](docs/decisoes/0009-identidade-visual-vigen.md) (Vigen, azul-petróleo, substitui a paleta pêssego do documento 04); estrutura, tipografia, espaçamento e componentes pelo documento 04. **Sem Tailwind.** Todo valor visual sai de um token. `#64748B` nunca como texto sobre `#F1F5F9` (reprova contraste; usar `#475569`).
- Interface (F1): a casca (barra lateral, Início, Pessoas) é testada sem sessão real pela vitrine `apps/web/e2e/vitrine/`, fora do build; o Playwright sobe um Vite próprio na porta 5174 para isso.
- Banco: PostgreSQL (fonte da verdade, decisão [0002](docs/decisoes/0002-fonte-da-verdade.md)). Identidade: Microsoft Entra ID. Arquivos: armazenamento local atrás de uma interface, até o SharePoint ser liberado ([0003](docs/decisoes/0003-ambiente-local.md)).
- Testes: Vitest (regras e API), Playwright + axe (telas e acessibilidade, a partir da F1).
- Node 24. Comandos na raiz: `npm run dev`, `npm run build`, `npm test` (só Vitest), `npm run test:e2e` (Playwright + axe; na primeira vez, `npx playwright install chromium` em `apps/web`), `npm run typecheck`, `npm run segredos`.
- **Interface (F1):** tokens num único arquivo, [apps/web/src/estilos/tokens.css](apps/web/src/estilos/tokens.css) (tema escuro em `:root[data-tema='escuro']`, escolha guardada no navegador em `docsync.tema`). Componentes reutilizáveis em `apps/web/src/componentes/`, telas em `apps/web/src/telas/`. Ícones `lucide-react`; fonte Inter 400–800 via `@fontsource/inter`.
- **Formulários (F2):** validação por script (`noValidate`), resumo de erros focável com links para os campos, erros inline via `aria-describedby` (componentes `Campo*` aceitam `dica`). Arquivos pelo componente `ZonaArquivo` (input nativo oculto só visualmente; o botão visível é um `<label>`). Toast aceita uma ação (`toast(texto, { rotulo, aoAcionar })`, 8s). Permissões de tela com contexto de área ficam em `apps/web/src/permissoes.ts`.
- **Diálogos e toque (F3):** todo diálogo usa o componente `Dialogo` (foco preso de verdade com Tab e Shift+Tab, Esc fecha, foco volta a quem abriu; variantes `larga` para listas e `detalhes` (980px, com `botaoFechar` ✕ e `cabecalho`); diálogos podem empilhar e o Esc fecha só o de cima). No cartão do Painel, o título é um botão que abre os detalhes e é o alvo do foco e das setas. Em `pointer: coarse` os botões têm no mínimo 44px de altura. Datas e plurais da interface só por `apps/web/src/formatacao.ts` (`formatarData`, `plural`). Etiquetas sem `aria-label` (o texto visível é o nome acessível; ARIA 1.2).
- **Login no navegador:** MSAL (`@azure/msal-browser` + `@azure/msal-react`), por redirecionamento, cache em sessionStorage. Destino pós-login só via `destinoSeguro()` ([apps/web/src/autenticacao/redirecionamento.ts](apps/web/src/autenticacao/redirecionamento.ts)). Chamadas à API só pelo cliente de `apps/web/src/api/cliente.ts` (prefixo `/api`, token Bearer; mensagens de erro em pt-BR em `api/erros.ts`).
- Telas: computador e tablet (a partir de 768px), sem rolagem horizontal da página ([0005](docs/decisoes/0005-telas-computador-tablet.md)). Barra lateral estática, só CSS ([04, seção 4](docs/especificacao/04-design-system.md)).
- **Banco (PGlite, F1):** pasta em `BANCO_PASTA` (relativa à raiz do monorepo). Migrações em `apps/api/migracoes/NNNN_nome.sql`, SQL padrão do PostgreSQL, aplicadas em ordem na subida da API, cada uma numa transação, registradas na tabela `migracoes`. **Migração aplicada nunca é editada**: mudança nova = arquivo novo. Cada arquivo traz no topo o plano de volta. Auditoria é imutável (gatilho bloqueia UPDATE, DELETE e TRUNCATE).
- **IDs:** `USR-uuid` (pessoas), `AREA-uuid` (áreas), `AUD-uuid` (auditoria), `TIPO-uuid` (tipos de documento), `DOC-uuid` (documentos, **gerado pelo cliente** antes do primeiro envio), `HIST-uuid` (eventos de histórico), `ARQ-uuid` (arquivos), `ACS-uuid` (registros de acesso a arquivos), gerados na criação e nunca reaproveitados.
- **Documentos (F2):** listas de domínio (status, fases, tipos) e regras puras em [packages/compartilhado/src/documentos.ts](packages/compartilhado/src/documentos.ts); fase de cada status gravada em `FASE_DO_STATUS`, nunca deduzida do texto. Cadastro por `POST /documentos` em multipart (`dados` JSON + `arquivoPrincipal` + `anexos`), status sempre `Recebido`, idempotente pelo ID (mesmo autor + mesmo resumo SHA-256 do pedido → 200 com o existente). Histórico (`eventos_historico`) imutável por gatilho, autor sempre do token. Código único por `lower(codigo)` + revisão.
- **Arquivos:** só pela interface `ArmazenamentoArquivos` ([apps/api/src/armazenamento/arquivos.ts](apps/api/src/armazenamento/arquivos.ts)). Local em `ARMAZENAMENTO_PASTA` (relativa à raiz do monorepo): pasta por ID do documento (nunca pelo título, P-07), principal na raiz e anexos em `Anexos/`, nomes sanitizados, gravação em temporário + renomear. Gravação de arquivos é o último passo da transação do banco; falha desfaz as duas coisas. Limites e extensões em `LIMITES_ARQUIVO`/`validarArquivo` (mesma função na interface e na API).
- **API:** rotas sem prefixo (a interface chama `/api/...` e o proxy do Vite remove o `/api`); sem CORS. Todo endpoint, exceto `/saude`, valida o token do Entra (jose + JWKS do locatário) e lê a pessoa e o perfil do banco a cada requisição. Erros no formato `{ codigo, mensagem?, campos? }` (tipo `ErroApi` em `packages/compartilhado`). Esquema fechado: campo desconhecido → 400 `dados_invalidos`. Logs nunca incluem o token.
- **Permissões:** função única `pode(pessoa, acao, contexto?)` em `packages/compartilhado`; `contexto.areaId` é a área do documento (Solicitante só atua na sua área). O tipo `Acao` cresce a cada fatia, sempre com linha nova na tabela de testes. A API deriva filtros de visibilidade da própria `pode` (nada de regra de perfil duplicada nas rotas); documento que a pessoa não pode ver responde 404, como se não existisse.
- **Prazo e datas (decisões [0011](docs/decisoes/0011-prazo-automatico-e-reprogramacao.md) e [0012](docs/decisoes/0012-recebimento-automatico-e-metas-de-ciclo.md)):** `dataRecebimento` e `dataRevisao` (prazo = recebimento + 30 dias corridos) são gravadas pelo servidor; enviá-las no cadastro → 400. "Hoje" do servidor só por `hojeNoFuso()` (`apps/api/src/datas.ts`, fuso America/Sao_Paulo); a interface usa o `hoje` devolvido pela API, nunca o relógio do navegador. Reprogramação por `POST /documentos/:id/reprogramacoes` (ação `reprogramarPrazo`: Administrador e Qualidade), só com prazo vencido (decisão 0015), só adia, justificativa de 10 a 500 caracteres, concorrência por `versao` (409 `conflito_versao`), evento REPROGRAMACAO.
- **Painel (F3, [contrato](docs/contratos/f3-painel-kanban.md)):** `GET /painel` com query fechada; KPIs, filtro e etiquetas de prazo por funções puras em `packages/compartilhado/src/painel.ts`, as mesmas na API e na tela; a tela carrega uma vez e filtra no cliente com `filtrarCartoes`. Largura mínima da coluna do Kanban no token `--kanban-coluna-min`. Contratos de fatia ficam em `docs/contratos/` e são aprovados pelo Eric antes do código.
- **Arquivos na entrega (F4, decisão [0014](docs/decisoes/0014-download-nome-e-versoes-de-arquivo.md), contrato seções 10–11):** sem marca d'água nem visualizador; `baixarArquivo` para Administrador, Qualidade e Solicitante da área (Leitor não); HEAD desligado; `GET /documentos/:id` devolve `DetalheDocumento` (`arquivos`, `eventos`, `hoje`); download `GET /documentos/:id/arquivos/:arquivoId` só por `ArmazenamentoArquivos`, com ação `baixarArquivo` e `arquivoId` sempre conferido contra o documento; conteúdo entregue byte a byte como foi gravado. Nome do principal só por `nomeDownloadPrincipal` (`packages/compartilhado/src/documentos.ts`); anexos com o nome original. Cabeçalhos só por `cabecalhosDownload` (tipo pela extensão, nunca pelo `tipo_mime` gravado; `nosniff`, `no-store`, CSP sandbox). Cada entrega grava um registro imutável em `registros_acesso_arquivos` (`ACS-uuid`, autor do token; tipo `VISUALIZACAO` previsto na migração 0004 e sem uso). Linha do tempo só por `descreverEvento` (`packages/compartilhado/src/historico.ts`).
- **Cartão do Kanban (decisão [0015](docs/decisoes/0015-cartao-estilo-planner.md)):** estilo Planner, sem botões: etiquetas, título, área, rodapé com prazo (neutro/laranja/vermelho) e responsável; ações só no modal de detalhes; colunas rolam por dentro. Reprogramar só com prazo vencido. Visão do usuário revisada pelo `agente-visao-minimalista`.
- **Contas de teste do Entra:** criadas pelo script [scripts/entra/criar-contas-teste.ps1](scripts/entra/criar-contas-teste.ps1) (só no locatário de teste; senha exibida só no terminal, nunca versionada).
- **Testes da API:** Vitest com `app.inject`, banco PGlite em memória (clonado de um modelo migrado) e JWKS local gerado no teste ([apps/api/src/apoio-testes.ts](apps/api/src/apoio-testes.ts)). Nenhum teste chama a internet.

## 8. Regras de negócio que não podem regredir

Resumo; a fonte é a especificação.

- **R1–R6** do [documento 01](docs/especificacao/01-visao-produto-e-licoes-aprendidas.md): sem segredos, autenticação e autorização no servidor, dados exibidos com segurança, ID estável (`DOC-uuid`, `HIST-uuid`), gravação idempotente e histórico acumulativo, nada apagado antes de validado.
- Nenhuma ação localiza documento por posição, código ou título.
- Autor de evento sempre da identidade autenticada.
- Defeitos **P-01 a P-19** do [documento 03](docs/especificacao/03-guia-de-preenchimento-e-fluxos.md) não se repetem.
- Revisões: documento novo vinculado ao de origem; código único por código + revisão; Aprovado é final ([0004](docs/decisoes/0004-revisoes-e-reativacao.md)).
- Reativação: volta ao status anterior ao cancelamento ([0004](docs/decisoes/0004-revisoes-e-reativacao.md)).
- Áreas: lista mantida, exibida sempre em ordem alfabética pt-BR ([0006](docs/decisoes/0006-nome-e-areas.md)).

## 9. Git

- Commits pequenos, mensagem em português, um assunto por commit.
- Commit e push só quando o Eric pedir ou aprovar a fatia.
- Nada de apagar ou mover arquivos em massa sem aprovação registrada.

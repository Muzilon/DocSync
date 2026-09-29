# Relatório — Agentes — Auditoria de tokens e precisão

- **Data:** 2026-09-29
- **Agente / modelo:** subagente de auditoria (pedido do Claude principal) / Opus
- **Fatia:** transversal (configuração dos agentes em `.claude/agents/`)

## O que foi feito

Auditoria dos agentes em `.claude/agents/` e ajustes mínimos diretamente nos arquivos, sem apagar nenhum agente. **Existem 19 agentes, não 21**, como dizia o pedido.

1. **Frontmatter:** modelos alinhados à regra (Fable para arquitetura, lógica complexa e revisão; Opus para implementação; Haiku para pesquisa). Duas trocas: `agente-qa-revisao` opus→fable e `agente-notificacoes` fable→opus (é módulo de implementação; a parte de arquitetura, o canal de envio, já passa pelo `agente-arquitetura-dados`). `tools` conferidas: pesquisa sem Write/Edit/Bash; QA sem Write/Edit, mantido porque o próprio arquivo justifica (o Claude principal grava o relatório a partir da resposta); os demais precisam de Write/Edit/Bash para implementar e rodar testes.
2. **`description`** (carregada em toda sessão): todas encurtadas, mantendo o gatilho (número do módulo + palavras-chave). De ~5.830 para ~3.400 caracteres no total (−42%, cerca de 600 tokens a menos por sessão). Nenhuma usa `: ` no meio, para não quebrar o YAML.
3. **Corpo:**
   - Removido de 13 agentes de módulo o bloco repetido "Stack e convenções do DocSync" (stack, 0001–0005, segredos, comandos), que já está no CLAUDE.md, seção 7.
   - Entrou no lugar um bloco padrão, **"Leitura mínima e entrega"**: ler só CLAUDE.md, `docs/estado-atual.md` e as decisões listadas (nunca "todos os documentos"); Grep/Glob e Read com offset/limit; não reler arquivo editado; comandos de verificação e CHANGELOG numa linha só; a revisão pelo QA fica com o Claude principal (subagente não aciona outro subagente).
   - Relatório final padronizado pelo `_modelo.md`, com resposta ao Claude principal **só com o caminho do relatório e no máximo 5 linhas**. Antes era "devolva o mesmo conteúdo", o que duplicava o relatório inteiro no contexto principal.
   - "Leia sempre a especificação completa" passou a "leia só a seção X (Grep pelo título, Read com offset)". A referência ao repositório antigo foi mantida como opcional e mais curta.
   - `agente-arquitetura-dados`: "leia todos os registros em `docs/decisoes/`" (15 arquivos) passou a "só as decisões ligadas à mudança", com lista das mais usadas. Removida a seção "Onde fica cada coisa" e as regras já presentes no CLAUDE.md (IDs, segredos, autor do evento, esquema fechado, autorização); ficaram só as que o CLAUDE.md não traz.
   - `agente-ux-ui`: removidas as regras repetidas do CLAUDE.md (stack, tokens, 768px, áreas, nada decorativo); mantidas as específicas (cores da barra lateral, estados, acessibilidade, axe).
   - `agente-qa-revisao`: leitura focada (seção da fatia no plano, contrato em `docs/contratos/`, decisões citadas), diff começando por `--stat`, relatório sem colar código.
   - `agente-pesquisa`: leitura só da seção pertinente do CLAUDE.md e regra de economia na web.
4. **Decisões citadas** (títulos conferidos em `docs/decisoes/`): 0009 (Vigen) em todos os agentes com tela; 0015 (cartão Planner) em ux-ui, visão minimalista, responsivo (colunas rolam por dentro), minha-fila, NC (como padrão de cartão de Kanban) e QA. As demais foram atribuídas por assunto, conforme a tabela abaixo.

## Arquivos alterados

Economia calculada pelos caracteres do arquivo (tokens ≈ caracteres ÷ 4). A economia maior não aparece aqui: vem da leitura dirigida e da resposta em 5 linhas (veja a nota abaixo da tabela).

| Agente | Modelo antes→depois | tools | Mudança feita | Linhas | Economia no arquivo |
|---|---|---|---|---|---|
| agente-arquitetura-dados | fable→fable | Read, Write, Edit, Glob, Grep, Bash | description curta; decisões dirigidas em vez de "todas"; removidas "Onde fica cada coisa" e as regras duplicadas; bloco padrão | 50→39 | −1.100 car. (~275 tokens) |
| agente-autenticacao-microsoft | fable→fable | idem | description; bloco padrão (0003, 0007, 0008); R1–R3 só na seção 4 | 35→33 | −560 (~140) |
| agente-busca-global | opus→opus | idem | description; bloco padrão (0005, 0007, 0009) | 36→34 | −480 (~120) |
| agente-controle-validade | opus→opus | idem | description; bloco padrão (0004, 0011, 0012) | 36→34 | −530 (~135) |
| agente-feedback-acessibilidade | opus→opus | idem | description; bloco padrão (0005, 0009); documento 04 só nas seções pertinentes | 34→32 | −490 (~120) |
| agente-indicadores-sgi | opus→opus | idem | description; bloco padrão (0005, 0006, 0009) | 36→34 | −500 (~125) |
| agente-integridade-sincronizacao | fable→fable | idem | description (sem "data de modificação", o CLAUDE.md usa `versao`); bloco padrão (0002, 0004); documento 02 só no trecho pertinente | 35→33 | −530 (~130) |
| agente-lista-mestra | opus→opus | idem | description; bloco padrão (0004, 0006, 0009, 0014) | 36→34 | −470 (~115) |
| agente-matriz-treinamentos | opus→opus | idem | description; bloco padrão (0005, 0007, 0009) | 37→35 | −530 (~130) |
| agente-minha-fila | opus→opus | idem | description; bloco padrão (0005, 0009, 0011, 0015) | 37→35 | −460 (~115) |
| agente-nao-conformidades | opus→opus | idem | description; bloco padrão (0005, 0009, 0015) | 37→35 | −490 (~120) |
| agente-notificacoes | **fable→opus** | idem | modelo; description; bloco padrão (0003, 0007, 0011, 0012) | 39→37 | −570 (~140) |
| agente-painel-auditoria | opus→opus | idem | description; bloco padrão (0005, 0006, 0009) | 37→35 | −530 (~130) |
| agente-pesquisa | haiku→haiku | Read, Glob, Grep, WebFetch, WebSearch | description; leitura dirigida; regra de economia na web | 25→26 | +190 (~+50) |
| agente-portal-sgi | opus→opus | Read, Write, Edit, Glob, Grep, Bash | description; bloco padrão (0005, 0009) | 36→34 | −530 (~135) |
| agente-qa-revisao | **opus→fable** | Read, Glob, Grep, Bash (sem mudança) | modelo; description; leitura focada (plano, contrato, 0009/0015); diff por `--stat`; relatório no modelo, sem colar código | 40→40 | +280 (~+70) |
| agente-responsivo | opus→opus | Read, Write, Edit, Glob, Grep, Bash | description; estado-atual, 0009 e 0015; economia; relatório padrão | 25→26 | +440 (~+110) |
| agente-ux-ui | opus→opus | idem | description; regras duplicadas do CLAUDE.md removidas; 0009 e 0015 com link; decisões por assunto; relatório padrão | 42→37 | −660 (~165) |
| agente-visao-minimalista | opus→opus | idem | description; links 0009/0015; economia; relatório padrão | 25→29 | +460 (~+115) |
| **Total** | 2 trocas de modelo | — | 19 arquivos | 677→661 | arquivos: 56,7 mil→49,7 mil car. (−12%, ~1.750 tokens); descriptions: −2.400 car. (~600 tokens por sessão) |

**Nota sobre a economia real.** O ganho maior não é o tamanho dos arquivos, e sim o que eles mandam fazer:
- sai "ler todas as decisões" (15 arquivos) e "a especificação completa";
- sai "devolver o relatório inteiro". Isso poupa ao contexto principal o conteúdo do relatório a cada delegação, tipicamente de 1 a 3 mil tokens.

Não houve medição com execução real.

## O que ficou pendente

- **CLAUDE.md, seção 2:** registrar que o subagente responde só com o caminho do relatório e até 5 linhas, e que o QA usa Fable. O pedido proibiu mexer fora de `.claude/agents/`, e o CLAUDE.md exige estar em dia, então isso fica para o Claude principal.
- **CHANGELOG.md:** falta a linha datada desta auditoria (também fora do escopo permitido).
- **Notificações em Opus:** se o Eric considerar a lógica anti-spam e de deduplicação "lógica complexa", basta voltar para `fable`.
- **QA sem Write:** a resposta do QA continua sendo o relatório inteiro, porque ele não pode gravar o arquivo. Alternativa mais econômica: dar `Write` ao QA, restrito por instrução ao arquivo `docs/relatorios/*-qa.md`, e ele responderia em 5 linhas. É decisão do Eric.
- Os finais de linha dos arquivos editados foram normalizados para LF (o repositório usa `core.autocrlf=true`; os arquivos estavam misturados).

## Como validar

1. `git diff --stat .claude/agents/`: só os 19 arquivos de agente e este relatório.
2. Abrir o `/agents` do Claude Code e conferir que os 19 carregam (frontmatter válido) com os modelos da tabela.
3. Delegar uma tarefa pequena a um agente de módulo e conferir que a resposta vem só com o caminho do relatório e até 5 linhas.

## Decisões tomadas ou necessárias

- Tomada (reversível): `agente-notificacoes` em Opus e `agente-qa-revisao` em Fable, conforme a regra passada no pedido.
- Necessária (Eric): dar `Write` ao QA só para o relatório (item acima).

# Consolidação — agentes, decisões e design Vigen (2026-09-29)

## O que foi feito

| Tarefa | Modelo | Relatório |
|---|---|---|
| Resumo das decisões 0001–0015 | Haiku | [decisoes-resumo](2026-09-29-decisoes-resumo.md) |
| Resumo do design Vigen (PDF em `docs/design/`) e diferenças para o doc 04 e `tokens.css` | Haiku | [design-vigen-resumo](2026-09-29-design-vigen-resumo.md) |
| Auditoria e otimização dos agentes de `.claude/agents/` | Opus | [agentes-auditoria](2026-09-29-agentes-auditoria.md) |

## Destaques

**Agentes (19 arquivos, nenhum apagado)**
- `agente-qa-revisao`: opus → fable (revisão). `agente-notificacoes`: fable → opus (implementação de módulo); reverter se a lógica anti-spam for considerada complexa.
- Descrições ~42% menores (~600 tokens a menos por sessão), mantendo o gatilho.
- Bloco de stack repetido saiu de 13 agentes; entrou o bloco padrão "Leitura mínima e entrega": ler só CLAUDE.md, estado-atual e as decisões listadas, usar Grep/offset, não reler o que editou, responder só com o caminho do relatório e no máximo 5 linhas.
- Decisão 0009 (Vigen) citada em todos os agentes com tela; 0015 (cartão Planner) nos de UI, visão minimalista, responsivo, minha-fila, NC e QA.

**Decisões**
- 0014 substitui 0013 (sem marca d'água nem visualizador; registro de acesso mantido).
- 0015: cartão do Kanban só de leitura; reprogramar só com prazo vencido.
- 0012 completa 0011; 0009 altera as cores do doc 04.

**Design Vigen**
- Azul-petróleo `#4B798F`, barra lateral `#0F2B34`, tema escuro `#071820`. Fases: Em Revisão azul, Devolvido vermelho, Cancelado grafite, Aprovado verde.
- Tipografia, espaçamento, raios e componentes seguem o doc 04.

## Pendências (dependem do Eric)

1. Registrar no CLAUDE.md, seção 2, a regra de resposta em 5 linhas e o QA em Fable, e adicionar a linha no CHANGELOG. Não foi feito: o CLAUDE.md só muda com aprovação.
2. Dar `Write` ao QA só para gravar o relatório (evita devolver o relatório inteiro ao Claude principal). Hoje ele segue sem Write.
3. Confirmar o modelo do `agente-notificacoes` (opus por padrão).
4. Nada foi commitado; os arquivos estão só no working tree.

## Como validar

- `git diff .claude/agents/` para ver as edições dos agentes.
- Ler as diferenças com `tokens.css` na seção final do relatório do Vigen.

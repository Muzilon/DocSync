# 0001 — Stack tecnológica

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric

## Contexto
O documento [06](../especificacao/06-opcoes-de-stack.md) deixou a stack em aberto. A tentativa com React foi abandonada por causa do processo (substituição total), não da tecnologia. O DocSync terá 11 módulos, Kanban, modal com três modos e formulários com validação.

## Opções consideradas
1. TypeScript sem framework: simples, mas fica pesado a partir do terceiro ou quarto módulo.
2. Framework de UI com TypeScript, feito por fatias: escolhido.
3. Power Apps: pouco controle de design (barra lateral, Kanban, contraste) e custo de licença.

## Decisão
- **Front-end:** React + TypeScript + Vite, estilos com variáveis CSS (tokens do documento 04) e CSS Modules. **Sem Tailwind**, para não trazer uma paleta paralela.
- **API:** Node + TypeScript com Fastify. Valida token, permissões e transições. É o único lugar com segredos.
- **Compartilhado:** tipos e regras puras em `packages/compartilhado`.
- **Testes:** Vitest; Playwright + axe a partir da F1.
- **Segredos:** secretlint no pre-commit e gitleaks no CI.

## Consequências
Monorepo com npm workspaces. Cada módulo entra em fatias; nenhuma troca de biblioteca substitui tudo de uma vez.

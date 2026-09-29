# 0005 — Telas para computador e tablet, sem versão de celular

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric

## Contexto
O documento 04 é pensado primeiro para computador; o módulo 3.6 do documento 05 pedia layout de celular com barra inferior.

## Decisão
- Não haverá versão específica para celular por enquanto (sem barra inferior, sem Kanban por abas).
- O sistema é **responsivo para computador e tablet, a partir de 768px**, sem rolagem horizontal da página (a rolagem do Kanban é interna ao quadro).
- Barra lateral estática, só CSS, conforme o documento 04: 236px, encolhendo para 76px (só ícones) abaixo de 860px.
- **Cores:** seguir o arquivo do Figma (https://www.figma.com/design/N81a9PbiHbGLvuR5wG3qwW), mantendo contraste mínimo de 4,5:1. Texto do item ativo da barra lateral no tema claro em #A84F26 (o #F69463 dá 2,0:1). Cores do Figma que não passarem no contraste são mostradas ao Eric com uma alternativa.

## Consequências
O módulo 3.6 sai da ordem de construção até nova decisão. O agente `agente-responsivo` substitui o antigo `agente-layout-mobile`.

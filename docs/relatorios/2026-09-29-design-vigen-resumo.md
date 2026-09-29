# Design System Vigen — Resumo Executivo

**Data:** 2026-09-29 | **Ref.:** Decisão 0009, PDF "Vigen — Sistema (SGI)", tokens.css

## Identidade Visual

**Nome:** Vigen (referência visual interna; produto = DocSync). **Tom:** profissional, seguro, corporativo. **Logotipo:** marca quadrada ou retangular em azul-petróleo (#4B798F) sobre fundo branco; texto em branco sobre fundos escuros. Versão escura do logo: branco ou cinza-claro sobre petróleo (#0F2B34).

## Paleta de Cores

| Elemento | Claro | Escuro | Uso |
|---|---|---|---|
| **Marca** | #4B798F | #4B798F | Botões, destaques, ícones da barra lateral |
| **Marca hover** | #396276 | #396276 | Estados ativos e detalhes |
| **Barra lateral** | #0F2B34 | #071820 | Fundo da navegação |
| **Texto claro** | #D9E3E8 | #E6EEF2 | Rótulos na barra, sobre fundos escuros |
| **Texto principal** | #0F172A | #E6EEF2 | Corpo (10.0:1 claro, 15.4:1 escuro) |
| **Texto secundário** | #475569 | #B7C8D0 | Subtítulos e metadados |
| **Sucesso** | #10B981/#047857/#ECFDF5 | #6EE7B7 | Status Aprovado, validações |
| **Erro** | #EF4444/#B91C1C/#FEF2F2 | #FCA5A5 | Status Devolvido, Cancelado (grafite 2026-09-29) |
| **Alerta** | #F59E0B/#B45309/#FFFBEB | #FCD34D | Status Em Aprovação, pendências |
| **Informação** | #3B82F6/#1D4ED8/#EFF6FF | #93C5FD | Status Em Revisão |
| **Cancelado** | #334155/#E2E8F0 (nov.) | Cinza-ardósia | Grafite (escolha Eric 2026-09-29) |

**Contraste mínimo:** 4,5:1 (AA). Regra crítica: #64748B **nunca** sobre #F1F5F9 (4,34:1); ali usar #475569 (6,9:1).

## Tipografia

Inter 400–800 via @fontsource. **Display:** 26px; **H1:** 22px; **H2:** 20px; **H3:** 16px; **Body:** 14px; **Caption:** 12px. Line height base 1.5, títulos 1.2. Letter-spacing: −0,02em títulos, +0,05em caixa-alta.

## Espaçamento, Raios, Sombras

**Escala de espaço:** 4px (4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 60px). **Raios:** 4px (xs), 6px (sm), 8px (md), 12px (lg), 20px (xl), 28px (2xl), 999px (pill). **Sombras:** sm (1px 2px, 5% opacidade), card, hover (8px 24px, 8%), float (12px 34px, 15%), modal (24px 60px, 30%). Tema escuro: mesmas sombras, 40–60% de opacidade base.

## Componentes e Padrões

**Barra lateral:** 236px (estática, só CSS), item ativo em #193942, ícones #90AFBD, texto #D9E3E8. **Kanban:** colunas 216px mín., altura máxima 100% da janela (F5), rola por dentro, avatares 24px. **Botões:** primário em #4B798F + #396276 (hover), texto branco; secundário 100% largura em campos, bordado em áreas; perigo #B91C1C; sucesso #047857. **Campos:** altura 40px, borda #CBD5E1, foco #396276 (2px), raio 6px. **Modal:** 440px (padrão), 760px (listas), 980px (detalhes, coluna dupla ≥860px), raio 28px, overlay #0F172A 55% opacidade. **Badges:** fundo 12–20% opacidade, texto forte (ex.: #047857/#ECFDF5 para sucesso). **Toast:** fundo #0F2B34, texto branco, link #90AFBD, 8s, com ação opcional (botão inline).

## Telas e Módulos Previstos

**F1 (Fundação):** Login (MSAL), barra lateral com Início/Pessoas, vitrine de componentes. **F2 (Cadastro):** Formulário multipart (dados, arquivo principal, anexos), validação inline, zona de arraste, resumo de erros focável. **F3 (Painel):** Kanban com KPIs, filtros, etiquetas de prazo (neutro/laranja/vermelho), responsável em cartão (Planner, F5). **F4 (Detalhes):** Documento com histórico imutável, arquivos principal + anexos, timeline de eventos. **F5 (Status):** Diálogos de transição (Revisar, Devolver, Aprovar, Cancelar, Reativar), regra de fase, reprogramação se vencido. **Módulos futuros** (fora backlog): SWOT, HIRA, aspectos ambientais, requisitos legais, inspeções, mapa de processos, mensagens (ideia, não adotado).

## Diferenças em relação a docs/especificacao/04-design-system.md e tokens.css

1. **Paleta:** 04 define "paleta quente e terrosa" com pêssego (#F69463) como identidade; Vigen substitui por **azul-petróleo (#4B798F) e neutros cinza-azulados**. Pêssego é removido.
2. **Barra lateral:** 04 prevê "Barra de navegação lateral" genérica; Vigen especifica **#0F2B34 com item ativo #193942**, ícones #90AFBD.
3. **Botões com texto branco:** 04 proíbe branco sobre pêssego original #F69463 (2,25:1), propõe #B4552A; Vigen usa **#4B798F (#396276 hover) sem alternativa de contraste**, aprov. 4,7:1.
4. **Cores de fase:** 04 mapeia Devolvido (vinho #B85057), Aprovado (verde #668D58); Vigen adota **Em Revisão azul (#1D4ED8), Devolvido vermelho (#B91C1C), Cancelado grafite (#334155) desde 2026-09-29** (antes azul).
5. **Neutros:** 04 descreve --text-secondary #6C6D70 (5,2:1), --text-muted corrigido; Vigen aplica **#475569 (secundário) e #64748B (muted, só sobre branco/#F8FAFC)** per decisão 0009 linha 6 de tokens.css.
6. **Tema escuro:** 04 prevê "tema escuro de primeira classe" genérico; Vigen apresenta **implementação completa derivada da família petróleo** (#071820 bg-page, #10262E card, #E6EEF2 texto).
7. **Tipografia, espaçamento, raios:** idênticos em 04 e tokens.css; Vigen **não altera**.

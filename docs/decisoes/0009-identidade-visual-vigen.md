# 0009 — Identidade visual do Vigen (petróleo) no lugar da paleta pêssego

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric
- **Substitui:** a paleta do documento 04 (seções 1, 2 e 8.1–8.2) e a parte de cores da decisão 0005.

## Contexto
O Eric enviou o design de referência do Figma exportado em PDF ("Vigen — Sistema (SGI)", guardado localmente em `docs/design/`, fora do Git por ter 80 MB). Ele usa uma identidade azul-petróleo com neutros cinza-azulados, diferente da paleta pêssego do documento 04. O PDF também mostra outro nome (Vigen), login por senha e cerca de 40 telas com módulos fora do backlog.

## Decisão
1. **Adotar o visual do Vigen**: cores, barra lateral escura e estilo de tabelas, filtros, cabeçalhos, badges e cartões.
2. **Não muda:** nome (**DocSync**), escopo e ordem do backlog (documento 05), login com conta Microsoft (decisão 0007; o login por senha do PDF **não** é adotado), barra lateral **estática e só CSS** (documento 04, seção 4, exceto as cores), regras de acessibilidade (4,5:1) e tema escuro por troca de tokens.
3. Os módulos extras do PDF (SWOT, HIRA, aspectos ambientais, requisitos legais, inspeções, mapa de processos, mensagens) ficam como **ideias futuras**, fora do backlog até nova decisão.
4. A barra lateral mostra só os destinos que existem (regra "nada decorativo"). Os grupos do Vigen (Qualidade, Gestão, Segurança, Meio Ambiente) aparecem à medida que houver telas neles.

## Paleta extraída do PDF (valores exatos do arquivo)

| Papel | Cor | Observação |
|---|---|---|
| Fundo da barra lateral | #0F2B34 | Variação #193942 no item ativo / áreas internas |
| Marca / botão principal | #4B798F | Texto branco: **4,7:1** (passa AA) |
| Marca intermediária | #396276 | Hover do botão e destaques (texto branco: 6,6:1) |
| Ícones e detalhes da barra | #6E94A9, #90AFBD | Sobre #0F2B34: 4,57:1 e 6,40:1. Para texto na barra, preferir #90AFBD ou #D9E3E8 |
| Texto claro da barra | #D9E3E8 | Sobre #0F2B34: ≈11,5:1 |
| Texto principal | #0F172A / #1E293B | |
| Texto secundário | #475569 | ≈7,6:1 sobre branco |
| Texto de apoio | #64748B | 4,76:1 sobre branco e 4,55:1 sobre #F8FAFC (passam, no limite). **Reprova sobre #F1F5F9 (4,34:1)**: nesse fundo, usar #475569 (6,9:1) |
| Neutros de borda e fundo | #94A3B8, #CBD5E1, #E2E8F0, #F0F4F6, #F1F5F9, #F8FAFC | #94A3B8 só em elementos não textuais |
| Sucesso | ponto #10B981, texto #047857, fundo #ECFDF5 | |
| Erro / crítico | ponto #EF4444, texto #B91C1C, fundo #FEF2F2 | |
| Alerta | ponto #F59E0B, texto #B45309, fundo #FFFBEB | |
| Informação | ponto #3B82F6, texto #1D4ED8, fundo #EFF6FF | |
| Destaque de risco | #F97316 | Só em gráficos e matrizes, nunca como texto |

Os contrastes são calculados por luminância relativa (WCAG 2.1) e devem ser reconferidos no teste de acessibilidade (axe) de cada tela.

## Mapeamento das fases da tramitação (substitui a tabela 2.5 do documento 04)

| Fase | Cor (texto / fundo / borda) |
|---|---|
| Recebido | #475569 / #F1F5F9 / #94A3B8 |
| Em Revisão | #1D4ED8 / #EFF6FF / #3B82F6 |
| Devolvido à Área | #B91C1C / #FEF2F2 / #EF4444 |
| Em Aprovação | #B45309 / #FFFBEB / #F59E0B |
| Aprovado | #047857 / #ECFDF5 / #10B981 |
| Cancelado | #B91C1C / #FEF2F2 / #EF4444, com rótulo "Cancelado" sempre visível |

Devolvido e Cancelado compartilham a família vermelha; a distinção é sempre pelo texto do rótulo (cor nunca sozinha). Pode ser revisto quando o Kanban (F3) for validado.

> **Atualização 2026-09-29:** o Eric decidiu **trocar** a cor de uma das duas fases, para que Devolvido e Cancelado não fiquem na mesma família. A proposta de cor (com contraste conferido) será apresentada no início da F3 e registrada aqui antes do código.

## Tema escuro
O PDF só mostra o tema claro. O tema escuro é derivado da mesma família (fundos petróleo escuros, textos claros) e será mostrado ao Eric na validação da F1 antes de ser dado como final.

> **Atualização 2026-09-29:** tema escuro **aprovado** pelo Eric.

## Consequências
- Troca apenas os valores em `apps/web/src/estilos/tokens.css` e os ajustes de estilo da barra lateral e dos componentes; nenhuma regra de negócio muda.
- O documento 04 continua valendo para estrutura, tipografia, espaçamento, raios, componentes, acessibilidade e barra lateral estática. Onde falar de cor, vale esta decisão.
- O CLAUDE.md passa a citar esta decisão.

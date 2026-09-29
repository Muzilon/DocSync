# 04 — Sistema de Design do DocFlow (reconstrução)

> Público: quem vai construir a interface do DocFlow do zero, num repositório novo.
> Origem: este documento consolida o guia de design atual (doc_projeto/04-design.md), a correção de contraste já implantada e validada pelo Eric (ideias_implantadas/modelos/modelo_design/2026-09-28_feedback-envio-e-acessibilidade.md) e a decisão do Eric de voltar à barra lateral simples e estática (referência: commit 06a6599, formulario.css).
> Regra de ouro: na reconstrução, **todo valor visual sai de um token**. Nenhuma cor, raio ou sombra fixa no CSS dos componentes.

## Sumário

1. [Princípios visuais](#1-princípios-visuais)
2. [Paleta de cores](#2-paleta-de-cores)
3. [Tipografia, espaçamento, raios e sombras](#3-tipografia-espaçamento-raios-e-sombras)
4. [Barra de navegação lateral](#4-barra-de-navegação-lateral)
5. [Quadro Kanban](#5-quadro-kanban)
6. [Modal de detalhes](#6-modal-de-detalhes)
7. [Formulário](#7-formulário)
8. [Catálogo de componentes](#8-catálogo-de-componentes)
9. [Ícones](#9-ícones)
10. [Responsividade e acessibilidade](#10-responsividade-e-acessibilidade)
11. [Pendências herdadas que a reconstrução deve resolver desde o início](#11-pendências-herdadas-que-a-reconstrução-deve-resolver-desde-o-início)

---

## 1. Princípios visuais

- **Paleta quente e terrosa.** O pêssego/terracota (#F69463) é a identidade da marca. Vinho, verde-oliva, âmbar e coral completam a paleta. Não existem azuis, roxos, teals nem cinzas "slate" na reconstrução.
- **Superfícies claras, bordas finas.** Fundo da página quase branco, cartões brancos com borda de 1px e sombras discretas.
- **Formas arredondadas.** Campos de formulário, badges e CTAs em formato pill. Cartões com raio de 14px. Modal com raio de 28px.
- **Cor como status, nunca sozinha.** Cada fase da tramitação tem uma cor fixa, e a cor sempre aparece acompanhada de texto (rótulo do badge ou título da coluna).
- **Fundo suave, texto escuro da mesma família.** Badges e tags usam a cor com opacidade de 12% a 20% no fundo e uma variante escura da mesma cor no texto, sempre com contraste mínimo de 4,5:1.
- **Contraste antes de estética.** Texto branco nunca fica sobre o pêssego original. O CTA usa o pêssego forte (#B4552A).
- **Simplicidade estrutural.** Componentes de navegação e layout são estáticos e resolvidos só com CSS. JavaScript não controla aparência de navegação.
- **Movimento curto e com propósito.** Transições entre 0,15s e 0,25s, só em micro-interações (hover, entrada de modal e toast). Tudo respeita prefers-reduced-motion.
- **Tema escuro de primeira classe**, obtido só pela troca de tokens, sem regras paralelas por componente.

---

## 2. Paleta de cores

### 2.1 Cores primitivas

| Token | Valor | Nome / uso |
|---|---|---|
| --cor-vinho | #B85057 | Marsala. Coluna "Devolvido à Área", pill de devoluções. |
| --cor-verde | #668D58 | Sage olive. Sucesso, coluna "Aprovado". |
| --cor-chumbo | #404040 | Grafite. Texto principal do tema claro, fundo dos toasts. |
| --cor-ambar | #FBBA6D | Ocre dourado. Alerta, pendente, coluna "Em Aprovação". |
| --cor-pessego | #F69463 | Pêssego/terracota. **Cor da marca**: ícones, item ativo da barra lateral, fundos suaves, anel de foco no escuro, coluna "Em Revisão". **Nunca** fundo de texto branco. |
| --cor-pessego-claro | #FBB08A | Links sobre fundos escuros (ex.: "Ver no painel" no toast). |
| --cor-coral | #F1655D | Coral. Perigo, cancelado, atrasado, etapa atual da timeline. |
| --cor-cinza | #808184 | Cinza ardósia. Coluna "Recebido" e elementos não textuais. Não usar como cor de texto sobre branco (3,9:1). |

### 2.2 Variações suaves (fundos de badge, hover e tags)

| Token | Claro | Escuro |
|---|---|---|
| --cor-vinho-suave | rgba(184, 80, 87, 0.12) | rgba(184, 80, 87, 0.28) |
| --cor-verde-suave | rgba(102, 141, 88, 0.14) | rgba(102, 141, 88, 0.28) |
| --cor-chumbo-suave | rgba(64, 64, 64, 0.08) | rgba(255, 255, 255, 0.08) |
| --cor-ambar-suave | rgba(251, 186, 109, 0.20) | rgba(251, 186, 109, 0.28) |
| --cor-pessego-suave | rgba(246, 148, 99, 0.15) | rgba(246, 148, 99, 0.28) |
| --cor-coral-suave | rgba(241, 101, 93, 0.14) | rgba(241, 101, 93, 0.28) |
| --cor-cinza-suave | rgba(128, 129, 132, 0.12) | rgba(128, 129, 132, 0.28) |

### 2.3 Tokens semânticos com contraste corrigido (validados)

Estes tokens vêm da ideia de acessibilidade implantada e validada pelo Eric em 28/09/2026. São obrigatórios na reconstrução.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| --cor-primaria | #F69463 | #F69463 | Identidade da marca (ícones, destaques, fundos suaves). Não é fundo de texto. |
| --cor-primaria-suave | --cor-pessego-suave | --cor-pessego-suave | Fundos de destaque e hover. |
| **--cor-primaria-forte** | **#B4552A** | **#B4552A** | **Fundo de todo CTA com texto branco.** Branco sobre ele = 4,91:1. |
| **--cor-primaria-forte-hover** | **#A84F26** | **#A84F26** | Hover do CTA. Branco sobre ele = 5,51:1. O hover é o mesmo nos dois temas (um hover mais claro, como #C0612F, dá só 4,21:1). |
| --cor-texto-sobre-primaria | #ffffff | #ffffff | Texto e ícones dentro do CTA. |
| --cor-foco | #B4552A | #F69463 | Anel de foco (4,75:1 sobre #fbfbfb; 8,38:1 sobre #111113). |
| --cor-erro | #c23a32 | #fca5a5 | Borda, rótulo e texto de erro (5,32:1 sobre branco; 8,93:1 sobre #1c1c22). |
| --cor-erro-suave | --cor-coral-suave | --cor-coral-suave | Fundo de área em erro. |
| --cor-sucesso / -suave | --cor-verde / --cor-verde-suave | idem | Ícones e fundos de sucesso. |
| --cor-sucesso-texto | #4b6b40 | #86efac | Texto verde (6,04:1 sobre branco). |
| --cor-alerta / -suave | --cor-ambar / --cor-ambar-suave | idem | Alertas. |
| --cor-perigo / -suave | --cor-coral / --cor-coral-suave | idem | Ações destrutivas (ícones, fundos). |

> **Regra do CTA:** o texto do botão principal **não fica mais em branco sobre o pêssego original #F69463** (2,25:1) nem sobre #e57f4e (2,81:1). Todo botão com texto branco usa --cor-primaria-forte (#B4552A) e hover --cor-primaria-forte-hover (#A84F26), nos dois temas. O pêssego #F69463 continua existindo para a marca, só não serve de fundo de texto branco.
>
> Botões de perigo com texto branco usam --cor-erro (#c23a32, 5,32:1) como fundo, nunca o coral #F1655D (3,1:1). Botões verdes com texto branco usam #4b6b40, nunca #668D58 (3,8:1).

### 2.4 Neutros, superfícies e texto

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| --bg-page | #fbfbfb | #111113 | Fundo da página. |
| --bg-card | #ffffff | #1c1c22 | Cartões, barra lateral, modal. |
| --bg-subtle | #f7f7f8 | #16161c | Rodapés de cartão, painéis internos, fundo de campo. |
| --bg-elevated | #ffffff | #1f1f26 | Cartões do Kanban. |
| --border-subtle | #e8eaed | #2e2e38 | Borda padrão. |
| --border-soft | #f1f3f4 | #25252d | Divisórias leves. |
| --border-input | #d8dadc | #373742 | Borda de campos. |
| --text-primary | #404040 | #f3f4f6 | Texto principal (10,0:1 e 15,4:1). |
| --text-secondary | #6c6d70 | #a1a1aa | Texto secundário. Corrigido: o #808184 atual falha (3,9:1); #6c6d70 dá cerca de 5,2:1 sobre branco. #a1a1aa dá 6,6:1 sobre #1c1c22. |
| --text-muted | #707175 | #8b8b94 | Placeholders, legendas e datas. Corrigido: #9ba0a6 (2,6:1) e #71717a (3,5:1) falham; os novos valores dão cerca de 4,9:1 e 5,0:1. |

> Os valores corrigidos de --text-secondary e --text-muted foram calculados por luminância relativa (WCAG 2.1), mas, diferentemente dos tokens da seção 2.3, ainda não foram validados pelo Eric. Confirmar com verificador de contraste antes de congelar.

### 2.5 Tokens de status da tramitação (conjunto único)

Existe **um só conjunto** de tokens de status, no padrão --status-{fase}-cor (texto), --status-{fase}-bg (fundo) e --status-{fase}-borda (borda superior da coluna e pontos). Badge, pill do cartão e coluna do Kanban usam todos o mesmo conjunto.

| Fase | --status-…-borda (coluna/ponto) | --status-…-bg | --status-…-cor claro | --status-…-cor escuro |
|---|---|---|---|---|
| recebido | --cor-cinza | --cor-cinza-suave | #5f6064 (≈5,5:1) | #d1d5db |
| revisao (Qualidade) | --cor-pessego | --cor-pessego-suave | #A84F26 (≈4,9:1) | #fdba74 |
| revisao-area | --cor-pessego | --cor-pessego-suave | #A84F26 | #fdba74 |
| devolvido | --cor-vinho | --cor-vinho-suave | #983F46 (≈5,7:1) | #f3a5aa |
| aprovacao | --cor-ambar | --cor-ambar-suave | #8a5a10 (≈5,3:1) | #FBBA6D |
| aprovado | --cor-verde | --cor-verde-suave | #4b6b40 (≈5,2:1) | #86efac |
| cancelado | --cor-coral | --cor-coral-suave | #c23a32 (≈4,6:1) | #fca5a5 |

Prazo e retrabalho reutilizam o mesmo conjunto:

| Pill | Regra | Tokens |
|---|---|---|
| prazo ok | mais de 5 dias | status aprovado |
| prazo vencendo | de 0 a 5 dias | status aprovacao (âmbar) |
| prazo atrasado | vencido | status cancelado (coral/erro) |
| devoluções ("↺ N×") | quantidade de devoluções | status devolvido (vinho) |

> Os textos claros #5f6064, #983F46 e #8a5a10 substituem valores que falhavam (#808184, #B85057 e #a26914 sobre os respectivos fundos suaves). Foram calculados, não validados; confirmar com verificador antes de congelar. #4b6b40, #A84F26 e #c23a32 já constam da ideia validada.

---

## 3. Tipografia, espaçamento, raios e sombras

### 3.1 Tipografia

- **Família:** Inter, com fallback -apple-system, "Segoe UI", Roboto, sans-serif (token --font-primary). Código de documento em fonte monoespaçada (--font-mono: ui-monospace, "Cascadia Code", Consolas, monospace).
- **Pesos carregados:** 400, 500, 600, 700 **e 800**. Todo peso usado no CSS precisa estar carregado (ver pendência 11.1).
- **Base:** 14px, altura de linha 1,5, suavização de fonte ativada.

| Token | Tamanho / peso | Uso |
|---|---|---|
| --fs-display | 26px / 800 | Valor de KPI, título de página |
| --fs-h1 | 22px / 800 | Título do formulário |
| --fs-h2 | 20px / 800 | Título do modal |
| --fs-h3 | 16px / 700 | Logo, títulos de tabela e de seção |
| --fs-body | 14px / 500 | Inputs, botões, texto corrido |
| --fs-body-sm | 13px / 500–600 | Links da barra lateral, rótulos, valores do modal |
| --fs-caption | 12px / 600 | Badges, metadados, toasts |
| --fs-micro | 11px / 600–700, caixa alta, +0,05em | Rótulos de campo, cabeçalhos de tabela e de modal |

- Espaçamento entre letras: títulos grandes de -0,01em a -0,03em; caixa alta de +0,04em a +0,06em.
- Nenhum texto abaixo de 11px (o sistema atual usa 9,5px e 10px; eliminar).

### 3.2 Espaçamento

Escala formal em tokens, base 4px:

| Token | Valor |
|---|---|
| --space-1 | 4px |
| --space-2 | 8px |
| --space-3 | 12px |
| --space-4 | 16px |
| --space-5 | 20px |
| --space-6 | 24px |
| --space-7 | 28px |
| --space-8 | 32px |
| --space-10 | 40px |

Container principal: padding de 28px no topo, 40px nas laterais (16px abaixo de 640px) e 60px embaixo; largura máxima de 1680px; 28px entre blocos.

### 3.3 Raios

| Token | Valor | Uso |
|---|---|---|
| --radius-xs | 4px | Código do cartão, etiqueta de tipo |
| --radius-sm | 6px | Pills compactas do cartão (status, prazo, devolução), botões de diálogo |
| --radius-md | 8px | Botões retangulares, cartão do Kanban, diálogo |
| --radius-lg | 14px | Cartões, colunas do Kanban, dropdowns |
| --radius-xl | 20px | Painel direito do modal, área de texto pill, dropzone |
| --radius-2xl | 28px | Cartão do formulário, modal |
| --radius-pill | 999px | Badges, campos pill, CTAs, toasts |
| --radius-circle | 50% | Avatares, pontos da timeline |

### 3.4 Sombras

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| --shadow-sm | 0 1px 2px rgba(0,0,0,0.04) | 0 1px 3px rgba(0,0,0,0.40) | Botões de ícone, badge do usuário |
| --shadow-card | 0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(64,64,64,0.06) | 0 4px 20px rgba(0,0,0,0.40) | Cartões |
| --shadow-hover | 0 8px 24px rgba(64,64,64,0.08) | 0 8px 24px rgba(0,0,0,0.45) | Hover de cartão do Kanban |
| --shadow-cta | 0 6px 16px rgba(246,148,99,0.32) | idem | Só o CTA principal (decorativa) |
| --shadow-float | 0 12px 34px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.04) | 0 12px 34px rgba(0,0,0,0.50) | Dropdowns |
| --shadow-modal | 0 24px 60px rgba(64,64,64,0.30) | 0 24px 60px rgba(0,0,0,0.60) | Modal |
| --shadow-toast | 0 8px 20px rgba(0,0,0,0.22) | idem | Toasts |

**Camadas (z-index):** barra lateral 50; cabeçalho 100; dropdown 1000; modal 1000; toast 9999; diálogo 10000.

---

## 4. Barra de navegação lateral

> ### ⚠ DECISÃO DEFINITIVA DO ERIC — LEIA ANTES DE MEXER NA BARRA LATERAL
>
> A barra lateral é **fixa, estática e resolvida só com CSS**. Ela é a versão original e simples do DocFlow (commit 06a6599, formulario.css).
>
> **Está definitivamente descartado:**
> - colapsar/expandir a barra (botão de colapso, estado "colapsada", preferência salva no navegador);
> - o recorte côncavo (notch) animado atrás do item ativo, com "orelhas" e gradientes;
> - qualquer JavaScript que controle a aparência da barra (posicionar recorte, trocar largura, alternar classes de colapso, medir a posição do link ativo);
> - animação ou transição de largura, de posição ou do item ativo;
> - o fundo em gradiente pêssego→vinho da barra.
>
> **Qualquer proposta de trazer de volta a versão colapsável ou animada exige aprovação explícita do Eric antes de ser implementada.** Não implemente "só para testar", nem atrás de flag.

### 4.1 Estrutura

```html
<div class="app-shell">
  <aside class="app-sidebar" aria-label="Navegação principal">
    <div class="sidebar-logo">
      <svg aria-hidden="true">…</svg>
      <span class="sidebar-logo-text">DocFlow</span>
    </div>

    <nav class="sidebar-nav">
      <a class="sidebar-link active" href="/painel" aria-current="page">
        <svg aria-hidden="true">…</svg>
        <span class="sidebar-link-text">Painel</span>
      </a>
      <a class="sidebar-link" href="/novo">
        <svg aria-hidden="true">…</svg>
        <span class="sidebar-link-text">Novo Documento</span>
      </a>
    </nav>

    <div class="sidebar-footer">
      <!-- indicador de conexão (SharePoint) -->
      <!-- badge do usuário -->
    </div>
  </aside>

  <main class="app-main-col">…</main>
</div>
```

- A classe `active` e o atributo `aria-current="page"` são escritos **no HTML de cada página** (ou pelo template/rota no servidor). Não existe script que calcule ou mova o item ativo.
- Ordem fixa, de cima para baixo: logo (`.sidebar-logo`), navegação (`.sidebar-nav`), rodapé (`.sidebar-footer`).

### 4.2 Especificação visual

| Elemento | Regra |
|---|---|
| `.app-shell` | `display: flex; min-height: 100vh;` |
| `.app-sidebar` | **Largura fixa de 236px** (`width: 236px; flex-shrink: 0`), **`position: sticky; top: 0; height: 100vh;`**, `display: flex; flex-direction: column;`, fundo --bg-card, borda direita 1px --border-subtle. Sem colapso, sem gradiente, sem recorte. |
| `.sidebar-logo` | Ícone (17–18px, cor --cor-primaria) + texto "DocFlow" (16px, peso 800, --text-primary). Padding de 20px/18px. |
| `.sidebar-nav` | `display: flex; flex-direction: column; gap: 4px; flex: 1;` padding de 8px/12px. |
| `.sidebar-link` | `display: flex; align-items: center; gap: 10px;` padding 10px/14px, raio --radius-md, texto 13,5px peso 600 em --text-secondary, ícone 18px herdando a cor, borda 1px transparente (para o ativo não "pular"). |
| `.sidebar-link:hover` | Fundo --cor-chumbo-suave, texto --text-primary. Troca instantânea, sem transição. |
| **`.sidebar-link.active`** | **Só muda de cor:** fundo **rgba(246, 148, 99, 0.15)** (--cor-pessego-suave), texto na cor pêssego **#F69463**, **borda sutil pêssego** (1px, rgba(246, 148, 99, 0.35)), **peso da fonte 700**. Nada mais: sem animação, sem recorte, sem sombra, sem JavaScript — é só uma classe CSS. |
| `.sidebar-footer` | `margin-top: auto;` padding 16px, borda superior 1px --border-soft. Contém o indicador de conexão (ponto de 8px verde + texto "SharePoint" em --fs-caption) e o badge do usuário (avatar circular com iniciais + nome/papel). |
| `.app-main-col` | `flex: 1; min-width: 0;` (o min-width evita que o Kanban estoure a largura). |

### 4.3 Estreito/celular: 76px, só CSS

```css
@media (max-width: 860px) {
  .app-sidebar { width: 76px; }
  .sidebar-logo-text,
  .sidebar-link-text,
  .sidebar-footer-text { /* ocultação visual acessível, não display:none */
    position: absolute; width: 1px; height: 1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap;
  }
  .sidebar-link { justify-content: center; padding: 12px; }
}
```

- Abaixo do ponto de quebra (860px, recomendado), a barra encolhe para **76px** e mostra só os ícones.
- **Sem JavaScript**: é apenas a media query. Não há botão, não há estado salvo, não há transição de largura.
- Os textos são ocultados **visualmente** (técnica de ocultação acessível), para que o leitor de tela continue lendo o nome de cada link. Adicionalmente, cada link pode ter `title` com o mesmo rótulo, como dica ao passar o mouse.
- O item ativo continua igual: mesmo fundo pêssego suave, mesma borda, ícone pêssego.

### 4.4 Tema escuro e acessibilidade da barra

- No escuro, a barra usa --bg-card (#1c1c22) e --border-subtle; o item ativo mantém exatamente fundo rgba(246, 148, 99, 0.15), texto #F69463 e borda pêssego. Contraste calculado: cerca de 5,7:1. Passa.
- **Ponto de atenção no tema claro:** texto #F69463 sobre o fundo pêssego suave em branco dá cerca de 2,0:1, abaixo do mínimo de 4,5:1 da seção 10. Recomendação (troca só de valor de cor, sem mudar comportamento): no tema claro, usar **#A84F26** (--cor-primaria-forte-hover, ≈4,9:1) no texto do item ativo, mantendo o fundo rgba(246, 148, 99, 0.15), a borda pêssego e o ícone #F69463. Confirmar com o Eric; até a confirmação, a especificação de referência é a descrita na seção 4.2.
- Foco de teclado: anel de 2px em --cor-foco, afastado 2px (a barra agora tem fundo neutro, então não se usa mais o anel branco da versão em gradiente).
- O indicador de conexão pode pulsar suavemente, mas fica parado com prefers-reduced-motion. O estado da conexão é sempre dito também em texto (visível ou oculto visualmente), nunca só pela cor.

---

## 5. Quadro Kanban

### 5.1 Layout

- Acima do quadro: faixa de KPIs (seção 5.4) e barra de filtros (busca + selects), com 16px entre si.
- Quadro: grade com **5 colunas iguais** e 14px de espaço (`grid-template-columns: repeat(5, minmax(260px, 1fr))`).
- Abaixo de 1400px: as colunas mantêm mínimo de 260px e o quadro ganha rolagem horizontal.
- Abaixo de 640px: cada coluna ocupa 85% da largura da tela, com rolagem horizontal e `scroll-snap-type: x mandatory`. As colunas **não** empilham verticalmente (corrige a lacuna atual entre 980px e 1400px).

### 5.2 Colunas

| # | Coluna | Borda superior (3px) e ponto (9px) | Status |
|---|---|---|---|
| 1 | Recebido | --status-recebido-borda (cinza) | recebido |
| 2 | Em Revisão | --status-revisao-borda (pêssego) | revisao, revisao-area |
| 3 | Devolvido à Área | --status-devolvido-borda (vinho) | devolvido |
| 4 | Em Aprovação | --status-aprovacao-borda (âmbar) | aprovacao |
| 5 | Aprovado | --status-aprovado-borda (verde) | aprovado |

Cancelados ficam fora do quadro, num modal próprio aberto por um botão com contador.

- Coluna: cartão --bg-card, raio --radius-lg, padding 14px, altura mínima de 480px (240px abaixo de 640px), borda superior de 3px na cor do status **aplicada por classe modificadora** (ex.: `.planner-col--revisao`), nunca por estilo no HTML.
- Cabeçalho: ponto colorido, título (13,5px/700) e contador em pill.
- Os nomes das variantes correspondem à cor real (nada de "amber" que é pêssego).

### 5.3 Cartão

- Fundo --bg-elevated, borda 1px --border-subtle, raio --radius-md, padding 16px, 10px entre blocos.
- De cima para baixo: código (mono) + revisão; título (14px/600); etiqueta de tipo; linha de prazo (pill de prazo + pill de devoluções); metadados (avatar + data); ações rápidas (editar, ver, troca de status).
- Hover e foco de teclado: sobe 2px, sombra --shadow-hover, título em --cor-primaria-forte. Foco adiciona o anel --cor-foco.
- O cartão é um elemento focável com papel de botão; Enter/Espaço abrem o modal; Esc fecha e devolve o foco ao cartão. Rótulo acessível: "{código}, {título}, {status}, prazo {situação}. Abrir detalhes".
- Cancelado: borda esquerda de 4px em --cor-erro e opacidade 92%.
- Destacado (vindo do link "Ver no painel"): contorno pêssego de 2px por 2s (sem animação com movimento reduzido).

### 5.4 KPIs

- Grade definida **só no CSS** (nunca colunas fixas no HTML): 4 colunas acima de 980px, 2 colunas entre 600px e 980px, 1 coluna abaixo de 600px. Alternativa aceitável: `repeat(auto-fit, minmax(180px, 1fr))`.
- Cartão de KPI: rótulo (--fs-micro), valor (--fs-display) e barra de progresso de 4px na cor do status correspondente (sem azul ou roxo).

---

## 6. Modal de detalhes

Um único modal com três modos: **visualizar**, **editar** e **histórico**.

### 6.1 Estrutura comum

- Fundo escurecido: rgba(64, 64, 64, 0.55) com desfoque de 4px, padding de 20px.
- Cartão: --bg-card, largura máxima de 980px, raio --radius-2xl, sombra --shadow-modal. Entrada em 0,25s (sobe 20px com opacidade); com movimento reduzido, só opacidade.
- Cabeçalho: pill com o código, badge de status, badges de prazo/devoluções e ações à direita (Editar, Histórico, Fechar ✕ com rótulo "Fechar detalhes").
- Semântica: diálogo modal com título associado, foco preso dentro do modal, Esc fecha, foco volta ao elemento que abriu.

### 6.2 Visualizar

- Área dividida: painel esquerdo e direito na proporção de cerca de 1,2 : 0,95 (mínimo de 320px à direita), 20px de espaço, rolagem interna até 64% da altura da tela. Abaixo de 860px, uma coluna (timeline abaixo dos dados).
- **Esquerda:** grade de 2 colunas de informações (rótulo --fs-micro em --text-secondary + valor 13px em --text-primary), observações e caixa de anexos.
- **Direita:** painel --bg-subtle, raio --radius-xl, com a timeline "rio" e o controle de etapa.
  - Pontos de 22px: etapa concluída em pêssego com ✓; etapa atual em coral com anel pulsante (parado com movimento reduzido); próxima etapa com borda tracejada --border-input.
  - Linha percorrida: 2,5px em pêssego; linha seguinte: tracejada.
  - Cartão de etapa: botão expansível (Enter/Espaço), estado de expandido anunciado.
  - Controle de etapa: select de status, destino, observação e botão "Registrar etapa" em --cor-primaria-forte, largura total.
- Rodapé: --bg-subtle, com o botão "Abrir no SharePoint" (verde de texto branco em #4b6b40).

### 6.3 Editar

- Os valores do painel esquerdo viram campos (mesmo componente de input da seção 8.3), mantendo a grade de 2 colunas.
- Rodapé troca para "Cancelar" (secundário) e "Salvar alterações" (CTA --cor-primaria-forte).
- Sair com alterações não salvas pede confirmação no diálogo customizado.
- Erros de validação seguem o padrão do formulário (mensagem inline + campo em --cor-erro).

### 6.4 Histórico (auditoria)

- Lista cronológica (mais recente primeiro) de cartões de evento: pill de tipo (status, edição, criação, anexo, cancelamento; raio --radius-xs, caixa alta), autor e data.
- Diferenças de edição: lista "campo: antes → depois" com borda esquerda de 3px em --border-input (substitui o azul #38bdf8).
- Observação: caixa com borda esquerda de 3px em --cor-primaria.
- Botão "Voltar aos detalhes" no cabeçalho.

---

## 7. Formulário

### 7.1 Cartão

- Container de largura máxima de 860px, centralizado.
- Cartão --bg-card, raio --radius-2xl, borda --border-subtle, sombra --shadow-card.
- De cima para baixo: faixa offline (quando houver); abas em cápsula ("Novo Documento" | "Revisão Técnica") e botão ✕ "Limpar formulário"; título; resumo de erros (só após tentativa de envio); grade de campos (2 colunas, 14px vertical × 16px horizontal; 1 coluna abaixo de 640px); rodapé --bg-subtle com informação à esquerda, banner de erro (quando houver) e botão "Registrar Documento" à direita (largura total abaixo de 640px).

### 7.2 Campo pill

- Rótulo **dentro** da pill: 11px/600 em --text-secondary, acima do valor (14px/500).
- Caixa: altura mínima de 56px, fundo --bg-subtle, borda 1,5px --border-input, raio --radius-pill.
- Hover: fundo --bg-card. Foco: borda --cor-foco + anel de 3px em pêssego a 18%.
- Erro (`is-erro`): borda e rótulo em --cor-erro, ícone de alerta de 14px à direita, mensagem inline de 12px abaixo (alinhada a 16px), anel de foco em --cor-erro a 18%.
- Obrigatório: asterisco em --cor-erro com texto "obrigatório" oculto visualmente.
- Área de texto: variante de largura total, raio --radius-xl, altura mínima de 76px.
- Select: seta SVG desenhada em --text-secondary, a 16px da borda direita (garantir que a seta apareça também no select pill).

### 7.3 Dropzone de arquivo (`pill-dropzone`)

| Estado | Aparência |
|---|---|
| Vazio | Borda tracejada 1,5px --border-input, raio --radius-xl, ícone de upload 20px, texto "Arraste o arquivo aqui ou" + botão "Procurar Arquivo" + dica "Um único arquivo. Prefira Word, Excel ou PDF." em --text-secondary. |
| Hover / arrastando | Borda tracejada --cor-primaria-forte (escuro: #F69463), fundo --cor-pessego-suave. |
| Foco | Anel --cor-foco no botão "Procurar Arquivo" (alvo do foco). |
| Preenchido | Borda sólida --border-subtle, ícone de documento, nome (600, reticências se longo), tamanho, link "Trocar" e ✕ "Remover arquivo {nome}". |
| Erro | Borda tracejada --cor-erro, fundo --cor-erro-suave, mensagem inline "Selecione o arquivo do documento principal." |

- O input de arquivo nativo fica oculto **visualmente**, nunca com display:none, para foco e rótulo funcionarem.
- Abaixo de 640px, some o "Arraste o arquivo aqui ou" e fica só o botão + dica.
- Mais de um arquivo arrastado: "Solte apenas um arquivo. Os demais vão em "Documentos Complementares"."
- Anexos complementares: contêiner raio 16px com etiquetas removíveis (cada ✕ com rótulo acessível e área de 44×44px).

### 7.4 Envio

- Validação por script (validação nativa desligada, sem balões do navegador). Microcopy e estados exatamente como na ideia validada (seções 3.3 e 3.4 dela): "Registrando…", "Registro pendente", "Documento registrado", "Não foi possível registrar o documento", "Tentar novamente".
- O formulário só é limpo depois da confirmação de gravação (ou do rascunho offline guardado).

---

## 8. Catálogo de componentes

### 8.1 Badges e pills

| Componente | Forma | Tokens |
|---|---|---|
| Badge de status (modal, tabela) | Pill, padding 4px/10px, 12px/600 | --status-{fase}-bg / -cor |
| Pill de status do cartão | Raio --radius-sm, 11px/700, borda 1px | mesmo conjunto de status (fim das cores azul/roxo/Tailwind) |
| Pill de prazo | Raio --radius-sm, 11px/700 | ver tabela de prazo (2.5) |
| Pill de devoluções "↺ N×" | Raio --radius-sm, 11px/800, com dica e rótulo acessível "Devolvido N vezes" | status devolvido |
| Pill de ID | Raio --radius-sm, mono | --cor-pessego-suave / #A84F26 |
| Contador | Pill | --cor-chumbo-suave / --text-primary |
| Tipo de evento (auditoria) | Raio --radius-xs, 11px, caixa alta | status correspondente |

No escuro, badges usam o fundo suave a 28% e a coluna "escuro" da tabela 2.5.

### 8.2 Botões

| Variante | Aparência | Uso |
|---|---|---|
| Primário (CTA) | Fundo --cor-primaria-forte, texto branco 14px/700, raio --radius-pill (pill) ou --radius-md (compacto). Hover --cor-primaria-forte-hover e sobe 1px. Sombra --shadow-cta só no CTA principal da tela. | Registrar, Salvar, Registrar etapa, Novo |
| Secundário | Transparente, borda --border-subtle, texto --text-primary. Hover --cor-chumbo-suave. | Cancelar, Tentar novamente |
| Fantasma / ícone | Sem borda, ícone em --text-secondary. Hover: fundo --cor-chumbo-suave, ícone --cor-primaria-forte. Quadrado de 38px (área mínima de 44px no toque). | Engrenagem, editar/ver do cartão, fechar |
| Perigo | Fundo --cor-erro, texto branco. Hover com 8% de escurecimento. | Cancelar documento, confirmar exclusão |
| Sucesso | Fundo #4b6b40, texto branco. | Abrir no SharePoint, Reativar |
| Estados | Desabilitado: opacidade 50%, cursor não permitido (CTA de envio só fica desabilitado durante o envio). Carregando: spinner branco 16px à esquerda, largura travada. | — |

Todas as variantes com foco de teclado visível (seção 10.2). Não existe botão teal, azul ou roxo.

### 8.3 Inputs

- **Pill** (formulário): seção 7.2.
- **Compacto** (filtros, modal de edição): borda 1px --border-input, raio --radius-md, padding 9px/13px, 14px. Foco com borda --cor-foco e anel pêssego a 18% (fim do anel azul).
- **Select**: aparência nativa removida, seta SVG em --text-secondary.
- **Busca**: largura de 320px (100% abaixo de 980px), ícone de lupa em --text-muted à esquerda, botão "Limpar busca" quando houver texto.
- **Login**: altura de 44px, ícone à esquerda, botão mostrar/ocultar senha com rótulo acessível.

### 8.4 Toasts e diálogos

| Componente | Formato | Comportamento |
|---|---|---|
| Toast simples | Fixo a 92px do topo, centralizado, pill, fundo --cor-chumbo (escuro #24242e), texto branco 12–13px, ícone de status | Fecha sozinho em 5s; região de status educada. |
| Toast de sucesso com ação | Igual, com título, texto, link em --cor-pessego-claro e ✕ "Fechar aviso" | 8s, pausa no hover e no foco. |
| Toast com "Desfazer" | Raio --radius-sm, botão "DESFAZER" em caixa alta em --cor-pessego-claro | Mesmo posicionamento. |
| Banner de erro | Borda esquerda de 4px --cor-erro, fundo --cor-erro-suave, texto --text-primary, botão secundário | Papel de alerta (assertivo), recebe foco. |
| Faixa de aviso | Fundo --cor-ambar-suave, texto status aprovacao | Offline / pendência. |
| Diálogo customizado | Largura de 440px, raio --radius-md, variantes confirmar (primário) e confirmar-perigo | Substitui confirm/alert nativos; diálogo modal com foco preso. |

No celular, toasts têm largura máxima de calc(100% - 32px).

---

## 9. Ícones

- **Biblioteca de referência: Lucide** (lucide.dev), sucessora de Feather, que é o estilo já usado no DocFlow. Usar os SVG da Lucide (pacote oficial ou ícones copiados para um sprite local), sem misturar com outras bibliotecas.
- **Estilo:** área de 24×24, sem preenchimento, traço 2 na cor do texto (`stroke="currentColor"`), pontas e junções arredondadas.
- **Tamanhos:** 16px em botões e filtros; 18px na navegação lateral e nos KPIs; 20px em ações isoladas e na engrenagem; 14px em ícones de campo (alerta de erro).
- **Cor:** herdada do elemento pai. Sem cores fixas nos SVG.
- **Acessibilidade:** ícone decorativo com `aria-hidden="true"`; botão só de ícone com rótulo acessível.
- **Caracteres como ícone** (✕, ✓, ↺): permitidos só com rótulo acessível no elemento; nenhum emoji na interface.

---

## 10. Responsividade e acessibilidade

### 10.1 Pontos de quebra (desktop-first)

| Largura | Efeito |
|---|---|
| até 1400px | Kanban com rolagem horizontal (colunas com mínimo de 260px). |
| até 980px | KPIs em 2 colunas; filtros empilhados; busca com largura total. |
| até 860px | **Barra lateral em 76px, só ícones (só CSS, seção 4.3)**; modal em 1 coluna. |
| até 640px | Formulário em 1 coluna, padding lateral de 20px, botão de envio com largura total; Kanban com colunas de 85% e scroll-snap; container com padding lateral de 16px. |
| até 600px | KPIs em 1 coluna; cabeçalhos de tabela empilhados. |

Critério: nenhuma tela tem rolagem horizontal da página inteira em 360px de largura (a rolagem do Kanban é interna ao quadro).

### 10.2 Contraste, foco e teclado

- **Contraste mínimo de 4,5:1** para todo texto (3:1 só para texto grande: 24px, ou 18,7px em negrito) e **3:1** para bordas de componentes, ícones funcionais e anel de foco. Validar os dois temas antes de cada merge.
- **Foco visível:** regra global em `:focus-visible` com contorno sólido de 2px em --cor-foco, afastado 2px, acompanhando o raio. Nenhum elemento remove o contorno sem substituto. Campos pill mantêm o anel de sombra de 3px com borda --cor-foco.
- **Navegação por teclado:** tudo que é clicável é `<button>` ou `<a>` de verdade. Tab percorre, na ordem visual: barra lateral, cabeçalho, filtros, cartões do Kanban (coluna por coluna, de cima para baixo) e as ações de cada cartão. Enter/Espaço ativam; Esc fecha modal, diálogo e dropdown, devolvendo o foco à origem. Dropdowns abrem por clique e teclado, não por hover.
- **Leitor de tela:** idioma pt-BR; links da barra lateral com nome mesmo em 76px; `aria-current="page"` no item ativo; resumo de erros como alerta com links para os campos; mensagens inline associadas como descrição do campo; toasts em região de status.
- **Área de toque:** mínimo de 44×44px em ações de ícone no celular.

### 10.3 Movimento reduzido (prefers-reduced-motion)

Com `@media (prefers-reduced-motion: reduce)`:

- pulsos (indicador de conexão, etapa atual da timeline) ficam parados;
- entrada de modal, toast e diálogo vira só opacidade (ou nada);
- elevações de hover (sobe 1–2px) e destaque do cartão ficam sem movimento;
- rolagem até o resumo de erros é instantânea;
- o spinner de carregamento continua girando, mais devagar (1,5s por volta), por ser indicador de progresso.

A barra lateral não tem animação em nenhum cenário, então não precisa de tratamento aqui.

---

## 11. Pendências herdadas que a reconstrução deve resolver desde o início

1. **Peso de fonte não carregado.** O sistema atual usa peso 800 em títulos, KPIs e logo, mas só carrega Inter 400–700, e o navegador sintetiza o negrito. Na reconstrução: carregar 400, 500, 600, 700 e 800 (ou limitar o CSS a 700); nenhum peso usado sem estar carregado.
2. **Tokens de status duplicados.** Hoje há dois conjuntos (--status-…-cor em paleta.css e --status-…-text / --badge-cancelado-… em formulario.css), o badge de cancelado usa cores fixas e as pills do cartão usam azul, roxo e tons Tailwind. Na reconstrução: um único conjunto --status-{fase}-cor / -bg / -borda (seção 2.5), usado por badge, pill do cartão, coluna e KPI.
3. **KPIs que não se ajustam no celular.** Hoje a grade de KPIs tem 4 colunas escritas direto no HTML, anulando os pontos de quebra. Na reconstrução: colunas definidas só no CSS (4 → 2 → 1, seção 5.4); proibido definir grade no HTML.
4. Também herdados e já resolvidos por este documento: texto branco sobre pêssego (seção 2.3), textos secundário/mutado abaixo de 4,5:1 (seção 2.4), anel de foco azul e foco removido sem substituto (seção 10.2), Kanban inacessível por teclado (seção 5.3), ausência de prefers-reduced-motion (seção 10.3), cores fora da paleta (slate, azul, roxo, teal) e barra lateral colapsável com recorte animado (substituída pela versão estática da seção 4).

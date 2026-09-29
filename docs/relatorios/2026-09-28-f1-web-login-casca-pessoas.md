# Relatório — F1 — Interface: login, casca e pessoas

- **Data:** 2026-09-28
- **Agente / modelo:** agente-ux-ui (com as regras do agente-responsivo) / Opus
- **Fatia:** F1 (parte interface, `apps/web`)

## O que foi feito

1. **Tokens do design system** num único arquivo (`apps/web/src/estilos/tokens.css`): primitivas, suaves, semânticos com contraste corrigido, neutros, conjunto único de status, tipografia, espaçamento, raios, sombras, camadas, medidas de layout e movimento. Tema escuro só por troca de tokens em `:root[data-tema='escuro']`. A escolha claro/escuro fica no navegador (`localStorage`, chave `docsync.tema`); sem escolha, segue a preferência do sistema. Texto do item ativo da barra lateral no claro: **#A84F26** (token `--cor-nav-ativo-texto`); no escuro, #F69463. Fonte Inter 400, 500, 600, 700 e 800 carregada (`@fontsource/inter`, sem CDN).
2. **Login Microsoft** (MSAL, `@azure/msal-browser` 5 + `@azure/msal-react` 5): configuração vinda de `VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_CLIENT_ID` e `VITE_ENTRA_REDIRECT_URI`; escopo `api://{clientId}/acesso_usuario`; fluxo por redirecionamento; cache em sessionStorage. Tela "Acesse sua conta" com um único botão "Entrar com a conta Microsoft" (sem campos de senha nem acesso rápido) e botão de tema. Sem os IDs no `.env`, a tela avisa em vez de quebrar.
   - **Rota protegida:** sem sessão, vai para `/login?destino=<rota>`; o destino volta no `state` do MSAL e é validado **duas vezes** por `destinoSeguro()` (só aceita texto que começa com `/`, não com `//`, sem barra invertida nem caractere de controle, e que não seja a própria `/login`).
   - **Sair da conta:** `logoutRedirect`, voltando para `/login?aviso=saiu`.
   - **Token expirado:** `acquireTokenSilent` a cada chamada (renova sozinho); se falhar, ou se a API responder 401 `nao_autenticado`, a sessão local é limpa e a pessoa volta ao login com o aviso "Sua sessão expirou. Entre novamente para continuar." e a rota em que estava.
3. **Casca** (react-router 8): barra lateral estática como no documento 04, seção 4 (236px, `position: sticky`, 76px abaixo de 860px só por media query, textos ocultos visualmente, nunca `display:none`; sem colapso, animação, recorte, gradiente ou JS de aparência). A classe ativa e o `aria-current="page"` vêm da rota (`NavLink`), nada é medido. Logo "DocSync"; links **só** para "Início" (todos com perfil) e "Pessoas" (só se `pode(eu, 'gerenciarPessoas')`); rodapé com badge (iniciais, nome, perfil), botão de tema e "Sair da conta". Sem indicador "SharePoint" (não existe nesta fatia). O `App.tsx` "Em construção" da F0 foi substituído.
4. **Início:** saudação com o primeiro nome e cartão com nome, perfil e área vindos de `/eu`. Nenhum número ou cartão inventado.
5. **Estados:** "Acesso ainda não liberado. Peça ao administrador do DocSync." (perfil nulo) e "Seu acesso ao DocSync está inativo. Fale com o administrador do DocSync." (status Inativo ou 403 `inativo`), ambos sem navegação e com botão "Sair da conta". Carregando (região de status) e erro de conexão com "Tentar novamente" (região de alerta), na sessão e na tela Pessoas. Rota inexistente mostra "Página não encontrada" com link para o início.
6. **Pessoas** (Administrador; não-admin que digitar `/pessoas` volta ao Início, e a API também recusa): tabela com nome, e-mail, perfil, área, status (badge) e ações; busca por nome ou e-mail sem diferenciar acentos, com contagem anunciada; estado vazio. Formulário "Pré-cadastrar pessoa" com validação por script (`noValidate`, sem balões nativos), mensagens inline associadas ao campo (`aria-describedby`, `aria-invalid`), resumo de erros com links para os campos (recebe foco), "Salvando…" com spinner, toast de sucesso (região de status, 5s, pausa no hover/foco). 409 `email_existente` vira erro no campo de e-mail; 400 `dados_invalidos` distribui `campos` pelos campos. Edição de perfil/área e inativar/reativar em **diálogo customizado** (`<dialog>` modal: foco preso, Esc fecha, foco volta ao botão de origem), enviando só o que mudou. Erros da API em pt-BR (ex.: `ultimo_administrador` → "Não é possível remover o último administrador ativo."). Áreas **ativas**, sempre via `ordenarAlfabetico` (decisão 0006).
7. **Acessibilidade e responsivo:** foco visível global em `--cor-foco`; tudo é `<button>`/`<a>`/campo nativo; rótulos em todos os campos; `aria-current`; regiões de status/alerta; `prefers-reduced-motion` (entradas viram só opacidade, sem elevação no hover, spinner mais lento); alvos de 44px; tabela com rolagem horizontal **interna** (a página não rola de lado); formulário em 1 coluna abaixo de 640px.
8. **Testes:** Vitest + Testing Library (jsdom) para `destinoSeguro`/`urlDeLogin` (15 casos) e para a tela Pessoas com API simulada (8 casos: ordem alfabética, busca, validação sem chamar a API, pré-cadastro com toast, 409, diálogo de inativação com `ultimo_administrador`, edição enviando só o que mudou, erro de conexão com "Tentar novamente"). Playwright + axe (`npm run test:e2e`): login sem violações WCAG 2.1 A/AA e sem rolagem horizontal em 768, 1024 e 1440px nos dois temas, sem campos de senha; rota protegida redireciona guardando o destino; aviso de sessão expirada; tema alterna e persiste. `npm test` na raiz continua rodando só o Vitest (o projeto web só inclui `src/**/*.test.*`).

Resultados: `npm run typecheck` ok; `npm test` 84 testes ok (6 arquivos, incluindo os da API); `npm run build` ok; `npm run segredos` ok; `npm run test:e2e` 10 testes ok.

### Cores: Figma x documento 04 (superada pela decisão 0009)

> Esta seção descreve a primeira entrega. As cores foram substituídas pelo visual Vigen; ver a seção seguinte.

**O Figma não pôde ser lido nesta sessão**: a chamada ao MCP do Figma (`get_metadata` no arquivo N81a9PbiHbGLvuR5wG3qwW) respondeu "limite de chamadas do plano Starter". Todos os tokens seguem o **documento 04**, sem nenhuma cor do Figma aplicada. Portanto:

- divergências Figma x documento 04: **não levantadas** (pendência);
- cores rejeitadas por contraste: **nenhuma** (nenhuma cor do Figma foi avaliada).

Tokens criados além do documento 04 (valores derivados, não cores novas): `--cor-pessego-borda` (rgba pêssego 0,35, borda do item ativo, 04 4.2), `--cor-pessego-anel` (pêssego 18%, anel do campo, 04 7.2), `--cor-erro-anel` (erro 18%), `--cor-erro-fundo-botao-hover` (#b2352e, "escurecimento de 8%" do botão de perigo, 04 8.2; branco sobre ele ≈ 6,0:1), `--cor-nav-ativo-texto`/`-icone`, `--bg-toast`, `--bg-overlay`.

### Visual Vigen (decisão 0009)

O Eric enviou o design do Figma em PDF e aprovou o visual Vigen (azul-petróleo), mantendo nome, escopo e login Microsoft.

- **Tokens** (`apps/web/src/estilos/tokens.css`): todas as cores trocadas pelas da decisão 0009; grupos `--sidebar-*`, `--painel-marca-*`, `--botao-*`, estados (sucesso, erro, alerta, informação) em ponto/texto/fundo, `--cor-link`; conjunto único `--status-{fase}-cor/-bg/-borda` com o mapeamento da decisão. Tokens pêssego removidos.
- **Barra lateral:** fundo #0F2B34, texto #D9E3E8, ícones #90AFBD, logo num quadrado #4B798F, item ativo #193942 com marcador à esquerda (só CSS). Grupo "ADMINISTRAÇÃO" só aparece quando existe o link Pessoas. Continua estática (236px; 76px abaixo de 860px).
- **Login:** painel petróleo à esquerda com logo, frase e selos ISO; cartão branco à direita com o único botão "Entrar com a conta Microsoft". Empilha abaixo de 860px.
- **Início e Pessoas:** cabeçalho de página, tabela em cartão com cabeçalho cinza em caixa alta, badges com ponto, botão principal #4B798F (hover #396276), secundário com borda.
- **Regra #64748B:** só sobre #FFFFFF ou #F8FAFC; sobre #F1F5F9 usa-se #475569.
- **Tema escuro (aguarda aprovação do Eric):** página #0A1A20, cartão #10262E, campos #0D2128, bordas #1F3B45/#36586A, textos #E6EEF2/#B7C8D0/#90AFBD, barra #071820 com ativo #15323C; botão principal #4B798F.
- **Vitrine de testes:** `apps/web/e2e/vitrine/` monta a casca, Início e Pessoas com sessão e API simuladas (sem MSAL), servida só pelo Vite do Playwright na porta 5174, fora do build. `e2e/casca.spec.ts`: axe sem violações e sem rolagem horizontal em 768/1024/1440, nos dois temas.

Contrastes medidos (WCAG 2.1):

| Par | Contraste |
|---|---|
| #0F172A / #FFFFFF | 17,85:1 |
| #475569 / #FFFFFF | 7,58:1 |
| #475569 / #F1F5F9 | 6,92:1 |
| #64748B / #FFFFFF | 4,76:1 |
| #64748B / #F8FAFC | 4,55:1 |
| Branco / #4B798F (botão) | 4,74:1 |
| Branco / #396276 (hover, link, foco) | 6,60:1 |
| Branco / #B91C1C (perigo) | 6,47:1 |
| Barra #D9E3E8 / #0F2B34 | 11,38:1 |
| Barra #90AFBD / #0F2B34 | 6,40:1 |
| Barra #D9E3E8 / #193942 (ativo) | 9,44:1 |
| Login branco / #0F2B34 | 14,84:1 |
| Fases: #047857/#ECFDF5 5,21 · #475569/#F1F5F9 6,92 · #1D4ED8/#EFF6FF 6,16 · #B91C1C/#FEF2F2 5,91 · #B45309/#FFFBEB 4,84 | — |
| Escuro: #E6EEF2/#10262E 13,35 · #B7C8D0/#10262E 9,10 · #90AFBD/#0A1A20 7,66 · barra #D9E3E8/#071820 13,88 · badges 7,03 a 8,24 | — |

O par proibido #64748B / #F1F5F9 (4,34:1) não é usado.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `apps/web/package.json` | Dependências (MSAL, react-router, lucide-react, @fontsource/inter, `@docsync/compartilhado`), dev (Testing Library, jsdom, Playwright, axe); script `test:e2e`. |
| `package.json` (raiz) | Script `test:e2e`. |
| `package-lock.json` | Dependências novas. |
| `apps/web/tsconfig.json` | Inclui `e2e/` e configs de teste. |
| `apps/web/vitest.config.ts` | Novo: projeto "web" (jsdom, só `src/**/*.test.*`). |
| `apps/web/playwright.config.ts`, `apps/web/e2e/login.spec.ts` | Novos: testes de tela com axe. |
| `apps/web/src/main.tsx` | Fontes, tokens, tema, MSAL (initialize + retorno do login), roteador. |
| `apps/web/src/App.tsx` | Substitui o "Em construção" da F0 pelas rotas. |
| `apps/web/src/vite-env.d.ts` | Tipos das variáveis `VITE_ENTRA_*`. |
| `apps/web/src/tema.ts` | Tema claro/escuro guardado no navegador. |
| `apps/web/src/estilos/tokens.css`, `base.css` | Tokens e estilos globais (foco, ocultação visual, movimento reduzido). |
| `apps/web/src/autenticacao/msal.ts`, `Sessao.tsx`, `redirecionamento.ts` (+ teste) | Login, rota protegida, sessão expirada, destino seguro. |
| `apps/web/src/api/cliente.ts`, `erros.ts` | Cliente HTTP com Bearer e mensagens em pt-BR. |
| `apps/web/src/componentes/` | Botao, Campo, Dialogo, Toast, BotaoTema, Estados (carregando/erro). |
| `apps/web/src/telas/` | TelaLogin, TelaAviso, Casca, TelaInicio, TelaPessoas (+ teste) e CSS Modules. |
| `apps/web/src/testes/configurar.ts` | Configuração do Testing Library. |
| `CLAUDE.md` (seção 7) | Onde ficam os tokens, componentes, login MSAL, `test:e2e`. |
| `CHANGELOG.md` | Linha da entrega. |

## O que ficou pendente

1. **Conferir as cores do Figma** quando houver acesso (plano do Figma com mais chamadas de MCP, ou exportação das variáveis pelo Eric). Levantar divergências e testar contraste antes de trocar tokens.
2. **Casca e Pessoas sem teste Playwright:** dependem de sessão Microsoft real. Coberto por Vitest (Pessoas) e validação manual abaixo; para automatizar, seria preciso simular o MSAL no navegador (a decidir).
3. Os valores de texto calculados e ainda não validados pelo Eric (04, notas das seções 2.4 e 2.5: `--text-secondary`, `--text-muted`, #5f6064, #983F46, #8a5a10) seguem como estão; o axe não apontou problema na tela de login.
4. Pacote JS com ~540 kB (aviso do Vite, sobretudo MSAL). Dividir em partes pode ficar para uma fatia posterior.
5. Comportamento real de renovação da sessão (decisão 0008) só pode ser medido com o locatário de teste.
6. Na sessão expirada, a limpeza é local (`clearCache`); a sessão da Microsoft continua, então o novo "Entrar" normalmente não pede senha de novo.

## Como validar

Pré-requisitos: `.env` na raiz com `VITE_ENTRA_*` e `ENTRA_*` do locatário de teste; `npm install`; na primeira vez, `cd apps/web && npx playwright install chromium`.

1. Na raiz: `npm run typecheck`, `npm test`, `npm run build`, `npm run segredos`, `npm run test:e2e`: tudo passa.
2. `npm run dev` e abrir `http://localhost:5173/pessoas` sem sessão: vai para "Acesse sua conta" (`/login?destino=%2Fpessoas`). Trocar para o tema escuro no botão do topo e recarregar: o tema fica.
3. "Entrar com a conta Microsoft" com a conta do Eric (primeiro Administrador): depois do login, volta para **/pessoas**.
4. Barra lateral: "Início" e "Pessoas", item ativo com texto #A84F26 no claro; em 768px, barra de 76px só com ícones (leitor de tela continua lendo os nomes); nenhuma rolagem horizontal em 768px e 1440px.
5. Pessoas: enviar o formulário vazio (resumo + mensagens inline); pré-cadastrar uma pessoa fictícia (toast, linha nova); repetir o e-mail (erro no campo); conferir áreas em ordem alfabética; editar perfil/área; tentar inativar o único Administrador (mensagem "Não é possível remover o último administrador ativo."); tudo por teclado (Tab, Enter, Esc no diálogo).
6. Entrar com uma conta de teste sem perfil: tela "Acesso ainda não liberado. Peça ao administrador do DocSync." sem navegação, com "Sair da conta". Inativar essa pessoa e entrar de novo: tela de acesso inativo.
7. Parar a API com a interface aberta e clicar em "Tentar novamente": mensagem de conexão; religar a API e tentar de novo: carrega.
8. Sessão expirada: apagar as chaves do MSAL no sessionStorage (DevTools) e navegar: volta ao login com "Sua sessão expirou".
9. "Sair da conta": sai da Microsoft e volta para o login com "Você saiu da conta.".

## Decisões tomadas ou necessárias

- Nenhuma decisão grande. Escolhas de implementação dentro da stack aprovada (0001): `react-router` para rotas, `@fontsource/inter` para servir a fonte localmente, `<dialog>` nativo para o diálogo customizado.
- **Necessária:** como obter as variáveis do Figma (plano ou exportação manual) para fechar a conferência de cores da decisão 0005.

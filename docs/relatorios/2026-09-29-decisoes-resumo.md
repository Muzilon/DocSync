# Resumo de Decisões 0001–0015

- **Data:** 2026-09-29
- **Escopo:** leitura completa de todas as decisões arquivadas.

## Decisões

| Nº | Título | Status | Decisão (1 linha) | Consequência-chave |
|---|---|---|---|---|
| **0001** | Stack tecnológica | Aprovada | React + TypeScript + Vite (front), Node + Fastify (API), Vitest + Playwright + axe (testes). Sem Tailwind. | Monorepo npm workspaces; cada módulo entra por fatias; troca de biblioteca nunca substitui tudo. |
| **0002** | Fonte da verdade | Aprovada | PostgreSQL próprio atrás da API; concorrência otimista por versão; gravação idempotente por ID. | Excel para importação/exportação só. Power Automate sai. Padrões de ID estável e histórico acumulativo continuam. |
| **0003** | Ambiente local | Aprovada (PGlite em 28/09) | Banco local via PGlite; arquivos em pasta local atrás de interface; login real pelo Entra (locatário de teste). | Nenhuma URL de produção nem segredo no repositório. Ida para Azure será decisão nova. |
| **0004** | Revisões e reativação | Aprovada | Aprovado é final. Revisão = documento novo (ID novo, `idDocumentoOrigem`). Reativação volta ao status anterior ao cancelamento. | Evento cancelamento guarda `statusAnterior`. Lista mestra usa revisão mais alta aprovada de cada código. |
| **0005** | Telas computador/tablet | Aprovada | Responsivo 768px+; sem celular. Barra lateral estática só CSS (236px, 76px abaixo 860px). | Módulo 3.6 sai da ordem. Agente `agente-responsivo` substitui o antigo `agente-layout-mobile`. |
| **0006** | Nome e áreas | Aprovada | Produto = **DocSync**. Áreas em lista mantida (Comercial, Custos, Engenharia, Qualidade, Saúde Ocupacional, Segurança, SGA, Suprimentos), sempre em ordem alfabética pt-BR. | Ordem calculada com `localeCompare`, nunca fixa. Novas áreas criadas por Administrador. |
| **0007** | Usuários e perfis | Aprovada | Entra prova identidade; perfil e área no DocSync. Primeiro Administrador via `ADMINISTRADORES_INICIAIS`. Pré-cadastro por e-mail corporativo. | Tela Pessoas entra já na F1 (mínima). Tabela de usuários antecipada. API consulta perfil no banco a cada requisição. |
| **0008** | Locatário Entra de teste | Aprovada | Eric cria locatário gratuito com conta pessoal, registra app SPA (localhost:5173), cria usuários fictícios. Tenant ID e client ID só em .env local. | Nenhum dado real da Monto. Registro no locatário da Monto pendência obrigatória futura. |
| **0009** | Identidade visual Vigen | Aprovada (tema escuro em 29/09) | Azul-petróleo (#0F2B34, #4B798F) + neutros cinza-azulados. Paleta exata do PDF. Barra lateral escura. Cancelado muda de vermelho para grafite (#E2E8F0). | Só tokens em `tokens.css` mudam. Nome (DocSync), barra estática, MSAL, acessibilidade (4,5:1) não mudam. Documento 04 continua. |
| **0010** | Prazo (D. revisão) e área Admin | Aprovada | Prazo sai do formulário (cálculo automático depois). Administrador pertence à área **Qualidade**. `AREA_ADMINISTRADOR_INICIAL` = padrão. | KPIs "Vencendo/Atrasados" vazios para docs novos até cálculo chegar. Permissão aceita Admin sem área (segurança). |
| **0011** | Prazo automático e reprogramação | Aprovada | Prazo automático = data cadastro + 30 dias (calculado no servidor). Reprogramação por botão com justificativa obrigatória. "Reprogramado" = etiqueta no Kanban. Só Qualidade e Admin reprogramam. | Nova ação de permissão `reprogramarPrazo`. Novo tipo de evento no histórico. KPIs ganham valor para todos os documentos. |
| **0012** | Data recebimento automática e metas | Aprovada | Data recebimento automática no servidor (fuso SP); sai do formulário. Metas: 14 dias (início revisão), 40 dias (conclusão). Reprogramação só adia. | Mudança mínima API. F5 grava data entrada revisão e aprovação. Prazo (30 dias) e meta (40 dias) são medidas diferentes. |
| **0013** | Marca d'água, visualizador, acesso | **Substituída 0014** | Visualizador PDF, marca "CÓPIA NÃO CONTROLADA" diagonal 60% transparência, registro imutável. Não-PDF sem marca, nome começa "COPIA-NAO-CONTROLADA_". | Dependências `pdf-lib` e `pdfjs-dist`. Migração nova. Marca aplicada no servidor, arquivo original intacto. |
| **0014** | Download, nome arquivo, versões | Aprovada (substitui 0013) | Sem marca, sem visualizador na tramitação. Download direto. Nome padrão: `[código]-[título]_[revisão]=[versão].[ext]`. Registro acesso mantido. Anexos: nome original. Versões (F7). | 0013 rescindida. API remove marca. Leitor **não** baixa. Só Admin, Qualidade e Solicitante da área. |
| **0015** | Cartão Planner, sem botões | Aprovada | Cartão só leitura (etiqueta, título, área, rodapé com prazo + responsável). Clicar abre detalhes. Todas ações nos detalhes. Prazo: neutra/laranja (5d)/vermelha (vencido). Reprogramar só com prazo vencido. | Contrato F3/F4 superado. Novo agente `agente-visao-minimalista` revisa cartões. |

## Regras que os agentes precisam saber

- **ID estável:** todo registro novo (documentos, pessoas, áreas, eventos, arquivos, acessos) recebe ID único UUID com prefixo (DOC-, USR-, AREA-, etc.), nunca reaproveitado.
- **Histórico imutável:** eventos de tramitação gravados por gatilho (UPDATE/DELETE/TRUNCATE bloqueados). Autor sempre é a identidade autenticada.
- **Banco é fonte de verdade:** gravação idempotente pelo ID; concorrência otimista por versão (versao++); nada apagado antes de validado.
- **Permissões únicas:** função `pode(pessoa, acao, contexto?)` em `packages/compartilhado`; API deriva filtros de visibilidade dela; documento inválido = 404.
- **Prazo:** 30 dias corridos a partir do recebimento. Reprogramação só adia (não antecipa), só com prazo vencido, justificativa 10–500 caracteres.
- **Aprovado é final:** nenhum "Reabrir". Revisão = documento novo com `idDocumentoOrigem`. Código único por código + revisão.
- **Reativação:** volta ao status anterior do cancelamento. Evento CANCELAMENTO guarda `statusAnterior`.
- **Máquina de estados:** DESTINOS_POR_FASE em `transicoes.ts` (Solicitante: só seus pares; Admin/Qualidade: todos); API confere depois do cliente.
- **Áreas:** lista mantida, sempre alfabética pt-BR. Novas criadas por Admin (F11). Qualidade é a área do Admin.
- **Perfil:** Entra prova identidade; perfil e área no banco do DocSync. Consulta a cada requisição. Mudança vale já.
- **Formulários:** validação por script (noValidate); resumo erros focável; inline via aria-describedby; Toast 8s (ação opcional).
- **Diálogos:** componente `Dialogo` (foco preso, Esc fecha, Tab ciclado). Variantes `larga` (listas) e `detalhes` (980px, ✕ cabecalho).
- **Kanban:** colunas rolam por dentro; cartão só leitura (etiqueta, título, área, prazo, responsável); todas ações em detalhes; largura mínima token `--kanban-coluna-min`.
- **Temas:** escuro em `:root[data-tema='escuro']`; preferência em localStorage `docsync.tema`; 4,5:1 contraste mínimo WCAG 2.1.
- **Segredos:** fora do Git (variáveis ambiente, .env local, cofre); secretlint pre-commit + gitleaks CI; VITE_* são públicos (client ID, tenant ID só).

## Conflitos ou decisões substituídas

- **0013 → 0014 (2026-09-29):** marca d'água, visualizador e nome prefixado "COPIA-NAO-CONTROLADA_" **saem** da tramitação. Registro de acesso **continua**. Download direto com nome padronizado `[código]-[título]_[revisão]=[versão].[ext]`.
- **0009 altera cores 04 e 0005:** paleta pêssego → azul-petróleo. Barra lateral estática continua CSS. Cancelado muda de vermelho (#EF4444) para grafite (#E2E8F0) em 29/09.
- **0012 completa 0011:** data recebimento sai formulário; prazo continua 30 dias (recebimento + 30).
- **0015 altera contratos F3/F4:** reprogramar só vencido (era "sempre"). Cartão só leitura (era com botão "Ação Principal + Reprogramar").

# Plano da Fundação

Versão publicada para compartilhar: https://claude.ai/artifact/FbhAk8aEz8sfoSCRoSsLd1

Cada fatia funciona de ponta a ponta (tela, regra, dados e permissão), é revisada pelo `agente-qa-revisao` e validada pelo Eric antes da próxima. Nenhuma fatia é uma reescrita total. Telas para computador e tablet a partir de 768px.

| # | Fatia | Entrega | Validação do Eric | Agentes | Situação |
|---|---|---|---|---|---|
| F0 | Configuração inicial | CLAUDE.md, CHANGELOG, decisões, agentes, verificação de segredos, esqueleto compilando. Nenhuma tela. | Commit com segredo falso é bloqueado; build e testes passam. | Claude, `agente-pesquisa` | Validada |
| F1 | Casca + login Microsoft + pessoas e perfis | Login Entra ID; API recusa sem token; "acesso ainda não liberado"; tela mínima de pessoas (decisão 0007); sessão que expira; barra lateral estática; tokens claro e escuro com as cores do Figma. | Entrar com a própria conta; pré-cadastrar uma pessoa; conta sem perfil é barrada; 768px e 1440px. | `agente-autenticacao-microsoft`, `agente-ux-ui` | Validada |
| F2 | Modelo de dados + cadastro | Documento, evento e domínios; formulário completo (P-01 a P-05, P-09); arquivos em pasta local; evento CRIACAO com autor do token; idempotência. | Cadastrar; reenviar não duplica; Leitor não cadastra. | `agente-arquitetura-dados`, `agente-integridade-sincronizacao`, `agente-feedback-acessibilidade` | Validada |
| F3 | Painel Kanban | 5 colunas, cartões, devoluções, prazos, KPIs corrigidos (P-12, P-13), prazo automático de 30 dias, reprogramação só para adiar com justificativa, data de recebimento automática (decisões 0011 e 0012), busca, filtro de área, cancelados, teclado. | Comparar com o sistema antigo. | `agente-ux-ui`, `agente-responsivo` | Validada |
| F4 | Detalhes + histórico | Modal visualizar e histórico, timeline, diferenças, foco preso. | Abrir pelo teclado; autor correto. | `agente-ux-ui` | Validada |
| F5 | Mudança de status | KPI Aprovados no mês e metas de 14/40 dias (decisão 0012); ações rápidas e "Atualizar Etapa" validadas no servidor; responsável obrigatório; cancelar com Desfazer; reativar para o status anterior; conflito de versão. | Transição proibida é recusada. | `agente-arquitetura-dados`, `agente-ux-ui` | Validada |
| F6 | Edição de dados | Mesma obrigatoriedade do cadastro (P-14); evento EDICAO com diferenças. | Conferir "antes → depois". | `agente-ux-ui` | Validada |
| F7 | Anexos posteriores + versões | Anexo nunca cria documento; evento ANEXO; nova versão do arquivo com justificativa e histórico de versões (decisão 0014). | Anexar e ver o evento. | `agente-integridade-sincronizacao`, `agente-ux-ui` | — |
| F8 | Revisão técnica vinculada | Documento novo com `idDocumentoOrigem`; código único por código + revisão (decisão 0004). | Revisão 1 ligada ao original. | `agente-arquitetura-dados`, `agente-ux-ui` | — |
| F9 | Offline e fila de envio | Rascunho local, faixa offline, fila com intervalo crescente, "Tentar agora". | Desligar a rede, cadastrar, religar. | `agente-integridade-sincronizacao`, `agente-feedback-acessibilidade` | — |
| F10 | Exportação CSV | Do Painel, filtrada ou completa (P-18, P-19). | Abrir no Excel com acentos. | `agente-ux-ui` | — |
| F11 | Administração | Áreas e tipos (ordem alfabética), complemento da tela de pessoas. | Qualidade não acessa; área nova aparece no formulário. | `agente-arquitetura-dados`, `agente-ux-ui` | — |
| F12 | Importação + validação paralela | Importador que preserva IDs e histórico; comparação tela por tela. Aposentar o antigo é passo separado. | Importar uma cópia e comparar. | `agente-integridade-sincronizacao`, `agente-qa-revisao` | — |

Ideia registrada pelo Eric (2026-09-29), a definir antes de entrar na ordem: **painel próprio para quem só acompanha** (visualizador), diferente do Kanban de trabalho da Qualidade. Até lá, o Solicitante usa o Painel travado na sua área.

Depois da Fundação: Indicadores → Validade → Minha fila → Notificações → Lista mestra → Treinamentos → NC → Portal → Busca → Auditoria.

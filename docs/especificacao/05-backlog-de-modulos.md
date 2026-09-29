# 05. Backlog de módulos e funcionalidades

Backlog consolidado para a reconstrução do DocFlow num repositório novo. Cada entrada descreve o módulo como funcionalidade de um sistema novo, não como correção do código anterior.

- **Fonte:** as 14 ideias registradas em `ideias_implantadas/modelos/` (3, já validadas na versão anterior) e `ideias/modelos/` (11, aprovadas e ainda não implementadas).
- **Fora deste backlog:** a ideia de migração para TypeScript, que não se aplica a uma reconstrução do zero (a escolha de linguagem é decisão de arquitetura da nova base).
- **Prioridade:** herdada da ideia original.
- **Base comum:** todos os módulos pressupõem o módulo central de **tramitação de documentos** (cadastro, Kanban por etapas, histórico de cada mudança). Ele não aparece como entrada própria porque é o sistema em si, mas está na ordem de construção.

---

## Bloco 1. Já validado: portar para a nova base

### 1.1 Integridade e sincronização dos dados

- **Situação:** já validada (versão anterior).
- **Prioridade:** Alta.
- **Origem:** `ideias_implantadas/modelos/modelo_problema/2026-09-28_integridade-sincronizacao.md`.
- **Objetivo:** garantir que nenhum cadastro, mudança de status ou evento de histórico se perca ou seja aplicado ao documento errado, mesmo com falha de rede, vários usuários ao mesmo tempo ou edição direta na fonte de dados. A base de dados precisa ser a fonte da verdade confiável, inclusive como evidência de auditoria do SGI.
- **Principais elementos:**
  - Identificador único e imutável para cada documento, criado no cadastro. Toda ação (mover, editar, cancelar, desfazer, auditar) localiza o registro por esse ID, nunca pela posição numa lista nem pelo código ou título.
  - Data de modificação em cada registro e regra de concorrência: a gravação mais antiga que a da base recebe "conflito" e a tela aplica o valor atual, avisando o usuário.
  - Gravações idempotentes: repetir o mesmo envio não duplica linhas. Atualizar é sempre atualizar, nunca inserir.
  - Fila de envios pendentes com nova tentativa automática (intervalo crescente, limite de tentativas, reenvio manual), preservando a ordem por documento.
  - Nenhuma falha silenciosa: aviso na tela, contador de pendências no cabeçalho e marca "não sincronizado" no cartão.
  - Histórico acumulativo: eventos mesclados pelo ID do evento, nunca descartados nem duplicados. Anexos também geram evento.
- **Dependências:** nenhuma. É pré-requisito de quase todos os outros módulos.

### 1.2 Feedback de envio, validação visível e acessibilidade

- **Situação:** já validada (versão anterior).
- **Prioridade:** Alta.
- **Origem:** `ideias_implantadas/modelos/modelo_design/2026-09-28_feedback-envio-e-acessibilidade.md`.
- **Objetivo:** o usuário sempre sabe se o registro foi gravado ou por que não foi, e nunca perde o que digitou. Os botões principais, o foco e o Kanban precisam ser utilizáveis por quem depende de contraste, teclado ou menos movimento (WCAG 2.1 AA).
- **Principais elementos:**
  - Botão de envio com estados padrão, "Registrando…" (bloqueia segundo clique), "Registro pendente" (offline).
  - Formulário limpo só depois da confirmação de gravação. Em erro, banner com "Tentar novamente" e todos os dados preservados.
  - Modo offline: faixa de aviso, rascunho guardado localmente e reenvio automático ao reconectar.
  - Validação por script (sem balões nativos do navegador): mensagem inline por campo, resumo de pendências com links para os campos, área de upload com arrastar e soltar.
  - Toast de sucesso com link "Ver no painel" que destaca o cartão criado.
  - Paleta com contraste mínimo de 4,5:1 nos CTAs, anel de foco visível em todo elemento interativo, Kanban e timeline operáveis por teclado, respeito à preferência por menos movimento, anúncios para leitor de tela.
- **Dependências:** nenhuma. Define o padrão de componentes e tokens que todos os módulos reutilizam.

### 1.3 Painel de Indicadores do SGI

- **Situação:** validada em parte. A versão anterior entregou um modal com KPIs da própria tramitação (lead time, gargalo atual, taxa de devolução, tempo médio por fase, documentos por área). O módulo completo de indicadores do SGI, descrito abaixo, é o alvo da nova base.
- **Prioridade:** Média.
- **Origem:** `ideias_implantadas/modelos/modelo_funcao/2026-09-28_painel-indicadores-sgi.md`.
- **Objetivo:** tirar os indicadores de Qualidade, Meio Ambiente, Segurança e Saúde Ocupacional das planilhas e dar a toda a empresa uma visão viva de "está bom ou ruim, melhorando ou piorando". Serve também de evidência de monitoramento e medição (cláusula 9.1 das ISO 9001, 14001 e 45001) na análise crítica e nas auditorias.
- **Principais elementos:**
  - **Visão pública (leitura):** cartões por indicador com último valor, meta, farol (verde, âmbar, vermelho, cinza sem dado), seta de tendência e minigráfico; faixa de resumo por farol; filtros por pilar, área e farol; detalhe com gráfico histórico, fórmula, fonte, responsável e comentários de análise.
  - **Visão de gestão:** cadastro de indicadores (código único e imutável, polaridade maior/menor/faixa, tolerância do âmbar, frequência, meta), lançamento periódico com prévia do farol e comentário obrigatório quando vermelho, importação inicial de planilha com prévia e relatório de erros.
  - Regras de cálculo de período, farol e tendência isoladas e testáveis; meta aplicada gravada em cada lançamento; indicador só é inativado, nunca apagado.
  - KPIs da tramitação (os já validados) como um grupo de indicadores calculados automaticamente.
- **Dependências:** tramitação (para os KPIs da tramitação); autenticação real (para abrir o lançamento aos responsáveis por indicador). É fonte para Controle de validade (indicador de % dentro da validade), Portal do SGI, Busca global, Não Conformidades (fase com NC sugerida por farol vermelho) e Painel de auditoria.

---

## Bloco 2. Prioridade Alta

### 2.1 Autenticação com conta Microsoft e perfis de acesso

- **Situação:** nova.
- **Prioridade:** Alta.
- **Origem:** `ideias/modelos/modelo_problema/2026-09-28_login-microsoft.md`.
- **Objetivo:** identidade comprovada e permissões que restringem de verdade, no servidor e não só na tela. Sem isso, a aprovação de informação documentada não vale como evidência (não há como provar quem aprovou) e dados de colaboradores ficam expostos.
- **Principais elementos:**
  - Login único com a conta corporativa (Microsoft Entra ID). Nenhuma senha própria do sistema, nenhum usuário de teste em produção.
  - Sessão com expiração e renovação; rota protegida exige sessão válida; redirecionamento pós-login só para páginas do próprio sistema.
  - Perfis vindos de grupos do Entra (Administrador, Qualidade, Solicitante, Leitor), com o perfil mais alto prevalecendo. Conta sem grupo vê "acesso não liberado".
  - Uma função única de permissão por ação e documento, aplicada na interface (botões ocultos) e na API (ação recusada). Tabela de permissões: ver, cadastrar, anexar, responder devolução, mover etapa, aprovar, editar, cancelar/reativar, importar, exportar.
  - Autor de cada evento do histórico gravado a partir da identidade autenticada, nunca informado pelo navegador.
  - Nenhum endereço de integração ou segredo exposto no front-end; toda gravação passa por chamada autenticada.
- **Dependências:** nenhuma de módulo; depende da TI para registrar o aplicativo e criar os grupos, e de hospedagem com HTTPS. É pré-requisito de Notificações, Minha fila (responsável confiável), visões por gestor/colaborador em Treinamentos e NC, e do lançamento de indicadores pelos responsáveis.

### 2.2 Controle de validade e revisão periódica dos documentos

- **Situação:** nova.
- **Prioridade:** Alta.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_controle-validade-documentos.md`.
- **Objetivo:** fechar o ciclo de vida do documento depois da aprovação (vigente, a vencer, vencido, em revisão, substituído), para que nenhum documento chegue vencido a uma auditoria. Atende à cláusula 7.5 das três normas (análise crítica e atualização da informação documentada).
- **Principais elementos:**
  - Periodicidade de revisão por tipo de documento, configurável pelo Administrador (registros como RL, AT e LD marcados "Não se aplica"), com ajuste individual justificado.
  - Na aprovação, gravação da data de aprovação e cálculo da próxima revisão; edição manual só pelo Administrador, com justificativa no histórico.
  - Estado de validade sempre calculado a partir das datas (Vigente, A vencer 60, A vencer 30, Vencido, Revisão em andamento), com selo de cor, texto e ícone no cartão e no detalhe.
  - Filtro e KPI de validade no painel; indicador de "% de documentos dentro da validade".
  - Faixa de aviso ao entrar no sistema (responsável vê os seus, Administrador vê todos).
  - Ação "Iniciar revisão periódica": abre a revisão técnica pré-preenchida e cria uma tramitação vinculada ao original pelo ID; uma revisão aberta por vez; ao aprovar a nova versão, o original vira Substituído.
  - Lista "Validade não definida" para documentos migrados sem data de aprovação.
- **Dependências:** tramitação e integridade de dados (ID estável, vínculo entre versões); Indicadores (recebe o KPI de validade). Alimenta Lista mestra, Notificações (gatilho de validade), Treinamentos (retreinamento por nova revisão) e Painel de auditoria.

### 2.3 Matriz de treinamentos ligada aos documentos

- **Situação:** nova.
- **Prioridade:** Alta.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_matriz-treinamentos.md`.
- **Objetivo:** fechar o ciclo "documento aprovado, pessoas treinadas, competência comprovada" (cláusula 7.2 das normas) e controlar vencimentos de NRs com reciclagem. Hoje não se sabe quem falta treinar, e a revisão de um documento não dispara retreinamento.
- **Principais elementos:**
  - Cadastro de treinamentos (código imutável, tipo, pilar, carga horária, validade em meses, método de avaliação de eficácia) com vínculo a um ou mais documentos e à revisão de referência.
  - Matriz cargo x treinamento (obrigatório ou recomendado), editável e importável.
  - Colaboradores importados da planilha do RH (matrícula como chave; novos, alterados e desligados mostrados antes de gravar; nunca apagar, só inativar).
  - Turmas com sugestão de participantes, presença digital ou importada, anexo da lista assinada.
  - Avaliação de eficácia por participante, com prazo; "não eficaz" mantém a pendência.
  - Retreinamento automático quando um documento vinculado é aprovado em revisão maior, com dispensa justificada.
  - Situação por colaborador com precedência definida, percentual de cumprimento por colaborador, área e geral, e lista de vencimentos (30, 60, 90 dias).
  - Visão pública só com agregados (nenhum nome de colaborador); visão de gestão completa. Minimização de dados pessoais (LGPD).
- **Dependências:** tramitação e integridade de dados (vínculo por ID e revisão aprovada); Controle de validade (nova revisão aprovada dispara retreinamento); autenticação real (visões de gestor e colaborador). Alimenta Portal do SGI (agenda), Busca global e Painel de auditoria.

---

## Bloco 3. Prioridade Média e Baixa

### Prioridade Média

#### 3.1 Não Conformidades e Planos de Ação

- **Situação:** nova.
- **Prioridade:** Média.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_nao-conformidades-planos-acao.md`.
- **Objetivo:** conduzir o ciclo completo de NC exigido pelas normas (reação, análise de causa, ação corretiva, verificação de eficácia, evidência) num só lugar. Evita ações esquecidas, causa raiz rasa e NC encerrada sem confirmar que o problema não voltou.
- **Principais elementos:**
  - Etapas Aberta, Em análise, Plano de ação, Verificação de eficácia, Encerrada (e Cancelada), com transições validadas: o sistema explica o que falta em vez de mover.
  - Abertura com origem, pilar, tipo (real, potencial, oportunidade de melhoria), gravidade, área, requisito da norma e ação imediata; número sequencial por ano confirmado pelo servidor.
  - Análise de causa com 5 porquês encadeados e Ishikawa 6M em lista, causa raiz consolidada e abrangência.
  - Plano 5W2H com várias ações por NC, responsável, prazo, status, evidência, prorrogação justificada e selo de atraso.
  - Verificação de eficácia com data prevista; "não eficaz" abre nova rodada de análise preservando o histórico.
  - Kanban de NC e Kanban de ações com filtro "Minhas ações"; tela de KPIs (abertas por pilar, ações atrasadas, tempo médio de encerramento, taxa de eficácia, reincidência).
  - Vínculo com documentos da tramitação por ID (referência "NC nº" no detalhe do documento), com indicadores e com treinamentos.
- **Dependências:** tramitação e integridade de dados; autenticação real (responsáveis de ação fora da Qualidade). Com Indicadores e Treinamentos já prontos na nova base, os vínculos deixam de ser texto livre e a NC pode ser sugerida a partir de farol vermelho. Alimenta Notificações, Portal do SGI (atalho "Abrir NC"), Busca global e Painel de auditoria.

#### 3.2 Notificações por e-mail (Outlook) e Teams

- **Situação:** nova.
- **Prioridade:** Média.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_notificacoes-email-teams.md`.
- **Objetivo:** avisar ativamente quem precisa agir (documento devolvido, atribuído, com prazo próximo ou atrasado, com validade a vencer), acabando com a cobrança manual e deixando registro de que o aviso foi dado.
- **Principais elementos:**
  - Gatilhos: mudança de status, atribuição de responsável, devolução à área, prazo (5, 2 e 0 dias e atraso) e validade (60, 30 e 7 dias).
  - Matriz de destinatários por papel (remetente, responsável, Qualidade, Administrador), com avisos obrigatórios que não podem ser desligados.
  - Regras anti-spam: agrupamento em janela de 10 minutos, respeito ao "Desfazer", deduplicação por chave, lembretes por marco, teto diário por pessoa, horário comercial, sem autoaviso.
  - Mensagens padronizadas com link direto ao documento (pelo ID, exigindo login), sem anexos nem conteúdo do documento.
  - Resumo diário opcional (nunca vazio).
  - Tela "Minhas notificações": canal (Teams, Outlook, ambos), gatilhos, silenciar por período ou por documento.
  - Registro de toda notificação (enviada, adiada, suprimida, falhou) retido por 12 meses como evidência.
  - Responsável da etapa escolhido entre usuários cadastrados (não texto livre).
- **Dependências:** tramitação e integridade de dados; autenticação real (e-mail confiável do destinatário); Controle de validade (gatilho de validade). Pode ser estendido depois para Treinamentos (vencimentos), NC (ações atrasadas) e Indicadores (lançamento pendente).

#### 3.3 Tela inicial "Minha fila"

- **Situação:** nova.
- **Prioridade:** Média.
- **Origem:** `ideias/modelos/modelo_design/2026-09-28_minha-fila.md`.
- **Objetivo:** abrir o sistema já respondendo "o que eu preciso fazer agora?", sem varrer as colunas do Kanban. Reduz documentos parados sem dono e a cobrança manual da Qualidade.
- **Principais elementos:**
  - Três contadores clicáveis e três blocos: "Comigo" (responsável da etapa atual), "Devolvidos à minha área" e "Prazos" (atrasados e vencendo em até 5 dias).
  - Linha de documento com código, revisão, status, prazo, área, tempo na etapa, número de devoluções e ações rápidas conforme a etapa e o perfil.
  - Ações sem campos obrigatórios mudam na hora com "Desfazer"; devolução e envio para aprovação abrem o controle de etapa já preenchido.
  - Estados de carregando, vazio por bloco, "Fila em dia", erro e sem conexão.
  - Tela inicial por perfil (Solicitante na Minha fila; Qualidade e Administrador no painel geral), com preferência do usuário; chip "Só os meus" no Kanban.
  - Mesmas regras, dados e modal do Kanban: são duas visões dos mesmos dados.
- **Dependências:** tramitação e integridade de dados; autenticação real (comparar responsável e área com o usuário logado); responsável da etapa como usuário cadastrado (mesmo requisito de Notificações); Feedback e acessibilidade.

#### 3.4 Lista mestra pública de documentos

- **Situação:** nova.
- **Prioridade:** Média.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_lista-mestra-documentos.md`.
- **Objetivo:** ser a fonte oficial de consulta da revisão vigente de cada documento do SGI, sem login, e impedir o uso de versões obsoletas (cláusula 7.5). Elimina a lista mestra paralela em planilha e responde ao auditor em segundos.
- **Principais elementos:**
  - Aba "Vigentes": só documentos aprovados na revisão mais alta de cada código, com código, título, tipo, área, revisão, data de aprovação, próxima revisão e link para a versão vigente.
  - Aba "Obsoletos": revisões substituídas e documentos cancelados já aprovados, com data de obsolescência e substituto, sem link para o arquivo.
  - Busca por código ou título e filtros por tipo, área e situação da próxima revisão (em dia, vencendo, vencida), sinalizada por cor e texto.
  - Exportação em PDF e Excel do recorte exibido, com data de emissão, filtros e o aviso "Cópia não controlada quando impressa".
  - Alerta visual quando houver duas aprovações com o mesmo código e revisão.
  - Endpoint de leitura pública que devolve só os campos públicos (nada de solicitante, observações, histórico ou usuários).
- **Dependências:** tramitação e integridade de dados; Controle de validade (próxima revisão e estado Substituído, com a mesma regra de cálculo). Alimenta Portal do SGI e Painel de auditoria.

#### 3.5 Portal do SGI (página inicial pública)

- **Situação:** nova.
- **Prioridade:** Média.
- **Origem:** `ideias/modelos/modelo_design/2026-09-28_portal-sgi.md`.
- **Objetivo:** porta de entrada única e sem login para qualquer colaborador: entender a política, achar o documento vigente, ver os indicadores, conhecer o próximo treinamento e registrar uma NC em poucos segundos.
- **Principais elementos:**
  - Página de leitura, sem a navegação do app: hero com a política do SGI e os quatro pilares, atalhos (Lista mestra, Indicadores, Treinamentos e "Abrir NC" em destaque), "Como estamos" com até 4 indicadores em destaque, documentos aprovados nos últimos 30 dias, próximos treinamentos, contatos da equipe do SGI e data da última atualização.
  - Estados de carregando, vazio e erro por bloco; a estrutura fixa aparece mesmo sem dados.
  - Links e conteúdos editáveis (política resumida, contatos) em configuração, não no código; atalho sem destino some.
  - Modo "faixa" compacto e parâmetro de tema claro para incorporação na página do SGI no SharePoint (recomendado: começar por link, evoluir para faixa incorporada).
  - Mobile first, com "Abrir NC" em primeiro no celular.
  - Só dados públicos, por leitura filtrada; confirmar se o público é só interno.
- **Dependências:** Indicadores (cartões e farol), Lista mestra (documentos e atalho), Matriz de treinamentos (agenda) e Não Conformidades (abertura de NC); Feedback e acessibilidade. Pode entrar antes com links de saída configuráveis para o que ainda não existir.

#### 3.6 Layout para celular (sistema responsivo)

- **Situação:** nova.
- **Prioridade:** Média.
- **Origem:** `ideias/modelos/modelo_design/2026-09-28_layout-mobile.md`.
- **Objetivo:** permitir que gestores e responsáveis consultem status, vejam KPIs e registrem ou movimentem documentos pelo celular (em campo, na obra, em auditoria), sem zoom nem rolagem horizontal.
- **Principais elementos:**
  - Três faixas oficiais de largura (celular até 767px, tablet 768 a 1023px, computador a partir de 1024px), mobile first.
  - Navegação: barra inferior com até 5 destinos e folha "Mais" no celular; menu lateral recolhido no tablet; menu lateral completo no computador.
  - KPIs em grade controlada só pelo CSS (2, 2 e 4 colunas).
  - Kanban no celular com abas de fase e contador, uma coluna por vez com deslize; no tablet, rolagem horizontal com encaixe. Mover cartão por botões, não por arrastar. Filtros numa folha inferior.
  - Modal de detalhes em tela cheia no celular, com "Voltar", rolagem única e ações fixas no rodapé.
  - Formulário em uma coluna no celular, botão de envio fixo e teclados adequados por tipo de campo.
  - Alvos de toque de 44px, espaçamento lateral de 16px, texto de campo de 16px ou mais, zoom nunca bloqueado.
- **Dependências:** Feedback e acessibilidade (foco, contraste e estados de envio não podem regredir); integridade de dados (ações por ID). Na nova base, o ideal é tratá-lo como requisito transversal desde a fundação, e não como etapa posterior.

### Prioridade Baixa

#### 3.7 Busca global (Ctrl+K)

- **Situação:** nova.
- **Prioridade:** Baixa.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_busca-global.md`.
- **Objetivo:** um único ponto de entrada, aberto de qualquer tela, para achar documentos, indicadores e, depois, treinamentos e NCs, sem saber em que tela está a informação.
- **Principais elementos:**
  - Janela sobreposta aberta por Ctrl+K (Cmd+K) ou botão "Buscar"; Esc fecha e devolve o foco.
  - Resultados agrupados por tipo (até 5 por grupo e "Ver todos em…"), com trecho destacado e linha de apoio (código, tipo e status; ou pilar, valor e farol).
  - Tolerância a acentos, maiúsculas e pequenos erros de digitação; ordenação por código exato, início do título, palavra inteira e aproximação.
  - Buscas recentes por usuário (sem dados sensíveis) e ações rápidas ("Novo documento", "Ir para Indicadores", e ações de gestão só para quem tem permissão).
  - Uso completo por teclado e leitor de tela; abertura dos itens sempre pelo ID.
- **Dependências:** tramitação e integridade de dados; Indicadores; autenticação real (filtrar ações por perfil). Ganha grupos novos conforme Treinamentos e NC forem entregues.

#### 3.8 Painel de prontidão para auditoria

- **Situação:** nova.
- **Prioridade:** Baixa.
- **Origem:** `ideias/modelos/modelo_funcao/2026-09-28_painel-auditoria.md`.
- **Objetivo:** responder "estamos prontos para a auditoria?" por norma, cláusula e área, em vez de juntar dados de várias fontes à mão durante dias, e entregar ao auditor um relatório pronto.
- **Principais elementos:**
  - Filtros por norma (ISO 9001, 14001, 45001 ou todas), área e janela de "a vencer".
  - Cartão por norma com nota geral e quatro contadores: documentos vencidos ou a vencer, NCs abertas (e atrasadas), treinamentos pendentes e indicadores fora da meta.
  - Tabela por área com nota de 0 a 100 (média ponderada das quatro fontes, pesos e limites ajustáveis), farol e drill-down até o item na tela de origem.
  - Checklist por cláusula (Atendida, Com pendências, Sem evidência), com marcação manual "Verificada" pelo Administrador.
  - Mapeamento item x norma x cláusula mantido pelo Administrador; itens sem mapeamento em "Não classificados".
  - Relatório pré-auditoria exportável (Excel com resumo, notas, checklist e pendências; versão para impressão).
  - Painel somente leitura: fonte ausente aparece como "Fonte não disponível" e a nota fica marcada como parcial.
- **Dependências:** Controle de validade, Matriz de treinamentos, Não Conformidades e Indicadores (as quatro fontes); Lista mestra (documentos obsoletos); autenticação real. Só gera valor com pelo menos validade, NC e indicadores prontos.

---

## Ordem sugerida de construção

Critérios: primeiro a base de que tudo depende, depois os módulos com mais dependentes, e por último os que só agregam dados de outros. Cada etapa entrega algo usável sozinha.

| # | Etapa | Por que nessa posição |
|---|-------|-----------------------|
| 1 | **Fundação:** tramitação de documentos + integridade de dados (1.1) + autenticação Microsoft e perfis (2.1) + padrões de feedback e acessibilidade (1.2), com o layout responsivo (3.6) como requisito desde o início | Tudo depende de ID estável, histórico confiável, identidade comprovada e do conjunto de componentes. Fazer responsivo e acessível desde o início custa menos do que adaptar depois. |
| 2 | **Indicadores do SGI** (1.3), incluindo os KPIs da tramitação já validados | Módulo com mais dependentes: validade, NC, portal, busca e auditoria leem dele. Já tem desenho validado em parte. |
| 3 | **Controle de validade** (2.2) | Prioridade Alta e fonte para lista mestra, notificações, treinamentos e auditoria. Depende só da fundação e de indicadores. |
| 4 | **Minha fila** (3.3) | Pouco esforço sobre a fundação e ganho diário para todos os perfis. Consolida o "responsável da etapa" como usuário cadastrado, que as notificações também usam. |
| 5 | **Notificações** (3.2) | Com autenticação, responsável estruturado e validade prontos, todos os gatilhos (incluindo validade) já nascem ativos. |
| 6 | **Lista mestra** (3.4) | Usa tramitação e validade; entrega a evidência de controle documental pedida em auditoria. |
| 7 | **Matriz de treinamentos** (2.3) | Prioridade Alta, mas é um módulo grande e depende de validade (retreinamento por revisão). Libera a agenda do portal e uma fonte da auditoria. |
| 8 | **Não Conformidades e planos de ação** (3.1) | Com indicadores e treinamentos prontos, os vínculos já nascem reais (não texto livre). |
| 9 | **Portal do SGI** (3.5) | Vitrine que agrega indicadores, lista mestra, treinamentos e NC; nessa altura, todos os atalhos apontam para módulos existentes. |
| 10 | **Busca global** (3.7) | Prioridade Baixa; entra com todos os grupos (documentos, indicadores, treinamentos, NC) de uma vez. |
| 11 | **Painel de prontidão para auditoria** (3.8) | Depende de validade, treinamentos, NC, indicadores e lista mestra; fica por último. |

**Em uma linha:** Fundação (tramitação + integridade + login Microsoft + acessibilidade/responsivo) → Indicadores → Validade → Minha fila → Notificações → Lista mestra → Treinamentos → NC → Portal → Busca global → Auditoria.

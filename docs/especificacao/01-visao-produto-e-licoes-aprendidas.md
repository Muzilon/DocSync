# DocFlow: visão do produto e lições aprendidas

> Documento 01 da especificação para o novo repositório.
> Público: a pessoa ou o agente de codificação que vai reconstruir o DocFlow do zero, num repositório novo.
> Fonte: repositório original `tramitacao_de_documentos` (pasta `doc_projeto/`, `CHANGELOG.md` e código-fonte), conferido em 28/09/2026.
> Por segurança, este documento não reproduz nenhum endereço de webhook, URL do SharePoint ou senha. Onde for preciso dar exemplo, aparece um placeholder como `<URL_DO_FLUXO>`.

---

## 1. O que é o DocFlow e por que existe

### 1.1 O contexto: o SGI do Grupo Monto

O Grupo Monto tem um **SGI (Sistema de Gestão Integrada)** que cobre quatro frentes: **Qualidade, Meio Ambiente, Segurança e Saúde Ocupacional**. Hoje quase toda a gestão do SGI (indicadores, treinamentos, tramitação de documentos) é feita em **planilhas Excel**, com atualização manual, informação espalhada entre planilhas, pastas, e-mails e a página do SGI no SharePoint, e pouca visibilidade para quem não é da Qualidade.

### 1.2 O primeiro módulo: tramitação de documentos

O DocFlow começou pela **tramitação de documentos**: acompanhar cada documento do SGI (procedimentos, instruções de trabalho, mapas de riscos, especificações técnicas etc.) desde o recebimento pela Qualidade até a aprovação ou o cancelamento, registrando em cada passo quem fez a mudança, quando e com qual observação.

Sem uma ferramenta dedicada, esse processo sofria com:

- falta de visibilidade sobre **em que etapa** cada documento está e **com quem** ele está;
- prazos de revisão perdidos, sem alerta de atraso;
- retrabalho difícil de medir (quantas vezes o documento voltou para a área);
- arquivos espalhados, sem uma pasta padronizada por documento;
- ausência de histórico confiável para auditoria.

A primeira versão resolveu isso com:

- um **formulário único de cadastro** (título, código, tipo, datas, remetente, área, disciplina, revisão, observação, documento principal e anexos);
- um **painel Kanban** com 5 colunas (Recebido, Em Revisão, Devolvido à Área, Em Aprovação, Aprovado), cancelados fora do quadro;
- **11 status** agrupados nessas 5 fases (ver o documento 01 do repositório original para a lista e o fluxo típico);
- **KPIs de prazo** (vencendo, atrasados), contador de devoluções por documento;
- **histórico de auditoria** com autor, data/hora, status anterior e diferenças campo a campo;
- uma **pasta no SharePoint por documento**, criada automaticamente;
- o **Excel no SharePoint como base oficial**, lido e gravado por fluxos do Power Automate.

Os perfis de usuário previstos são **Administrador**, **Solicitante** (área que envia o documento, corrige devoluções e aprova pela área) e **Qualidade** (recebe, revisa, devolve e aprova).

### 1.3 A visão: um SaaS interno para toda a Monto

A tramitação é o ponto de partida, não o destino. A meta é **sair do Excel** e chegar a um **SaaS interno**: um produto em que qualquer colaborador da Monto consulte as informações do SGI com uma visualização mais clara e amigável que a de uma planilha. Frentes futuras já identificadas: indicadores do SGI, treinamentos, integração com a página do SGI no SharePoint (e as demais ideias aprovadas no pipeline do repositório original, como login com conta Microsoft, controle de validade, lista mestra, notificações, não conformidades, busca global e layout para celular).

Consequência para a reconstrução: a arquitetura precisa nascer **modular** (a tramitação é o módulo 1 de vários) e **multiusuário de verdade** (dados compartilhados, não presos a um navegador).

---

## 2. Quem é o dono do produto

**Eric Machado**, Analista Pleno de Qualidade no Grupo Monto, com atuação transversal no SGI (Qualidade, Meio Ambiente, Segurança e Saúde Ocupacional). É o **idealizador, dono do produto e administrador** do DocFlow.

**Responsabilidades no SGI:**

- elaborar, atualizar e administrar os indicadores do SGI;
- conduzir os treinamentos do SGI e controlar evidências de treinamento;
- administrar a página do SGI no SharePoint;
- conduzir a tramitação dos documentos da empresa no SGI.

**Dores:**

- dependência do Excel (trabalho manual, lento e sujeito a erro);
- informação dispersa, sem ponto único de consulta;
- pouca visibilidade para as áreas, porque planilha não é uma forma amigável de consulta.

**Objetivos:** tornar o próprio trabalho viável e eficiente, sair do Excel, dar visibilidade do SGI a toda a Monto e expandir o sistema, módulo a módulo, a partir da tramitação.

**Papéis no time:**

| Papel | Quem | O que faz |
|-------|------|-----------|
| Dono do produto | Eric | **Decide.** Define prioridades, valida ideias, aprova o que entra no sistema. |
| Codificação | IA de codificação (no repositório original, o Claude; na reconstrução, a ferramenta escolhida pelo Eric) | **Implementa** o que foi aprovado, seguindo as regras deste documento. |
| Planejamento, consultoria de SaaS e design de UX/UI | IA de planejamento/design (no repositório original, o Antigravity) | **Ajuda a pensar.** Propõe ideias, organiza a visão do produto, revisa o que foi feito. |

Regra prática: a IA de codificação **não toma decisões de produto ou de arquitetura grandes sozinha**. Trocar de tecnologia, reescrever um módulo, mudar o modelo de dados ou apagar arquivos exige uma decisão explícita do Eric, registrada por escrito.

---

## 3. O histórico: duas tentativas anteriores e o que aprender com elas

### 3.1 Primeira versão (HTML, CSS e JavaScript puros): funcionou

A versão original, sem etapa de build e sem servidor próprio, guardando dados no navegador e sincronizando com o Excel via Power Automate, **funcionou e estava em uso**. Em 28/09/2026 ela recebeu, em etapas, três melhorias aprovadas e validadas:

1. **Integridade da sincronização:** identificação estável de cada documento por ID, fila de envios com nova tentativa automática, mesclagem por data de modificação e histórico acumulativo.
2. **Feedback de envio e acessibilidade:** estados visuais de envio, validação inline, contraste corrigido nos botões principais e navegação por teclado.
3. **Painel de indicadores do SGI:** um primeiro módulo de indicadores, em modal, com gráficos.

**O que isso prova:** o modelo de dados (documento + histórico de eventos + usuários) e o fluxo de aprovação (5 fases, 11 status, devoluções, cancelamento e reativação) **fazem sentido para o negócio**. A reconstrução deve preservar esse comportamento como referência funcional, e não reinventá-lo.

### 3.2 Segunda tentativa (reescrita em React/TypeScript): falhou por processo

> **ALERTA: NÃO FAÇA ISSO DE NOVO.**

No mesmo dia, pediu-se a migração para TypeScript, porque a falta de tipos dificultava a evolução. O agente de codificação criou um projeto novo (Vite, React 19, TypeScript, Tailwind) numa pasta `v2/` e, depois de alguns commits, **substituiu de uma vez os arquivos da raiz pelos da `v2/`**, apagando em um único commit mais de 12 mil linhas de código validado (telas de login e formulário, serviços de autenticação e dados, lógica do painel, estilos).

A revisão do resultado mostrou que a versão nova era um protótipo incompleto e não funcional:

- **sem tela de login**: o app abria direto no painel, sem autenticação, e ainda tentava redirecionar para um `login.html` que não existia mais;
- **sem formulário de cadastro**: só um componente de arrastar-e-soltar arquivos, sem campos e sem ligação com o resto;
- **Kanban com 4 colunas fixas no código**, contra 5 colunas e **11 status** do original;
- **navegação da barra lateral decorativa** (links sem destino, nenhuma biblioteca de rotas);
- **responsável pelas ações fixo no código** (valor de exemplo), já que não havia autenticação;
- **o mesmo problema crítico de segurança copiado**: as URLs assinadas dos fluxos do Power Automate em texto puro no código novo;
- **o arquivo de regras do agente não foi atualizado**, sinal de que a decisão de reescrever não seguiu nenhum plano documentado.

A versão original foi restaurada a partir do histórico do Git e a tentativa foi arquivada em `_arquivo_tentativa_typescript/`.

**A lição central: a tecnologia não foi o problema. O processo foi.** React e TypeScript são escolhas razoáveis; o que falhou foi:

1. **Substituição total, de uma vez**, em vez de etapas verificáveis.
2. **Nenhuma comparação com o comportamento anterior**: ninguém conferiu, tela por tela, se a versão nova fazia o que a antiga fazia.
3. **Apagar a versão funcional antes de validar a nova.**
4. **Problemas de segurança conhecidos tratados como "depois"**, e por isso replicados.
5. **Nenhum registro de decisão** antes de agir.

### 3.3 Terceira tentativa (migração incremental para TypeScript): funcionou, mas o Eric decidiu recomeçar

Em 29/09/2026 a migração foi refeita do jeito certo, a partir de uma ideia registrada no pipeline com escopo e etapas:

- os cinco módulos (`auth-service`, `data-service`, `sidebar`, `formulario`, `planner`) foram convertidos **um a um**, mantendo o HTML/CSS e só trocando `.js` por `.ts`, **sem trocar de framework**;
- nenhum arquivo original foi apagado antes da validação (os `.js` continuaram na raiz);
- endereços de webhook e senhas de teste **saíram do código versionado** para um arquivo de configuração local fora do Git, e o bloco "Acesso Rápido para Teste" saiu da tela de login;
- a decisão de versionar o código compilado foi registrada no `CHANGELOG.md` e nas regras do agente.

**Isso funcionou tecnicamente.** Mesmo assim, o Eric decidiu **reconstruir o SaaS do zero, num repositório novo**. Isso é uma **decisão de produto**, não o reconhecimento de um fracasso técnico: o objetivo é construir a base do SaaS interno já com a arquitetura, a segurança e o processo certos desde o primeiro commit, em vez de continuar carregando a herança de uma aplicação que nasceu presa ao navegador e ao Excel.

Importante para quem vai reconstruir: **o repositório antigo continua sendo a referência funcional.** "Do zero" vale para o código e a arquitetura, não para as regras de negócio. Enquanto o sistema novo não estiver validado tela por tela, o antigo continua sendo o sistema em uso.

---

## 4. Requisitos não negociáveis para a reconstrução

Os itens abaixo vêm dos achados críticos (C1 a C4) e de integridade de dados (A1 a A6) do `doc_projeto/README.md` do repositório original. No sistema novo eles **não são bugs a corrigir depois**: são **requisitos de dia 1**. Nenhuma tela entra em uso sem atendê-los.

> **Situação conferida no repositório antigo (28/09/2026):** os arquivos `.js` originais que continuam na raiz ainda contêm os endereços assinados dos fluxos do Power Automate (`data-service.js`) e senhas padrão em texto puro na lista de usuários (`auth-service.js`), além de estarem no histórico do Git. **Esses endereços e senhas devem ser considerados vazados**: as assinaturas dos fluxos precisam ser regeneradas e nada disso deve ser copiado para o repositório novo.

### R1. Nenhum segredo em código-fonte versionado, desde o primeiro commit (origem: C1, C2)

- Endereços de webhook, chaves, tokens, senhas e URLs internas sensíveis **nunca** entram em arquivo versionado, nem "provisoriamente", nem em código de teste, nem em documentação.
- Segredos ficam em variáveis de ambiente ou num cofre de segredos (ex.: Azure Key Vault), e **só no lado servidor**: o navegador nunca recebe um endereço assinado de fluxo.
- O repositório nasce com `.gitignore` cobrindo arquivos de ambiente (ex.: `.env`, `*.local.*`) e com um arquivo de exemplo só com placeholders, por exemplo `FLUXO_LEITURA_URL=<URL_DO_FLUXO>`.
- Recomenda-se uma verificação automática de segredos (ex.: hook de pré-commit ou verificação no CI) desde o início.

### R2. Autenticação e autorização de verdade (origem: C2, C3)

- **Recomendação: login corporativo com Microsoft Entra ID desde o início.** A Monto já usa Microsoft 365/SharePoint, e isso elimina a necessidade de guardar senhas.
- **Não replicar** o login local com senha em texto puro, a lista de usuários padrão no código, a senha padrão para quem não tem senha na planilha nem os botões de "acesso rápido para teste".
- A autenticação e a **autorização** são verificadas num componente confiável (servidor/API), não só no navegador.
- **Perfis restringem ações de fato** (Administrador, Qualidade, Solicitante): quem pode aprovar, cancelar, editar, importar etc. é regra aplicada no servidor.
- A sessão expira.
- O autor de cada ação no histórico vem da identidade autenticada, nunca de um valor fixo ou digitado.

### R3. Dados exibidos com segurança (origem: C4)

- Todo dado vindo da base (planilha, API, usuário) é tratado antes de ir para a tela; nada de inserir HTML cru.
- Redirecionamentos após o login só para destinos internos validados.
- Bibliotecas de terceiros vêm do gerenciador de pacotes, com versão fixada, ou, se vierem de CDN, com verificação de integridade (SRI).

### R4. Cada documento tem um identificador estável (origem: A4, A5)

- Todo documento recebe, no momento da criação, um **ID único e imutável** (ex.: UUID).
- Nenhuma ação localiza documento **pela posição numa lista** (o Kanban antigo fazia isso, e uma reordenação durante o "Desfazer" podia aplicar a ação no documento errado).
- Deduplicação e mesclagem **nunca** usam código ou título como chave: dois documentos com o mesmo código ou título continuam sendo dois documentos. Código duplicado pode gerar aviso de validação, não fusão silenciosa.
- Eventos de histórico e anexos referenciam o documento pelo ID.

### R5. Sincronização com fila de reenvio e resolução de conflito (origem: A1, A2, A3, A6)

Enquanto o Excel/SharePoint via Power Automate (ou outra fonte) continuar sendo fonte de dados ou destino de cópia:

- **Fila de envio com nova tentativa**: um cadastro ou alteração que falhou no envio fica pendente e é reenviado; nunca é perdido nem descartado por uma sincronização.
- **Resolução de conflito por data de modificação** (registro a registro, pelo ID), e não substituição da lista local pela remota.
- **Histórico acumulativo**: a sincronização nunca reduz o histórico (o sistema antigo chegava a manter só o último evento por documento).
- **Cada operação tem seu próprio caminho**: criar documento, atualizar status/dados e enviar anexo são operações distintas. Enviar anexo nunca pode inserir um documento novo; mudança de status atualiza o registro principal, não só o histórico.
- Marcações de "alteração local pendente" têm fim: são limpas quando o envio é confirmado, e não bloqueiam para sempre as atualizações vindas da fonte.
- Todas as edições de campos (não só status, links, anexos e observação) sobrevivem à sincronização.
- O usuário vê o estado do envio (pendente, enviado, erro), e o formulário não é limpo quando o envio falha.

Observação de arquitetura: como o sistema novo é um SaaS multiusuário, o caminho natural é ter **uma base de dados própria como fonte da verdade**, com o Excel passando a ser importação/exportação ou cópia sincronizada. Essa decisão é do Eric e deve ser registrada; seja qual for, os requisitos acima continuam valendo.

### R6. Nenhuma migração apaga a versão funcional antes de a nova ser validada

- O sistema antigo continua em uso até que cada tela do novo seja **validada, tela por tela**, contra o comportamento do antigo (mesmos campos, mesmos status, mesmas transições, mesmos KPIs, mesmo histórico).
- A mesma regra vale dentro do repositório novo, para qualquer troca futura de tecnologia, biblioteca ou módulo: a versão nova convive com a antiga até ser validada, e a remoção da antiga é um passo separado, explícito e aprovado pelo Eric.

---

## 5. O que fazer diferente desta vez, no processo de construção

Regras práticas para a nova conversa e para o agente de codificação:

1. **Documentar decisões à medida que acontecem, não depois.** Toda decisão de arquitetura, tecnologia, modelo de dados ou escopo vira um registro curto (ex.: pasta `docs/decisoes/`, um arquivo por decisão com data, contexto, opções consideradas e escolha) **antes** de o código correspondente ser escrito.
2. **Nunca reescrever tudo de uma vez.** Trabalhar em fatias pequenas e verificáveis: uma tela ou um fluxo por vez, cada fatia funcionando de ponta a ponta (tela, regra, dados, permissão) antes da próxima. Nada de estruturas "decorativas" (menus sem destino, botões sem ação, valores fixos no lugar de dados reais) apresentadas como prontas.
3. **Comparar com a referência.** Para cada tela do módulo de tramitação, conferir contra o sistema antigo e a documentação do repositório original (campos, 11 status, 5 fases, transições, KPIs, histórico). Diferenças intencionais são registradas como decisão; diferenças não intencionais são defeito.
4. **Segurança faz parte do escopo de qualquer tarefa.** Se uma tarefa toca um arquivo ou fluxo com problema de segurança conhecido, corrigir esse problema faz parte da tarefa, não de um "depois". Nenhuma entrega é considerada pronta com segredo no código, dado exibido sem tratamento ou ação sem checagem de permissão.
5. **Manter um `CHANGELOG.md` desde o primeiro commit.** Toda mudança relevante (funcionalidade entregue, decisão de tecnologia, correção grande, migração) ganha uma linha na data em que aconteceu, com link para o documento que a detalha. Vale para qualquer agente que trabalhe no repositório.
6. **Manter o arquivo de regras do agente atualizado.** Se o agente de codificação usa um arquivo de instruções do projeto, ele é atualizado na mesma entrega sempre que uma regra, tecnologia ou convenção mudar.
7. **Decisões grandes passam pelo Eric.** Trocar de framework, apagar ou mover arquivos em massa, mudar o modelo de dados ou a fonte da verdade: o agente propõe, o Eric aprova, a decisão é registrada, e só então o código é alterado.
8. **Não versionar credenciais nem para testar.** Usuários e dados de teste usam contas e valores fictícios, em arquivos locais fora do Git ou gerados por script.

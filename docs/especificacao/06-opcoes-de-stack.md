# Opções de stack para a reconstrução

Este documento não decide a tecnologia — isso é para conversar com quem vai codificar a versão nova. Ele existe para a decisão ser tomada de olhos abertos, considerando o que já foi aprendido.

## O que já sabemos

- **HTML/CSS/JS puro** funcionou bem por um bom tempo, recebeu melhorias reais e é fácil de qualquer pessoa (mesmo sem ser desenvolvedora) entender abrindo o arquivo.
- **TypeScript sem framework** (convertendo os `.js` para `.ts`, mantendo o DOM manipulado direto) funcionou tecnicamente numa tentativa recente: os cinco módulos principais foram convertidos, compilando sem erro, sem trocar nada da interface. A decisão de recomeçar do zero foi do Eric, não um fracasso técnico dessa abordagem.
- **React + TypeScript + Vite + Tailwind**, feito como reescrita completa de uma vez, falhou — mas por causa de COMO foi feito (substituição total, sem validar por etapas), não necessariamente por causa da tecnologia em si.

## Três caminhos possíveis

### 1. Continuar sem framework, com TypeScript

- **Prós:** menor curva de aprendizado, sem dependências de build complexas, mais fácil de qualquer IA de codificação entender e modificar sem quebrar nada, já foi tentado com sucesso técnico.
- **Contras:** conforme o número de módulos crescer (indicadores, treinamentos, NC, auditoria), manter tudo em manipulação direta do DOM fica mais trabalhoso; não há um padrão de componentização.
- **Indicado se:** a prioridade é simplicidade e menor risco, e o ritmo de adição de módulos novos for gradual.

### 2. Framework de UI moderno (React, Vue ou similar), com TypeScript, feito com disciplina

- **Prós:** melhor para telas com muito estado e interação (Kanban com arrastar-e-soltar, formulários dinâmicos, modais complexos), ecossistema maior de componentes prontos, mais fácil de escalar para muitos módulos.
- **Contras:** curva de aprendizado maior, mais decisões de arquitetura (roteamento, gerenciamento de estado, build), e é exatamente o caminho que falhou da última vez — só deve ser escolhido com um plano de migração por etapas, nunca como substituição total.
- **Indicado se:** o Eric aceita investir num planejamento mais cuidadoso desta vez, com telas construídas e validadas uma de cada vez (ver a seção 5 do documento 01).

### 3. Uma plataforma "low-code"/"no-code" sobre o próprio ecossistema Microsoft (Power Apps, por exemplo)

- **Prós:** integra nativamente com SharePoint, Excel e Power Automate, sem depender de hospedagem própria; pode ser mais rápido para telas de formulário e listagem.
- **Contras:** menos controle sobre o design (a barra lateral estática e o Kanban customizado podem não ser triviais de replicar); pode esbarrar em licenciamento (Power Apps por usuário ou por app); não foi avaliado em profundidade neste projeto.
- **Indicado se:** a TI da Monto já usa Power Platform e há apetite para trocar a abordagem por completo, não só a linguagem.

## Recomendação de processo, qualquer que seja a escolha

Independente da tecnologia escolhida, a regra da seção 5 do documento 01 vale sempre: **construir e validar por partes pequenas, nunca substituir tudo de uma vez.** Essa foi a causa real do problema anterior, não a tecnologia.

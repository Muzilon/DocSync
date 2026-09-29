# Histórico da sessão inicial (28 e 29/09/2026)

Resumo da primeira conversa entre o Eric e o Claude, em que o DocSync foi planejado e as fatias F0 a F2 foram construídas. Serve para entender **por que** as coisas estão como estão. O estado do momento fica em [estado-atual.md](estado-atual.md); as decisões formais, em [decisoes/](decisoes/).

## 1. Ponto de partida

- O Eric trouxe um pacote de especificação (documentos 00 a 06, hoje em [especificacao/](especificacao/)) e esboços de agentes para reconstruir do zero o antigo DocFlow: o sistema de tramitação de documentos do SGI do Grupo Monto, com a meta de virar um SaaS interno modular.
- Regra principal herdada das tentativas anteriores: **nunca substituir tudo de uma vez**. Fatias pequenas, cada uma de ponta a ponta e validada pelo Eric antes da próxima.
- Papéis: Eric decide; Claude codifica e faz o UX/UI, delegando a subagentes (Fable para arquitetura e regras, Opus para telas, Haiku para pesquisa); Antigravity ajuda com ideias.

## 2. Plano e decisões iniciais

O Claude leu a especificação, apontou contradições e propôs a stack e um plano de 13 fatias para a Fundação (F0 a F12). O plano foi publicado para compartilhar (https://claude.ai/artifact/FbhAk8aEz8sfoSCRoSsLd1), com PDF gerado por script.

Respostas do Eric que viraram decisões:

| Tema | Decisão | Registro |
|---|---|---|
| Stack | React + TypeScript + Vite; API Node/Fastify; sem Tailwind | [0001](decisoes/0001-stack.md) |
| Fonte da verdade | PostgreSQL próprio; Excel só para importar e exportar | [0002](decisoes/0002-fonte-da-verdade.md) |
| Ambiente | Tudo local durante a construção (Azure só depois); banco PGlite, sem Docker | [0003](decisoes/0003-ambiente-local.md) |
| Revisões | Aprovado é final; revisão é documento novo vinculado; código único por código + revisão | [0004](decisoes/0004-revisoes-e-reativacao.md) |
| Reativação | Cancelado volta ao status anterior ao cancelamento | [0004](decisoes/0004-revisoes-e-reativacao.md) |
| Telas | Computador e tablet (a partir de 768px); sem versão de celular | [0005](decisoes/0005-telas-computador-tablet.md) |
| Nome e áreas | Produto se chama DocSync; 8 áreas, sempre em ordem alfabética | [0006](decisoes/0006-nome-e-areas.md) |
| Migração e offline | Importação da base antiga e modo offline entram na Fundação | [plano](plano-fundacao.md) |

## 3. F0: configuração inicial (validada)

- Repositório novo: https://github.com/Muzilon/DocSync.
- Criados o CLAUDE.md, o CHANGELOG, os registros de decisão, 18 agentes em `.claude/agents/` (adaptados dos esboços), a verificação de segredos (secretlint no pre-commit, gitleaks no CI) e o esqueleto do monorepo.
- O QA reprovou a primeira versão porque o próprio relatório continha uma senha falsa de exemplo; corrigido.
- O pre-commit falhava no GitHub Desktop (sem bash para o `npx`); corrigido para chamar o Node direto e separar "segredo encontrado" de "verificação não rodou".

## 4. Login e perfis

- O Eric quer cadastrar pessoas ele mesmo, sem depender da TI. Decisão: o Entra ID só prova a identidade; perfil e área ficam no DocSync, geridos pelo Administrador ([0007](decisoes/0007-usuarios-e-perfis.md)).
- O Eric não tem permissão para registrar aplicativos no Entra da Monto e a TI não será acionada por enquanto. Solução: um locatário Entra gratuito de teste, criado com a conta pessoal dele ([0008](decisoes/0008-locatario-entra-de-teste.md)). O login simulado foi descartado.
- As contas de teste do locatário ainda não foram criadas (o Eric teve dificuldade); por isso os testes com os perfis Qualidade, Solicitante e Leitor estão pendentes.

## 5. F1: casca, login Microsoft, pessoas e perfis (validada)

- Servidor (Fable): validação do token do Entra em toda chamada, pessoas no banco, bootstrap do primeiro Administrador pelo e-mail, função única de permissão, regra do último administrador, auditoria imutável.
- Interface (Opus): login com um único botão "Entrar com a conta Microsoft", barra lateral estática, tela "Acesso ainda não liberado", tela de Pessoas.
- O QA aprovou com ressalvas (área deduzida pelo nome, concorrência na regra do último administrador); corrigidas.

## 6. Identidade visual: Vigen

- O MCP do Figma recusou a leitura (limite do plano gratuito). O Eric enviou o design em PDF, renderizado pelo Claude dentro do Chromium.
- O PDF mostrou outro produto, "Vigen": visual azul-petróleo, cerca de 40 telas e módulos fora do backlog.
- Decisão do Eric: **adotar só o visual do Vigen**; nome, escopo e login Microsoft continuam ([0009](decisoes/0009-identidade-visual-vigen.md)). Os módulos extras do Vigen ficaram como ideias futuras.
- Contraste conferido por cálculo: uma combinação do próprio design (#64748B sobre #F1F5F9) reprova e foi proibida.
- O PDF (80 MB) fica só na máquina, fora do Git.

## 7. F2: modelo de dados e cadastro de documento (pronta, aguardando validação)

- Servidor (Fable): documentos, histórico imutável, 8 tipos e 11 status com fase explícita; arquivos numa pasta local por ID do documento; status inicial sempre Recebido; código + revisão únicos; reenvio idempotente; permissões por perfil e área.
- Interface (Opus): formulário no estilo Vigen, arrastar arquivos, validação visível, estados de envio, lista de recentes. A aba Revisão Técnica ficou para a F8.
- O QA achou um caso em que um reenvio após falha de conexão e edição poderia duplicar o documento; corrigido.
- Ajustes do Eric ([0010](decisoes/0010-prazo-e-area-do-administrador.md)): o prazo sai do cadastro (será automático, regra a definir) e o Administrador é da área Qualidade.

## 8. Passagem para o app do Claude Code

- O Eric vai continuar pelo app, abrindo a pasta `DocSync`.
- Criados o [estado-atual.md](estado-atual.md) e o comando `/retomar`, que manda ler CLAUDE.md, estado atual, plano, decisões e relatórios antes de agir.

## Lições desta sessão

- Registrar a decisão antes do código evitou retrabalho em cada mudança de rumo (login, visual, prazo).
- O QA ao fim de cada fatia pegou defeitos reais em todas elas.
- Exemplos de segredo, mesmo falsos, não podem ser escritos em nenhum arquivo versionado.
- A primeira pergunta ao receber um material novo (como o PDF do Vigen) é se ele muda escopo ou só aparência; isso foi decidido pelo Eric antes de qualquer código.

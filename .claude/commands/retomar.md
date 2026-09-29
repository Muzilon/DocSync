---
description: Retoma o trabalho do DocSync de onde parou (lê regras, estado atual, plano e decisões)
---

Vamos retomar o projeto DocSync. Trabalhe SOMENTE no repositório C:\Users\eric2\Documents\GitHub\DocSync. Não crie nem altere nada no repositório antigo `tramitacao_de_documentos` (ele é só referência funcional e contém segredos vazados; nunca copie código dele). Responda sempre em português do Brasil.

Antes de qualquer ação, leia nesta ordem:
1. `CLAUDE.md` (regras do projeto: papéis, delegação por módulo, fatias pequenas, segredos, CHANGELOG, decisões).
2. `docs/estado-atual.md` (onde paramos, o que falta, perguntas em aberto).
3. `docs/plano-fundacao.md` (fatias da Fundação).
4. Todos os arquivos de `docs/decisoes/` (0001 a 0010 ou mais). As decisões mais recentes prevalecem sobre a especificação.
5. O `CHANGELOG.md` e os relatórios mais recentes em `docs/relatorios/`.
6. Consulte `docs/especificacao/` (documentos 00 a 06) quando a fatia exigir.

Depois:
- Rode `git status` e `git log --oneline -5` para confirmar o estado do repositório (a F2 pode estar sem commit).
- Rode `npm run typecheck`, `npm test`, `npm run build` e `npm run segredos` para confirmar que está tudo verde.
- Confirme que os agentes de `.claude/agents/` estão disponíveis.

Então me responda, curto:
1. Em que fatia estamos e o que falta para fechá-la.
2. O resultado das verificações.
3. As perguntas em aberto que dependem de mim.
4. O próximo passo que você propõe.

Não comece a próxima fatia sem eu validar a atual. Siga o processo do CLAUDE.md: contrato primeiro, subagentes por módulo (Fable para arquitetura e regras, Opus para telas, Haiku para pesquisa), relatório em Markdown de cada tarefa, `agente-qa-revisao` ao fim da fatia, CHANGELOG e `docs/estado-atual.md` atualizados.

$ARGUMENTS

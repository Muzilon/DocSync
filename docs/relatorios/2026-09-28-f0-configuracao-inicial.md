# Relatório — F0 — Configuração inicial

- **Data:** 2026-09-28
- **Agente / modelo:** Claude principal (Opus)
- **Fatia:** F0

## O que foi feito

- Regras do projeto no `CLAUDE.md`: papéis, delegação por módulo com escolha de modelo e relatório, fatias pequenas, segredos, CHANGELOG, decisões e obrigação de manter o próprio arquivo atualizado.
- `CHANGELOG.md` com a primeira entrada.
- Especificação 00 a 06 copiada para `docs/especificacao/` (conferida: sem segredos).
- Decisões 0001 a 0006 registradas como aprovadas; 0007 (pessoas e perfis) registrada como **proposta**.
- 18 agentes em `.claude/agents/`: os 13 de módulo adaptados do pacote (modelos `fable` e `opus`, caminhos novos, bloco de stack e relatório obrigatório); `agente-arquitetura-dados`, `agente-ux-ui` e `agente-qa-revisao` reescritos para a stack; `agente-layout-mobile` substituído por `agente-responsivo` (decisão 0005); `agente-pesquisa` novo, com `haiku`.
- Segredos: `.gitignore` cobrindo `.env*` e `*.local.*`, `.env.example` só com placeholders, secretlint (regras recomendadas + padrões de URL assinada, client secret, senha e cadeia de conexão) no pre-commit via husky, gitleaks e secretlint no CI.
- Esqueleto do monorepo: `packages/compartilhado` (ordenação alfabética pt-BR, com testes), `apps/api` (Fastify, rota `/saude`, com testes), `apps/web` (React + Vite, página "Em construção", sem navegação).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `CLAUDE.md`, `CHANGELOG.md`, `README.md` | Novos |
| `docs/especificacao/*`, `docs/decisoes/*`, `docs/plano-fundacao.md`, `docs/relatorios/*` | Novos |
| `.claude/agents/*.md` (18) | Novos |
| `.gitignore`, `.gitattributes`, `.env.example`, `.nvmrc`, `.secretlintrc.json`, `.secretlintignore`, `.husky/pre-commit`, `.github/workflows/ci.yml` | Novos |
| `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `apps/*`, `packages/*` | Novos |

## O que ficou pendente

- Decisão 0007 aprovada pelo Eric em 2026-09-28.
- Registro do aplicativo de desenvolvimento no Entra ID pela TI (bloqueia a F1).
- Forma de rodar o PostgreSQL local (não há Docker): definir no início da F2.
- Nada foi commitado nem enviado ao GitHub: aguarda a aprovação do Eric.

## Como validar

1. `npm install`, depois `npm test` (5 testes passam), `npm run typecheck`, `npm run build` e `npm run segredos`.
2. Criar um arquivo temporário com uma cadeia de conexão PostgreSQL fictícia que inclua usuário e uma senha inventada (esquema postgres, depois usuário, dois-pontos, senha, arroba e servidor), dar `git add` e tentar `git commit`: o commit é bloqueado. Apagar o arquivo depois. Nunca escrever o exemplo com senha em arquivo versionado.
3. Ler o `CLAUDE.md` e as decisões 0001 a 0007.

## Decisões tomadas ou necessárias

Tomadas: 0001 a 0006. A 0007 está registrada como proposta, aguardando aprovação do Eric. Revisão de QA: [2026-09-28-f0-qa.md](2026-09-28-f0-qa.md).

# Changelog

Uma linha por mudança relevante, na data em que aconteceu, com link para a decisão ou o relatório.

## 2026-09-28

- Criação do repositório DocSync e da configuração inicial (fatia F0): CLAUDE.md, CHANGELOG, especificação em `docs/especificacao/`, plano da Fundação, decisões 0001 a 0007, agentes em `.claude/agents/`, `.gitignore`, `.env.example`, verificação de segredos (secretlint no pre-commit, gitleaks no CI) e esqueleto do monorepo (`apps/web`, `apps/api`, `packages/compartilhado`). Relatório: [docs/relatorios/2026-09-28-f0-configuracao-inicial.md](docs/relatorios/2026-09-28-f0-configuracao-inicial.md).
- Decisão [0007](docs/decisoes/0007-usuarios-e-perfis.md) aprovada: o Entra ID só prova a identidade; perfil e área de cada pessoa são geridos no DocSync pelo Administrador.
- Decisão [0008](docs/decisoes/0008-locatario-entra-de-teste.md): login real da F1 usará um locatário Entra ID gratuito de teste, separado da Monto.
- Decisão [0003](docs/decisoes/0003-ambiente-local.md) completada: banco local com PGlite, antecipado para a F1.
- F1 (parte servidor): tipos de pessoas e função única de permissão `pode` em `packages/compartilhado`; banco PGlite com migrações versionadas (áreas, usuários, auditoria imutável); validação do token do Entra ID; rotas `/eu`, `/areas` e `/pessoas` com pré-cadastro, bootstrap do primeiro Administrador e auditoria campo a campo (decisões [0003](docs/decisoes/0003-ambiente-local.md), [0007](docs/decisoes/0007-usuarios-e-perfis.md), [0008](docs/decisoes/0008-locatario-entra-de-teste.md)). Relatório: [docs/relatorios/2026-09-28-f1-api-login-pessoas.md](docs/relatorios/2026-09-28-f1-api-login-pessoas.md).
- F1 (parte interface, `apps/web`): tokens claro/escuro do documento 04 num único arquivo; login Microsoft (MSAL, redirecionamento) com rota protegida e destino seguro; casca com barra lateral estática; Início com dados reais de `/eu`; telas de acesso não liberado e inativo; tela Pessoas (pré-cadastro, edição de perfil/área, inativar/reativar); testes Vitest e Playwright + axe. Cores do Figma ainda não conferidas (limite do MCP). Relatório: [docs/relatorios/2026-09-28-f1-web-login-casca-pessoas.md](docs/relatorios/2026-09-28-f1-web-login-casca-pessoas.md).
- F1: correções pós-QA. `areaId` passa a vir em `Pessoa` (diálogo mostra área inativa como "(inativa)"); bloqueio contra concorrência na regra do último Administrador e no bootstrap; tipos de pessoas da web vêm do pacote compartilhado. Relatório: [docs/relatorios/2026-09-28-f1-api-login-pessoas.md](docs/relatorios/2026-09-28-f1-api-login-pessoas.md).
- Correção do pre-commit: chama o secretlint direto pelo Node (o GitHub Desktop não tem bash para o npx) e separa "segredo encontrado" de "verificação não rodou".
- Decisão [0009](docs/decisoes/0009-identidade-visual-vigen.md): identidade visual do Vigen (azul-petróleo) no lugar da paleta pêssego; nome, escopo e login Microsoft mantidos. PDF de design fora do Git (`docs/design/*.pdf`).
- F1: visual Vigen (decisão 0009) na interface: tokens petróleo claro/escuro, barra lateral #0F2B34 com marcador, login com painel da marca, tabela e badges com ponto; vitrine de testes da casca (axe 768/1024/1440, dois temas). Relatório: docs/relatorios/2026-09-28-f1-web-login-casca-pessoas.md.

## 2026-09-29

- F1 validada pelo Eric com o login real (locatário de teste): login Microsoft, pessoas e perfis, casca com visual Vigen.

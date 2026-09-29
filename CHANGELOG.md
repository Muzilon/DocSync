# Changelog

Uma linha por mudança relevante, na data em que aconteceu, com link para a decisão ou o relatório.

## 2026-09-28

- Criação do repositório DocSync e da configuração inicial (fatia F0): CLAUDE.md, CHANGELOG, especificação em `docs/especificacao/`, plano da Fundação, decisões 0001 a 0007, agentes em `.claude/agents/`, `.gitignore`, `.env.example`, verificação de segredos (secretlint no pre-commit, gitleaks no CI) e esqueleto do monorepo (`apps/web`, `apps/api`, `packages/compartilhado`). Relatório: [docs/relatorios/2026-09-28-f0-configuracao-inicial.md](docs/relatorios/2026-09-28-f0-configuracao-inicial.md).
- Decisão [0007](docs/decisoes/0007-usuarios-e-perfis.md) aprovada: o Entra ID só prova a identidade; perfil e área de cada pessoa são geridos no DocSync pelo Administrador.

# DocSync

SaaS interno do SGI (Qualidade, Meio Ambiente, Segurança e Saúde Ocupacional) do Grupo Monto. Começa pela tramitação de documentos e cresce módulo a módulo.

- Regras do projeto: [CLAUDE.md](CLAUDE.md)
- Especificação: [docs/especificacao/](docs/especificacao/)
- Plano da Fundação: [docs/plano-fundacao.md](docs/plano-fundacao.md)
- Decisões: [docs/decisoes/](docs/decisoes/)
- Mudanças: [CHANGELOG.md](CHANGELOG.md)

## Como rodar (desenvolvimento local)

Requisitos: Node 24.

```sh
npm install
cp .env.example .env   # preencha os valores reais; o .env nunca vai para o Git
npm run dev            # API em http://127.0.0.1:3001 e interface em http://localhost:5173
```

Outros comandos: `npm test`, `npm run typecheck`, `npm run build`, `npm run segredos`.

Todo commit passa pela verificação de segredos (secretlint). O CI roda também o gitleaks.

# Estado atual do projeto (passagem entre sessões)

Atualizado em 2026-09-29. Leia este arquivo logo depois do CLAUDE.md ao começar uma sessão nova. Atualize-o ao fim de cada fatia ou sempre que parar no meio de uma.

## Onde estamos

| Fatia | Situação | Commit |
|---|---|---|
| F0 Configuração inicial | Validada | `cb3eab4` |
| F1 Login Microsoft, casca, pessoas e perfis, visual Vigen | Validada | `a8a8d7a`, `9617d33` |
| **F2 Modelo de dados + cadastro de documento** | **Pronta, QA aprovado, aguardando validação do Eric** | **Não commitada** (as mudanças estão no disco, no working tree) |
| F3 Painel Kanban | Próxima | — |

Detalhes de cada fatia: [plano-fundacao.md](plano-fundacao.md) e os relatórios em [relatorios/](relatorios/). Como chegamos até aqui: [historico-sessao-inicial.md](historico-sessao-inicial.md).

## F2: o que falta

1. O Eric roda o roteiro de testes (abaixo) com o login real.
2. Se ele disser "F2 validada": marcar F2 como Validada no plano, linha no CHANGELOG, conferir `git status` (nada de `.env`, `dados-locais/`, `armazenamento-local/`, PDFs), commit e push.
3. Seguir para a F3 (Painel Kanban), com o mesmo processo: contrato primeiro, agente de servidor (Fable) e de interface (Opus) em paralelo, verificação integrada, `agente-qa-revisao`, capturas e roteiro para o Eric.

Roteiro de testes da F2 (com `npm run dev` reiniciado):
- enviar o formulário vazio (resumo de erros, inclusive o arquivo principal);
- tentar anexar `.exe` (recusado);
- cadastrar com um PDF principal e 2 anexos (toast "Documento registrado", item na lista de recentes);
- conferir `armazenamento-local/DOC-.../` (principal na raiz, anexos em `Anexos/`);
- repetir código + revisão (erro no campo Código);
- parar a API, tentar registrar (banner), subir de novo e "Tentar novamente" (grava uma única vez);
- em Pessoas, definir a própria área como Qualidade (decisão 0010).

## Decisões recentes que mudam a especificação

- [0009](decisoes/0009-identidade-visual-vigen.md): visual Vigen (azul-petróleo) substitui a paleta pêssego do documento 04. O PDF do design fica só na máquina, em `docs/design/` (fora do Git, 80 MB).
- [0010](decisoes/0010-prazo-e-area-do-administrador.md): prazo fora do cadastro (será automático; regra a definir); Administrador na área Qualidade.
- [0007](decisoes/0007-usuarios-e-perfis.md) e [0008](decisoes/0008-locatario-entra-de-teste.md): o Entra só prova a identidade (locatário de teste); perfil e área são geridos no DocSync.

## Ambiente local do Eric

- Windows, Node 24. Sem Docker (banco PGlite em `dados-locais/banco`).
- `.env` na raiz (não versionado) já preenchido: IDs do locatário e do aplicativo de teste, `ADMINISTRADORES_INICIAIS=eric23antony@gmail.com`, `AREA_ADMINISTRADOR_INICIAL=Qualidade`.
- O Eric faz commits pelo GitHub Desktop; o pre-commit (secretlint) funciona nele.
- Contas de teste no Entra ainda não foram criadas (o Eric teve dificuldade); os testes com Qualidade, Solicitante e Leitor aguardam isso.

## Perguntas em aberto com o Eric

- Tema escuro derivado do Vigen: aguarda a aprovação dele.
- Cores das fases Devolvido e Cancelado (ambas vermelhas, distinguidas pelo rótulo): rever na F3.
- Regra do prazo automático: a definir antes de implementar.

## Pendências técnicas registradas (não bloqueiam)

- Envio de arquivos fica todo em memória (até ~120 MB por requisição): trocar por streaming antes da produção.
- Regra do último administrador usa `pg_advisory_xact_lock`: validar com PostgreSQL real antes da produção.
- Sem rota de download de arquivos (F4) e sem verificação de conteúdo/antivírus.

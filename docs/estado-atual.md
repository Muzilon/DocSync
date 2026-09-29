# Estado atual do projeto (passagem entre sessões)

Atualizado em 2026-09-29. Leia este arquivo logo depois do CLAUDE.md ao começar uma sessão nova. Atualize-o ao fim de cada fatia ou sempre que parar no meio de uma.

## Onde estamos

| Fatia | Situação | Commit |
|---|---|---|
| F0 Configuração inicial | Validada | `cb3eab4` |
| F1 Login Microsoft, casca, pessoas e perfis, visual Vigen | Validada | `a8a8d7a`, `9617d33` |
| F2 Modelo de dados + cadastro de documento | Validada pelo Eric em 2026-09-29 | `5f2f437` |
| F3 Painel Kanban | Validada pelo Eric em 2026-09-29 | `7e76160`…`1338442` |
| **F4 Detalhes + histórico** | **Em andamento: contrato aprovado; parte servidor entregue ([relatório](relatorios/2026-09-29-f4-api-detalhes-arquivos.md)); parte interface em andamento** | — |

Detalhes de cada fatia: [plano-fundacao.md](plano-fundacao.md) e os relatórios em [relatorios/](relatorios/).

## F4: em andamento

Detalhes + histórico (plano-fundacao.md). Contrato em `docs/contratos/f4-detalhes-historico.md` aprovado (seção 9 prevalece; decisão 0013). Parte servidor pronta: detalhe estendido, download e visualização com marca d'água, migração 0004 (registro de acesso). A confirmar com o Eric: a marca é desenhada por cima do conteúdo com opacidade 0,4 (não atrás), para continuar visível em páginas digitalizadas.

## Contas de teste no Entra

Script [scripts/entra/criar-contas-teste.ps1](../scripts/entra/criar-contas-teste.ps1): o Eric roda no Windows (PowerShell), no locatário de TESTE; ele cria `teste.qualidade`, `teste.solicitante` e `teste.leitor` com senha aleatória exibida só no terminal. Depois, pré-cadastro na tela Pessoas (Qualidade/Qualidade, Solicitante/Engenharia, Leitor/Suprimentos).

## Decisões recentes que mudam a especificação

- [0009](decisoes/0009-identidade-visual-vigen.md): visual Vigen (azul-petróleo) substitui a paleta pêssego do documento 04. O PDF do design fica só na máquina, em `docs/design/` (fora do Git, 80 MB).
- [0011](decisoes/0011-prazo-automatico-e-reprogramacao.md): prazo automático de 30 dias após o cadastro, com reprogramação por botão e justificativa.
- [0010](decisoes/0010-prazo-e-area-do-administrador.md): prazo fora do formulário de cadastro; Administrador na área Qualidade.
- [0007](decisoes/0007-usuarios-e-perfis.md) e [0008](decisoes/0008-locatario-entra-de-teste.md): o Entra só prova a identidade (locatário de teste); perfil e área são geridos no DocSync.

## Ambiente local do Eric

- **Máquina principal (a partir de 2026-09-29): notebook da Monto**, Windows, repositório clonado dentro do OneDrive. O PowerShell bloqueia scripts: usar `npm.cmd ...` ou o cmd. Recomendado mover o clone para fora do OneDrive (ex.: `C:\dev\DocSync`), por causa de `node_modules` e `dados-locais/`.
- `.env` do notebook montado à mão a partir do `.env.example` (IDs do locatário e do aplicativo de teste, `ADMINISTRADORES_INICIAIS`, `AREA_ADMINISTRADOR_INICIAL=Qualidade`). Banco local começa vazio nessa máquina.
- Risco: a rede/política da Monto pode barrar o login com o locatário de teste; se acontecer, avaliar com a TI ou usar a máquina pessoal.
- Máquina anterior (`eric2`, pessoal): Node 24, sem Docker, PGlite em `dados-locais/banco`; o Eric faz commits pelo GitHub Desktop; o pre-commit (secretlint) funciona nele.
- Contas de teste no Entra: script pronto em `scripts/entra/criar-contas-teste.ps1`, falta rodar.

## Perguntas em aberto com o Eric

- Contas de teste: aguardam o Eric rodar o script.
- Painel do visualizador: quais perfis (Solicitante, Leitor ou ambos) e o que ele mostra.
- Cartão do Kanban: "responsável atual" e outras informações entram conforme o Eric for decidindo (responsável depende da F5).

Resolvidas em 2026-09-29: tema escuro aprovado; Devolvido e Cancelado terão cores diferentes; prazo = cadastro + 30 dias com reprogramação justificada (decisão 0011).

## Pendências técnicas registradas (não bloqueiam)

- Envio de arquivos fica todo em memória (até ~120 MB por requisição): trocar por streaming antes da produção.
- Regra do último administrador usa `pg_advisory_xact_lock`: validar com PostgreSQL real antes da produção.
- Sem verificação de conteúdo/antivírus dos arquivos. Download e marca d'água ficam em memória (PDF até 20 MB): streaming antes da produção. Histórico sem paginação (rota `?apos=` quando a F12 importar centenas de eventos). Sem tela para `registros_acesso_arquivos` (fatia futura).

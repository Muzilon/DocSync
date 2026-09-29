# Estado atual do projeto (passagem entre sessões)

Atualizado em 2026-09-29. Leia este arquivo logo depois do CLAUDE.md ao começar uma sessão nova. Atualize-o ao fim de cada fatia ou sempre que parar no meio de uma.

## Onde estamos

| Fatia | Situação | Commit |
|---|---|---|
| F0 Configuração inicial | Validada | `cb3eab4` |
| F1 Login Microsoft, casca, pessoas e perfis, visual Vigen | Validada | `a8a8d7a`, `9617d33` |
| F2 Modelo de dados + cadastro de documento | Validada pelo Eric em 2026-09-29 | `5f2f437` |
| **F3 Painel Kanban** | **Pronta, QA aprovado com ressalvas corrigidas; aguardando validação do Eric** | — |

Detalhes de cada fatia: [plano-fundacao.md](plano-fundacao.md) e os relatórios em [relatorios/](relatorios/). Como chegamos até aqui: [historico-sessao-inicial.md](historico-sessao-inicial.md).

## F3: o que falta

1. O Eric roda o roteiro abaixo com o login real (e, se possível, com as contas de teste).
2. Se ele disser "F3 validada": marcar no plano, linha no CHANGELOG, commit e seguir para a F4.

Contrato: [contratos/f3-painel-kanban.md](contratos/f3-painel-kanban.md). Relatórios: `relatorios/2026-09-29-f3-*.md`. Capturas: `relatorios/capturas/painel-*.png`.

Roteiro de testes da F3 (com `npm run dev` reiniciado; a migração 0003 roda sozinha na subida):
- documentos já cadastrados na F2 aparecem no Painel com prazo = cadastro + 30;
- cadastrar um documento: o formulário não tem mais "Data de recebimento" e o toast mostra "Prazo: <hoje + 30>";
- Painel (menu, abaixo de Início): 5 colunas, cartão com código, título, status, etiquetas de área e prazo, "Recebido em";
- reprogramar: prazo igual/anterior ao atual ou justificativa com menos de 10 caracteres é recusado; prazo válido → toast e etiqueta "Reprogramado";
- duas abas, reprogramar o mesmo documento nas duas: a segunda avisa que alguém alterou o documento;
- busca sem acento e filtro de área mudam KPIs e contagem; "Cancelados (N)" abre a janela, Esc fecha;
- janela menor que ~1430px: o quadro rola por dentro, a página não;
- tema escuro: Cancelado em grafite, Devolvido em vermelho;
- com as contas de teste: Solicitante vê só a sua área (sem seleção de área) e não vê Reprogramar; Leitor não vê Reprogramar.

## Contas de teste no Entra

Script [scripts/entra/criar-contas-teste.ps1](../scripts/entra/criar-contas-teste.ps1): o Eric roda no Windows (PowerShell), no locatário de TESTE; ele cria `teste.qualidade`, `teste.solicitante` e `teste.leitor` com senha aleatória exibida só no terminal. Depois, pré-cadastro na tela Pessoas (Qualidade/Qualidade, Solicitante/Engenharia, Leitor/Suprimentos).

## Decisões recentes que mudam a especificação

- [0009](decisoes/0009-identidade-visual-vigen.md): visual Vigen (azul-petróleo) substitui a paleta pêssego do documento 04. O PDF do design fica só na máquina, em `docs/design/` (fora do Git, 80 MB).
- [0011](decisoes/0011-prazo-automatico-e-reprogramacao.md): prazo automático de 30 dias após o cadastro, com reprogramação por botão e justificativa.
- [0010](decisoes/0010-prazo-e-area-do-administrador.md): prazo fora do formulário de cadastro; Administrador na área Qualidade.
- [0007](decisoes/0007-usuarios-e-perfis.md) e [0008](decisoes/0008-locatario-entra-de-teste.md): o Entra só prova a identidade (locatário de teste); perfil e área são geridos no DocSync.

## Ambiente local do Eric

- Windows, Node 24. Sem Docker (banco PGlite em `dados-locais/banco`).
- `.env` na raiz (não versionado) já preenchido: IDs do locatário e do aplicativo de teste, `ADMINISTRADORES_INICIAIS=eric23antony@gmail.com`, `AREA_ADMINISTRADOR_INICIAL=Qualidade`.
- O Eric faz commits pelo GitHub Desktop; o pre-commit (secretlint) funciona nele.
- Contas de teste no Entra: script pronto em `scripts/entra/criar-contas-teste.ps1`, falta rodar.

## Perguntas em aberto com o Eric

- Contas de teste: aguardam o Eric rodar o script.
- Painel do visualizador: quais perfis (Solicitante, Leitor ou ambos) e o que ele mostra.
- Cartão do Kanban: "responsável atual" e outras informações entram conforme o Eric for decidindo (responsável depende da F5).

Resolvidas em 2026-09-29: tema escuro aprovado; Devolvido e Cancelado terão cores diferentes; prazo = cadastro + 30 dias com reprogramação justificada (decisão 0011).

## Pendências técnicas registradas (não bloqueiam)

- Envio de arquivos fica todo em memória (até ~120 MB por requisição): trocar por streaming antes da produção.
- Regra do último administrador usa `pg_advisory_xact_lock`: validar com PostgreSQL real antes da produção.
- Sem rota de download de arquivos (F4) e sem verificação de conteúdo/antivírus.

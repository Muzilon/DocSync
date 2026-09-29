# Estado atual do projeto (passagem entre sessões)

Atualizado em 2026-09-29. Leia este arquivo logo depois do CLAUDE.md ao começar uma sessão nova. Atualize-o ao fim de cada fatia ou sempre que parar no meio de uma.

## Onde estamos

| Fatia | Situação | Commit |
|---|---|---|
| F0 Configuração inicial | Validada | `cb3eab4` |
| F1 Login Microsoft, casca, pessoas e perfis, visual Vigen | Validada | `a8a8d7a`, `9617d33` |
| F2 Modelo de dados + cadastro de documento | Validada pelo Eric em 2026-09-29 | `5f2f437` |
| F3 Painel Kanban | Validada pelo Eric em 2026-09-29 | `7e76160`…`1338442` |
| F4 Detalhes + histórico | Validada pelo Eric em 2026-09-29 | `8cd5ee7`…`a2ffd8a` |
| **F5 Mudança de status** | **Servidor e interface entregues; QA aprovado com ressalvas; correções pós-QA (rodapé enxuto, rolagem do quadro) em andamento; depois validação do Eric** | `ed3d59d`…`1f9da60` |

Detalhes de cada fatia: [plano-fundacao.md](plano-fundacao.md) e os relatórios em [relatorios/](relatorios/).

## F5: o que falta

1. Correções pós-QA terminando (rodapé enxuto aprovado, quadro com a altura da janela, pequenos ajustes). Depois, o Eric roda o roteiro abaixo.
2. Se ele disser "F5 validada": marcar no plano, CHANGELOG e seguir para a F6.

Relatórios: `relatorios/2026-09-29-f5-*.md` (API, web, QA). Pendências: F9 (chave de idempotência por evento); regra "só adia" sem efeito prático depois da 0015.

Roteiro da F5 (com `npm.cmd run dev` reiniciado; a migração 0005 roda sozinha):
- Cartão sem botões: prazo neutro/laranja/vermelho e iniciais do responsável; clique ou Enter abre os detalhes. Só as colunas rolam; a página não.
- Detalhes → ação principal (ex.: "Iniciar revisão") com responsável; o cartão muda de coluna e mostra as iniciais.
- "Atualizar etapa…": todas as outras transições permitidas; responsável obrigatório em revisão, devolvido e aprovação.
- Aprovar pede confirmação ("a aprovação é final"); o KPI "Aprovados no mês" sobe.
- "Cancelar documento": motivo curto dá erro; motivo válido → aviso com "Desfazer" (8 s) que traz o documento de volta.
- Cancelados → abrir um → Reativar: a confirmação diz para qual status ele volta.
- "Reprogramar" só aparece com prazo vencido.
- Duas abas no mesmo documento: a segunda mudança avisa que alguém alterou.
- Contas de teste: Solicitante só reenvia devolvidos e aprova pela área; Leitor só vê.

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
- Cartão do Kanban: "responsável atual" e outras informações entram conforme o Eric for decidindo (responsável depende da F5).

Resolvidas em 2026-09-29: tema escuro aprovado; Devolvido e Cancelado terão cores diferentes; prazo = cadastro + 30 dias com reprogramação justificada (decisão 0011).

## Pendências técnicas registradas (não bloqueiam)

- Envio de arquivos fica todo em memória (até ~120 MB por requisição): trocar por streaming antes da produção.
- Regra do último administrador usa `pg_advisory_xact_lock`: validar com PostgreSQL real antes da produção.
- F9: chave de idempotência por evento gerada pelo cliente (`HIST-uuid` criado na origem), com migração própria. A detecção de reenvio da F3/F5 (versão + último evento do mesmo autor) cobre duplo clique e reenvio imediato, não um reenvio depois de outra ação intermediária (contrato F5, 3.6).
- Regra "só adia" da reprogramação (decisão 0012) ficou inalcançável pela API depois da decisão 0015 (com prazo vencido, qualquer data de hoje em diante é posterior ao prazo): continua em `validarNovoPrazo` e testada no puro; sem efeito prático.
- Sem verificação de conteúdo/antivírus dos arquivos. Download fica em memória (arquivo até 20 MB): streaming antes da produção. Histórico sem paginação (rota `?apos=` quando a F12 importar centenas de eventos). Sem tela para `registros_acesso_arquivos` (fatia futura).

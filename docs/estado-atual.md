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
| F5 Mudança de status | Validada pelo Eric em 2026-09-29 | `ed3d59d`…`c89c7e2` |
| **F6 Edição de dados** | **Servidor e interface entregues; QA aprovado com ressalvas; correções pequenas em andamento; depois validação do Eric** | `3c45b60`…`83d2d8c` |

Detalhes de cada fatia: [plano-fundacao.md](plano-fundacao.md) e os relatórios em [relatorios/](relatorios/).

## F6: o que falta

1. Correções pequenas do QA terminando; o Eric responde os 3 pontos da seção 10 do contrato e roda o roteiro abaixo.
2. Se ele disser "F6 validada": plano, CHANGELOG e seguir para a F7 (anexos posteriores + versões de arquivo, decisão 0014).

Relatórios: `relatorios/2026-09-29-f6-*.md`. A parte servidor foi feita com Opus (Fable sem créditos).

Roteiro da F6:
- Detalhes → "Editar dados": mudar Título e Área e salvar → aviso, cartão atualizado e "Edição de dados" na linha do tempo com "antes → depois".
- Apagar o Remetente e salvar → recusado com a mesma mensagem do cadastro.
- Salvar sem mudar nada → "Nenhum campo foi alterado." e nada é gravado.
- Código + revisão iguais aos de outro documento → recusado no campo Código, nada é mesclado.
- Duas abas: salvar na primeira; na segunda, mudar outro campo e salvar → aviso com o que mudou; salvar de novo não desfaz a primeira.
- Esc com alteração → "Descartar alterações?".
- Solicitante: botão só em Devolvido da sua área, com Área travada. Leitor: sem botão. Aprovado e Cancelado: sem botão para ninguém.

## Contas de teste no Entra

Script [scripts/entra/criar-contas-teste.ps1](../scripts/entra/criar-contas-teste.ps1): o Eric roda no Windows (PowerShell), no locatário de TESTE; ele cria `teste.qualidade`, `teste.solicitante` e `teste.leitor` com senha aleatória exibida só no terminal. Depois, pré-cadastro na tela Pessoas (Qualidade/Qualidade, Solicitante/Engenharia, Leitor/Suprimentos).

## Decisões recentes que mudam a especificação

- [0009](decisoes/0009-identidade-visual-vigen.md): visual Vigen (azul-petróleo) substitui a paleta pêssego do documento 04. O PDF do design fica só na máquina, em `docs/design/` (fora do Git, 80 MB).
- [0011](decisoes/0011-prazo-automatico-e-reprogramacao.md): prazo automático de 30 dias após o cadastro, com reprogramação por botão e justificativa.
- [0010](decisoes/0010-prazo-e-area-do-administrador.md): prazo fora do formulário de cadastro; Administrador na área Qualidade.
- [0007](decisoes/0007-usuarios-e-perfis.md) e [0008](decisoes/0008-locatario-entra-de-teste.md): o Entra só prova a identidade (locatário de teste); perfil e área são geridos no DocSync.

## Ambiente local do Eric

- **Máquina principal (a partir de 2026-09-29): notebook da Monto**, Windows, repositório clonado dentro do OneDrive. O PowerShell bloqueia scripts: usar `npm.cmd ...` ou o cmd. Recomendado mover o clone para fora do OneDrive (ex.: `C:\dev\DocSync`), por causa de `node_modules` e `dados-locais/`.
- No notebook, banco e arquivos fora do OneDrive (`BANCO_PASTA=C:/dev/docsync-dados/banco`, `ARMAZENAMENTO_PASTA=C:/dev/docsync-dados/arquivos`): o PGlite não abre dentro da pasta sincronizada.
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

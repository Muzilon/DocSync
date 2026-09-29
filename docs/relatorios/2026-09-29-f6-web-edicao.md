# Relatório — F6 — Edição de dados (parte interface)

- **Data:** 2026-09-29
- **Agente / modelo:** agente-ux-ui / Opus
- **Fatia:** F6 ([contrato](../contratos/f6-edicao-de-dados.md), seção 9 prevalece; decisão [0015](../decisoes/0015-cartao-estilo-planner.md))

## O que foi feito

- **Botão "Editar dados"** (ícone `Pencil`, secundário) no rodapé do modal de detalhes, na ordem do contrato (ação principal → Atualizar etapa… → **Editar dados** → Cancelar documento → Reativar → Reprogramar → Fechar). Aparece só quando `podeEditar(eu, documento)` (`permissoes.ts`): `podeEditarAgora(documento) && pode(eu, 'editarDados', { areaId, status })`. Leitor, Solicitante fora de devolvido ou de outra área, Aprovado e Cancelado não veem o botão (nem desativado). O cartão do Painel não mudou (decisão 0015).
- **`DialogoEditarDados`** (sobre `Dialogo`, `larga`, empilhado): cabeçalho com código/"S/ código", "Rev. N", `BadgeStatus` e a frase fixa "Status, responsável, data de recebimento, prazo e arquivos não se alteram aqui."; os 8 campos na ordem e com os componentes do cadastro (IDs `edicao-*`), sem `ZonaArquivo`; grade 2 colunas ≥ 640px. Tipo atual inativo aparece como "(inativo)", área atual inativa como "(inativa)"; áreas em ordem pt-BR (`ordenarAlfabetico`); para o Solicitante a área é somente leitura com a dica "Você edita documentos só na sua área.". Listas carregando (`Carregando`) e com erro (`ErroCarregamento` + "Tentar novamente").
- **Validação por script** (`noValidate`) com `validarDadosDocumento` (a mesma da API), resumo de erros focável com links para os campos e erros inline por `aria-describedby`. Sem diferença (`diferencasDocumento` vazio) → "Nenhum campo foi alterado." e nenhuma chamada.
- **Envio** `PUT /documentos/:id/dados` com os 8 campos normalizados + `versao` (`api.editarDados` em `cliente.ts`, também envolvido por `vigiar` em `Sessao.tsx`). Sucesso: fecha, aviso `role="status"` no modal "Dados atualizados: Título, Área." (rótulos de `rotuloCampoHistorico` sobre o `evento.detalhes`), `aoAtualizarDocumento` (Painel troca o cartão por `mesclarDocumento`; área fora do filtro some pela `filtrarCartoes`), recarga silenciosa (linha do tempo ganha o EDICAO com "antes → depois"), foco volta ao botão. `200` com `evento: null` → "Nenhuma alteração para salvar.".
- **Erros:** `409 conflito_versao` não fecha nem descarta: aviso focável com a lista "Campo: “A” → “B”" do que a outra pessoa mudou, dica "Valor atual no servidor: X." em cada campo alterado, base e versão atualizadas, `aoAtualizarDocumento` com o documento do erro; se o documento deixou de ser editável, o botão Salvar some e o aviso diz o porquê. `codigo_revisao_existente` inline em Código; `dados_invalidos` inline por campo; `sem_permissao`/`acao_nao_permitida` com a mensagem do servidor; `sem_conexao` com "Tentar novamente" reenviando o **mesmo** corpo.
- **Descartar:** com alterações, "Voltar", Esc e ✕ abrem "Descartar alterações?" ("Descartar" / "Continuar editando"; `DialogoConfirmar` ganhou `rotuloVoltar`); sem alterações fecham direto. Foco inicial no Título.
- **Tela Novo documento:** texto dos campos validado por `validarDadosDocumento`; corpo do cadastro montado dos dados normalizados; rótulos e ordem vindos do módulo comum `camposDocumento.ts` (`NOME_CAMPO_DOCUMENTO`, `ORDEM_CAMPOS_DOCUMENTO`, `MENSAGEM_CODIGO_EXISTENTE`).
- **Vitrine:** `editarDados` simulado com as mesmas funções puras da API (inclusive código+revisão, área nova, Aprovado/Cancelado); `?editar=1` abre o diálogo; `?edicao=conflito` gera um 409 (outra pessoa trocou remetente e disciplina); `?perfil=Solicitante|Leitor` já existiam.
- **Testes:** Vitest `DialogoEditarDados.test.tsx` (27 casos: `podeEditar` por perfil/status, ordem do rodapé, sem botão, preenchimento, inativos, área travada, validação e resumo, sem alteração, envio + aviso + linha do tempo + foco, conflito com mescla e reenvio na versão nova, conflito para Aprovado, código+revisão, 400/403, sem conexão, erro das listas, Esc/Descartar/Continuar). e2e `edicao.spec.ts` (14 casos: 768/1024/1440 × claro/escuro com axe e sem rolagem horizontal, teclado com foco preso e Esc só no de cima, fluxo salvar → evento "antes → depois" e cartão atualizado, P-14, conflito, Solicitante/Leitor, Aprovado, toque 44px). Rodapés esperados em `status.spec.ts` e `DetalhesDocumento.test.tsx` ganharam "Editar dados".
- **Capturas** em `docs/relatorios/capturas/`: `editar-dados-{1440,1024,768}-{claro,escuro}`, `editar-dados-conflito-*`, `editar-dados-erros-*`, `editar-dados-salvo-*`, `editar-dados-solicitante-*`.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `apps/web/src/camposDocumento.ts` | Novo: rótulos, ordem e mensagem de código comuns ao cadastro e à edição. |
| `apps/web/src/componentes/DialogoEditarDados.tsx` / `.module.css` | Novo diálogo (5.2–5.5). |
| `apps/web/src/componentes/DialogoEditarDados.test.tsx` | Novos testes de tela. |
| `apps/web/src/componentes/DetalhesDocumento.tsx` | Botão "Editar dados", diálogo empilhado, aviso e recarga. |
| `apps/web/src/componentes/DialogoConfirmar.tsx` | Prop opcional `rotuloVoltar`. |
| `apps/web/src/permissoes.ts` | `podeEditar`. |
| `apps/web/src/api/cliente.ts`, `autenticacao/Sessao.tsx` | `editarDados` (PUT). |
| `apps/web/src/telas/TelaNovoDocumento.tsx` | Validação por `validarDadosDocumento`; rótulos do módulo comum. |
| `apps/web/src/componentes/DetalhesDocumento.test.tsx`, `telas/*.test.tsx` | Mock `editarDados`; rodapé com "Editar dados". |
| `apps/web/e2e/vitrine/vitrine.tsx` | API simulada de edição, `?editar=1`, `?edicao=conflito`. |
| `apps/web/e2e/edicao.spec.ts`, `status.spec.ts`, `capturas.spec.ts` | e2e + axe e capturas da F6. |
| `CHANGELOG.md` | Linha da F6 (interface). |

## O que ficou pendente

- Revisão do `agente-qa-revisao` e do `agente-visao-minimalista` (rodapé do modal agora tem até 5 botões para Qualidade/Administrador; em 768px quebra em duas linhas, sem rolagem horizontal, ver `editar-dados-salvo-*`).
- Verificação integrada com a API real (o Vitest e o e2e usam API simulada).

## Divergências registradas (não corrigidas por mim)

1. **Mensagem da revisão na tela Novo documento** mudou de "Informe um número inteiro igual ou maior que 0." para a do compartilhado, "O número de revisão deve ser um inteiro de 0 a 999." (a regra agora tem teto de 999). Nenhum teste conferia o texto antigo. O contrato (2.2) fala em "mesmas mensagens"; a mensagem nova é a que a API já usava.
2. **Conflito de versão:** além de manter o que a pessoa digitou (contrato 5.4), os campos que ela **não tocou** passam ao valor atual do servidor. Sem isso, o reenvio com a versão nova desfaria em silêncio a mudança da outra pessoa (decisão 0002). Os campos alterados pelos dois lados mantêm o valor digitado e mostram a dica "Valor atual no servidor".
3. Dica nova em "N° de revisão" no diálogo: "Corrige o número deste documento; não cria uma revisão nova." (resposta 3 do Eric; o contrato não fixava texto).

## Como validar

1. `npm run typecheck`, `npm test` (565 testes), `npm run build`, `npm run segredos`: todos passam.
2. `npm run test:e2e` em `apps/web`: 115 passam (53 capturas puladas sem `CAPTURAS`).
3. Na vitrine, `/e2e/vitrine/index.html?rota=%2Fpainel%3Fdocumento%3DDOC-P6`: "Editar dados" → mudar título e área → Salvar → conferir o aviso, o cartão e o evento "Edição de dados" expandido com "antes → depois". Repetir com `&edicao=conflito` (a segunda edição vê o que mudou), `&perfil=Solicitante` (área travada) e `&perfil=Leitor` (sem botão).
4. Roteiro do Eric (contrato 7.2): tentar apagar o remetente → recusado no formulário; duas abas editando → a segunda vê o conflito.

## Decisões tomadas ou necessárias

- Nenhuma decisão nova de arquitetura. As divergências 1 e 2 acima pedem só o "de acordo" do Claude principal (ou uma linha no contrato).

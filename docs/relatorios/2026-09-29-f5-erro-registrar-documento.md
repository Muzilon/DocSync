# Relatório — F5 — Erro inesperado ao registrar documento

- **Data:** 2026-09-29
- **Agente / modelo:** agente-arquitetura-dados / Fable
- **Fatia:** F5 (diagnóstico de defeito no cadastro, F2)

## O que foi feito

Relato: ao registrar 'pomba orando.jpg' (14 KB, sem anexos) a tela mostra "Ocorreu um erro inesperado".

**Leitura do sintoma.** Essa mensagem é `MENSAGENS.desconhecido` (`apps/web/src/api/erros.ts`). Pelo cliente (`cliente.ts`) ela só aparece quando a API responde com JSON cujo `codigo` não está na lista da interface. Na prática, é o 500 `{ "codigo": "erro_interno" }` do `setErrorHandler` de `apps/api/src/app.ts` (a falha de armazenamento também usa `erro_interno`). Um 5xx sem corpo (proxy sem API) mostraria "Não foi possível conectar ao servidor", e 400 de validação mostraria "Revise os campos destacados". Ou seja: a API recebeu o pedido e lançou exceção não tratada.

**Reprodução: não consegui.** Hipóteses descartadas com teste real (HTTP de verdade com `FormData`, como o navegador; armazenamento local em disco; banco PGlite em pasta; JPG de 14 KB chamado `pomba orando.jpg`, sem anexos): cadastro devolve 201, o arquivo fica em `<pasta>/<DOC-id>/pomba orando.jpg` e volta idêntico.

- Espaço no nome / extensão JPG / sanitização: OK (`sanitizarNomeArquivo`, `validarArquivo`).
- Pasta de armazenamento: `ARMAZENAMENTO_PASTA=./armazenamento-local` resolve para `C:\Users\eric2\Documents\GitHub\DocSync\armazenamento-local`; gravar, ler e remover nessa pasta real funcionou (a pasta ainda não existia; `mkdir` recursivo a cria).
- Migrações: `dados-locais/banco` (cópia examinada) tem 0001 a 0005 aplicadas, tabela `documentos` com todas as colunas (incluindo `responsavel_id`), 0 documentos, 4 usuários, 8 áreas, 8 tipos.
- Limites do multipart: 14 KB está bem abaixo de 25 MB (LIMITES_ARQUIVO); excesso geraria 400 com mensagem no campo, não 500.
- Proxy do Vite: só reescreve `/api`; multipart passa direto.

Não foi alterado nenhum código de produção (não há defeito reproduzível para corrigir com a menor mudança). Foi adicionado um teste de regressão que cobre o que faltava: cadastro de ponta a ponta com `ArmazenamentoLocal` (os demais testes usam memória).

**Causa provável a confirmar (não provada):** algo específico do processo da API em execução na máquina do Eric, por exemplo processo antigo sem reinício depois da migração 0005 ou duas instâncias da API disputando a mesma pasta do PGlite, ou bloqueio de gravação no Windows (antivírus, "Acesso controlado a pastas") em `armazenamento-local`. Só o log do terminal da API mostra qual.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `apps/api/src/cadastro-armazenamento-local.test.ts` | Novo: regressão do cadastro com armazenamento local em disco, PGlite em pasta, HTTP real e JPG com espaço no nome. |
| `docs/relatorios/2026-09-29-f5-erro-registrar-documento.md` | Este relatório. |

## O que ficou pendente

1. **Eric copia o log do terminal da API.** Ao clicar em Registrar de novo, o terminal onde roda `npm run dev` imprime uma linha JSON de nível 50 (`"level":50`) com `err` (mensagem e pilha) e o `reqId`. Colar essa linha (não contém token nem segredo: o `Authorization` é ocultado) fecha o diagnóstico. Alternativa: DevTools do navegador, aba Rede, requisição `documentos`, resposta (deve ser `{"codigo":"erro_interno"}`).
2. Antes disso, teste rápido: parar todos os processos `node`, rodar `npm run dev` uma vez só e repetir o cadastro.
3. Pendência à parte, não relacionada: `armazenamento-local/` não está no `.gitignore` (só `dados-locais` está). Os arquivos dos documentos, gravados na primeira vez que o cadastro funcionar, poderiam ser versionados por engano. Sugestão: adicionar `armazenamento-local/` ao `.gitignore` (mudança pequena, ficou por aprovação do Eric/Claude principal).
4. Melhoria opcional: a interface mostra a mesma mensagem para `erro_interno`; um código conhecido `erro_interno` com texto "Erro no servidor; avise o administrador do DocSync" ajudaria a distinguir. Não feito (escopo).

## Como validar

1. `npm test` (491 testes passando, inclui o novo) e `npm run typecheck` (sem erros).
2. `npx vitest run src/cadastro-armazenamento-local.test.ts` dentro de `apps/api`.
3. Reproduzir no ambiente do Eric e enviar o log descrito em "O que ficou pendente".

## Decisões tomadas ou necessárias

Nenhuma decisão de arquitetura. Sem alteração de modelo de dados. Sem entrada no CHANGELOG (não houve mudança de comportamento, só um teste novo).

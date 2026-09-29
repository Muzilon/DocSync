# Relatório — F1 — API: login Microsoft, pessoas e perfis (parte servidor)

- **Data:** 2026-09-28
- **Agente / modelo:** agente-autenticacao-microsoft + agente-arquitetura-dados / Fable
- **Fatia:** F1 (parte servidor: `packages/compartilhado` e `apps/api`; `apps/web` ficou com outro agente)

## O que foi feito

**Compartilhado (`packages/compartilhado/src/pessoas.ts`)**
- `PERFIS`, `Perfil`, `StatusPessoa`, `Pessoa`, `Area`, `Acao` (`'gerenciarPessoas' | 'verDocumentos'`; cresce a cada fatia) com os nomes exatos combinados com a interface.
- `pode(pessoa, acao)`: função única de permissão. Pessoa ausente, inativa ou sem perfil não pode nada; `gerenciarPessoas` só Administrador. Perfil não Administrador sem área também não pode nada (é "acesso ainda não liberado"); o Administrador dispensa área, porque o primeiro nasce do bootstrap sem área.
- Extras úteis para a interface: `acessoLiberado(pessoa)` (mesma regra acima), `ehPerfil`, e o contrato das rotas: `NovaPessoa`, `AlteracaoPessoa`, `RegistroAuditoriaPessoa`, `ErroApi`, `CodigoErroApi`.
- Testes com a tabela de permissões (perfil × ação) e os casos de inativo, sem perfil e sem área.

**Banco (PGlite, decisão 0003)**
- `abrirBanco(pasta | 'memoria')`: pasta vinda de `BANCO_PASTA`, relativa à raiz do monorepo (padrão `./dados-locais/banco`, já no `.gitignore`); modo em memória para testes.
- Migrações simples e versionadas: `apps/api/migracoes/NNNN_nome.sql`, aplicadas em ordem na subida, cada uma numa transação, registradas na tabela `migracoes`. Plano de volta no topo de cada arquivo.
- `0001_pessoas_e_areas.sql`: `areas` (8 áreas da decisão 0006, ID `AREA-uuid` gerado uma vez e estável), `usuarios` (`USR-uuid`, `id_entra` único e nulo até o 1º login, e-mail minúsculo único com CHECK, perfil nulo, `area_id` nulo, status, `criado_em`, `atualizado_em`), `auditoria_pessoas` (`AUD-uuid`, `ordem` sequencial, `id_usuario`, `autor_id`, `data_hora`, `campo`, `antes`, `depois`), imutável por gatilho (UPDATE, DELETE e TRUNCATE recusados).

**Autenticação (Entra ID)**
- `validarToken` com jose: JWKS de `https://login.microsoftonline.com/{ENTRA_TENANT_ID}/discovery/v2.0/keys`, RS256, emissor v2 do locatário, audiência `api://{ENTRA_CLIENT_ID}` **ou** `{ENTRA_CLIENT_ID}`, `tid` do locatário, escopo `acesso_usuario` em `scp`, `oid` obrigatório, tolerância de relógio de 30 s. O provedor de chaves é injetável (testes usam JWKS local).
- Também aceita o emissor v1 (`https://sts.windows.net/{tenant}/`) do mesmo locatário, para não quebrar se o manifesto do aplicativo emitir tokens v1. Continua amarrado ao locatário e à audiência.
- E-mail lido nas claims `email`, `preferred_username`, `upn` e `unique_name`, nessa ordem, em minúsculas. O UPN de convidado (`eric23antony_gmail.com#EXT#@...`) vira `eric23antony@gmail.com`; o prefixo `live.com#` (tokens v1 de conta pessoal) é removido.
- Identificação (decisão 0007), a cada requisição, numa transação: 1) por `id_entra` (= `oid`); 2) senão, pelo e-mail num pré-cadastro sem `id_entra` (grava o vínculo e audita `vinculoEntra`); 3) senão, cria registro sem perfil (audita `cadastro`). Se o e-mail já estiver vinculado a **outro** `oid`, responde 409 `conflito_identidade` em vez de associar em silêncio.
- Bootstrap: sem nenhum Administrador ativo e e-mail em `ADMINISTRADORES_INICIAIS` (lista por vírgula) → vira Administrador, auditado com autor `sistema`.
- Sem token, token inválido ou esquema diferente de Bearer → 401 `{codigo:'nao_autenticado'}` com cabeçalho `WWW-Authenticate`. Pessoa inativa → 403 `{codigo:'inativo'}` em todas as rotas protegidas. Identidade só do token, nunca do corpo.

**Rotas (sem prefixo; a web chama `/api/...` pelo proxy do Vite; sem CORS)**

| Rota | Quem | Resposta |
|---|---|---|
| `GET /saude` | público | `{status:'ok'}` |
| `GET /eu` | autenticado | 200 `Pessoa` (mesmo sem perfil) |
| `GET /areas` | autenticado | `Area[]` ativas, ordem alfabética pt-BR |
| `GET /pessoas` | `gerenciarPessoas` | `Pessoa[]` por nome (pt-BR) |
| `POST /pessoas` `{email, nome, perfil?, areaId?}` | `gerenciarPessoas` | 201 `Pessoa`; 409 `email_existente`; 400 `dados_invalidos` com `campos` |
| `PATCH /pessoas/:id` `{perfil?, areaId?, status?}` | `gerenciarPessoas` | 200 `Pessoa`; 404 `nao_encontrado`; 409 `ultimo_administrador`; 400 `dados_invalidos` |
| `GET /pessoas/:id/auditoria` | `gerenciarPessoas` | `RegistroAuditoriaPessoa[]` em ordem de gravação |

- Sem permissão → 403 `{codigo:'sem_permissao'}`. JSON malformado → 400 `dados_invalidos`. Erro inesperado → 500 `erro_interno` (detalhe só no log).
- Esquema fechado com mensagens pt-BR (ex.: `{"codigo":"dados_invalidos","campos":{"id":"Campo não permitido."}}`). `perfil` e `areaId` são opcionais e aceitam `null` no POST (pré-cadastro sem liberar acesso). `areaId` precisa existir e estar ativa.
- PATCH grava auditoria campo a campo (só o que mudou; área registrada pelo nome), com o autor da identidade autenticada. O pré-cadastro também audita `cadastro`, `perfil` e `area`.
- Último Administrador ativo não pode ser rebaixado (inclusive para `null`) nem inativado → 409.
- Logs do Fastify em JSON, com `req.headers.authorization` ocultado; token recusado registra só o código do motivo (ex.: `ERR_JWS_INVALID`).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `packages/compartilhado/src/pessoas.ts` | Novo: tipos, `pode`, `acessoLiberado`, contrato das rotas |
| `packages/compartilhado/src/pessoas.test.ts` | Novo: tabela de permissões |
| `packages/compartilhado/src/index.ts` | Exporta o módulo de pessoas |
| `apps/api/migracoes/0001_pessoas_e_areas.sql` | Novo: áreas, usuários, auditoria imutável |
| `apps/api/src/banco/conexao.ts` | Novo: abrir PGlite e aplicar migrações |
| `apps/api/src/banco/pessoas.ts` | Novo: acesso a usuários, áreas e auditoria |
| `apps/api/src/autenticacao/token.ts` | Novo: validação do token e extração de e-mail |
| `apps/api/src/autenticacao/identificacao.ts` | Novo: localizar/associar/criar pessoa e bootstrap |
| `apps/api/src/autenticacao/plugin.ts` | Novo: hook de autenticação, `exigir(acao)`, `enviarErro` |
| `apps/api/src/rotas/pessoas.ts` | Novo: `/eu`, `/areas`, `/pessoas` |
| `apps/api/src/validacao.ts` | Novo: validação de esquema fechado em pt-BR |
| `apps/api/src/config.ts` | Novo: leitura do ambiente (falha clara se faltar `ENTRA_*`) |
| `apps/api/src/app.ts` | Recebe banco, configuração e provedor de chaves; tratador de erros |
| `apps/api/src/servidor.ts` | Abre o banco, liga logs sem token, encerra o banco ao sair |
| `apps/api/src/apoio-testes.ts` | Novo: Entra falso (JWKS local) e ambiente de teste |
| `apps/api/src/app.test.ts` | Reescrito: 29 testes de rotas, identificação e banco |
| `apps/api/src/autenticacao/token.test.ts` | Novo: 15 testes de token e e-mail |
| `apps/api/package.json`, `package-lock.json` | `jose`, `@electric-sql/pglite`, `@docsync/compartilhado` |
| `apps/api/tsconfig.build.json` | Exclui `apoio-testes.ts` do build |
| `.env.example` | Só comentário de `ADMINISTRADORES_INICIAIS` (lista por vírgula); nenhuma chave nova |
| `CLAUDE.md` | Seção 7: convenções de banco, migrações, IDs, API, permissões e testes |
| `CHANGELOG.md` | Linha da F1 (parte servidor) |

## O que ficou pendente

- **Configuração no Entra (Eric, no locatário de teste):** em "Expor uma API", URI `api://{client-id}` e escopo `acesso_usuario`; a interface deve pedir o escopo `api://{client-id}/acesso_usuario` (token para o Graph, como `User.Read`, é recusado). Recomendado no manifesto: `requestedAccessTokenVersion: 2` (a API aceita v1 também).
- **Validação real com a conta do Eric**: os testes cobrem o formato #EXT# e a ordem das claims, mas o primeiro login real vai confirmar quais claims o locatário de teste emite para a conta pessoal convidada. Se o 1º login criar a pessoa sem perfil, conferir se `ADMINISTRADORES_INICIAIS` no `.env` tem o mesmo e-mail que aparece em `/eu`.
- **Contrato de `Pessoa` só traz o nome da área**, não o ID. A interface mapeia nome → ID pela lista de `GET /areas` (nomes são únicos) para enviar `areaId` no PATCH. Se preferirem, acrescentar `areaId` em `Pessoa` é mudança pequena, mas muda o contrato combinado.
- Falha de rede ao buscar o JWKS do Entra hoje resulta em 401 (não 503). Aceitável para a F1.
- Sessão que expira é responsabilidade do MSAL na interface; a API recusa token vencido.
- `verDocumentos` ainda não é usado por nenhuma rota (entra com os documentos, F2+).
- Revisão pelo `agente-qa-revisao`.

## Como validar

1. Na raiz: `npm run typecheck`, `npm test` (84 testes; 44 da API, ~12 s), `npm run build`, `npm run segredos`. Todos passaram nesta entrega (com o estado atual de `apps/web`).
2. Preencher no `.env` local `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` e `ADMINISTRADORES_INICIAIS` (e-mail do Eric) e rodar `npm run dev`. A API sobe em `http://127.0.0.1:3001` e cria o banco em `dados-locais/banco`.
3. Sem login: `curl http://127.0.0.1:3001/eu` → 401 `{"codigo":"nao_autenticado"}`.
4. Entrar pela interface com a conta do Eric: `/eu` deve voltar com `perfil: "Administrador"`; a auditoria dele mostra o registro com autor "Sistema".
5. Pré-cadastrar uma conta de teste do locatário com perfil e área; entrar com ela; conferir que já chega com o perfil e que `GET /pessoas` com ela dá 403.
6. Entrar com outra conta de teste não cadastrada: deve ver "Acesso ainda não liberado".
7. Tentar tirar o perfil de Administrador do Eric sendo o único: 409 `ultimo_administrador`.

## Decisões tomadas ou necessárias

- Tomadas dentro do escopo (sem mudar decisão existente): aceitar também o emissor v1 do mesmo locatário; recusar com 409 `conflito_identidade` quando o e-mail já está vinculado a outro `oid`; Administrador dispensa área para ter acesso; auditoria também registra pré-cadastro, vínculo no 1º login e bootstrap; área na auditoria gravada pelo nome (retrato legível do momento).
- Nenhuma decisão nova de arquitetura necessária. Se o Eric preferir que o 1º Administrador também tenha área obrigatória, basta ajustar `acessoLiberado`.

## Correções pós-QA (2026-09-28)

O `agente-qa-revisao` aprovou a F1 com ressalvas. O que mudou:

- **M1 — `areaId` em `Pessoa`:** o contrato agora traz `areaId: string | null` (ID estável `AREA-uuid`) além do nome da área. A API devolve o campo em todas as respostas de pessoa (`paraPessoa`). Na interface, `TelaPessoas.tsx` usa `pessoa.areaId` diretamente (não procura mais o ID pelo nome). Se a área atual da pessoa estiver inativa (fora de `/areas`), o diálogo de edição mostra "`<nome>` (inativa)" selecionada, em vez de "Sem área". Isso resolve a pendência "Área em `Pessoa`" registrada acima.
- **M2 — concorrência nas decisões sobre Administrador:** a regra do último Administrador (PATCH) e o bootstrap agora tomam `pg_advisory_xact_lock` com chave fixa (`bloquearDecisaoAdministradores`, em `apps/api/src/banco/pessoas.ts`) **antes** de ler e contar. No PATCH, o bloqueio é feito no início da transação sempre que o pedido altera perfil ou situação, e só então a pessoa é lida. Escolhi advisory lock em vez de `SELECT ... FOR UPDATE` porque o bootstrap precisa bloquear justamente quando não existe nenhuma linha de Administrador para travar. É PostgreSQL padrão e funciona no PGlite (coberto pelos testes).
- **B1:** `apps/web/src/api/cliente.ts` importa `NovaPessoa` e `AlteracaoPessoa` de `@docsync/compartilhado` e só as reexporta; não há mais definição duplicada.
- **B2 (intencional, sem mudança de comportamento):** o diálogo de edição não oferece "limpar área". Tirar a área de alguém cortaria o acesso de um perfil não Administrador sem deixar isso explícito. Para barrar o acesso, o caminho é inativar a pessoa. A API continua aceitando `areaId: null`, caso uma tela futura precise.

**Arquivos:** `packages/compartilhado/src/pessoas.ts` e `pessoas.test.ts`; `apps/api/src/banco/pessoas.ts`, `rotas/pessoas.ts`, `autenticacao/identificacao.ts` e `app.test.ts`; `apps/web/src/api/cliente.ts`, `telas/TelaPessoas.tsx` e `telas/TelaPessoas.test.tsx`.

**Testes novos:**
- API: `areaId` devolvido, e nome e ID mantidos quando a área é inativada.
- API: dois rebaixamentos simultâneos dos dois últimos Administradores, em que só um passa e sobra exatamente um Administrador ativo.
- Web: o diálogo usa `areaId` e mostra a área inativa como "(inativa)"; mudar só o perfil não reenvia a área.

**Verificações:** `npm run typecheck`, `npm test` (87 testes), `npm run build` e `npm run segredos`, todos sem erro.

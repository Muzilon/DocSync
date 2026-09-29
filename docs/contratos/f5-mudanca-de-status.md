# Contrato da fatia F5 — Mudança de status

- **Data:** 2026-09-29
- **Status:** Aprovado pelo Eric em 2026-09-29 com as respostas da seção 11 (prevalece). Status anterior: Proposto; aguarda respostas do Eric (seção 10) antes de qualquer código.
- **Base:** [plano-fundacao.md](../plano-fundacao.md) (linha F5), documento 02 (seções 3.1, 3.2, 4.3 e 7.3), documento 03 (seções 9.4, 9.6, 10.1, 10.2, 10.4; P-03, P-12, P-14, P-17), documento 04 (seções 5.3, 6.2, 8.4, com as cores da decisão [0009](../decisoes/0009-identidade-visual-vigen.md)), decisões [0002](../decisoes/0002-fonte-da-verdade.md), [0004](../decisoes/0004-revisoes-e-reativacao.md), [0007](../decisoes/0007-usuarios-e-perfis.md), [0011](../decisoes/0011-prazo-automatico-e-reprogramacao.md), [0012](../decisoes/0012-recebimento-automatico-e-metas-de-ciclo.md) e [0014](../decisoes/0014-download-nome-e-versoes-de-arquivo.md); contratos da [F3](f3-painel-kanban.md) e da [F4](f4-detalhes-historico.md) (formato, ordem de decisão, idempotência e concorrência já em vigor).

Este arquivo é o combinado entre a parte servidor (`apps/api`, `packages/compartilhado`) e a parte interface (`apps/web`). Tudo o que a interface consome está tipado em `packages/compartilhado`; nenhuma das duas partes inventa campo fora daqui. Mudança neste contrato durante a F5 é feita aqui primeiro, depois no código.

A F5 é a primeira fatia que **muda o status** de um documento depois do cadastro. Até aqui só existiam CRIACAO e REPROGRAMACAO; agora entram STATUS e CANCELAMENTO, e com eles passam a ter valor real: a contagem "↺ N×" de devoluções, `dataAprovacao`, o KPI "Aprovados no mês" (P-12) e as metas de 14 e 40 dias (decisão 0012).

## 1. Escopo

**Entra na F5**

- Máquina de estados do documento: transições permitidas por status e por perfil, como **função pura** em `packages/compartilhado` (a mesma na API, que decide, e na interface, que esconde botões). Transição proibida é recusada no servidor (critério de validação do Eric).
- Rotas `POST /documentos/:id/transicoes`, `POST /documentos/:id/cancelamentos` e `POST /documentos/:id/reativacoes`, com corpo fechado, concorrência otimista (`409 conflito_versao`), idempotência e evento imutável com autor do token.
- **Responsável** pela etapa: pessoa cadastrada, obrigatória quando aplicável, guardada no documento ("responsável atual") e em cada evento. Rota de leitura `GET /responsaveis`.
- Cancelamento com **motivo** e **Desfazer** (toast com ação); **reativação** para o status anterior ao cancelamento (decisão 0004, P-17), a mesma regra em todos os pontos da interface.
- **Aprovado é final** (decisão 0004): não muda de status, não cancela.
- KPI **"Aprovados no mês"** (P-12) e **metas de 14/40 dias** (decisão 0012) como funções puras; exibição proposta na seção 6.
- Interface: uma ação principal no cartão, rodapé de ações no modal de detalhes, diálogo "Atualizar etapa", cancelar com Desfazer, reativar na janela de cancelados e no modal, "Responsável" no cartão, quarto KPI, bloco de metas no modal; teclado, 768px+, toque.
- Migração `0005_responsavel.sql` (coluna `responsavel_id` em `documentos` e em `eventos_historico`).

**Fica fora (não aparece nem como botão desativado)**

- Editar dados do documento (título, tipo, área, remetente…): **F6**. Sem botão "Editar". A F5 muda **só** `status`, `responsavel_id`, `versao` e `data_modificacao`; P-14 continua garantido (status nunca muda pela edição, só por estas rotas).
- Anexar arquivo depois do cadastro e nova versão de arquivo com justificativa (decisão 0014, item 5): **F7**. Devolver um documento não pede nem aceita arquivo.
- Revisão técnica vinculada (documento novo com `idDocumentoOrigem`; código único por código + revisão): **F8**. "Reabrir Revisão" não existe (decisão 0004).
- Fila offline de envio e chave de idempotência gerada pelo cliente para eventos: **F9** (ver 3.6).
- Notificar o responsável por e-mail: módulo futuro (Notificações). A F5 só grava quem é o responsável.
- Tela de administração de listas (status, áreas): **F11**. Status continuam a lista fechada do documento 02, 3.1.
- Painel próprio para quem só acompanha (ideia registrada no plano): decisão futura.

## 2. Máquina de estados

### 2.1 Status e fases (já existem; nada muda)

`STATUS_DOCUMENTO` (11 valores) e `FASE_DO_STATUS` em `packages/compartilhado/src/documentos.ts`. **'Em Revisão' (genérico)** existe só para dados migrados: **nunca é destino** de uma transição nova; como **origem**, é tratado como qualquer status da fase `revisao`. Ele pode voltar a ser o status de um documento por **reativação** (restaura o que estava gravado; não é escolha).

### 2.2 Transições permitidas (independentes de perfil)

Regra por **fase** (documento 02, 3.2, mais os atalhos que o documento 03, 10.1, já oferecia e que estão listados no ponto 1 da seção 10), em `packages/compartilhado/src/transicoes.ts`:

```ts
/** Fases de destino permitidas a partir de cada fase (documento 02, 3.2 + documento 03, 10.1). */
export const DESTINOS_POR_FASE: Record<Fase, readonly Fase[]> = {
  recebido:  ['revisao', 'devolvido'],
  revisao:   ['revisao', 'devolvido', 'aprovacao', 'aprovado'],
  devolvido: ['devolvido', 'revisao', 'aprovacao'],
  aprovacao: ['aprovacao', 'devolvido', 'aprovado'],
  aprovado:  [],            // final (decisão 0004)
  cancelado: [],            // só por reativação (rota própria)
};

/** Status que podem ser escolhidos como destino a partir de `de`. Exclui 'Em Revisão' (genérico),
 *  'Cancelado' (rota própria), o próprio `de` e qualquer status fora de DESTINOS_POR_FASE. */
export function destinosPermitidos(de: StatusDocumento): StatusDocumento[];

/** A máquina aceita `de` → `para`? (= destinosPermitidos(de).includes(para)). */
export function transicaoPermitida(de: StatusDocumento, para: StatusDocumento): boolean;
```

Tabela resultante (linhas = origem, colunas = destino; ● permitido). Mudar entre dois status da **mesma fase** (ex.: "Em revisão da qualidade" → "Em revisão junto à área") é permitido, porque muda quem está com o documento sem mudar a coluna.

| de \ para | Em rev. qualidade | Em rev. junto à área | Devolv. p/ área p/ revisão | Devolv. p/ correção | Em rev. do solicitante | P/ aprov. da área | P/ aprov. qualidade | Aprovado |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Recebido | ● | ● | ● | ● | ● | | | |
| Em revisão da qualidade | | ● | ● | ● | ● | ● | ● | ● |
| Em revisão junto à área | ● | | ● | ● | ● | ● | ● | ● |
| Em Revisão (migrado) | ● | ● | ● | ● | ● | ● | ● | ● |
| Devolvido p/ área p/ revisão | ● | ● | | ● | ● | ● | ● | |
| Devolvido p/ correção | ● | ● | ● | | ● | ● | ● | |
| Em revisão do solicitante | ● | ● | ● | ● | | ● | ● | |
| P/ aprovação da área solicitante | | | ● | ● | ● | | ● | ● |
| P/ aprovação qualidade | | | ● | ● | ● | ● | | ● |
| Aprovado | | | | | | | | |
| Cancelado | | | | | | | | |

Cancelar: de qualquer status **exceto Aprovado e Cancelado** (rota própria, seção 3.3). Reativar: só de Cancelado, para o status anterior ao cancelamento (seção 3.4).

### 2.3 Por perfil (documento 02, 7.3)

`pode` continua a função única. `ContextoPermissao` ganha a transição, e `Acao` ganha três ações:

```ts
export interface ContextoPermissao {
  areaId?: string;
  /** Só em 'mudarStatus': a transição pedida. Sem ela, `pode` responde à pergunta genérica
   *  "esta pessoa pode mudar status de documentos desta área?" (para mostrar o rodapé de ações). */
  transicao?: { de: StatusDocumento; para: StatusDocumento };
}

export type Acao = /* existentes */ | 'mudarStatus' | 'cancelarDocumento' | 'reativarDocumento';
```

| Ação | Administrador | Qualidade | Solicitante | Leitor |
|---|:-:|:-:|:-:|:-:|
| `mudarStatus` | sim | sim | `daSuaArea` **e** transição em `TRANSICOES_SOLICITANTE` | não |
| `cancelarDocumento` | sim | sim | não | não |
| `reativarDocumento` | sim | sim | não | não |

```ts
/** Documento 02, 7.3: o Solicitante "só reenvia após devolução e aprova quando 'Para aprovação da
 *  área solicitante'". Aprovação final ('Aprovado') nunca é dele: o "aprovar" da área é encaminhar
 *  à aprovação da Qualidade. */
export const TRANSICOES_SOLICITANTE: ReadonlyArray<readonly [de: StatusDocumento, para: StatusDocumento]> = [
  ['Devolvido para área para revisão', 'Em revisão da qualidade'],
  ['Devolvido para correção', 'Em revisão da qualidade'],
  ['Em revisão do solicitante', 'Em revisão da qualidade'],
  ['Para aprovação da área solicitante', 'Para aprovação qualidade'],
];
```

Semântica de `pode(eu, 'mudarStatus', ctx)`:
- Administrador e Qualidade: `true` (com ou sem `transicao`; a **máquina** da 2.2 é conferida à parte, por `transicaoPermitida`).
- Solicitante: exige `areaId` igual à sua área; sem `transicao` → `true` (pergunta genérica); com `transicao` → só se o par estiver em `TRANSICOES_SOLICITANTE`.
- Leitor, pessoa sem acesso liberado: `false`.

`pode` **não** embute a máquina (2.2), para as duas regras continuarem testáveis separadamente: "o fluxo aceita?" e "este perfil pode?". A API confere as duas (seção 3.2); a interface usa `acoesDeStatus` (2.6), que já combina as duas.

### 2.4 Responsável pela etapa

- **É uma pessoa cadastrada** (`usuarios`), não texto livre (o antigo sugeria "Área Solicitante (Custos)"; texto livre não permite "responsável atual" confiável no cartão nem, no futuro, notificação). Ver ponto 2 da seção 10.
- **Elegível:** pessoa `Ativo`, com acesso liberado (perfil e área) e perfil **Administrador, Qualidade ou Solicitante** (Leitor não atua). Conferido no servidor a cada transição (400 se não elegível).
- **Obrigatório** quando o destino está nas fases `revisao`, `devolvido` ou `aprovacao` (o documento 03 pedia só devolução e aprovação; incluir revisão é o que faz o cartão ter sempre um responsável enquanto o documento tramita). Para **Aprovado** não há responsável: o servidor grava `responsavel_id = NULL` (fluxo concluído). Cancelamento e reativação **não mexem** no responsável (a reativação encontra quem estava).
- Gravado em `documentos.responsavel_id` (estado atual) e no evento (`responsavel_id` + `responsavel` = nome no momento, como `autor_nome`).
- Sugestão (função pura, só para a interface pré-selecionar; o servidor não usa):

```ts
export interface PessoaResumo { id: string; nome: string; perfil: Perfil; areaId: string | null; area: string | null }

/** Quem exige responsável: destino em fase revisao, devolvido ou aprovacao. */
export function exigeResponsavel(para: StatusDocumento): boolean;

/** Ordena as pessoas elegíveis colocando as sugeridas primeiro:
 *  - destino em fase 'devolvido' ou 'Para aprovação da área solicitante' → pessoas da área do documento;
 *  - destino em fase 'revisao' ou 'Para aprovação qualidade' → pessoas com perfil Qualidade ou Administrador;
 *  Se `eu` está entre as sugeridas, vem em primeiro (a ação rápida usa essa primeira pessoa). */
export function sugerirResponsaveis(para: StatusDocumento, documento: Pick<Documento, 'areaId'>, pessoas: readonly PessoaResumo[], eu: Pick<Pessoa, 'id'>): PessoaResumo[];
```

### 2.5 Eventos gravados

| Ação | `tipoAcao` | `status` | `statusAnterior` | `responsavel` / `responsavel_id` | `observacao` | `detalhes` |
|---|---|---|---|---|---|---|
| Transição | `STATUS` | destino | origem (obrigatório) | pessoa escolhida (ou null em Aprovado) | observação aparada ou null | `[]` |
| Cancelamento | `CANCELAMENTO` | `Cancelado` | origem (obrigatório; a reativação lê daqui, decisão 0004) | mantém o do documento (só informativo) | **motivo** aparado | `[]` |
| Reativação | `STATUS` | status anterior ao cancelamento | `Cancelado` | responsável do documento (informativo) | observação aparada ou null (o Desfazer manda "Cancelamento desfeito.") | `[]` |

`destino` fica `null` (coluna reservada). `descreverEvento` (F4) já mostra "De X para Y", "Cancelado (estava em X)" e o responsável; ganha `rotuloObservacao = 'Motivo'` para CANCELAMENTO.

```ts
/** Status para o qual um documento cancelado volta (decisão 0004): `statusAnterior` do ÚLTIMO evento
 *  CANCELAMENTO. Sem esse evento ou sem statusAnterior (dados importados incompletos) → 'Recebido'
 *  (o que o documento 02 previa), registrado na observação do evento de reativação. */
export function statusDeReativacao(eventos: readonly EventoHistorico[]): StatusDocumento;
```

### 2.6 Ações disponíveis (função pura para a interface)

```ts
export interface AcaoStatus {
  para: StatusDocumento;
  /** Texto do botão (ROTULO_TRANSICAO ou "Mover para <status>"). */
  rotulo: string;
  /** A única ação que vai para o cartão (ACAO_PRINCIPAL); as demais só no modal. */
  principal: boolean;
  exigeResponsavel: boolean;
  /** Aprovado é final: sempre pede confirmação. */
  exigeConfirmacao: boolean;
}

/** Transições que ESTA pessoa pode aplicar a ESTE documento agora (máquina ∩ perfil), na ordem de
 *  destinosPermitidos. Vazio para Aprovado, Cancelado, Leitor e Solicitante de outra área. */
export function acoesDeStatus(eu: Pessoa | null, documento: Pick<Documento, 'status' | 'areaId'>): AcaoStatus[];
```

Rótulos (`ROTULO_TRANSICAO`, chave `de → para`; sem chave, "Mover para <para>"):

| de (fase) | para | Rótulo (Qualidade/Administrador) | Rótulo (Solicitante) |
|---|---|---|---|
| recebido | Em revisão da qualidade | Iniciar revisão | — |
| devolvido | Em revisão da qualidade | Retomar revisão | Reenviar à Qualidade |
| qualquer | Em revisão junto à área | Revisar junto à área | — |
| qualquer | Devolvido para área para revisão | Devolver à área | — |
| qualquer | Devolvido para correção | Devolver para correção | — |
| qualquer | Em revisão do solicitante | Enviar ao solicitante | — |
| qualquer | Para aprovação da área solicitante | Enviar à aprovação da área | — |
| qualquer | Para aprovação qualidade | Enviar à aprovação da Qualidade | Aprovar pela área |
| qualquer | Aprovado | Aprovar | — |

Ação **principal** por status de origem (`ACAO_PRINCIPAL`): Recebido → Em revisão da qualidade; fase revisao → Para aprovação da área solicitante; fase devolvido → Em revisão da qualidade; Para aprovação da área solicitante → Para aprovação qualidade; Para aprovação qualidade → Aprovado. Se a principal não estiver nas ações da pessoa, o cartão não mostra ação de status (nunca substitui por outra em silêncio).

## 3. Rotas

Todas em JSON, esquema fechado (campo desconhecido → `400 dados_invalidos`, `campos.<nome>: 'Campo não permitido.'`), autor sempre do token. Nenhuma aceita `autorId`, `status` de origem, `dataHora` nem `id` de evento no corpo.

### 3.1 Tipos

```ts
/** Corpo de POST /documentos/:id/transicoes. */
export interface NovaTransicao {
  para: StatusDocumento;
  /** 'USR-uuid'. Obrigatório quando exigeResponsavel(para); deve ser null quando para = 'Aprovado'. */
  responsavelId: string | null;
  /** Até 500 caracteres depois de trim; null ou '' = sem observação. */
  observacao: string | null;
  versao: number;
}

/** Corpo de POST /documentos/:id/cancelamentos. */
export interface NovoCancelamento {
  /** Obrigatório, 10 a 500 caracteres (LIMITES_JUSTIFICATIVA). */
  motivo: string;
  versao: number;
}

/** Corpo de POST /documentos/:id/reativacoes. */
export interface NovaReativacao {
  observacao: string | null;
  versao: number;
}

/** Resposta 200/201 das três rotas (mesmo formato de ResultadoReprogramacao). */
export interface ResultadoTransicao {
  documento: Documento;
  evento: EventoHistorico;
}

export const LIMITES_OBSERVACAO = { maximo: 500 } as const;
/** Motivo do cancelamento: mesmas regras da justificativa de reprogramação. */
export function validarMotivoCancelamento(texto: unknown): string | null;
export function validarObservacao(texto: unknown): string | null;
```

`Documento` ganha `responsavelId: string | null` e `responsavel: string | null` (nome **atual** da pessoa, por JOIN; o nome histórico fica no evento). `CartaoPainel` ganha os mesmos dois campos, mais `dataInicioRevisao` e `statusAntesDoCancelamento` (seção 5.1).

### 3.2 `POST /documentos/:id/transicoes` — ordem de decisão

1. `!pode(eu, 'verDocumentos')` → `403 sem_permissao`.
2. Documento inexistente **ou** `!pode(eu, 'verDocumentos', { areaId })` → `404 nao_encontrado`.
3. `!pode(eu, 'mudarStatus', { areaId: documento.areaId })` (pergunta genérica, sem transição) → `403 sem_permissao`.
4. Status atual `Aprovado` ou `Cancelado` (leitura sem bloqueio) → `409 acao_nao_permitida` ("Documento aprovado é final." / "Documento cancelado: use Reativar.").
5. **Corpo** (antes da idempotência, B2 do QA da F3): esquema fechado; `para` é um `StatusDocumento` **diferente de 'Em Revisão' e de 'Cancelado'**; `responsavelId` null ou `USR-…`; `observacao` null ou ≤ 500 após trim; `versao` inteiro ≥ 1; `para === 'Aprovado'` com `responsavelId` não nulo → `campos.responsavelId: 'Documento aprovado não tem responsável.'`; `exigeResponsavel(para)` e `responsavelId` nulo → `campos.responsavelId: 'Informe o responsável por esta etapa.'`. Qualquer falha → `400 dados_invalidos`.
6. Em **uma transação**, com `SELECT … FOR UPDATE` do documento:
   1. **Idempotência:** `documento.versao === corpo.versao + 1` **e** o último evento é `STATUS` do mesmo `autorId`, com `status === para`, `responsavel_id === responsavelId` e `observacao` igual (aparada) → `200` com o estado atual, sem gravar.
   2. **Concorrência:** `documento.versao !== corpo.versao` → `409 conflito_versao`, corpo `{ codigo, mensagem, documento }` (a interface mostra o status atual e refaz as ações).
   3. **Máquina:** `!transicaoPermitida(documento.status, para)` → `409 acao_nao_permitida` ("Não é possível ir de <de> para <para>."). Cobre `para === status` ("O documento já está neste status.").
   4. **Perfil:** `!pode(eu, 'mudarStatus', { areaId, transicao: { de: documento.status, para } })` → `403 sem_permissao` ("Seu perfil não pode aplicar esta etapa.").
   5. **Responsável:** se não nulo, buscar em `usuarios`: inexistente, inativo, sem perfil/área ou perfil Leitor → `400 dados_invalidos` (`campos.responsavelId: 'Pessoa não encontrada ou não pode ser responsável.'`).
   6. Grava: `status = para`, `responsavel_id = responsavelId` (null em Aprovado), `versao + 1`, `data_modificacao = now()`. `UPDATE … WHERE versao = $versao`; 0 linhas → `409 conflito_versao` (corrida no PostgreSQL real).
   7. Evento `STATUS` (2.5), autor do token.
   8. `201` com `ResultadoTransicao`.

O Solicitante da própria área que tenta uma transição fora da sua lista recebe `403`; o de outra área nunca chega a saber que o documento existe (`404` no passo 2).

### 3.3 `POST /documentos/:id/cancelamentos`

1–2. Como em 3.2.
3. `!pode(eu, 'cancelarDocumento', { areaId })` → `403`.
4. Status `Aprovado` → `409 acao_nao_permitida` ("Documento aprovado é final e não pode ser cancelado."); `Cancelado` → `409` ("Documento já cancelado.").
5. Corpo: esquema fechado; `motivo` 10–500 após trim (`validarMotivoCancelamento`); `versao` ≥ 1 → senão `400`.
6. Transação, `FOR UPDATE`:
   1. Idempotência: `versao === corpo.versao + 1` e último evento `CANCELAMENTO` do mesmo autor com a mesma `observacao` → `200`.
   2. `versao !== corpo.versao` → `409 conflito_versao`.
   3. Status `Aprovado`/`Cancelado` conferido de novo → `409`.
   4. Grava `status = 'Cancelado'`, `versao + 1`, `data_modificacao`; `responsavel_id` **intacto**.
   5. Evento `CANCELAMENTO` com `statusAnterior` = status de origem (nunca null aqui) e `observacao` = motivo.
   6. `201`.

### 3.4 `POST /documentos/:id/reativacoes`

1–2. Como em 3.2.
3. `!pode(eu, 'reativarDocumento', { areaId })` → `403`.
4. Status ≠ `Cancelado` → `409 acao_nao_permitida` ("Só documentos cancelados podem ser reativados.").
5. Corpo: esquema fechado; `observacao` null ou ≤ 500; `versao` ≥ 1.
6. Transação, `FOR UPDATE`:
   1. Idempotência: `versao === corpo.versao + 1` e último evento `STATUS` com `statusAnterior === 'Cancelado'` do mesmo autor → `200`.
   2. `versao !== corpo.versao` → `409 conflito_versao`.
   3. Status ≠ `Cancelado` conferido de novo → `409`.
   4. `destino = statusDeReativacao(eventos do documento)` (2.5). Quando cair no reserva 'Recebido', a observação do evento recebe o sufixo " (status anterior desconhecido; voltou para Recebido)".
   5. Grava `status = destino`, `versao + 1`, `data_modificacao`; `responsavel_id` intacto.
   6. Evento `STATUS` com `statusAnterior = 'Cancelado'`, `status = destino`.
   7. `201`.

A **mesma rota** serve ao "Desfazer" do toast, ao botão "Reativar" da janela de cancelados e ao do modal (P-17: um só caminho, um só resultado). O Desfazer manda `observacao: 'Cancelamento desfeito.'` e a `versao` devolvida pelo cancelamento. Cancelamento e reativação ficam ambos na linha do tempo (histórico acumulativo; nada é apagado).

### 3.5 `GET /responsaveis`

- Quem pode: `pode(eu, 'mudarStatus')` sem contexto (Administrador, Qualidade, Solicitante). Leitor → `403`.
- Resposta `200`: `PessoaResumo[]` com as pessoas **elegíveis** (2.4), em ordem alfabética pt-BR de `nome` (`ordenarAlfabetico`). **Sem e-mail** (LGPD: o mínimo para escolher e exibir). Query vazia (esquema fechado).
- A interface carrega uma vez ao abrir o diálogo (lista pequena) e aplica `sugerirResponsaveis`.

### 3.6 Idempotência e F9

O padrão é o da F3 (versão + último evento igual). Ele cobre o duplo clique e o reenvio imediato, mas **não** cobre um reenvio depois de outra ação intermediária. A fila offline (F9) vai precisar de uma chave de idempotência gerada pelo cliente por evento (`HIST-uuid` criado na origem, como o `DOC-uuid` do cadastro): a coluna e a regra entram na F9, com migração própria; a F5 deixa a nota aqui e no relatório.

### 3.7 Códigos de erro

Nenhum código novo: `sem_permissao` (403), `nao_encontrado` (404), `dados_invalidos` (400), `conflito_versao` (409, com `documento`), `acao_nao_permitida` (409). As mensagens novas vão em `mensagem` e a interface prefere a `mensagem` do servidor quando existir (hoje já faz isso para `acao_nao_permitida`).

## 4. "Responsável atual" no cartão (proposta)

- `CartaoPainel.responsavel` (nome atual) e `responsavelId`. No cartão, uma linha abaixo das etiquetas e acima de "Recebido em": ícone `UserRound` (`aria-hidden`) + texto **"Responsável: <nome>"** (13px, `--text-secondary`; o nome em `--text-primary`). **Só aparece quando não é nulo**: documento em Recebido (sem ninguém ainda), Aprovado ou importado sem responsável não mostra a linha (nada de "—" nem "Sem responsável" fixo).
- No modal (bloco Dados): par "Responsável atual" com o nome ou "—", como os demais pares.
- A busca do Painel **passa a procurar também no responsável** (`filtrarCartoes` ganha o campo; o rótulo do campo de busca vira "Buscar por título, código, remetente ou responsável"). Mudança pequena e testada; se o Eric preferir, fica de fora.
- O cartão continua enxuto (pedido do Eric na F3): entram só esta linha e a ação principal (seção 6.1).

## 5. KPI "Aprovados no mês" (P-12) e metas de 14/40 dias (decisão 0012)

### 5.1 Datas do ciclo (servidor, a partir dos eventos; nunca de contador editável)

`CartaoPainel` ganha:

```ts
/** Dia ('AAAA-MM-DD', fuso de São Paulo) do PRIMEIRO evento STATUS cujo status está na fase 'revisao';
 *  null se ainda não entrou em revisão. Base da meta de 14 dias. */
dataInicioRevisao: string | null;
/** statusAnterior do último evento CANCELAMENTO; só não nulo quando status = 'Cancelado'. Para a
 *  confirmação "Reativar: volta para <status>" na janela de cancelados. */
statusAntesDoCancelamento: StatusDocumento | null;
```

`dataAprovacao` já existe (dia do último `STATUS` com `status = 'Aprovado'`). As três vêm de subconsultas em `listarCartoes` (mesmo padrão de `qtd_devolucoes`), com `AT TIME ZONE 'America/Sao_Paulo'`. Para o modal, as mesmas datas saem dos eventos por funções puras com a **mesma regra** do SQL (testadas em paralelo, como `contarDevolucoes`):

```ts
export function dataInicioRevisao(eventos: readonly EventoHistorico[]): string | null; // dia SP do 1.º STATUS em fase revisao
export function dataAprovacao(eventos: readonly EventoHistorico[]): string | null;     // dia SP do último STATUS Aprovado
```

(Converter `dataHora` ISO UTC para dia de São Paulo é puro: `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`; função `diaEmSaoPaulo(iso)` em `documentos.ts`, usada também pela API em vez de repetir a conversão.)

### 5.2 Funções puras (`packages/compartilhado/src/metas.ts`)

```ts
export const META_DIAS_INICIO_REVISAO = 14;
export const META_DIAS_CONCLUSAO = 40;

export type EstadoMeta = 'cumprida' | 'estourada' | 'no_prazo' | 'nao_se_aplica';

export interface SituacaoMeta {
  estado: EstadoMeta;
  /** Dias corridos usados: até o marco (cumprida/estourada) ou até hoje (no_prazo/estourada sem marco). */
  dias: number | null;
  limite: number;
  /** Texto pronto: "Iniciada em 9 dias (meta: 14)", "Ainda não iniciada: 16 dias (meta: 14)", "Não se aplica". */
  texto: string;
  tom: 'sucesso' | 'erro' | 'neutro';
}

export interface Metas { inicioRevisao: SituacaoMeta; conclusao: SituacaoMeta }

/** Contadas da dataRecebimento, em dias corridos (decisão 0012). Cancelado → nao_se_aplica nas duas. */
export function avaliarMetas(
  doc: Pick<CartaoPainel, 'status' | 'dataRecebimento' | 'dataInicioRevisao' | 'dataAprovacao'>,
  hoje: string,
): Metas;
```

Regras: **início da revisão** — com `dataInicioRevisao`: `dias = inicio - recebimento`; ≤ 14 `cumprida`, > 14 `estourada`. Sem: `dias = hoje - recebimento`; ≤ 14 `no_prazo`, > 14 `estourada`; Aprovado sem nunca ter entrado em revisão (importado) → `nao_se_aplica`. **Conclusão** — com `dataAprovacao`: `dias = aprovacao - recebimento`; ≤ 40 `cumprida`, senão `estourada`. Sem: `dias = hoje - recebimento`; ≤ 40 `no_prazo`, senão `estourada`. `Cancelado` → `nao_se_aplica` nas duas. Prazo de 30 dias (reprogramável) e meta de 40 (fixa) são medidas diferentes e ficam lado a lado; a relação entre elas fica para depois de o Eric ver as duas na tela (decisão 0012, "ponto a observar").

### 5.3 KPIs

`Kpis` ganha dois campos; `calcularKpis(cartoes, hoje)` mantém a assinatura:

```ts
/** Cartões com dataAprovacao no mesmo mês e ano de `hoje` (P-12). */
aprovadosNoMes: number;
/** Dos aprovados no mês, quantos cumpriram a meta de 40 dias. */
aprovadosNoMesNaMeta: number;
```

Aprovados no mês contam sobre os cartões **já filtrados** por busca e área (mesma base dos outros três KPIs). Documento reativado que voltou a tramitar e foi aprovado de novo conta pela **última** aprovação (`dataAprovacao` = máximo).

### 5.4 Onde exibir (proposta)

1. **Painel, quarto cartão de KPI:** rótulo "Aprovados no mês", valor `aprovadosNoMes`, subtítulo "concluídos em <mês de aaaa>" (mês de `hoje`, por `Intl`), e a linha "N dentro da meta de 40 dias" (`aprovadosNoMesNaMeta`). A grade de KPIs já prevê 4 colunas acima de 980px (documento 04, 5.4). Rótulo e regra coerentes (P-13).
2. **Modal de detalhes, seção "Metas do ciclo"** (abaixo de Dados): duas linhas com etiqueta de tom (`sucesso`/`erro`/`neutro`, mesmas cores da `EtiquetaPrazo`) e o `texto` de `SituacaoMeta`. Só texto e cor; a cor nunca sozinha.
3. **Cartão: nada novo** (fica enxuto). Se o Eric quiser, uma etiqueta "Meta de revisão estourada" pode entrar depois com uma linha em `avaliarMetas` já pronta.

## 6. Interface (`apps/web`)

### 6.1 Cartão do Painel

- Rodapé de ações: **Reprogramar** (como hoje) + **uma ação principal** de status (`acoesDeStatus(...).find(a => a.principal)`), ex.: "Iniciar revisão", "Enviar à aprovação da área", "Aprovar", "Reenviar à Qualidade". Nunca mais de dois botões no cartão.
- Comportamento da ação principal: se `exigeConfirmacao` (Aprovar) → diálogo de confirmação ("Aprovar <título>? A aprovação é final e encerra a tramitação." / "Aprovar" / "Voltar"). Senão, se `exigeResponsavel` e `sugerirResponsaveis(...)[0]` existe → abre o diálogo **Atualizar etapa** já preenchido (destino e responsável sugerido) para um clique em "Registrar etapa"; nunca envia sem a pessoa ver quem ficou responsável. Sucesso: toast "Etapa registrada: <status>" e cartão substituído pelo `documento` devolvido (mesmo `substituirCartao` da F3; o cartão troca de coluna).
- Linha "Responsável: <nome>" (seção 4). "↺ N×" continua o mesmo componente, agora com valor.
- Sem "Cancelar" no cartão (fica no modal): reduz cliques errados num botão destrutivo e mantém o cartão enxuto.

### 6.2 Modal de detalhes: rodapé de ações

Ordem, da esquerda para a direita (só os que `acoesDeStatus`/`pode` permitirem; nenhum botão desativado "de enfeite"):

1. Ações de status, na ordem de `acoesDeStatus` (a principal com estilo primário; as demais secundárias). Com mais de **três** ações, mostra as três primeiras e um botão "Atualizar etapa…" que abre o diálogo com a lista completa; com três ou menos, todas visíveis e "Atualizar etapa…" ainda presente (é o caminho para registrar observação).
2. **Cancelar** (estilo perigo, ícone `Ban`): `pode(eu, 'cancelarDocumento', …)` e status ≠ Aprovado/Cancelado.
3. **Reativar** (ícone `RotateCcw`): `pode(eu, 'reativarDocumento', …)` e status = Cancelado. Confirmação: "Reativar <título>? Ele volta para **<statusDeReativacao(eventos)>**."
4. **Reprogramar** (já existe) e **Fechar**.

Leitor e Solicitante de outra área: rodapé só com Fechar (como hoje). Aprovado: só Reprogramar não aparece (sem prazo) e nenhuma ação de status; Fechar.

### 6.3 Diálogo "Atualizar etapa" (componente `DialogoAtualizarEtapa`, sobre `Dialogo`, empilhável sobre o modal)

- Campos: **Etapa** (`<select>`, opções = `acoesDeStatus(eu, documento)` com `rotulo` e, entre parênteses, o nome do status; pré-selecionada quando vem de uma ação rápida); **Responsável** (`<select>` com `<optgroup>` "Sugeridos" e "Outras pessoas" a partir de `sugerirResponsaveis`; aparece só quando `exigeResponsavel(para)`; obrigatório; carrega `GET /responsaveis` ao abrir, com estado carregando/erro e "Tentar de novo"); **Observação** (multilinha, contador "N/500", opcional). Texto fixo de apoio: "De: <status atual>".
- Validação por script (`noValidate`), resumo de erros focável, erros inline (`aria-describedby`), como a F2/F3. Botão "Registrar etapa" (primário) e "Voltar"; desabilitado só enquanto envia.
- Envia `POST /documentos/:id/transicoes` com `{ para, responsavelId, observacao, versao }`. Sucesso: fecha, aviso dentro do modal ("Etapa registrada: <status>", `role="status"`, regra 11.1 da F4) ou toast se veio do cartão; modal e cartão atualizados pelo `documento` e a linha do tempo ganha o `evento` (recarga silenciosa, como na reprogramação).
- `409 conflito_versao`: mostra "Alguém alterou este documento: agora está em <status atual>." com o documento do erro; recalcula as ações e mantém o diálogo aberto para a pessoa decidir. `409 acao_nao_permitida` e `403`: mensagem do servidor no resumo de erros. `400` por campo: inline.

### 6.4 Cancelar com Desfazer

- Botão Cancelar (modal) → diálogo "Cancelar documento" com **Motivo** (multilinha, 10–500, contador, mesma `validarMotivoCancelamento`) e botões "Sim, cancelar" (perigo) / "Voltar". Foco inicial no campo de motivo.
- Sucesso: fecha o diálogo **e o modal** (o documento sai do quadro); o cartão sai da coluna e `qtdCancelados` sobe 1 (sem recarregar tudo); toast **"Documento cancelado."** com ação **"Desfazer"** (`toast(texto, { rotulo: 'Desfazer', aoAcionar })`, 8 s, pausa no foco/hover — o documento 03 falava em 4 s; 8 s é o tempo do toast com ação do design system).
- **Desfazer** → `POST /documentos/:id/reativacoes` com `{ observacao: 'Cancelamento desfeito.', versao: <versao devolvida pelo cancelamento> }`. Sucesso: toast "Cancelamento desfeito: o documento voltou para <status>." e o cartão volta à coluna (usa o `documento` da resposta; `qtdCancelados` desce 1). `409 conflito_versao` (alguém mexeu nesse meio-tempo): toast "Não foi possível desfazer: o documento foi alterado. Veja em Cancelados." O Desfazer localiza o documento **pelo ID** (documento 02, 3.2), nunca por posição.
- Cancelar não fica no cartão nem na janela de cancelados.

### 6.5 Reativar

- **Janela de cancelados:** cada cartão ganha o botão "Reativar" (só se `pode(eu, 'reativarDocumento', …)`), com confirmação "Reativar <título>? Ele volta para <statusAntesDoCancelamento ?? 'Recebido'>." Sucesso: cartão sai da janela, volta ao quadro na coluna certa, toast "Documento reativado: <status>." e título da janela atualizado.
- **Modal** de um documento cancelado: botão Reativar no rodapé (6.2), mesma confirmação, mesma rota. Depois, o modal mostra o estado novo (recarga silenciosa) e o Painel recebe o cartão.
- Um só caminho (P-17): os dois botões chamam a mesma função do cliente e a mesma rota.

### 6.6 KPI e metas

- Quarto KPI "Aprovados no mês" (5.4). "—" enquanto carrega.
- Seção "Metas do ciclo" no modal (5.4), a partir de `avaliarMetas({ ...documento, dataInicioRevisao: dataInicioRevisao(eventos), dataAprovacao: dataAprovacao(eventos) }, detalhe.hoje)`.

### 6.7 Teclado, tamanho e toque

- Tab no cartão: título → Reprogramar → ação principal. No modal: ✕ → Baixar… → Detalhes da linha do tempo → ações do rodapé (ordem da 6.2) → Fechar. Diálogos empilhados: foco preso no de cima, Esc fecha só ele, foco volta ao botão que abriu (já é o `Dialogo`).
- 768px: rodapé do modal quebra em duas linhas sem rolagem horizontal; botões com 44px em `pointer: coarse`. O quarto KPI segue a grade só em CSS (4 → 2 → 1 colunas).
- Todo texto de status vem de `STATUS_DOCUMENTO`/rótulos do compartilhado; nada de texto de status escrito à mão na interface. Cores só de tokens; cor nunca sozinha (o botão diz o que faz).
- Nada decorativo: sem "Editar", "Anexar", "Histórico completo", sem seta de "próxima etapa" desenhada na linha do tempo, sem botão de status desabilitado para "mostrar que existe".

### 6.8 Vitrine

A vitrine (`apps/web/e2e/vitrine/`) ganha: um documento em cada status com o rodapé de ações correspondente, perfis `?perfil=Qualidade|Solicitante|Leitor`, um cancelado com `statusAntesDoCancelamento`, o quarto KPI com valores, o modal com "Metas do ciclo" nos três tons e o toast com Desfazer (`?toast=cancelado`).

## 7. Migração `0005_responsavel.sql`

Nunca editar as anteriores. Uma transação, plano de volta no topo:

```sql
-- documentos: responsável atual pela etapa (pessoa cadastrada; null em Recebido, Aprovado e importados).
ALTER TABLE documentos ADD COLUMN responsavel_id text REFERENCES usuarios (id);

-- eventos_historico: ID do responsável ao lado do nome já gravado (o nome fica como estava no momento).
-- ADD COLUMN é DDL: o gatilho de imutabilidade bloqueia UPDATE/DELETE/TRUNCATE de linhas, não a coluna nova.
ALTER TABLE eventos_historico ADD COLUMN responsavel_id text REFERENCES usuarios (id);

-- Subconsultas do Painel (início da revisão, aprovação, devoluções, último cancelamento).
CREATE INDEX eventos_historico_documento_tipo_status ON eventos_historico (id_documento, tipo_acao, status);
```

Plano de volta (só com aprovação do Eric):

```sql
DROP INDEX eventos_historico_documento_tipo_status;
ALTER TABLE eventos_historico DROP COLUMN responsavel_id;
ALTER TABLE documentos DROP COLUMN responsavel_id;
DELETE FROM migracoes WHERE versao = '0005';
```

Sem dados a preencher: documentos existentes ficam com `responsavel_id NULL` (o cartão não mostra a linha). Nenhuma restrição `CHECK` muda (`STATUS` e `CANCELAMENTO` já constam desde a 0002). A coluna `responsavel` (texto) dos eventos continua sendo gravada com o nome, para o histórico se ler sem JOIN.

## 8. Testes obrigatórios

| Camada | Teste |
|---|---|
| compartilhado | `destinosPermitidos`/`transicaoPermitida`: a tabela inteira da 2.2 (matriz 11×11, gerada a partir de `DESTINOS_POR_FASE`), 'Em Revisão' nunca destino, mesmo status nunca, Aprovado e Cancelado sem destinos, 'Em Revisão' como origem = fase revisao. |
| compartilhado | `pode`: linhas `mudarStatus` (4 perfis; Solicitante com e sem `areaId`, com cada par de `TRANSICOES_SOLICITANTE` e com um par fora dela; Solicitante nunca → Aprovado), `cancelarDocumento`, `reativarDocumento`. |
| compartilhado | `acoesDeStatus`: Qualidade em Recebido (5 ações, principal "Iniciar revisão"); Solicitante da área em Devolvido (1 ação "Reenviar à Qualidade", principal); Solicitante em Recebido (vazio); Leitor (vazio); Aprovado (vazio); `exigeConfirmacao` só em Aprovado; `exigeResponsavel` por destino. |
| compartilhado | `exigeResponsavel` (fases), `sugerirResponsaveis` (área do documento primeiro; Qualidade/Administrador para revisão e aprovação da Qualidade; `eu` em primeiro quando sugerido; ordem pt-BR dentro dos grupos), `statusDeReativacao` (último CANCELAMENTO; sem evento → 'Recebido'; dois cancelamentos → o último). |
| compartilhado | `validarMotivoCancelamento` (mesmos limites da justificativa) e `validarObservacao` (500). |
| compartilhado | `dataInicioRevisao`/`dataAprovacao` puras: mesmo resultado da regra SQL para as sequências: nunca em revisão; Recebido→Em rev. qualidade→Devolvido→Em rev. junto à área (primeiro = a 1.ª entrada); Aprovado, reativado, aprovado de novo (última aprovação); evento às 23:30 de SP em UTC do dia seguinte (dia certo). `diaEmSaoPaulo`. |
| compartilhado | `avaliarMetas`: cumprida (14, 40 no limite), estourada (15, 41), no_prazo sem marco, estourada sem marco, Cancelado nao_se_aplica, Aprovado sem revisão. `calcularKpis`: `aprovadosNoMes` conta só o mês de `hoje` (31/08 fora, 01/09 dentro, ano diferente fora); `aprovadosNoMesNaMeta`; cancelado nunca. |
| compartilhado | `descreverEvento`: STATUS com responsável, CANCELAMENTO com `rotuloObservacao = 'Motivo'`, reativação ("De Cancelado para X"). `contarDevolucoes` inalterada. `filtrarCartoes` com responsável (se aprovado na seção 4). |
| API | Migração 0005 aplica sobre a 0004; colunas novas nulas; `eventos_historico` continua imutável (UPDATE/DELETE/TRUNCATE recusados) depois do `ADD COLUMN`. |
| API | `POST /documentos/:id/transicoes`: 201 com `documento.status`, `responsavelId`, `responsavel`, `versao + 1` e evento STATUS com `statusAnterior`, `responsavel` (nome) e autor do token; `autorId`/`status` no corpo → 400 campo desconhecido; `para: 'Em Revisão'`, `'Cancelado'`, valor fora da lista → 400; responsável ausente quando exigido → 400; responsável em Aprovado → 400; responsável inexistente/inativo/Leitor/sem área → 400; mesmo status → 409; transição fora da máquina (Recebido → Aprovado) → 409; Solicitante da área com par permitido → 201, com par fora (→ Aprovado) → 403, de outra área → 404; Leitor → 403; Aprovado → 409; Cancelado → 409; reenvio idêntico → 200 sem novo evento; `versao` velha → 409 com documento atual; dois envios em sequência com a mesma `versao` → 2.º recebe 409. |
| API | `POST /documentos/:id/cancelamentos`: 201, `status = 'Cancelado'`, `responsavelId` mantido, evento CANCELAMENTO com `statusAnterior` e motivo; motivo curto/longo/ausente → 400; Aprovado → 409; já cancelado → 409; Solicitante → 403; reenvio → 200; versão velha → 409. |
| API | `POST /documentos/:id/reativacoes`: volta ao `statusAnterior` do último CANCELAMENTO (inclusive 'Em Revisão' migrado e um 2.º cancelamento com outro status); evento STATUS `De Cancelado para X`; documento com CANCELAMENTO inserido sem `statusAnterior` (direto no banco de teste) → 'Recebido' com sufixo na observação; não cancelado → 409; Solicitante → 403; Desfazer (mesma rota, `versao` do cancelamento) → 201; reenvio → 200; versão velha → 409. |
| API | `GET /responsaveis`: só elegíveis (inativo, sem perfil, sem área e Leitor ficam fora), ordem pt-BR, sem `email`; Leitor → 403; query → 400. |
| API | `GET /painel`: `responsavel`, `dataInicioRevisao`, `statusAntesDoCancelamento` calculados; `qtdDevolucoes` e `dataAprovacao` agora a partir de eventos gravados pelas rotas (não mais inseridos à mão); `GET /documentos/:id` com `responsavelId`/`responsavel`. Regressão: cadastro, reprogramação e download inalterados. |
| API | Fluxo completo com `app.inject`: Recebido → Em rev. qualidade → Devolvido → (Solicitante) Em rev. qualidade → P/ aprov. da área → (Solicitante) P/ aprov. qualidade → Aprovado; ao fim, `qtdDevolucoes = 1`, `dataAprovacao = hoje`, `dataInicioRevisao = hoje`, Aprovado não cancela nem transita. |
| tela (Vitest) | Cartão: ação principal certa por status e perfil; some para Leitor/Aprovado; Aprovar pede confirmação; ação com responsável abre o diálogo preenchido; linha "Responsável" só quando há. Modal: rodapé conforme 6.2 por perfil e status; Atualizar etapa valida, envia `{ para, responsavelId, observacao, versao }`, trata 409 mostrando o status atual e refazendo as ações; Cancelar exige motivo, fecha o modal, remove o cartão, toast com Desfazer que chama `reativar` com a `versao` devolvida e recoloca o cartão; Reativar na janela de cancelados confirma com o status de volta e move o cartão; quarto KPI; "Metas do ciclo" nos três tons; nenhum botão desabilitado de enfeite. |
| e2e + axe | Vitrine: Painel com 4 KPIs e cartões com ação principal em 768, 1024 e 1440 px, temas claro e escuro, sem rolagem horizontal da página; modal com rodapé de ações e diálogo Atualizar etapa empilhado (Tab e Shift+Tab presos, Esc fecha só o de cima, foco volta ao botão); toast com Desfazer acionável pelo teclado; toque 44px; axe sem violações. |

## 9. Divisão do trabalho

**Parte servidor (agente de arquitetura e dados, Fable)** — entrega primeiro os tipos:

1. `packages/compartilhado`: arquivo novo `transicoes.ts` (`DESTINOS_POR_FASE`, `destinosPermitidos`, `transicaoPermitida`, `TRANSICOES_SOLICITANTE`, `ROTULO_TRANSICAO`, `ACAO_PRINCIPAL`, `AcaoStatus`, `acoesDeStatus`, `exigeResponsavel`, `sugerirResponsaveis`, `statusDeReativacao`, `NovaTransicao`, `NovoCancelamento`, `NovaReativacao`, `ResultadoTransicao`, `PessoaResumo`, `LIMITES_OBSERVACAO`, `validarMotivoCancelamento`, `validarObservacao`); arquivo novo `metas.ts` (5.2); `pessoas.ts` (`Acao`, `ContextoPermissao.transicao`, regras); `documentos.ts` (`Documento.responsavelId/responsavel`, `diaEmSaoPaulo`); `painel.ts` (`CartaoPainel` estendido, `Kpis` estendido, `calcularKpis`, `filtrarCartoes`); `historico.ts` (`dataInicioRevisao`, `dataAprovacao`, `rotuloObservacao` de CANCELAMENTO); `index.ts`; testes.
2. `apps/api`: migração 0005; `banco/documentos.ts` (`aplicarTransicao`, `aplicarCancelamento`, `aplicarReativacao` com `WHERE versao = $n`, `registrarEvento` com `responsavelId`, `listarCartoes`/`buscarDocumento` com os campos novos, `ultimoCancelamento`); `banco/pessoas.ts` (`listarResponsaveis`, `buscarResponsavelElegivel`); `validacao.ts` (três corpos fechados); rotas 3.2–3.5; testes da tabela.
3. Relatório `docs/relatorios/2026-09-29-f5-api-transicoes.md`; `docs/estado-atual.md` (pendência nova: chave de idempotência por evento na F9).

**Parte interface (agente de UX/UI, Opus)** — começa com os tipos da etapa 1 e uma API simulada:

1. `api/cliente.ts` (`mudarStatus`, `cancelarDocumento`, `reativarDocumento`, `responsaveis`), `permissoes.ts` (`podeCancelar`, `podeReativar`, `acoesDeStatus` reexportada com `eu`), `formatacao.ts` (mês por extenso).
2. `CartaoDocumento` (ação principal, linha Responsável), `DetalhesDocumento` (rodapé 6.2, seção Metas, recarga), componentes novos `DialogoAtualizarEtapa`, `DialogoCancelar`, `DialogoConfirmar` (Aprovar/Reativar), `JanelaCancelados` (Reativar), `TelaPainel` (quarto KPI, toast com Desfazer, `qtdCancelados` local, mover cartão de coluna), busca com responsável.
3. Testes de tela, vitrine, e2e + axe, capturas. Relatório `docs/relatorios/2026-09-29-f5-web-status.md`.

**Fronteira exata:** a interface só importa de `@docsync/compartilhado` (`acoesDeStatus`, `AcaoStatus`, `exigeResponsavel`, `sugerirResponsaveis`, `statusDeReativacao`, `NovaTransicao`, `NovoCancelamento`, `NovaReativacao`, `ResultadoTransicao`, `PessoaResumo`, `validarMotivoCancelamento`, `validarObservacao`, `LIMITES_JUSTIFICATIVA`, `LIMITES_OBSERVACAO`, `avaliarMetas`, `Metas`, `dataInicioRevisao`, `dataAprovacao`, `calcularKpis`, `pode`, `STATUS_DOCUMENTO`, `FASE_DO_STATUS`, `ROTULO_FASE`) e chama só as rotas da seção 3. A interface não decide transição nem permissão de verdade, não calcula o status de reativação a partir de nada além dos eventos/cartão devolvidos pela API, e nunca escreve texto de status à mão; a API não formata rótulo de botão nem texto de meta. Depois das duas partes: verificação integrada, `agente-qa-revisao`, capturas e roteiro para o Eric (critério do plano: transição proibida é recusada, inclusive forçando o corpo por fora da tela).

## 10. Pontos em aberto para o Eric (com proposta)

1. **Atalhos do documento 03 que o diagrama do documento 02 não tem:** Recebido → Devolvido, Devolvido → Em Aprovação e **Em Revisão → Aprovado** (pular a fase Em Aprovação). **Proposta:** manter os três (a Qualidade já os usava; com confirmação obrigatória no Aprovar), só para Qualidade e Administrador. Se preferir o fluxo estrito do 02, basta apagar três entradas de `DESTINOS_POR_FASE`.
2. **Responsável = pessoa cadastrada e obrigatória também ao entrar em revisão.** O antigo aceitava texto livre ("Gestor da Área (Custos)") e só exigia em devolução/aprovação. **Proposta:** pessoa cadastrada (ativa, perfil Administrador/Qualidade/Solicitante), obrigatória em revisão, devolvido e aprovação; Aprovado limpa o responsável. É o que faz "Responsável: <nome>" no cartão ser dado real e prepara notificações.
3. **O que o Solicitante pode fazer.** A tabela 7.3 diz "reenviar após devolução e aprovar quando 'Para aprovação da área solicitante'", mas também "Aprovação final: não". **Proposta:** Solicitante da área reenvia (Devolvido → Em revisão da qualidade) e, em "Para aprovação da área solicitante", encaminha para "Para aprovação qualidade" (botão "Aprovar pela área"); nunca marca Aprovado, nunca cancela nem reativa.
4. **Motivo do cancelamento obrigatório** (10 a 500 caracteres, como a justificativa da reprogramação)? O antigo só pedia confirmação. **Proposta:** sim; é o que dá sentido a abrir um cancelado pelos detalhes (resposta 8 da F4).
5. **Cartão: uma ação principal + Reprogramar; Cancelar e o resto só no modal.** **Proposta:** sim, para o cartão continuar enxuto e o botão destrutivo ficar a um passo de distância. Alternativa: sem ação de status no cartão (tudo no modal).
6. **Onde ficam as metas de 14/40 dias.** **Proposta:** quarto KPI "Aprovados no mês" com "N dentro da meta de 40 dias" e seção "Metas do ciclo" no modal; nada no cartão. Alternativas prontas na 5.4.

## 11. Respostas do Eric (2026-09-29) — prevalecem sobre as seções anteriores

1. Atalhos mantidos, só Qualidade e Administrador, Aprovar sempre com confirmação.
2. Responsável = pessoa cadastrada; obrigatório em revisão, devolvido e aprovação; Aprovado limpa.
3. Solicitante: reenvia devolvido e aprova pela área; nunca Aprovado, nunca cancela/reativa.
4. Motivo do cancelamento obrigatório (10–500).
5. **Cartão sem nenhum botão, no estilo do Planner** (decisão [0015](../decisoes/0015-cartao-estilo-planner.md)): etiquetas no topo, título, área, rodapé com prazo (neutro, laranja vencendo, vermelho vencido) e responsável (iniciais). Todas as ações só no modal de detalhes. Colunas com rolagem vertical própria. **Reprogramar só aparece (e a API só aceita) com prazo vencido** (409 `acao_nao_permitida` caso contrário). A seção 6 fica ajustada a isso: nada de ação principal no cartão.
6. Metas: quarto KPI "Aprovados no mês" com "N dentro da meta de 40 dias" e seção "Metas do ciclo" no modal; nada no cartão.

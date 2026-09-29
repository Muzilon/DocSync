# Contrato da fatia F3 — Painel Kanban

- **Data:** 2026-09-29
- **Status:** Aprovado pelo Eric em 2026-09-29 (respostas na seção 8)
- **Base:** [plano-fundacao.md](../plano-fundacao.md) (linha F3), documento 03 (seção 9, P-12, P-13), decisões [0004](../decisoes/0004-revisoes-e-reativacao.md), [0009](../decisoes/0009-identidade-visual-vigen.md), [0010](../decisoes/0010-prazo-e-area-do-administrador.md) e [0011](../decisoes/0011-prazo-automatico-e-reprogramacao.md) e [0012](../decisoes/0012-recebimento-automatico-e-metas-de-ciclo.md).

Este arquivo é o combinado entre a parte servidor (`apps/api`, `packages/compartilhado`) e a parte interface (`apps/web`). Tudo o que a interface consome está tipado em `packages/compartilhado`; nenhuma das duas partes inventa campo fora daqui. Mudança neste contrato durante a F3 é feita aqui primeiro, depois no código.

## 1. Escopo

**Entra na F3**

- Prazo automático no cadastro (decisão 0011) e migração para os documentos já cadastrados.
- Reprogramação do prazo com justificativa, evento no histórico e etiqueta "Reprogramado".
- Leitura do Painel: rota de cartões, KPIs (P-12, P-13 corrigidos), etiquetas de prazo, contagem de devoluções.
- Tela Painel: 5 colunas por fase, cartões, busca, filtro de área, janela de cancelados, botão Reprogramar, teclado, 768px+.
- Item "Painel" na barra lateral (só agora, porque só agora o destino existe).

**Fica fora (não aparece nem como botão desativado)**

- Mudar status, cancelar, reativar: **F5**. O cartão não tem ações rápidas nem "Atualizar Etapa".
- Detalhes, histórico, linha do tempo, download de arquivos: **F4**. O cartão não tem "Detalhes" nem "Histórico"; clicar no cartão não abre nada além do foco.
- Editar dados: **F6**. Sem botão "Editar".
- Exportar CSV: **F10**. A rota de leitura já aceita os filtros para a F10 reaproveitar.
- Cor de Cancelado: grafite #334155 / #E2E8F0 / #64748B; Devolvido segue vermelho (decisão 0009, escolha do Eric em 2026-09-29).

## 2. Prazo automático (decisão 0011)

### 2.1 Regra

- `dataRevisao` (prazo) = **data do cadastro + 30 dias corridos**. "Data do cadastro" é o dia, no fuso de São Paulo, em que o servidor recebe o `POST /documentos` (o `criado_em`). É também a `dataRecebimento`, que passa a ser gravada pelo servidor (decisão 0012).
- Calculado **só no servidor**. A interface não envia prazo e não o calcula.
- Função pura em `packages/compartilhado/src/documentos.ts`:

```ts
export const DIAS_PRAZO_PADRAO = 30;
/** Soma dias corridos a uma data só-dia 'AAAA-MM-DD' (sem fuso; aritmética em UTC). */
export function somarDias(data: string, dias: number): string;
/** Prazo automático de um cadastro feito no dia `dataCadastro` ('AAAA-MM-DD'). */
export function calcularPrazoAutomatico(dataCadastro: string): string; // = somarDias(dataCadastro, DIAS_PRAZO_PADRAO)
```

- O servidor obtém o dia de hoje por uma única função `hojeNoFuso()` em `apps/api` (fuso `America/Sao_Paulo`, constante; não é segredo e não vai para o `.env`). É a mesma função usada para validar prazo de reprogramação.

### 2.2 Mudanças no cadastro (F2, já validada; mudança mínima)

- `NovoDocumento` **perde** o campo `dataRevisao`. Por esquema fechado, enviá-lo passa a ser `400 dados_invalidos` (`campos.dataRevisao: 'Campo não permitido.'`). A interface deixa de mandar `dataRevisao: null` (hoje manda). Documentos importados com prazo próprio entram por outro caminho (F12), nunca por `POST /documentos`.
- `NovoDocumento` **perde** também `dataRecebimento` (decisão 0012): enviá-lo → `400 dados_invalidos`. O servidor grava `data_recebimento = hojeNoFuso()`. A tela Novo documento remove o campo "Data de recebimento" (a lista de recentes continua mostrando a data gravada).
- `inserirDocumento` grava `data_revisao = calcularPrazoAutomatico(hojeNoFuso())`.
- O evento `CRIACAO` passa a levar em `detalhes` a linha `{ campo: 'dataRevisao', antes: null, depois: '<prazo>' }`, para o histórico mostrar de onde veio o prazo.
- O resumo de idempotência (`hash_cadastro`) **não** inclui o prazo (o prazo é derivado, não parte do pedido); reenvio idêntico em outro dia continua devolvendo o documento existente com o prazo original.
- A resposta de `POST /documentos` já traz `dataRevisao` preenchido; a tela Novo documento mostra "Prazo: dd/mm/aaaa" no toast de sucesso.

### 2.3 Migração `0003_prazo_e_reprogramacao.sql`

Nunca editar a 0002. Uma transação, com o plano de volta no topo do arquivo:

```sql
-- documentos: etiqueta e contagem de reprogramações (justificativa fica só no evento).
ALTER TABLE documentos ADD COLUMN reprogramado boolean NOT NULL DEFAULT false;
ALTER TABLE documentos ADD COLUMN qtd_reprogramacoes integer NOT NULL DEFAULT 0 CHECK (qtd_reprogramacoes >= 0);

-- Tabela auxiliar que guarda quais documentos receberam prazo por esta migração
-- (torna o plano de volta exato). Não é lida pela aplicação.
CREATE TABLE migracao_0003_prazos (id_documento text PRIMARY KEY REFERENCES documentos (id));
INSERT INTO migracao_0003_prazos SELECT id FROM documentos WHERE data_revisao IS NULL;

-- Documentos sem prazo: data do cadastro (fuso de São Paulo) + 30 dias corridos (decisão 0011).
UPDATE documentos
   SET data_revisao = (criado_em AT TIME ZONE 'America/Sao_Paulo')::date + 30
 WHERE data_revisao IS NULL;

-- Novo tipo de evento no histórico.
ALTER TABLE eventos_historico DROP CONSTRAINT eventos_historico_tipo_acao_check;
ALTER TABLE eventos_historico ADD CONSTRAINT eventos_historico_tipo_acao_check
  CHECK (tipo_acao IN ('CRIACAO', 'STATUS', 'EDICAO', 'ANEXO', 'CANCELAMENTO', 'REPROGRAMACAO'));
```

Plano de volta (só com aprovação do Eric, depois de exportar os dados):

```sql
UPDATE documentos SET data_revisao = NULL
 WHERE id IN (SELECT id_documento FROM migracao_0003_prazos) AND qtd_reprogramacoes = 0;
DROP TABLE migracao_0003_prazos;
ALTER TABLE documentos DROP COLUMN qtd_reprogramacoes;
ALTER TABLE documentos DROP COLUMN reprogramado;
-- Eventos REPROGRAMACAO são imutáveis: a restrição antiga só volta se não houver nenhum
-- (SELECT count(*) FROM eventos_historico WHERE tipo_acao = 'REPROGRAMACAO' deve ser 0).
ALTER TABLE eventos_historico DROP CONSTRAINT eventos_historico_tipo_acao_check;
ALTER TABLE eventos_historico ADD CONSTRAINT eventos_historico_tipo_acao_check
  CHECK (tipo_acao IN ('CRIACAO', 'STATUS', 'EDICAO', 'ANEXO', 'CANCELAMENTO'));
DELETE FROM migracoes WHERE versao = '0003';
```

- Os documentos preenchidos pela migração **não** ganham evento no histórico (não há autor humano e `autor_id` referencia `usuarios`); a origem fica registrada no CHANGELOG e na tabela auxiliar. Documentos da base antiga com prazo próprio (F12) não são tocados (`WHERE data_revisao IS NULL`).
- `data_revisao` continua **anulável** no banco (F12 pode importar documento sem prazo); a aplicação nunca grava nulo em cadastro novo.

## 3. Reprogramação do prazo

### 3.1 Rota

`POST /documentos/:id/reprogramacoes` — JSON, esquema fechado.

```ts
/** Corpo de POST /documentos/:id/reprogramacoes. Campo desconhecido é rejeitado. */
export interface NovaReprogramacao {
  /** 'AAAA-MM-DD'. */
  novoPrazo: string;
  justificativa: string;
  /** Versão do documento que a pessoa está vendo (concorrência otimista, decisão 0002). */
  versao: number;
}

export const LIMITES_JUSTIFICATIVA = { minimo: 10, maximo: 500 } as const;

/** Resposta 200/201 da reprogramação. */
export interface ResultadoReprogramacao {
  documento: Documento;
  evento: EventoHistorico;
}
```

### 3.2 Validação (400 `dados_invalidos`, mensagem pt-BR por campo)

| Campo | Regra |
|---|---|
| `novoPrazo` | Obrigatório, data só-dia válida. Precisa ser **posterior ao prazo atual** (só adiar; decisão 0012) e não anterior a **hoje** (`hojeNoFuso()`). Documento sem prazo: só a regra de hoje. |
| `justificativa` | Obrigatória; depois de `trim`, entre 10 e 500 caracteres. Gravada aparada. |
| `versao` | Obrigatório, inteiro ≥ 1. |

Regras puras em `packages/compartilhado` (`validarJustificativa(texto)`, `validarNovoPrazo(novoPrazo, prazoAtual, hoje)` → mensagem ou `null`), usadas pela API e pelo diálogo.

### 3.3 Ordem de decisão no servidor

1. `pode(eu, 'verDocumentos')` falso → `403 sem_permissao`.
2. Documento inexistente **ou** `!pode(eu, 'verDocumentos', { areaId: documento.areaId })` → `404 nao_encontrado` (mesma resposta; não revela existência).
3. `!pode(eu, 'reprogramarPrazo', { areaId: documento.areaId })` → `403 sem_permissao`.
4. Status `Aprovado` ou `Cancelado` → `409 acao_nao_permitida` ("Documento aprovado/cancelado não tem prazo a reprogramar").
5. Corpo inválido → `400 dados_invalidos`.
6. Dentro de **uma transação**, com `SELECT ... FOR UPDATE` do documento:
   - **Idempotência:** se `documento.versao === corpo.versao + 1` e o **último** evento do documento é `REPROGRAMACAO` com o mesmo `autorId`, mesmo `prazoNovo` e mesma `justificativa` → o pedido já foi aplicado: responde `200` com o estado atual, **sem** gravar nada.
   - **Concorrência:** senão, se `documento.versao !== corpo.versao` → `409 conflito_versao`, corpo `{ codigo, mensagem, documento }` com o documento atual (a interface mostra "Alguém alterou este documento; veja o prazo atual e tente de novo").
   - Grava: `data_revisao = novoPrazo`, `reprogramado = true`, `qtd_reprogramacoes + 1`, `versao + 1`, `data_modificacao = now()`.
   - Registra o evento (seção 3.4). Autor = token, nunca o corpo.
   - Responde `201` com `ResultadoReprogramacao`.

Com PGlite (uma conexão) o `FOR UPDATE` é inócuo; a regra vale para o PostgreSQL real.

### 3.4 Evento `REPROGRAMACAO`

- `TipoAcaoHistorico` ganha `'REPROGRAMACAO'`.
- `status` = status atual do documento; `statusAnterior` = `null` (o status não muda).
- `detalhes` = `[{ campo: 'dataRevisao', antes: '<prazoAnterior>', depois: '<prazoNovo>' }]` (mesmo formato de `EDICAO`, para a F4 mostrar "antes → depois" sem caso especial).
- `observacao` = justificativa aparada.
- Para leitura tipada sem inspecionar `detalhes`, `packages/compartilhado` exporta:

```ts
/** Lê prazo anterior, prazo novo e justificativa de um evento REPROGRAMACAO; null para outros tipos. */
export function lerReprogramacao(evento: EventoHistorico): { prazoAnterior: string | null; prazoNovo: string; justificativa: string } | null;
```

### 3.5 Permissão

- `Acao` ganha `'reprogramarPrazo'`: `{ Administrador: 'sim', Qualidade: 'sim', Solicitante: 'nao', Leitor: 'nao' }` (decisão 0011, pontos confirmados). O contexto `areaId` é aceito mas hoje não altera o resultado; fica para a regra continuar uniforme.
- Linha nova na tabela de testes de `pode` (`pessoas.test.ts`).
- A interface pergunta `pode(eu, 'reprogramarPrazo', { areaId: cartao.areaId })` para mostrar o botão; a API decide de verdade.

### 3.6 Códigos de erro novos em `CodigoErroApi`

- `conflito_versao` (409): corpo traz `documento` atual.
- `acao_nao_permitida` (409): estado do documento não aceita a ação.
- Mensagens pt-BR correspondentes em `apps/web/src/api/erros.ts`.

## 4. Leitura do Painel

### 4.1 Rota

`GET /painel?busca=<texto>&areaId=<AREA-uuid>&cancelados=<true|false>`

- Parâmetros opcionais; qualquer outro parâmetro → `400 dados_invalidos` (esquema fechado também na query). `busca` limitada a 200 caracteres; `areaId` precisa existir (ativa ou não; áreas inativas ainda têm documentos) senão `400`; `cancelados` padrão `false`.
- Sem `pode(eu, 'verDocumentos')` → `403`.
- Visibilidade derivada de `pode`, como em `/documentos/recentes` (`areaVisivel` + conferência final `podeVer` por cartão). Solicitante recebe só a sua área mesmo que peça `areaId` de outra (resposta vazia, não 403).
- O servidor **aplica** busca e área com a mesma função pura `filtrarCartoes` da seção 4.4, depois de carregar os cartões visíveis (volume pequeno; a filtragem em SQL fica anotada como pendência para quando a base crescer). Assim a interface e a F10 (exportação) filtram exatamente igual.
- Resposta `200`:

```ts
export interface RespostaPainel {
  cartoes: CartaoPainel[];
  /** Quantos documentos cancelados a pessoa poderia ver (para o botão "Cancelados (N)"), já com busca e área aplicadas. */
  qtdCancelados: number;
  /** Dia de referência do servidor ('AAAA-MM-DD', fuso de São Paulo), para a interface calcular KPIs e etiquetas com a mesma data. */
  hoje: string;
}
```

Ordem dos cartões: por `dataRevisao` crescente (nulos por último), depois `criadoEm` crescente, depois `id`. A interface mantém essa ordem dentro de cada coluna.

### 4.2 Cartão (`CartaoPainel`, só campos de exibição, LGPD: sem observação, sem arquivos, sem `criadoPor`)

```ts
export interface CartaoPainel {
  id: string;
  codigo: string | null;
  titulo: string;
  revisao: number;
  status: StatusDocumento;
  /** = FASE_DO_STATUS[status], já resolvida pelo servidor. */
  fase: Fase;
  tipoDocumento: string;
  areaId: string;
  area: string;
  remetente: string;
  dataRecebimento: string;
  dataRevisao: string | null;
  reprogramado: boolean;
  qtdReprogramacoes: number;
  /** Quantas vezes o documento entrou na fase 'devolvido' (eventos STATUS/CANCELAMENTO não contam se não forem para essa fase). */
  qtdDevolucoes: number;
  /** Dia ('AAAA-MM-DD') do evento mais recente com status 'Aprovado'; null se nunca aprovado. Base do KPI "Aprovados no mês" (P-12). */
  dataAprovacao: string | null;
  versao: number;
  criadoEm: string;
  dataModificacao: string;
}
```

`qtdDevolucoes` e `dataAprovacao` vêm de agregações sobre `eventos_historico` (subconsultas na mesma query), nunca de contadores editáveis. Até a F5 existir, `qtdDevolucoes` é 0 e `dataAprovacao` é `null` para documentos novos; para documentos importados (F12) refletem o histórico importado.

### 4.3 KPIs (função pura, data de referência injetável)

Em `packages/compartilhado/src/painel.ts`:

```ts
export const DIAS_JANELA_VENCENDO = 5;

export interface Kpis {
  /** Não cancelados e não aprovados (P-13: rótulo "Em tramitação"). */
  emTramitacao: number;
  /** Em tramitação com prazo entre hoje e hoje + 5 dias, inclusive (P-13: rótulo "Vencendo em até 5 dias"). */
  vencendo: number;
  /** Em tramitação com prazo anterior a hoje. */
  atrasados: number;
}

export function calcularKpis(cartoes: readonly CartaoPainel[], hoje: string): Kpis;
```

Regras: "Aprovados no mês" (P-12) fica para a **F5**, com as metas de 14/40 dias (decisão 0012); não entra no tipo nem na tela. Cancelados nunca contam; sem `dataRevisao` conta em `emTramitacao` mas nunca em `vencendo`/`atrasados`; os KPIs são calculados sobre os cartões **já filtrados** por busca e área (documento 03, 9.1). "Hoje" vem de `RespostaPainel.hoje`, nunca do relógio do navegador, para a tela e a API concordarem.

### 4.4 Filtro e busca (função pura)

```ts
export interface FiltroPainel { busca?: string; areaId?: string | null }
/** Busca sem acento e sem diferenciar maiúsculas em título, código e remetente; área por ID. */
export function filtrarCartoes(cartoes: readonly CartaoPainel[], filtro: FiltroPainel): CartaoPainel[];
```

Normalização: `normalize('NFD')` + remoção de diacríticos + `toLocaleLowerCase('pt-BR')`, nos dois lados.

### 4.5 Etiquetas de prazo e "Reprogramado" (função pura)

```ts
export type TomPrazo = 'verde' | 'ambar' | 'vermelho';
export interface EtiquetaPrazo { tom: TomPrazo; texto: string; diasRestantes: number }
/** null quando não há prazo ou o documento está Aprovado ou Cancelado (documento 03, 9.5). */
export function etiquetaPrazo(cartao: Pick<CartaoPainel, 'dataRevisao' | 'status'>, hoje: string): EtiquetaPrazo | null;
```

| Tom | Texto | Condição (`dias = prazo - hoje`, em dias corridos) | Cores (decisão 0009) |
|---|---|---|---|
| verde | `Prazo: dd/mm/aaaa` | `dias > 5` | sucesso: texto #047857, fundo #ECFDF5 |
| ambar | `Vence hoje` / `Vence em 1 dia` / `Vence em N dias` | `0 <= dias <= 5` | alerta: texto #B45309, fundo #FFFBEB |
| vermelho | `Atrasado há 1 dia` / `Atrasado há N dias` | `dias < 0` | erro: texto #B91C1C, fundo #FEF2F2 |

A cor nunca vai sozinha: o texto já diz o estado, e a etiqueta tem `aria-label` igual ao texto. A etiqueta **"Reprogramado"** (tom informação: #1D4ED8 / #EFF6FF) aparece quando `reprogramado === true`, com título "Reprogramado N vez(es)"; ela é independente da etiqueta de prazo.

## 5. Interface (`apps/web`)

- Rota `/painel`, tela `apps/web/src/telas/TelaPainel.tsx`; item "Painel" na barra lateral logo abaixo de Início (ícone `LayoutDashboard`), visível para quem tem `pode(eu, 'verDocumentos')`. A tela Início ganha o link "Abrir o painel" só porque o destino passa a existir.
- Chamadas só pelo cliente de `api/cliente.ts`: `painel(filtro)` → `RespostaPainel` e `reprogramarPrazo(id, dados)` → `ResultadoReprogramacao`. A tela carrega uma vez sem cancelados e **filtra no cliente** com `filtrarCartoes` (busca em tempo real sem ir ao servidor a cada tecla); a janela de cancelados faz a sua própria chamada. Depois de reprogramar, substitui o cartão pelo `documento` devolvido (sem recarregar tudo).
- **Cabeçalho:** título "Painel", botão "Novo documento" (só se `podeCadastrarDocumento`), três KPIs com rótulo e subtítulo coerentes (P-13): "Em tramitação — documentos não concluídos", "Vencendo em até 5 dias — prazo entre hoje e daqui a 5 dias", "Atrasados — passaram do prazo". KPIs recalculados a cada mudança de busca/área.
- **Filtros:** campo de busca (`type="search"`, rótulo "Buscar por título, código ou remetente", `aria-live="polite"` num texto "N documentos encontrados"); seleção "Área" com "Todas as áreas" + áreas **em ordem pt-BR** (`ordenarAlfabetico`) vindas de `GET /areas` (todas as áreas ativas); botão "Cancelados (N)", N = `qtdCancelados`, que abre a **janela de cancelados** (como no sistema antigo, documento 03, 9.2).
- **Quadro:** `<section aria-label="Quadro de tramitação">` com 5 colunas (`recebido`, `revisao`, `devolvido`, `aprovacao`, `aprovado`); cancelados nunca aparecem no quadro. Cada coluna é um `<section>` com `<h2>` (rótulo de `ROTULO_FASE` + contagem) e uma lista `<ul>`; coluna vazia mostra "Nenhum documento nesta fase". Em 768–1023px as colunas rolam horizontalmente **dentro do quadro** (a página não rola na horizontal, decisão 0005); a partir de 1024px cabem lado a lado com largura mínima de 220px.
- **Cartão** (`<li>` com `<article tabIndex={0} aria-labelledby>`): código ou "S/ código" + "Rev. N"; título; `BadgeStatus`; tipo; etiqueta de prazo; etiqueta "Reprogramado"; "↺ N×" com `aria-label="Devolvido N vezes"` (só se N > 0); remetente; "Revisão até dd/mm/aaaa" ou, sem prazo, "Recebido em dd/mm/aaaa"; botão **Reprogramar** só se `pode(eu, 'reprogramarPrazo', …)` e status não é Aprovado nem Cancelado. Nenhum outro botão.
- **Janela de cancelados** (componente `Dialogo`, foco preso, Esc fecha, título "Documentos cancelados (N)"): carrega `GET /painel?cancelados=true` e lista só os cartões da fase Cancelado, com a busca e a área em vigor; cartões iguais aos do quadro, sem botão Reprogramar; vazio: "Nenhum documento cancelado". Nada de reativar aqui (F5).
- **Diálogo Reprogramar** (componente `Dialogo`, foco preso, Esc fecha): mostra prazo atual; campo data "Novo prazo" (`min` = o maior entre hoje do servidor e o dia seguinte ao prazo atual) e `CampoTexto` multilinha "Justificativa" com contador "N/500" e dica "mínimo 10 caracteres"; validação por script (`noValidate`) com resumo de erros focável; botão "Confirmar" desabilitado só enquanto envia. Sucesso: toast "Prazo reprogramado para dd/mm/aaaa". `409 conflito_versao`: o diálogo mostra o prazo atual vindo do erro e pede para conferir; `409 acao_nao_permitida`, `403`, `404`: mensagens de `api/erros.ts`.
- **Estados:** carregando (esqueleto de 5 colunas com `aria-busy`), vazio geral ("Nenhum documento cadastrado ainda" + link para Novo documento se puder), vazio por filtro ("Nenhum documento corresponde à busca" + botão "Limpar filtros"), erro (`Estados` com "Tentar de novo"). KPIs mostram "—" enquanto carrega, nunca 0 falso.
- **Teclado:** ordem Tab = cabeçalho → filtros → colunas na ordem das fases → cartões → botão Reprogramar. Setas ← → entre colunas e ↑ ↓ entre cartões da coluna (roving tabindex) são desejáveis, não obrigatórias; Tab sozinho precisa alcançar tudo.
- **Contraste:** todo valor visual sai de token; nada de `#64748B` sobre `#F1F5F9`. Fase Devolvido/Cancelado seguem a decisão 0009 (Devolvido vermelho, Cancelado grafite) e o rótulo de texto sempre visível.
- Nada decorativo: sem "Detalhes", "Histórico", "Editar", "Exportar" nem ações de status.

## 6. Testes obrigatórios

| Camada | Teste |
|---|---|
| compartilhado | `somarDias` e `calcularPrazoAutomatico`: virada de mês, de ano e 29/02. |
| compartilhado | `calcularKpis`: cancelado não conta; sem prazo conta só no total; limites da janela (hoje, hoje+5 dentro; hoje+6 fora; ontem atrasado); aprovado nunca em vencendo/atrasados. |
| compartilhado | `etiquetaPrazo`: null sem prazo, Aprovado e Cancelado; textos singular/plural; `dias = 5` âmbar, `6` verde, `-1` vermelho. |
| compartilhado | `filtrarCartoes`: sem acento e maiúsculas, nos três campos; área por ID; busca vazia não filtra. |
| compartilhado | `validarJustificativa`/`validarNovoPrazo`: aparar, mínimo, máximo, data inválida, anterior a hoje, igual ao prazo atual. |
| compartilhado | `pode`: linha `reprogramarPrazo` na tabela (4 perfis, com e sem contexto). `lerReprogramacao`. |
| API | Migração 0003 aplica sobre a 0002; documento com prazo importado não muda; sem prazo recebe criado_em + 30 no fuso de São Paulo; tabela auxiliar lista só os alterados. |
| API | `POST /documentos`: resposta com `dataRecebimento` = hoje e `dataRevisao` = hoje + 30; enviar `dataRevisao` ou `dataRecebimento` → 400; evento CRIACAO com detalhe do prazo; reenvio idêntico → 200 com o prazo original. |
| API | `POST /documentos/:id/reprogramacoes`: 201 com documento (`versao` +1, `reprogramado`, contagem) e evento com autor do token (ignora `autorId` no corpo → 400 por campo desconhecido); reenvio idêntico → 200 sem novo evento; `versao` velha → 409 `conflito_versao` com documento atual; Aprovado/Cancelado → 409 `acao_nao_permitida`; Solicitante → 403 na própria área e 404 em área alheia; Leitor → 403; documento inexistente → 404; justificativa curta e prazo passado ou anterior/igual ao atual → 400 por campo; campo extra → 400. |
| API | Evento REPROGRAMACAO não pode ser alterado nem apagado (gatilho). |
| API | `GET /painel`: filtros aplicados; parâmetro desconhecido → 400; Solicitante só vê a própria área mesmo pedindo outra; `qtdCancelados` respeita filtros; cartão não expõe `observacao`, `criadoPor` nem arquivos; `qtdDevolucoes` e `dataAprovacao` calculados de eventos (inserindo eventos direto no banco de teste, já que a F5 não existe); `hoje` presente. |
| tela (Vitest) | KPIs e colunas a partir de uma API simulada; busca filtra e atualiza contagem; botão Cancelados abre a janela com os cancelados; botão Reprogramar aparece só para Qualidade/Administrador e some em Aprovado/Cancelado; diálogo valida, envia `{ novoPrazo, justificativa, versao }` e trata 409 mostrando o prazo atual; estados carregando/vazio/erro. |
| e2e + axe | Vitrine (sem sessão real): Painel com cartões nas 5 fases e as três etiquetas de prazo, mais "Reprogramado", em 768, 1024 e 1440 px, temas claro e escuro, sem rolagem horizontal da página; axe sem violações; diálogo Reprogramar com foco preso e Esc. |

## 7. Divisão do trabalho

**Parte servidor (agente de arquitetura e dados, Fable)** — entrega primeiro os tipos, depois o resto:

1. `packages/compartilhado`: tipos e funções das seções 2.1, 3.1, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5 (arquivo novo `painel.ts` exportado pelo `index.ts`; alterações em `documentos.ts` e `pessoas.ts`), com testes.
2. `apps/api`: migração 0003; `hojeNoFuso()`; cadastro gravando prazo; `GET /painel`; `POST /documentos/:id/reprogramacoes`; funções de banco (`listarCartoes`, `reprogramarPrazo`); validação fechada; testes da tabela.
3. Relatório `docs/relatorios/2026-09-29-f3-api-painel-reprogramacao.md`.

**Parte interface (agente de UX/UI, Opus)** — pode começar com os tipos da etapa 1 e uma API simulada:

1. `api/cliente.ts` (`painel`, `reprogramarPrazo`), `api/erros.ts` (códigos novos), `permissoes.ts` (`podeReprogramar`).
2. `TelaPainel` e componentes `CartaoDocumento`, `EtiquetaPrazo`, `ColunaKanban`, `DialogoReprogramar`; item de menu; ajuste da tela Novo documento (não enviar `dataRevisao`; toast com prazo).
3. Testes de tela, vitrine e e2e + axe. Relatório `docs/relatorios/2026-09-29-f3-web-painel.md`.

**Fronteira exata:** a interface só importa de `@docsync/compartilhado` (`CartaoPainel`, `RespostaPainel`, `NovaReprogramacao`, `ResultadoReprogramacao`, `Kpis`, `calcularKpis`, `filtrarCartoes`, `etiquetaPrazo`, `validarJustificativa`, `validarNovoPrazo`, `LIMITES_JUSTIFICATIVA`, `pode`, `ROTULO_FASE`, `FASES`) e chama só `GET /painel` e `POST /documentos/:id/reprogramacoes`. A interface não calcula prazo automático nem decide permissão de verdade; a API não formata texto de etiqueta. Depois das duas partes: verificação integrada, `agente-qa-revisao`, capturas e roteiro para o Eric.

## 8. Respostas do Eric (2026-09-29)

1. Cor: Cancelado em grafite (#334155 / #E2E8F0 / #64748B); Devolvido vermelho (decisão 0009).
2. "Data do cadastro" = dia em que o sistema recebeu; o campo "Data de recebimento" sai do formulário (decisão 0012).
3. Reprogramação **só adia** (decisão 0012).
4. "Aprovados no mês" fica para a F5, com as metas de 14 dias (início da revisão) e 40 dias (conclusão) (decisão 0012).
5. Filtro de área: todas as áreas ativas.
6. Cancelados numa **janela**, como no antigo.
7. Justificativa de 10 a 500 caracteres e janela de 5 dias: confirmados.

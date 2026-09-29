# Contrato da fatia F4 — Detalhes + histórico

- **Data:** 2026-09-29
- **Status:** Proposto; aguarda respostas do Eric à seção 8 antes do código
- **Base:** [plano-fundacao.md](../plano-fundacao.md) (linha F4), documento 02 (seções 1.2, 4.3 e 7.3), documento 03 (seção 9.6, "Histórico Completo", P-07, P-08, P-09), documento 04 (seções 5.3 e 6, com as cores da decisão [0009](../decisoes/0009-identidade-visual-vigen.md)), decisões [0002](../decisoes/0002-fonte-da-verdade.md), [0003](../decisoes/0003-ambiente-local.md), [0004](../decisoes/0004-revisoes-e-reativacao.md), [0007](../decisoes/0007-usuarios-e-perfis.md), [0011](../decisoes/0011-prazo-automatico-e-reprogramacao.md) e [0012](../decisoes/0012-recebimento-automatico-e-metas-de-ciclo.md); contrato da [F3](f3-painel-kanban.md) (formato e regras já em vigor).

Este arquivo é o combinado entre a parte servidor (`apps/api`, `packages/compartilhado`) e a parte interface (`apps/web`). Tudo o que a interface consome está tipado em `packages/compartilhado`; nenhuma das duas partes inventa campo fora daqui. Mudança neste contrato durante a F4 é feita aqui primeiro, depois no código.

A F4 **não tem migração**: nenhuma tabela nem coluna muda. Ela lê o que a F2 e a F3 já gravam (`documentos`, `eventos_historico`, `arquivos_documento`) e abre o primeiro caminho de leitura dos arquivos.

## 1. Escopo

**Entra na F4**

- Leitura completa de um documento: dados, lista de arquivos (principal e anexos) e todos os eventos do histórico, numa única chamada (`GET /documentos/:id`, estendida).
- Download seguro de cada arquivo (`GET /documentos/:id/arquivos/:arquivoId`), só pela interface `ArmazenamentoArquivos`, com permissão no servidor. Fecha a pendência "sem rota de download" registrada em `docs/estado-atual.md`.
- Ação nova de permissão `baixarArquivo` em `pode`.
- Regras puras para a linha do tempo (`descreverEvento`, rótulos de tipo de evento e de campo), usadas pela tela e prontas para os tipos que a F5, F6 e F7 vão gravar.
- Tela: modal de detalhes aberto pelo cartão do Painel (clique, Enter e Espaço), com seções Dados, Arquivos e Linha do tempo, foco preso (componente `Dialogo`), estados de carregamento/erro/404, 768px+.
- Link direto `/painel?documento=<DOC-uuid>` (e o atalho `/documentos/:id`, que redireciona para ele).
- O toast de sucesso da tela Novo documento ganha a ação "Abrir detalhes" (P-01 pedia link para o documento criado; só agora o destino existe).

**Fica fora (não aparece nem como botão desativado)**

- Mudar status, cancelar, reativar, "Atualizar Etapa", botões de ação rápida, responsável: **F5**. O modal não tem rodapé de ações além de "Fechar".
- Editar dados: **F6**. Sem botão "Editar"; nenhum campo do modal é editável.
- Anexar arquivo depois do cadastro, link da pasta no SharePoint ("Abrir Pasta", "Inserir link", "Alterar Link" do documento 03, 9.6): **F7**. Com armazenamento local (decisão 0003) não há pasta a abrir.
- Revisão técnica vinculada e navegação para `idDocumentoOrigem`: **F8**. O campo é exibido como texto ("Revisa o documento <código>") só quando existir; sem link enquanto a F8 não existir.
- Botão "Reprogramar" dentro do modal: fica no cartão (F3). Entra no modal junto com as demais ações, na F5 (ver seção 8, ponto 5).
- Visualização inline (abrir PDF em nova aba), miniaturas, antivírus e streaming do download: pendências registradas (seção 8, ponto 4, e relatório).
- Modo "Histórico completo" separado (documento 04, 6.4): não há. A linha do tempo já mostra **todos** os eventos, sem corte (ver seção 8, ponto 1).

## 2. Leitura de detalhes

### 2.1 Rota

`GET /documentos/:id` já existe (F2) e devolve `{ documento, eventos }`. A F4 **estende** a resposta em vez de criar rotas separadas: um documento tem poucas dezenas de eventos e arquivos, e uma chamada só garante que dados, arquivos e histórico são a mesma fotografia (ninguém vê um prazo novo com uma linha do tempo velha). Adicionar campos a `DetalheDocumento` não quebra quem já consome.

```ts
/** Arquivo do documento (metadados; o conteúdo vem por GET /documentos/:id/arquivos/:arquivoId). */
export interface ArquivoDocumento {
  /** 'ARQ-uuid', gerado no cadastro e nunca reaproveitado. É a única forma de pedir o download. */
  id: string;
  papel: 'principal' | 'anexo';
  /** Nome como veio de quem enviou (só exibição; o nome do download é sanitizado pelo servidor). */
  nomeOriginal: string;
  /** Bytes. */
  tamanho: number;
  /** ISO 8601 UTC. */
  criadoEm: string;
}

/** Resposta de GET /documentos/:id. */
export interface DetalheDocumento {
  documento: Documento;
  /** Principal primeiro, depois anexos em ordem alfabética pt-BR do nome. */
  arquivos: ArquivoDocumento[];
  /** Todos os eventos, em ordem de gravação (mais antigo primeiro). A tela inverte. */
  eventos: EventoHistorico[];
  /** Dia de referência do servidor ('AAAA-MM-DD', fuso de São Paulo), para a etiqueta de prazo do modal. */
  hoje: string;
}
```

O que **não** entra em `ArquivoDocumento`: `nomeArmazenado` (caminho relativo no disco; a interface não precisa dele e nada na tela deve depender do layout do armazenamento) e `tipoMime` (declarado pelo navegador de quem enviou; não é confiável e o download decide o tipo pela extensão, seção 4.3).

### 2.2 Ordem de decisão no servidor

1. `!pode(eu, 'verDocumentos')` → `403 sem_permissao`.
2. Documento inexistente **ou** `!pode(eu, 'verDocumentos', { areaId: documento.areaId })` → `404 nao_encontrado` (mesma resposta; não revela existência). Igual ao que já existe.
3. `200` com `DetalheDocumento`. `hoje = hojeNoFuso()`.

Sem query aceita: qualquer parâmetro → `400 dados_invalidos` (esquema fechado também aqui, como em `/painel`).

### 2.3 Campos exibidos e LGPD

Quem pode ver o documento vê tudo o que segue (documento 02, 7.3: Leitor "vê documentos e histórico, todos, somente leitura" e "ver auditoria completa: sim"; Solicitante só os da sua área):

| Bloco | Campos de `Documento` | Observação |
|---|---|---|
| Cabeçalho | `codigo` (ou "S/ código"), `revisao`, `status` (badge), etiqueta de prazo (`etiquetaPrazo(documento, hoje)`), "Reprogramado N vez(es)" se `reprogramado`, "Devolvido N vezes" se houver | Mesmas funções puras da F3. `id` (`DOC-uuid`) em texto pequeno, para suporte. |
| Dados | `titulo`, `tipoDocumento`, `area`, `disciplina`, `remetente`, `dataRecebimento`, `dataRevisao`, `criadoEm`, `dataModificacao`, `idDocumentoOrigem` (só se não nulo, como texto) | Rótulos do documento 03, seção 6. Nulo vira "—". |
| Observação | `observacao` | Visível para todo perfil que vê o documento. |
| Arquivos | `arquivos[]` | Nome, tamanho, papel, botão Baixar (seção 4). Lista vazia (só possível em documento importado, F12): "Nenhum arquivo anexado". |
| Linha do tempo | `eventos[]` | Seção 3. |

Não exibidos: `criadoPor` (ID `USR-uuid`, sem significado para a pessoa; o autor do cadastro já aparece no evento CRIACAO), `nomePasta` e `nomeArquivoPrincipal` (substituídos pela lista real de arquivos), `versao` (uso interno; continua na resposta para a F5/F6). "Devolvido N vezes" é calculado dos eventos na própria tela (`contarDevolucoes(eventos)`, seção 3.3), nunca de contador editável.

Nada aqui é endpoint público: todo campo sai só para pessoa autenticada com `verDocumentos`. O único dado pessoal novo em circulação é o `autorNome` dos eventos, que já existia na resposta da F2 e é o próprio objeto da auditoria (documento 02, 1.2).

## 3. Histórico (linha do tempo)

### 3.1 Fonte e ordem

- Os eventos vêm em `DetalheDocumento.eventos`, em ordem de gravação (`ORDER BY ordem`, já existente). Não há rota separada `GET /documentos/:id/historico` nesta fatia; se um documento importado (F12) trouxer centenas de eventos, a rota separada com `?apos=<HIST-uuid>` entra aí, sem mudar a tela (que já lê uma lista). Registrado como pendência.
- A tela mostra **do mais recente para o mais antigo** (documento 03, 9.6; documento 04, 6.4). Inverter é responsabilidade da tela (`[...eventos].reverse()`); a API não muda a ordem de gravação, que é a ordem da auditoria.
- Nenhum evento é omitido, agrupado ou resumido (documento 02, 4.3).

### 3.2 Autor

- Exibe-se `autorNome` **como foi gravado** no evento (nome da pessoa no momento da ação). Não há junção com `usuarios` para buscar o nome atual: a trilha de auditoria é o que aconteceu, e uma pessoa inativada continua com o nome dela no histórico (decisão 0007). `autorId` não é exibido.
- O autor nunca vem do corpo de nenhuma requisição (já garantido nas rotas de escrita); a F4 só lê.

### 3.3 Descrição de cada evento (função pura, `packages/compartilhado/src/historico.ts`)

A tela não conhece o significado de `tipoAcao` nem de `detalhes[].campo`; ela chama uma função única, para que F5 (STATUS, CANCELAMENTO), F6 (EDICAO) e F7 (ANEXO) só precisem gravar no formato combinado abaixo e apareçam certos na linha do tempo sem mexer na tela.

```ts
/** Rótulo de exibição de cada tipo de evento (valor gravado separado do rótulo). */
export const ROTULO_TIPO_ACAO: Record<TipoAcaoHistorico, string> = {
  CRIACAO: 'Cadastro',
  STATUS: 'Mudança de status',
  EDICAO: 'Edição de dados',
  ANEXO: 'Arquivos',
  CANCELAMENTO: 'Cancelamento',
  REPROGRAMACAO: 'Reprogramação de prazo',
};

/** Rótulo pt-BR dos campos que podem aparecer em `detalhes[].campo` (os mesmos nomes de `Documento`). */
export const ROTULO_CAMPO_HISTORICO: Record<string, string> = {
  titulo: 'Título', codigo: 'Código', tipoDocumento: 'Tipo de documento', revisao: 'Revisão',
  remetente: 'Remetente', area: 'Área', disciplina: 'Disciplina', observacao: 'Observação',
  dataRecebimento: 'Data de recebimento', dataRevisao: 'Prazo', status: 'Status',
  arquivo: 'Arquivo',
};

export interface DiferencaExibida { campo: string; rotulo: string; antes: string; depois: string }

export interface DescricaoEvento {
  /** = ROTULO_TIPO_ACAO[tipoAcao]. */
  titulo: string;
  /** Uma linha: "Documento cadastrado", "De X para Y", "Prazo de 10/10/2026 para 20/10/2026", "2 arquivos anexados"... */
  resumo: string;
  /** Status depois do evento (badge). */
  status: StatusDocumento;
  /** Só quando houve mudança (statusAnterior != null e != status). */
  statusAnterior: StatusDocumento | null;
  /** detalhes[] com rótulo e valores já formatados ('—' para null; datas em dd/mm/aaaa). */
  diferencas: DiferencaExibida[];
  /** observacao aparada, ou null. Em REPROGRAMACAO é a justificativa. */
  observacao: string | null;
  destino: string | null;
  responsavel: string | null;
  /** Há algo a expandir (diferencas, observacao, destino ou responsavel). */
  temDetalhes: boolean;
}

export function descreverEvento(evento: EventoHistorico): DescricaoEvento;

/** Quantas vezes o documento entrou na fase 'devolvido' (mesma regra do SQL de `listarCartoes`). */
export function contarDevolucoes(eventos: readonly EventoHistorico[]): number;
```

Regras de `descreverEvento` por tipo (as futuras valem como contrato para F5/F6/F7):

| Tipo | Resumo | O que vai em `detalhes` (gravado por quem escreve) |
|---|---|---|
| `CRIACAO` (F2) | "Documento cadastrado" | `[{ campo: 'dataRevisao', antes: null, depois: prazo }]` → diferença "Prazo: — → dd/mm/aaaa". `observacao` = observação do cadastro. |
| `REPROGRAMACAO` (F3) | "Prazo de dd/mm/aaaa para dd/mm/aaaa" (via `lerReprogramacao`) | `[{ campo: 'dataRevisao', antes, depois }]`; `observacao` = justificativa. |
| `STATUS` (F5) | "De <statusAnterior> para <status>" | `detalhes` vazio; `destino`/`responsavel` quando houver. |
| `CANCELAMENTO` (F5) | "Cancelado (estava em <statusAnterior>)" | `detalhes` vazio; `statusAnterior` obrigatório (decisão 0004: a reativação lê daqui). |
| `EDICAO` (F6) | "N campo(s) alterado(s)" | Um item por campo alterado, com o **nome de exibição** para tipo e área (`tipoDocumento`, `area`), não o ID. |
| `ANEXO` (F7) | "N arquivo(s) anexado(s)" | Um item por arquivo: `{ campo: 'arquivo', antes: null, depois: nomeOriginal }`. |

Formatação de valores: campo com nome começando em `data` e valor `AAAA-MM-DD` → `formatarDataCurta`; `null` → "—"; o resto como texto. Campo desconhecido usa o próprio nome como rótulo (nunca quebra a tela). Data/hora do evento (`dataHora`, ISO UTC) é formatada só na tela, em `America/Sao_Paulo` (documento 02, 1.2: `dataExibicao` não é gravada).

### 3.4 Paginação

Não há nesta fatia (ver 3.1). A tela precisa funcionar com qualquer quantidade (lista rolável dentro do modal), e o teste de tela cobre 50 eventos.

## 4. Download de arquivos

### 4.1 Rota

`GET /documentos/:id/arquivos/:arquivoId` → corpo binário do arquivo.

### 4.2 Ordem de decisão no servidor

1. `!pode(eu, 'verDocumentos')` → `403 sem_permissao`.
2. Documento inexistente **ou** `!pode(eu, 'verDocumentos', { areaId })` → `404 nao_encontrado`.
3. `!pode(eu, 'baixarArquivo', { areaId: documento.areaId })` → `403 sem_permissao`.
4. `arquivoId` não pertence a **este** documento (`WHERE id = $arquivoId AND id_documento = $id`) → `404 nao_encontrado`. O `arquivoId` sozinho nunca localiza nada: um `ARQ-uuid` válido de outro documento responde 404, como se não existisse.
5. `armazenamento.ler(documento.id, arquivo.nomeArmazenado)`; `null` (registro no banco sem arquivo no disco, inconsistência) → `404 arquivo_indisponivel`, com `log.error` incluindo só os IDs. `ErroArmazenamento` → `500 erro_interno`.
6. `200` com os cabeçalhos da seção 4.3 e o conteúdo.

Todo caminho de disco é montado **exclusivamente** por `ArmazenamentoLocal.caminho()`, a partir do `id` do documento (regex `DOC-…`) e do `nome_armazenado` gravado pelo servidor no cadastro (validado por `caminhoRelativoSeguro` e pela conferência `startsWith(pasta + sep)`). Nenhum trecho da URL, do nome original ou de cabeçalho da requisição entra no caminho. Sem `HEAD`, sem `Range` nesta fatia.

Sem evento no histórico e sem auditoria de quem baixou (ver seção 8, ponto 3). O log da requisição tem método, rota, IDs e status, nunca o token.

### 4.3 Cabeçalhos da resposta

| Cabeçalho | Valor |
|---|---|
| `Content-Type` | Derivado da **extensão** do `nome_armazenado`, pela tabela fechada `TIPO_MIME_POR_EXTENSAO` (pdf → `application/pdf`, doc → `application/msword`, docx → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, xls → `application/vnd.ms-excel`, xlsx → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, png → `image/png`, jpg/jpeg → `image/jpeg`); extensão fora da tabela → `application/octet-stream`. **Nunca** o `tipo_mime` declarado no envio (um `text/html` gravado por um cliente malicioso não pode virar página servida pela API). A tabela mora em `packages/compartilhado` ao lado de `LIMITES_ARQUIVO.extensoes`, com teste garantindo que toda extensão permitida tem tipo. |
| `Content-Disposition` | `attachment; filename="<ascii>"; filename*=UTF-8''<utf-8 percent-encoded>`, com o nome = `sanitizarNomeArquivo(nomeOriginal)` (mesma função do cadastro). `<ascii>` troca não-ASCII por `_` e remove `"` e `\`. Sempre `attachment` (nunca `inline`) nesta fatia. |
| `Content-Length` | Tamanho do conteúdo lido. |
| `X-Content-Type-Options` | `nosniff`. |
| `Cache-Control` | `private, no-store`. |
| `Content-Security-Policy` | `default-src 'none'; sandbox` (defesa extra caso algum navegador renderize a resposta). |

Função pura `cabecalhosDownload(nomeOriginal, nomeArmazenado, tamanho)` em `apps/api/src/armazenamento/download.ts`, com testes (nome com acento, aspas, nome reservado, extensão em maiúsculas, sem extensão).

### 4.4 Como o navegador baixa (sem URL assinada, sem token na URL)

- `api/cliente.ts` ganha `baixarArquivo(id, arquivoId): Promise<{ blob: Blob; nomeArquivo: string }>`: `fetch('/api/documentos/…/arquivos/…', { headers: { Authorization: 'Bearer <token>' } })`; se `!ok`, lê o JSON de erro e lança `ErroApi` como nas outras chamadas; se ok, `blob()` e nome lido de `Content-Disposition` (`filename*` decodificado com `decodeURIComponent`, senão `filename`, senão `nomeOriginal` passado pela tela). O caminho de erro JSON e o de sucesso binário ficam separados de `chamar()` (que sempre faz `resposta.json()`).
- A tela cria `URL.createObjectURL(blob)`, dispara um `<a download={nomeArquivo}>` temporário e chama `URL.revokeObjectURL` em seguida. O token nunca aparece em URL, histórico do navegador, log de proxy ou `<a href>`. O limite de 20 MB por arquivo (P-09) mantém o blob em memória aceitável; streaming fica registrado como pendência junto com o do envio.
- Enquanto baixa: botão desabilitado com texto "Baixando…" e `aria-live="polite"`; erro → toast com `mensagemDeErro` (`arquivo_indisponivel`: "Este arquivo não está disponível no momento. Avise o administrador do DocSync."); sucesso não precisa de toast (o navegador mostra o download).

### 4.5 Permissão e códigos novos

- `Acao` ganha `'baixarArquivo'`: `{ Administrador: 'sim', Qualidade: 'sim', Solicitante: 'daSuaArea', Leitor: 'sim' }` — hoje idêntica a `verDocumentos`, mas separada para poder ser apertada depois (ex.: Leitor sem download) sem mexer na visibilidade. Linha nova na tabela de testes de `pode`. Ver seção 8, ponto 2.
- `CodigoErroApi` ganha `'arquivo_indisponivel'` (404). Mensagem pt-BR em `apps/web/src/api/erros.ts`.
- A interface pergunta `pode(eu, 'baixarArquivo', { areaId: documento.areaId })` para mostrar os botões Baixar (`podeBaixarArquivo` em `permissoes.ts`); a API decide de verdade.

## 5. Interface (`apps/web`)

### 5.1 Abrir pelo cartão

- O título do cartão (`<h3>`) passa a envolver um `<button type="button">` com o texto do título; o clique em qualquer ponto do `<article>` que não seja outro controle (Reprogramar) aciona esse botão. Enter/Espaço no botão abrem o modal (comportamento nativo). Nome acessível = o título visível (ARIA 1.2, sem `aria-label`); `aria-describedby` aponta para código/revisão, badge de status e etiqueta de prazo, e o botão tem um texto oculto ", abrir detalhes". Isso substitui o `tabIndex={0}` do `<article>` (um `article` focável com `onKeyDown` e um botão dentro não tem papel válido): o alvo do foco e das setas ↑ ↓ ← → passa a ser o botão do título (`data-cartao-id` vai para ele). Um foco por cartão, mais o Reprogramar.
- Ao fechar (Esc, ✕ ou "Fechar"), o foco volta ao botão do título do cartão que abriu (já é o comportamento de `Dialogo`).
- Cartões da **janela de cancelados** também abrem detalhes. O `<dialog>` nativo empilha modais; `Dialogo` prende o foco por diálogo; ao fechar os detalhes o foco volta ao cartão dentro da janela de cancelados. Coberto por e2e.
- `TelaPainel` guarda o documento aberto na URL: `/painel?documento=<DOC-uuid>` (`useSearchParams`). Abrir escreve o parâmetro, fechar o remove; recarregar a página reabre o modal. Quando a abertura vem da URL (sem cartão de origem), o fechar leva o foco ao `<h1>` da tela. O modal carrega o seu próprio `GET /documentos/:id`, independente dos cartões: funciona para cancelados e para documentos que a busca/área esconderam.
- Rota `/documentos/:id` → `<Navigate to="/painel?documento=:id" replace />`. É o atalho curto para toasts e, no futuro, e-mails (módulo 3.2). Ver seção 8, ponto 6.
- Tela Novo documento: o toast "Documento registrado" troca a ação "Ver na lista" por "Abrir detalhes" → `/documentos/<id>`. (Ação única do toast; a lista de recentes continua na própria tela.)

### 5.2 Componente `DetalhesDocumento` (modal)

- Usa `Dialogo` com variante nova `tamanho="detalhes"` (largura `min(var(--dialogo-largura-detalhes), calc(100vw - var(--space-8)))`, token novo `--dialogo-largura-detalhes: 980px`, documento 04 6.1), altura máxima `--dialogo-altura-max`, cabeçalho e rodapé fixos e conteúdo rolável (como `larga`). `Dialogo` ganha a prop opcional `botaoFechar` (✕ no cabeçalho, rótulo "Fechar detalhes"). Rodapé: só o botão "Fechar".
- Título do diálogo (`<h2>`): o título do documento. Logo abaixo, a linha de cabeçalho da seção 2.3 (código, Rev., badge, etiquetas). Reaproveita `BadgeStatus`, `EtiquetaPrazo`, `EtiquetaReprogramado`.
- **Layout:** duas colunas a partir de 860px (esquerda ≈ 1,2 : direita ≈ 0,95, mínimo 320px à direita; documento 04, 6.2); uma coluna abaixo (linha do tempo depois de Dados e Arquivos). Em 768px o modal ocupa `100vw - 2*space-4`, sem rolagem horizontal da página. Os três blocos são `<section aria-labelledby>` com `<h3>` "Dados", "Arquivos", "Linha do tempo" — seções, não abas (tudo visível, sem estado escondido; ver seção 8, ponto 1).
- **Dados:** grade de 2 colunas (1 abaixo de 640px) de pares rótulo (`--fs-micro`, `--text-secondary`) + valor (13px, `--text-primary`); "Observação" ocupa a linha inteira, com quebra de linha preservada (`white-space: pre-wrap`), sem HTML. Datas via `formatarData`; data/hora via `formatarDataHora` novo em `formatacao.ts` (`Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })`). Tamanho de arquivo via `formatarTamanho(bytes)` ("1,2 MB", "340 KB") em `packages/compartilhado` (puro, testado).
- **Arquivos:** `<ul>`; cada item com ícone por extensão (`lucide-react`: `FileText`, `FileSpreadsheet`, `Image`, `File`), nome original, etiqueta "Principal" no primeiro, tamanho e botão "Baixar" (`aria-label` não; o nome acessível é "Baixar" + texto oculto com o nome do arquivo). Lista vazia: "Nenhum arquivo anexado". Sem botão de anexar, sem link (F7).
- **Linha do tempo:** `<ol>` do mais recente para o mais antigo; cada `<li>`: pill do tipo (`ROTULO_TIPO_ACAO`, caixa alta, raio `--radius-xs`), `autorNome`, data/hora (`<time dateTime>`), `resumo`, badge de `status` (e "De X para Y" quando `statusAnterior` difere). Quando `temDetalhes`, um `<button aria-expanded>` "Detalhes" (▾) expande: lista de `diferencas` "Rótulo: antes → depois" com borda esquerda de 3px em `--border-input`, observação em caixa com borda esquerda em `--cor-primaria`, destino e responsável como pares rótulo/valor. Ponto de 22px à esquerda: o evento mais recente com anel (parado em `prefers-reduced-motion`), os demais com ✓; linha vertical contínua (documento 04, 6.2, com as cores da decisão 0009: marca `#4B798F` no lugar do pêssego, erro `#EF4444` no lugar do coral). Nada de "etapa seguinte tracejada": não há previsão de próxima etapa (isso seria decorativo).
- **Estados:** carregando (esqueleto das três seções, `aria-busy`, texto oculto "Carregando detalhes…"); erro de rede (`ErroCarregamento` com "Tentar de novo" dentro do modal); `404` ("Documento não encontrado. Ele pode ter sido removido ou você não tem acesso a ele." + Fechar, e o parâmetro da URL é removido ao fechar); `403` (mensagem de `erros.ts`). Nada renderiza número ou data falsa enquanto carrega.
- **Teclado e foco:** foco inicial no ✕ "Fechar detalhes" (primeiro controle); Tab circula por ✕ → botões Baixar → botões Detalhes da linha do tempo → Fechar; Esc fecha. Conteúdo rolável com `tabIndex={0}` na região de rolagem só se não houver controle focável dentro dela (não é o caso normal).
- **Contraste e tokens:** todo valor visual sai de `tokens.css`; `#64748B` nunca sobre `#F1F5F9`. Ícones `aria-hidden`.
- **Nada decorativo:** sem "Editar", "Histórico completo", "Atualizar Etapa", "Abrir no SharePoint", "Anexar", ações de status, "Copiar link". O único botão além de Fechar é Baixar, e ele baixa.

### 5.3 Vitrine e e2e

A vitrine (`apps/web/e2e/vitrine/`) ganha um documento com 6+ eventos de todos os tipos (inseridos na API simulada, inclusive STATUS/EDICAO/ANEXO/CANCELAMENTO que a F5–F7 ainda não gravam, para a linha do tempo ser vista já agora), 1 principal + 3 anexos, observação longa; `?detalhes=erro|404|carregando` força os estados; `?perfil=Leitor` e `Solicitante` para os botões Baixar.

## 6. Testes obrigatórios

| Camada | Teste |
|---|---|
| compartilhado | `pode`: linha `baixarArquivo` na tabela (4 perfis, com e sem contexto; Solicitante em área alheia → não). |
| compartilhado | `descreverEvento`: um caso por tipo (CRIACAO com prazo e observação; REPROGRAMACAO; STATUS com destino/responsável; CANCELAMENTO; EDICAO com 3 campos incluindo data e null; ANEXO com 2 arquivos); campo desconhecido não quebra; `temDetalhes` falso em STATUS sem observação. |
| compartilhado | `contarDevolucoes`: mesmo resultado que a regra SQL de `listarCartoes` para as sequências: nenhuma; devolvido→revisão→devolvido (2); devolvido→devolvido entre status da mesma fase (1); CANCELAMENTO vindo de devolvido não conta. |
| compartilhado | `formatarTamanho`: 0, 999 B, 1 KB, 1,5 MB, 20 MB, pt-BR (vírgula). `TIPO_MIME_POR_EXTENSAO` cobre toda `LIMITES_ARQUIVO.extensoes`. |
| API | `GET /documentos/:id`: resposta com `arquivos` (principal primeiro, anexos em ordem pt-BR, `id` ARQ, sem `nomeArmazenado`/`tipoMime`), `eventos` em ordem de gravação, `hoje`; parâmetro de query → 400; Solicitante de outra área e Leitor sem acesso liberado → 404/403 como hoje. |
| API | `cabecalhosDownload`: nome com acento (`filename*` codificado, `filename` ASCII), aspas e barra removidas, nome reservado (`con.pdf` → `_con.pdf`), `.PDF` → `application/pdf`, sem extensão → `application/octet-stream`; `attachment` sempre; `nosniff` e `no-store` presentes. |
| API | `GET /documentos/:id/arquivos/:arquivoId`: 200 com corpo igual ao gravado, `Content-Length` e cabeçalhos; `tipo_mime` gravado como `text/html` não sai como `text/html`; `arquivoId` de **outro** documento → 404; `arquivoId` inexistente → 404; documento invisível (Solicitante de outra área) → 404 mesmo com `arquivoId` certo; Leitor → 200 (enquanto a regra da seção 4.5 valer); pessoa sem acesso liberado → 403; sem token → 401; arquivo ausente no armazenamento em memória → 404 `arquivo_indisponivel`; `nome_armazenado` adulterado no banco de teste para `../x` → o armazenamento recusa (500, nunca lê fora da pasta); log não contém o token. |
| API | Regressão: `POST /documentos` e `POST /documentos/:id/reprogramacoes` continuam passando (nenhuma mudança de gravação). |
| tela (Vitest) | Cartão: clique no corpo, Enter e Espaço no título abrem o modal; clique em Reprogramar não abre; foco volta ao título ao fechar. Modal: renderiza Dados (rótulos e valores, "—" para nulos), Arquivos (Principal primeiro, Baixar chama `baixarArquivo(id, arquivoId)` e dispara download com o nome devolvido; botão some para quem não pode), Linha do tempo (ordem inversa, 50 eventos, expandir mostra "Prazo: — → dd/mm/aaaa" e a justificativa da REPROGRAMACAO); estados carregando/erro/404; `?documento=` na URL abre e fechar limpa; `/documentos/:id` redireciona. Toast do cadastro com "Abrir detalhes". |
| e2e + axe | Vitrine: modal aberto em 768, 1024 e 1440 px, temas claro e escuro, sem rolagem horizontal da página, axe sem violações; foco preso (Tab e Shift+Tab circulam), Esc fecha e devolve o foco ao cartão; abrir a partir da janela de cancelados e voltar; `prefers-reduced-motion` sem animação do anel; toque em 768px com alvos de 44px. |

## 7. Divisão do trabalho

**Parte servidor (agente de arquitetura e dados, Fable)** — entrega primeiro os tipos:

1. `packages/compartilhado`: `ArquivoDocumento`, `DetalheDocumento` estendido, `Acao` `'baixarArquivo'`, `CodigoErroApi` `'arquivo_indisponivel'`, arquivo novo `historico.ts` (`ROTULO_TIPO_ACAO`, `ROTULO_CAMPO_HISTORICO`, `descreverEvento`, `contarDevolucoes`, `DescricaoEvento`, `DiferencaExibida`), `formatarTamanho` e `TIPO_MIME_POR_EXTENSAO` em `documentos.ts`; exportações no `index.ts`; testes.
2. `apps/api`: `listarArquivos` devolvendo `id` e `criado_em` (e função `buscarArquivoDoDocumento(db, idDocumento, idArquivo)`); `GET /documentos/:id` estendido com esquema fechado na query; `GET /documentos/:id/arquivos/:arquivoId`; `armazenamento/download.ts` (`cabecalhosDownload`); testes da tabela.
3. Relatório `docs/relatorios/2026-09-29-f4-api-detalhes-download.md`; `docs/estado-atual.md` (pendência de download fechada; pendências novas: streaming do download, rota paginada de histórico).

**Parte interface (agente de UX/UI, Opus)** — pode começar com os tipos da etapa 1 e uma API simulada:

1. `api/cliente.ts` (`documento` devolvendo o tipo estendido; `baixarArquivo`), `api/erros.ts` (`arquivo_indisponivel`), `permissoes.ts` (`podeBaixarArquivo`), `formatacao.ts` (`formatarDataHora`).
2. `Dialogo` (variante `detalhes`, `botaoFechar`), token `--dialogo-largura-detalhes`; componentes `DetalhesDocumento`, `ListaArquivos`, `LinhaDoTempo`, `EventoLinhaDoTempo`; `CartaoDocumento` com título-botão; `TelaPainel` com `?documento=`; rota `/documentos/:id`; toast da tela Novo documento.
3. Testes de tela, vitrine e e2e + axe. Relatório `docs/relatorios/2026-09-29-f4-web-detalhes.md`.

**Fronteira exata:** a interface só importa de `@docsync/compartilhado` (`DetalheDocumento`, `ArquivoDocumento`, `EventoHistorico`, `DescricaoEvento`, `descreverEvento`, `contarDevolucoes`, `ROTULO_TIPO_ACAO`, `formatarTamanho`, `etiquetaPrazo`, `pode`, `FASE_DO_STATUS`, `ROTULO_FASE`) e chama só `GET /documentos/:id` e `GET /documentos/:id/arquivos/:arquivoId`. A interface não decide permissão de verdade, não monta caminho de arquivo e não interpreta `detalhes[]` fora de `descreverEvento`; a API não formata texto de linha do tempo nem de tamanho. Depois das duas partes: verificação integrada, `agente-qa-revisao`, capturas e roteiro para o Eric (abrir pelo teclado; autor e data de cada evento corretos; baixar principal e anexo com nome certo; Leitor e Solicitante).

## 8. Pontos em aberto para o Eric (com proposta)

1. **Linha do tempo única ou "Histórico completo" à parte?** O documento 03 tinha um modal de detalhes com timeline resumida e um botão "Histórico Completo"; o 04 descreve um modo separado com "Voltar aos detalhes". **Proposta:** uma só linha do tempo, com todos os eventos, cada um expansível; sem modo separado. Menos telas, nada escondido, e o histórico não pode ser "resumido" (documento 02, 4.3).
2. **Leitor baixa arquivos?** A tabela 7.3 do documento 02 diz que o Leitor vê documentos e histórico, mas não fala de download. **Proposta:** sim, Leitor baixa (ler o documento é a razão do perfil), com a ação `baixarArquivo` separada de `verDocumentos` para poder mudar depois só nessa linha.
3. **Registrar quem baixou?** **Proposta:** não nesta fatia. Um evento por download poluiria a trilha de tramitação e guardaria dado pessoal sem necessidade (LGPD). Se a Qualidade precisar de evidência de acesso para auditoria, vira registro de auditoria separado (não evento), em decisão própria.
4. **Abrir PDF direto no navegador (nova aba) além de baixar?** **Proposta:** não agora; só download com `attachment`. Visualização inline exige política de conteúdo própria e pode entrar quando o SharePoint for liberado (abre lá) ou numa fatia curta depois da F7.
5. **Botão Reprogramar dentro do modal?** Hoje ele fica no cartão. **Proposta:** só na F5, junto com as demais ações (rodapé único de ações, uma vez, com regra de permissão por botão), para não montar um rodapé agora e refazê-lo depois.
6. **Link direto:** **Proposta:** `/painel?documento=<id>` como endereço real (modal sobre o Painel, recarregável e compartilhável) e `/documentos/<id>` como atalho curto que redireciona. Se o Eric preferir uma página própria de documento (sem Painel atrás), ela pode nascer na F5, reaproveitando `DetalhesDocumento`.
7. **Campos do bloco Dados:** proposta na seção 2.3 (inclusive mostrar o `DOC-uuid` em texto pequeno e "cadastrado em" com hora). O Eric pode cortar ou reordenar antes do código.
8. **Cartões da janela de cancelados abrem detalhes (modal sobre modal)?** **Proposta:** sim, para ver por que um documento foi cancelado sem ter de reativá-lo (F5). O `<dialog>` nativo empilha; e2e garante foco e Esc. Alternativa mais simples: só o quadro abre detalhes na F4.

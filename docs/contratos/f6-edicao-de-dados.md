# Contrato da fatia F6 — Edição de dados

- **Data:** 2026-09-29
- **Status:** Aprovado pelo Eric em 2026-09-29 (seção 9). Status anterior: Proposto; aguarda respostas do Eric (seção 8) antes de qualquer código.
- **Base:** [plano-fundacao.md](../plano-fundacao.md) (linha F6), documento 02 (seções 1.1, 1.2, 4.3 e 7.3), documento 03 (seções 6, 9.6 e 10.3; P-03, P-05, P-06, P-07, P-10, P-11, P-14), documento 01 (R2, R4, R5), decisões [0002](../decisoes/0002-fonte-da-verdade.md), [0004](../decisoes/0004-revisoes-e-reativacao.md), [0006](../decisoes/0006-nome-e-areas.md), [0007](../decisoes/0007-usuarios-e-perfis.md), [0011](../decisoes/0011-prazo-automatico-e-reprogramacao.md), [0012](../decisoes/0012-recebimento-automatico-e-metas-de-ciclo.md), [0014](../decisoes/0014-download-nome-e-versoes-de-arquivo.md) e [0015](../decisoes/0015-cartao-estilo-planner.md); contratos da [F3](f3-painel-kanban.md), [F4](f4-detalhes-historico.md) (seção 3.3: formato do evento `EDICAO` que a linha do tempo já lê) e [F5](f5-mudanca-de-status.md) (ordem de decisão, idempotência, conflito de versão e rodapé do modal, seções 13 e 14).

Este arquivo é o combinado entre a parte servidor (`apps/api`, `packages/compartilhado`) e a parte interface (`apps/web`). Tudo o que a interface consome está tipado em `packages/compartilhado`; nenhuma das duas partes inventa campo fora daqui. Mudança neste contrato durante a F6 é feita aqui primeiro, depois no código.

A F6 é a primeira fatia que **altera os dados cadastrais** de um documento depois do cadastro. O ponto central é o P-14: no sistema antigo a edição exigia só o Título (Tipo, Data de recebimento e Remetente podiam ser apagados) e permitia trocar o status livremente. Aqui a edição usa **a mesma validação do cadastro, pela mesma função pura**, e **não toca em status, responsável, datas do servidor nem ID**. Cada edição grava um evento `EDICAO` com "antes → depois" campo a campo, com autor do token (critério de validação do Eric: conferir "antes → depois").

## 1. Escopo

**Entra na F6**

- Regras puras compartilhadas: campos editáveis, limites e obrigatoriedade do documento numa **única função** `validarDadosDocumento` (usada pelo cadastro, pela edição e pela tela); diferença campo a campo `diferencasDocumento` (a mesma na API, que grava o evento, e na interface, que avisa "nenhuma alteração" e mostra o que outra pessoa mudou num conflito).
- Rota `PUT /documentos/:id/dados` com corpo fechado e completo, concorrência otimista (`409 conflito_versao`), idempotência e evento `EDICAO` imutável com autor do token.
- Ação nova de permissão `editarDados` em `pode` (documento 02, 7.3: Solicitante "só quando devolvido para a sua área").
- Código único por código + revisão também na edição (decisão 0004, P-06): conflito é erro, nunca fusão.
- `descreverEvento` com resumo mais legível para `EDICAO` (a linha do tempo da F4 já mostra as diferenças expandidas; nada muda na tela).
- Interface: botão **"Editar dados"** no rodapé do modal de detalhes (o cartão não tem botões, decisão 0015), diálogo empilhado com o mesmo formulário do cadastro (sem arquivos), validação por script, conflito de versão mostrado campo a campo, teclado, 768px+, toque.
- Tela Novo documento passa a validar pela função compartilhada (mudança mínima; mensagens iguais às de hoje).

**Fica fora (não aparece nem como botão desativado)**

- Trocar, acrescentar ou versionar **arquivos** (principal e anexos), evento `ANEXO`, justificativa de nova versão (decisão 0014, item 5): **F7**. O diálogo de edição não tem campo de arquivo.
- **Revisão técnica vinculada** (documento novo com `idDocumentoOrigem`; "cadastrar revisão" a partir de um Aprovado): **F8**. Editar o campo "N° de revisão" aqui é **correção de digitação** do mesmo documento, não uma revisão nova (ver 2.2 e seção 8, ponto 3).
- **Status e responsável**: só pelas rotas da F5 (P-14). `status`, `responsavelId` e qualquer campo fora da lista de 2.1 no corpo → `400`.
- **Prazo e data de recebimento**: gravados pelo servidor (decisões 0011 e 0012); prazo muda só por reprogramação (F3). Enviar `dataRevisao`/`dataRecebimento` → `400`.
- Editar documento **Aprovado** ou **Cancelado**: não (proposta na 3.2; ponto 2 da seção 8).
- Chave de idempotência gerada pelo cliente por evento: **F9** (padrão da F3/F5 aqui, ver 4.5).
- Administração de listas (tipos, áreas): **F11**. A edição usa as listas que já existem (`GET /tipos-documento`, `GET /areas`).

## 2. Campos editáveis e regras (P-14: as mesmas do cadastro)

### 2.1 Lista fechada

Arquivo novo `packages/compartilhado/src/edicao.ts`:

```ts
/** Os campos cadastrais que uma pessoa pode alterar depois do cadastro (documento 03, 10.3, menos os que o servidor governa). */
export const CAMPOS_EDITAVEIS = [
  'titulo', 'codigo', 'tipoDocumentoId', 'revisao', 'remetente', 'areaId', 'disciplina', 'observacao',
] as const satisfies readonly (keyof NovoDocumento)[];
export type CampoEditavel = (typeof CAMPOS_EDITAVEIS)[number];

/** Dados cadastrais de um documento: o que o cadastro recebe (menos o `id`) e o que a edição substitui por inteiro. */
export type DadosDocumento = Pick<NovoDocumento, CampoEditavel>;
```

`NovoDocumento` passa a ser `DadosDocumento & { id: string }` (mesmos campos de hoje; só muda a origem do tipo).

| Campo | Obrigatório | Regra (idêntica ao cadastro; hoje em `apps/api/src/validacao.ts`, passa para o compartilhado) | No evento `EDICAO` (`detalhes[].campo`) |
|---|---|---|---|
| `titulo` | sim | texto aparado, 1–300 | `titulo` |
| `codigo` | não | texto aparado, ≤ 100, vazio → `null`; **único por `lower(codigo)` + `revisao`**, ignorando o próprio documento | `codigo` |
| `tipoDocumentoId` | sim | `TIPO-…` **ativo** quando muda; o tipo atual é aceito mesmo se tiver sido inativado (não se perde o valor por causa de um campo que a pessoa não tocou) | `tipoDocumento` (nome de exibição, contrato F4 3.3) |
| `revisao` | sim | inteiro 0–999 (aceita também texto numérico, como o formulário envia) | `revisao` (texto) |
| `remetente` | sim | texto aparado, 1–200 | `remetente` |
| `areaId` | sim | `AREA-…` **ativa** quando muda; área atual aceita mesmo se inativada; quem edita precisa ter permissão também na **área nova** (3.1) | `area` (nome de exibição) |
| `disciplina` | não | ≤ 100, vazio → `null` | `disciplina` |
| `observacao` | não | ≤ 2000, vazio → `null` | `observacao` |

**Não editáveis por esta rota** (campo no corpo → `400 dados_invalidos`, `campos.<nome>: 'Campo não permitido.'`; `status` com mensagem própria: `'O status muda só por Atualizar etapa.'`): `id`, `status`, `responsavelId`, `dataRecebimento`, `dataRevisao`, `reprogramado`, `qtdReprogramacoes`, `nomePasta`, `nomeArquivoPrincipal`, `qtdAnexos`, `idDocumentoOrigem`, `criadoPor`, `criadoEm`, `dataModificacao`, `hashCadastro`. `nomePasta` é derivado do título (só exibição, P-07: a pasta real é nomeada pelo ID): o servidor o **recalcula** com `sanitizarNomePasta(titulo)` quando o título muda, sem linha em `detalhes`. `hash_cadastro` **não muda** com a edição: um reenvio tardio do cadastro original continua respondendo `200` com o documento como está agora (editado), nunca reverte nem duplica (comentário já gravado na migração 0002).

### 2.2 Uma validação, três lugares

```ts
export const LIMITES_TEXTO_DOCUMENTO = { codigo: 100, titulo: 300, remetente: 200, disciplina: 100, observacao: 2000 } as const;
export const REVISAO_MAXIMA = 999;

export interface ValidacaoDados {
  /** Mensagem pt-BR por campo (as mesmas de hoje: "Informe o título do documento.", "Selecione o tipo de documento."…). */
  erros: Partial<Record<CampoEditavel, string>>;
  /** Dados normalizados (aparados, vazios → null, revisão como número) quando não há erro; senão null. */
  dados: DadosDocumento | null;
}

/**
 * Valida os 8 campos cadastrais com as regras da tabela 2.1. Recebe valores crus
 * (`unknown`: o formulário manda texto, a API manda JSON) e devolve erros e dados
 * normalizados. NÃO confere esquema fechado, existência de tipo/área nem unicidade
 * de código: isso é do servidor. Usada por `validarNovoDocumento` (API, cadastro),
 * `validarEdicaoDocumento` (API, edição), pela tela Novo documento e pelo diálogo
 * Editar dados: P-14 fica garantido por construção, não por disciplina.
 */
export function validarDadosDocumento(entrada: Partial<Record<CampoEditavel, unknown>>): ValidacaoDados;
```

- `apps/api/src/validacao.ts`: `validarNovoDocumento` vira "esquema fechado + `id` + `validarDadosDocumento`"; `validarEdicaoDocumento` (4.2, passo 5) vira "esquema fechado + `validarDadosDocumento` + `versao`". Os testes atuais do cadastro (mensagens por campo) continuam passando sem alteração.
- `apps/web/src/telas/TelaNovoDocumento.tsx`: `validarDocumento(dados, principal, anexos)` passa a chamar `validarDadosDocumento` para os campos de texto e mantém só a parte de arquivos. Mesmas mensagens, mesmos testes.
- Nenhuma regra de campo fica escrita duas vezes; o dia em que um limite mudar, muda num lugar.

### 2.3 Diferença campo a campo (função pura)

```ts
/** Um item de `detalhes[]` do evento EDICAO (contrato F4, 3.3): nome do campo como `ROTULO_CAMPO_HISTORICO` conhece. */
export interface DetalheEdicao { campo: 'titulo' | 'codigo' | 'tipoDocumento' | 'revisao' | 'remetente' | 'area' | 'disciplina' | 'observacao'; antes: string | null; depois: string | null }

/**
 * Diferenças entre o documento como está e os dados novos, na ordem de CAMPOS_EDITAVEIS.
 * Tipo e área comparam pelo ID e gravam o NOME (o de agora, em `atual`, e o da lista
 * ativa, em `nomes`), nunca o ID. Revisão vira texto. Vazio = nada mudou.
 */
export function diferencasDocumento(
  atual: Pick<Documento, CampoEditavel | 'tipoDocumento' | 'area'>,
  novo: DadosDocumento,
  nomes: { tipoDocumento: string; area: string },
): DetalheEdicao[];

/** Documento em tramitação (nem Aprovado nem Cancelado) aceita edição de dados (3.2). = emTramitacao. */
export function podeEditarAgora(documento: Pick<Documento, 'status'>): boolean;
```

A API usa `diferencasDocumento` para montar o evento e para decidir a idempotência (4.5); a interface, para não enviar edição vazia e para mostrar, num `409`, o que a outra pessoa alterou (5.4). Uma só regra de comparação: `null` ≠ `''` nunca acontece porque os dois lados passam por `validarDadosDocumento` antes.

## 3. Quem edita

### 3.1 Por perfil (documento 02, 7.3; proposta)

`Acao` ganha `'editarDados'`; `ContextoPermissao` ganha `status`:

```ts
export interface ContextoPermissao {
  areaId?: string;
  transicao?: { de: StatusDocumento; para: StatusDocumento };
  /** Só em 'editarDados': status atual do documento (o Solicitante só edita em fase 'devolvido'). */
  status?: StatusDocumento;
}
```

| Ação | Administrador | Qualidade | Solicitante | Leitor |
|---|:-:|:-:|:-:|:-:|
| `editarDados` | sim | sim | `daSuaArea` **e**, com `contexto.status`, só fase `devolvido` | não |

Semântica de `pode(eu, 'editarDados', ctx)` para o Solicitante (regra nova `'daSuaAreaSeDevolvido'`): `areaId` informado e diferente da sua → `false`; `status` informado e `FASE_DO_STATUS[status] !== 'devolvido'` → `false`; sem contexto → `true` (pergunta genérica, como em `mudarStatus`). A API **sempre** passa área e status (4.2, passo 3); a interface também (5.1). É regra de perfil (Qualidade edita em qualquer fase; o Solicitante não), por isso mora em `pode` e não numa máquina à parte.

**Área nova:** quem edita precisa poder editar também na área de destino: `pode(eu, 'editarDados', { areaId: dados.areaId, status })`. Para Administrador e Qualidade é sempre verdade; para o Solicitante só se a área for a dele, ou seja, **o Solicitante não move o documento de área** (o formulário mostra a área travada, como no cadastro). Motivo: movê-lo para fora da sua área o faria sumir da própria vista e contornaria o "só da sua área" do cadastro.

### 3.2 Por fase (todos os perfis; proposta)

| Fase atual | Editável? | Motivo |
|---|:-:|---|
| Recebido, Em Revisão, Devolvido à Área, Em Aprovação | sim | Documento em tramitação: correção faz parte do fluxo (o Solicitante só em Devolvido). |
| **Aprovado** | **não** | Aprovado é final (decisão 0004): os dados aprovados são a versão controlada; correção é uma **revisão nova** (F8). Vale também para o Administrador. |
| **Cancelado** | **não** | Um só caminho (P-17): reativar primeiro (F5), editar depois. Evita "consertar" um cancelado sem ele voltar ao quadro. |

Regra pura `podeEditarAgora(documento) = emTramitacao(documento)` (a mesma que já decide o prazo). A API responde `409 acao_nao_permitida` fora dela; a interface esconde o botão. Se o Eric preferir liberar Aprovado para o Administrador (ponto 2 da seção 8), muda só essa função e a tabela de testes.

## 4. Rota `PUT /documentos/:id/dados`

### 4.1 Por que `PUT …/dados` (e não `PATCH /documentos/:id`)

- O recurso alterado é o **bloco de dados cadastrais**, não o documento inteiro (status, responsável, prazo e arquivos têm rotas próprias). `…/dados` diz isso na URL; `PATCH /documentos/:id` sugeriria que `status` é aceitável no corpo.
- O corpo é **sempre completo** (os 8 campos): é o que faz P-14 valer sem ambiguidade — "campo ausente" nunca significa "manter" nem "apagar"; a validação é literalmente a do cadastro. Substituição integral do sub-recurso é `PUT`.
- A interface manda o formulário inteiro, que já está preenchido com os valores atuais; o servidor calcula o que mudou (2.3). Quem envia por fora da tela também precisa mandar tudo, como no cadastro.

### 4.2 Tipos e ordem de decisão

```ts
/** Corpo de PUT /documentos/:id/dados: os 8 campos editáveis, sempre completos, mais a versão vista. Campo desconhecido é rejeitado. */
export interface EdicaoDocumento extends DadosDocumento { versao: number }

/** Resposta 200/201. `evento` é null quando nada mudou (200; nada gravado). */
export interface ResultadoEdicao { documento: Documento; evento: EventoHistorico | null }
```

Ordem (mesmo padrão da F5, 3.2, inclusive a nota de implementação sobre reenvio):

1. `!pode(eu, 'verDocumentos')` → `403 sem_permissao`.
2. Documento inexistente **ou** `!pode(eu, 'verDocumentos', { areaId })` → `404 nao_encontrado` (não revela existência).
3. `!pode(eu, 'editarDados', { areaId: visto.areaId, status: visto.status })` → `403 sem_permissao` (Solicitante fora de devolvido: `mensagem: 'Você só pode editar documentos devolvidos à sua área.'`).
4. `!podeEditarAgora(visto)` e o pedido não é um possível reenvio (`corpo.versao !== visto.versao - 1`) → `409 acao_nao_permitida` (`'Documento aprovado é final. Para corrigir, cadastre uma revisão.'` / `'Documento cancelado: reative antes de editar.'`).
5. **Corpo** (antes da idempotência, B2 do QA da F3): esquema fechado (`CAMPOS_EDITAVEIS` + `versao`; `status` com a mensagem própria de 2.1); `validarDadosDocumento`; `versao` inteiro ≥ 1. Qualquer falha → `400 dados_invalidos` com `campos`.
6. Em **uma transação**, com `SELECT … FOR UPDATE`:
   1. **Idempotência (4.5):** `documento.versao === corpo.versao + 1` **e** o último evento é `EDICAO` do mesmo `autorId` **e** `diferencasDocumento(documento, corpo, nomesAtuais)` é vazio (o documento já está exatamente como o pedido quer) → `200` com `{ documento, evento: <esse evento> }`, sem gravar.
   2. **Concorrência:** `documento.versao !== corpo.versao` → `409 conflito_versao`, corpo `{ codigo, mensagem, documento }` (a interface compara e mostra o que mudou, 5.4).
   3. **Estado:** `!podeEditarAgora(documento)` → `409 acao_nao_permitida`.
   4. **Tipo e área:** se `tipoDocumentoId` mudou, `buscarTipoAtivo` → inexistente/inativo → `400` (`campos.tipoDocumentoId: 'Tipo de documento não encontrado ou inativo.'`); se `areaId` mudou, `buscarAreaAtiva` → `400` (`campos.areaId: 'Área não encontrada ou inativa.'`) e `!pode(eu, 'editarDados', { areaId: corpo.areaId, status })` → `403` (`'Seu perfil não pode mover o documento para outra área.'`). Sem mudança, o valor atual é aceito ainda que inativado.
   5. **Código + revisão (decisão 0004, P-06):** se `(codigo, revisao)` mudou e `codigo !== null` e existe **outro** documento (`id <> $este`) com `lower(codigo)` e `revisao` iguais → `409 codigo_revisao_existente` (mesmo corpo do cadastro, com `campos.codigo`). Nunca unifica, nunca mescla.
   6. **Diferenças:** `diferencasDocumento(...)`; vazio → `200 { documento, evento: null }` (nada gravado, versão intacta).
   7. **Gravação:** `UPDATE documentos SET <8 colunas>, nome_pasta, versao = versao + 1, data_modificacao = now() WHERE id = $1 AND versao = $2`; 0 linhas → `409 conflito_versao` (corrida no PostgreSQL real). Violação do índice `documentos_codigo_revisao` na corrida → `409 codigo_revisao_existente`.
   8. **Evento `EDICAO`** (4.4), autor do token.
   9. `201` com `ResultadoEdicao`.

Nenhum código de erro novo. `status`, `responsavel_id`, `data_recebimento`, `data_revisao`, `reprogramado`, `qtd_*`, `hash_cadastro`, `criado_por` e `id_documento_origem` **não aparecem no `UPDATE`**.

### 4.3 Corpo aceito (exemplo)

```json
{ "titulo": "Controle de informação documentada", "codigo": "PR-QUA-0010", "tipoDocumentoId": "TIPO-…",
  "revisao": 0, "remetente": "Ana Exemplo", "areaId": "AREA-…", "disciplina": "Corporativo",
  "observacao": null, "versao": 4 }
```

### 4.4 Evento gravado

| `tipoAcao` | `status` | `statusAnterior` | `codigo` | `responsavel`/`responsavelId` | `destino` | `detalhes` | `observacao` |
|---|---|---|---|---|---|---|---|
| `EDICAO` | status atual (não muda) | `null` | código **depois** da edição (o anterior fica em `detalhes`) | `null` (edição não tem responsável de etapa; evita "Responsável: X" enganoso na linha do tempo) | `null` | `diferencasDocumento(...)`, um item por campo alterado, na ordem de 2.1 | `null` (sem justificativa; ponto 4 da seção 8) |

`descreverEvento` (F4) já lista as diferenças como "Rótulo: antes → depois" (`ROTULO_CAMPO_HISTORICO` cobre os oito nomes; `revisao` e textos como texto; `null` como "—"). O **resumo** de `EDICAO` melhora (`historico.ts`, função `resumoEdicao(diferencas)`): `"Título alterado"`, `"Título, Área e Disciplina alterados"`, `"5 campos alterados: Título, Área, Disciplina e mais 2"` (até três rótulos por extenso); evento `EDICAO` sem `detalhes` (importado) → `"Dados editados"`. O teste da F4 que espera `"3 campos alterados"` é ajustado; a tela não muda.

### 4.5 Idempotência

Padrão da F3/F5 (versão + último evento do mesmo autor), com uma vantagem própria da edição: como o corpo é o estado completo desejado, "já aplicado" é verificável direto — o documento **já está igual ao pedido** e o último evento é uma `EDICAO` minha. Cobre duplo clique e "Tentar novamente" depois de resposta perdida. Um reenvio depois de outra ação intermediária (a chave de idempotência por evento gerada pelo cliente) fica para a **F9**, como registrado na F5 (3.6). Edição sem diferença com a versão certa não é reenvio: é um no-op honesto (`200`, `evento: null`).

## 5. Interface (`apps/web`)

### 5.1 Botão "Editar dados" (modal de detalhes)

- Rodapé do modal (`DetalhesDocumento`), ordem: ação principal de status → "Atualizar etapa…" → **"Editar dados"** (ícone `Pencil`, estilo secundário) → "Cancelar documento" → "Reativar" → "Reprogramar" → "Fechar". O botão destrutivo continua depois das ações construtivas; em 768px o rodapé quebra em duas linhas sem rolagem horizontal (já acontece).
- Aparece só quando `podeEditar(eu, documento)` em `permissoes.ts`: `podeEditarAgora(documento) && pode(eu, 'editarDados', { areaId: documento.areaId, status: documento.status })`. A API decide de verdade. Leitor, Solicitante fora de devolvido, Aprovado e Cancelado: sem botão (nunca desativado "de enfeite").
- Cartão do Painel: **nada** (decisão 0015).

### 5.2 Diálogo `DialogoEditarDados` (sobre `Dialogo`, `tamanho="larga"`, empilhável sobre o modal)

- Título "Editar dados"; linha de apoio com código/"S/ código", "Rev. N" e `BadgeStatus` do status atual; texto fixo: "Status, responsável, data de recebimento, prazo e arquivos não se alteram aqui." (uma frase, sem lista de botões).
- Campos, **na mesma ordem e com os mesmos componentes do cadastro** (`CampoTexto`, `CampoSelecao`, `CampoAreaTexto`, IDs `edicao-*`): Título do documento\*, Código do documento, Tipo de documento\*, Remetente / solicitante\*, Área\*, Disciplina, N° de revisão, Observações. Sem `ZonaArquivo`. Grade de 2 colunas a partir de 640px como no cadastro; 1 coluna abaixo.
- Valores iniciais = os do `documento` carregado no modal. Tipo: `GET /tipos-documento` (só ativos) **mais o tipo atual** se ele não estiver na lista, rotulado "<nome> (inativo)", para o valor nunca sumir do formulário. Área: `GET /areas`, só ativas em ordem pt-BR (`ordenarAlfabetico`, decisão 0006), mais a atual se inativa; para quem não pode mudar de área (Solicitante), o campo é somente leitura com a dica "Você edita documentos só na sua área.", como no cadastro. Enquanto as listas carregam: `Carregando`; erro: `ErroCarregamento` com "Tentar de novo" dentro do diálogo.
- **Validação por script** (`noValidate`) com `validarDadosDocumento` (a mesma da API), resumo de erros focável com links para os campos, erros inline via `aria-describedby`. Antes de enviar, `diferencasDocumento(documentoBase, dados, nomes)` vazio → resumo com "Nenhum campo foi alterado." e nenhuma chamada.
- Botões: **"Salvar alterações"** (primário; "Salvando…" enquanto envia; desabilitado só enquanto envia) e **"Voltar"**. Com alterações não salvas, "Voltar", Esc e o ✕ abrem `DialogoConfirmar` "Descartar alterações?" ("Descartar" / "Continuar editando"); sem alterações, fecham direto. Foco inicial no campo Título; ao fechar, o foco volta ao botão "Editar dados" (já é o comportamento de `Dialogo`).
- Envia `PUT /documentos/:id/dados` com `{ ...dados, versao: documento.versao }` (`api.editarDados(id, dados)` em `cliente.ts`).

### 5.3 Depois de salvar

- `201`: fecha o diálogo; aviso dentro do modal (`role="status"`, regra 11.1 da F4): "Dados atualizados." com os rótulos alterados ("Dados atualizados: Título, Área."); `aoAtualizarDocumento(documento)` (o Painel substitui o cartão pelo ID, como na reprogramação: título, área e código do cartão e do cabeçalho do modal mudam; se a área saiu do filtro em vigor, o cartão some do quadro pela mesma `filtrarCartoes`); recarga silenciosa do modal (a linha do tempo ganha o evento `EDICAO`, expansível com "antes → depois").
- `200` com `evento: null` (a API não viu diferença; só acontece por fora da tela ou em corrida benigna): fecha com "Nenhuma alteração para salvar."; `200` com evento (reenvio): tratado como sucesso.

### 5.4 Erros

- `409 conflito_versao`: o diálogo **não fecha e não descarta o que a pessoa digitou**. Mostra um aviso focável (`role="alert"`): "Alguém alterou este documento enquanto você editava." seguido da lista `diferencasDocumento(documentoBase, erro.documento, nomesDoErro)` como "Título: 'A' → 'B'" (o que a outra pessoa mudou), atualiza a base (`versao` e valores de referência) e `aoAtualizarDocumento(erro.documento)`. Cada campo alterado pela outra pessoa ganha a dica "Valor atual no servidor: <valor>". A pessoa decide: ajusta e clica em "Salvar alterações" de novo (agora com a versão nova) ou volta. Nunca sobrescreve em silêncio (decisão 0002). Se o documento do erro não for mais editável (Aprovado/Cancelado), o botão Salvar some e o aviso diz o porquê.
- `409 codigo_revisao_existente`: erro inline em Código ("Já existe um documento com este código nesta revisão."), como no cadastro.
- `400 dados_invalidos`: inline por campo (`ORDEM_CAMPOS`); `403`/`409 acao_nao_permitida`: mensagem do servidor no resumo de erros (`ErroApi` já prefere a `mensagem` nesses dois códigos); `sem_conexao`: banner com "Tentar novamente" reenviando o **mesmo** corpo (idempotente).

### 5.5 Teclado, tamanho e toque

- Tab: Título → … → Observações → Salvar alterações → Voltar → ✕. Diálogos empilhados: foco preso no de cima, Esc fecha só ele (com a confirmação de 5.2 quando há alterações).
- 768px: diálogo `larga` cabe sem rolagem horizontal da página; conteúdo rola por dentro; botões 44px em `pointer: coarse`.
- Todo texto de status por `STATUS_DOCUMENTO`/`BadgeStatus`; rótulos dos campos iguais aos do cadastro (constante compartilhada entre as duas telas, `NOME_CAMPO`, extraída de `TelaNovoDocumento` para um módulo comum da interface). Cores só de tokens.
- Nada decorativo: sem "Anexar", sem campo de status desabilitado, sem "Histórico de edições" à parte (a linha do tempo já é isso).

### 5.6 Vitrine e e2e

A vitrine (`apps/web/e2e/vitrine/`) ganha `?editar=1` (abre os detalhes do documento em devolvido com o diálogo Editar dados), `?perfil=Solicitante` (área travada; sem botão fora de devolvido) e `?perfil=Leitor` (sem botão); o DOC-P6 já tem um evento `EDICAO` na linha do tempo (o resumo passa a ser "Título, Disciplina e Data de recebimento alterados"). e2e cobre: abrir pelo teclado, alterar título, salvar, ver o evento novo expandido com "antes → depois"; conflito simulado pela API da vitrine; axe sem violações em 768/1024/1440, claro e escuro.

## 6. Migração

**Nenhuma.** `EDICAO` já está no `CHECK` de `tipo_acao` (migrações 0002 e 0003), `detalhes` é `jsonb`, e todas as colunas alteradas existem desde a 0002. `nome_pasta` é recalculado, não migrado. A imutabilidade de `eventos_historico` (gatilho) continua cobrindo o evento novo; teste de regressão na tabela da seção 7.

## 7. Testes e divisão do trabalho

### 7.1 Testes obrigatórios

| Camada | Teste |
|---|---|
| compartilhado | `validarDadosDocumento`: cada campo obrigatório vazio/ausente/só espaços; limites (300/100/200/100/2000, no limite e +1); `revisao` como número e como texto (`'0'`, `'12'`, `'-1'`, `'1.5'`, `'abc'`, 1000); aparar e vazio → `null`; tipo não texto → "inválido"; dados normalizados iguais aos que `validarNovoDocumento` devolve hoje (mesmas mensagens, para os testes da F2 não mudarem). |
| compartilhado | `diferencasDocumento`: nada mudou → `[]`; um campo; todos os oito na ordem de `CAMPOS_EDITAVEIS`; tipo/área gravam nome e não ID; `null` ↔ texto; revisão como texto; código só com maiúsculas diferentes conta como mudança (o valor gravado muda; a unicidade é que ignora caixa). |
| compartilhado | `podeEditarAgora`: 11 status (só Aprovado e Cancelado → falso). `pode`: linha `editarDados` (4 perfis; Solicitante com/sem `areaId`, com/sem `status`, cada fase; Leitor nunca; pessoa sem acesso liberado nunca). Tabela existente inalterada. |
| compartilhado | `descreverEvento`/`resumoEdicao`: 1, 3, 5 campos e sem detalhes; diferenças formatadas ("Prazo" não aparece em EDICAO; `observacao` longa inteira; `null` → "—"). |
| API | `validarNovoDocumento` continua igual (regressão dos testes da F2). `validarEdicaoDocumento`: campo desconhecido, `status` com a mensagem própria, `id`/`responsavelId`/`dataRevisao`/`dataRecebimento` → "Campo não permitido.", `versao` ausente/0/texto. |
| API | `PUT /documentos/:id/dados`: `201` com `documento` (8 campos novos, `versao + 1`, `nomePasta` recalculado, `status`/`responsavelId`/`dataRecebimento`/`dataRevisao`/`criadoPor`/`hashCadastro` intactos) e `evento` EDICAO com `detalhes` na ordem certa, nomes de tipo/área, `codigo` novo, autor do token, `responsavel` null; corpo igual ao atual → `200` com `evento: null` e versão intacta, nenhum evento novo; reenvio idêntico → `200` com o mesmo evento, sem gravar; versão velha → `409 conflito_versao` com o documento atual; dois envios em sequência com a mesma versão → 2.º recebe `409`; código de outro documento (mesma revisão, caixa diferente) → `409 codigo_revisao_existente` e nada gravado; manter o próprio código → `201`; mudar só a revisão para uma combinação já usada → `409`; tipo inativo trocado → `400`, tipo atual inativado mantido → `201`; área inativa idem; Solicitante: em Devolvido na sua área → `201`, em Recebido → `403`, mudando `areaId` → `403`, de outra área → `404`; Qualidade em qualquer fase de tramitação → `201`; Leitor → `403`; Aprovado → `409 acao_nao_permitida` (também para Administrador); Cancelado → `409`; reenvio da edição que precedeu uma aprovação (versão −1) → `409 conflito_versao` (ajuste 14.7 da F5); campo extra num reenvio idêntico → `400` (B2). |
| API | Evento EDICAO não pode ser alterado nem apagado (gatilho); `GET /documentos/:id` devolve o evento na ordem; `GET /painel` reflete título/área/código novos; `GET /documentos/recentes` idem. Regressão: cadastro (inclusive reenvio idempotente **depois** de uma edição → `200` com o documento editado), reprogramação, transições e download inalterados. |
| tela (Vitest) | Modal: botão "Editar dados" por perfil e status (Qualidade em Recebido sim; Solicitante em Recebido não, em Devolvido da sua área sim; Leitor não; Aprovado/Cancelado não). Diálogo: preenchido com os valores atuais; tipo inativo atual aparece como "(inativo)"; área travada para o Solicitante; validação inline e resumo focável com as mensagens de `validarDadosDocumento`; "Nenhum campo foi alterado." sem chamada; envia `{ …8 campos, versao }`; sucesso fecha, anuncia, chama `aoAtualizarDocumento` e a linha do tempo ganha EDICAO; `409 conflito_versao` mantém o digitado, lista o que mudou e reenvia com a versão nova; `codigo_revisao_existente` inline; Esc com alterações pede confirmação, sem alterações fecha; foco volta ao botão. Novo documento: mesmos testes de antes passam com `validarDadosDocumento`. |
| e2e + axe | Vitrine: modal com "Editar dados" e diálogo aberto em 768, 1024 e 1440 px, claro e escuro, sem rolagem horizontal; foco preso e Esc só no de cima; fluxo editar → salvar → evento expandido "antes → depois"; toque 44px; axe sem violações. |

### 7.2 Divisão do trabalho

**Parte servidor (agente de arquitetura e dados, Fable)** — entrega primeiro os tipos:

1. `packages/compartilhado`: arquivo novo `edicao.ts` (`CAMPOS_EDITAVEIS`, `CampoEditavel`, `DadosDocumento`, `LIMITES_TEXTO_DOCUMENTO`, `REVISAO_MAXIMA`, `ValidacaoDados`, `validarDadosDocumento`, `DetalheEdicao`, `diferencasDocumento`, `podeEditarAgora`, `EdicaoDocumento`, `ResultadoEdicao`); `documentos.ts` (`NovoDocumento` sobre `DadosDocumento`); `pessoas.ts` (`Acao` `'editarDados'`, `ContextoPermissao.status`, regra `'daSuaAreaSeDevolvido'`); `historico.ts` (`resumoEdicao`); `index.ts`; testes.
2. `apps/api`: `validacao.ts` (`validarNovoDocumento` sobre a função compartilhada; `validarEdicaoDocumento`); `banco/documentos.ts` (`aplicarEdicao` com `WHERE versao = $n`, `existeOutroComCodigoRevisao(codigo, revisao, excetoId)`, `buscarTipo`/`buscarArea` para os nomes atuais); `rotas/edicao.ts` (4.2) registrado em `app.ts`; `edicao.test.ts` com a tabela.
3. Relatório `docs/relatorios/2026-09-29-f6-api-edicao.md`; `docs/estado-atual.md`.

**Parte interface (agente de UX/UI, Opus)** — começa com os tipos da etapa 1 e uma API simulada:

1. `api/cliente.ts` (`editarDados(id, dados): Promise<ResultadoEdicao>`), `permissoes.ts` (`podeEditar`), módulo comum dos rótulos de campo do documento (extraído de `TelaNovoDocumento`).
2. `DialogoEditarDados` (5.2–5.4), `DetalhesDocumento` (botão, aviso, recarga), `TelaNovoDocumento` (validação pela função compartilhada), `TelaPainel` (nada novo além de `substituirCartao` já existente; conferir área fora do filtro).
3. Testes de tela, vitrine, e2e + axe, capturas. Relatório `docs/relatorios/2026-09-29-f6-web-edicao.md`.

**Fronteira exata:** a interface só importa de `@docsync/compartilhado` (`CAMPOS_EDITAVEIS`, `LIMITES_TEXTO_DOCUMENTO`, `REVISAO_MAXIMA`, `DadosDocumento`, `EdicaoDocumento`, `ResultadoEdicao`, `DetalheEdicao`, `validarDadosDocumento`, `diferencasDocumento`, `podeEditarAgora`, `pode`, `ordenarAlfabetico`, `rotuloCampoHistorico`, `STATUS_DOCUMENTO`) e chama só `PUT /documentos/:id/dados`, `GET /tipos-documento` e `GET /areas`. A interface não decide permissão de verdade, não calcula o evento e não escreve regra de campo à mão; a API não formata rótulo de campo nem texto de aviso. Depois das duas partes: verificação integrada, `agente-qa-revisao`, `agente-visao-minimalista` (rodapé do modal continua enxuto?), capturas e roteiro para o Eric (editar título e área; conferir "antes → depois" na linha do tempo; tentar apagar o remetente → recusado; tentar mandar `status` por fora da tela → 400; duas abas editando → a segunda vê o conflito com o que a primeira mudou).

## 8. Pontos em aberto para o Eric (com proposta)

1. **Quem edita.** A tabela 7.3 diz: Administrador e Qualidade sim; Solicitante "só quando devolvido para a sua área"; Leitor não. **Proposta:** exatamente isso, e o Solicitante **não muda a área** do documento (campo travado, como no cadastro). Alternativa: Solicitante edita em qualquer fase enquanto o documento é da área dele.
2. **Aprovado e Cancelado não se editam** (nem pelo Administrador). Aprovado é final (decisão 0004): erro em documento aprovado vira revisão nova (F8); Cancelado se reativa antes (P-17). **Proposta:** manter. Alternativa: liberar Aprovado só para o Administrador, com a mesma trilha "antes → depois".
3. **Código e N° de revisão editáveis?** O antigo permitia (e unificava cartões, P-06). **Proposta:** sim, como **correção de digitação**, com unicidade código + revisão conferida e conflito recusado (nunca mescla). Quando a F8 chegar, um documento que já tem revisão vinculada pode ter esses dois campos travados; até lá, editáveis.
4. **Justificativa na edição?** A reprogramação e o cancelamento pedem; o antigo não pedia para editar dados. **Proposta:** **não** — o registro "antes → depois" com autor e hora já é a evidência, e pedir texto a cada correção de acento desestimula corrigir. Se a Qualidade precisar, entra depois como campo opcional "Motivo" no mesmo evento (sem migração).

## 9. Respostas do Eric (2026-09-29) — aprovado

1. Quem edita: como proposto (Administrador e Qualidade; Solicitante só quando devolvido para a sua área, sem mudar a área; Leitor não).
2. Aprovado e Cancelado não se editam, nem pelo Administrador.
3. Código e N.º de revisão editáveis como correção, com unicidade conferida e conflito recusado.
4. Sem justificativa na edição.

Nota de processo: sem créditos do Fable, a parte servidor da F6 é implementada com Opus (registrado no relatório).

## 10. Ajustes durante a implementação (registrados após o QA, 2026-09-29)

1. Mensagem única da revisão, na API e nas telas: "O número de revisão deve ser um inteiro de 0 a 999." (teto 999 também na tela). Aprovado pelo Eric.
2. Conflito de versão: o que a pessoa digitou fica; os campos que ela não tocou passam ao valor atual do servidor, para o reenvio não desfazer a mudança da outra pessoa (decisão 0002). Aprovado pelo Eric.
3. Dica em "N° de revisão", texto do Eric: "Corrigir o número de revisão não cria uma nova revisão."
4. `revisao` passou a ser obrigatória também no `POST /documentos` (antes, ausente virava 0); a tela sempre envia o campo.
5. O perfil é conferido de novo dentro da transação.
6. Rodapé do modal reduzido pelo Eric (decisão 0015, atualização): só "Atualizar etapa…", "Cancelar documento"/"Reativar" e "Reprogramar" (vencido ou vencendo); sem "Fechar" e sem ação principal separada; "Editar" no título da seção Dados.

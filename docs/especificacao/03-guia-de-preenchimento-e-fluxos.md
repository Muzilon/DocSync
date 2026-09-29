# 03 — Formulários, Fluxos e Comportamento das Telas

Especificação de comportamento para a reconstrução do **DocFlow** (sistema de tramitação de documentos) em um repositório novo.

**Origem:** adaptado de `doc_projeto/03-guia-de-preenchimento.md` (guia de uso da versão atual, escrito para usuários finais). O conteúdo funcional foi mantido; mudou só o enquadramento: em vez de "como usar a tela que já existe", este documento descreve **como a tela nova deve se comportar**.

**Como ler:**

- "DEVE" indica comportamento obrigatório herdado da versão atual.
- Trechos marcados com **⚠ P-xx** descrevem comportamentos da versão atual que são **defeitos**. Eles estão listados na seção final, [Problemas de comportamento a NÃO repetir](#12-problemas-de-comportamento-a-não-repetir). A nova versão **não deve copiá-los**.

**Público do sistema:**

- **Solicitantes das áreas**: enviam documentos novos ou revisões para a Qualidade.
- **Equipe da Qualidade**: analisa os documentos, muda o status e acompanha os prazos.

---

## Sumário

1. [Acesso e login](#1-acesso-e-login)
2. [Estrutura de navegação](#2-estrutura-de-navegação)
3. [Modos do formulário: Novo Documento × Revisão Técnica](#3-modos-do-formulário-novo-documento--revisão-técnica)
4. [Fluxo: cadastrar um documento novo](#4-fluxo-cadastrar-um-documento-novo)
5. [Fluxo: cadastrar uma revisão](#5-fluxo-cadastrar-uma-revisão)
6. [Especificação dos campos do formulário](#6-especificação-dos-campos-do-formulário)
7. [Regras de arquivos (principal e anexos)](#7-regras-de-arquivos-principal-e-anexos)
8. [Comportamento ao enviar o formulário](#8-comportamento-ao-enviar-o-formulário)
9. [Painel: KPIs, filtros, quadro e detalhes](#9-painel-kpis-filtros-quadro-e-detalhes)
10. [Mudança de status e edição de documento](#10-mudança-de-status-e-edição-de-documento)
11. [Exportação de dados (CSV)](#11-exportação-de-dados-csv)
12. [Problemas de comportamento a NÃO repetir](#12-problemas-de-comportamento-a-não-repetir)

---

## 1. Acesso e login

Tela **"Acesse sua Conta"**, com os campos:

| Campo | Comportamento |
|---|---|
| **E-mail Corporativo** | Aceita o e-mail corporativo (ex.: `seu.nome@monto.com.br`). A versão atual também aceita o **nome** do usuário exatamente como cadastrado. |
| **Senha de Acesso** | Senha fornecida pelo administrador. Ícone de olho mostra/oculta o texto. |

Botão **Acessar DocFlow**. Em caso de sucesso:

- DEVE exibir "Bem-vindo! Redirecionando..." e levar ao **Painel**.
- Se o usuário tentou abrir outra rota antes do login (ex.: o formulário), DEVE redirecioná-lo para essa rota após autenticar.

Outros requisitos:

- A sessão DEVE persistir no navegador até o logout.
- Logout: menu da engrenagem → **Sair da Conta**.
- Alternância de tema claro/escuro disponível na tela de login (botão sol/lua) e nas configurações.
- Usuários inativos não podem entrar.
- O sistema não exibe nem recupera senhas. A gestão de acesso é feita pelo administrador. ⚠ P-16

Mensagens de validação da versão atual:

| Situação | Mensagem |
|---|---|
| E-mail ou senha vazios | "Por favor, informe tanto o e-mail quanto a senha." |
| Usuário não existe | "Usuário não cadastrado na base de dados." ⚠ P-15 |
| Senha errada | "Senha incorreta. Verifique suas credenciais." ⚠ P-15 |
| Usuário inativo | "Este usuário está inativo. Consulte o administrador." |

---

## 2. Estrutura de navegação

Menu lateral esquerdo (recolhível por um botão de seta):

| Item | Função |
|---|---|
| **Painel** | Quadro Kanban com KPIs de prazo, busca, filtros e detalhes de cada documento. |
| **Novo Registro** | Formulário de cadastro de documentos e revisões, com a lista "Documentos Registrados Recentemente" e o botão de exportação CSV. |

Rodapé do menu: **engrenagem** (Configurações & Sincronização), contendo:

- nome, perfil e área do usuário logado;
- **Aparência**: Claro ou Escuro;
- **Dados & Sincronização**: origem dos dados ("Nuvem (SharePoint)" ou "Cache Local"), total de documentos e os botões **Sincronizar Nuvem** e **Carregar Excel (.xlsx)**;
- **Sair da Conta**.

---

## 3. Modos do formulário: Novo Documento × Revisão Técnica

O formulário tem duas abas no topo. **Os campos são os mesmos nas duas**; muda apenas o comportamento do campo **N° de Revisão**.

| Aba | Uso | Comportamento esperado |
|---|---|---|
| **Novo Documento** (padrão) | Documento criado pela primeira vez. | Define **N° de Revisão = 0**. |
| **Revisão Técnica** | Nova versão de um documento existente. | Se N° de Revisão estiver em 0 ou vazio, muda para **1** e move o foco para **Código do Documento**. Valores maiores que 1 podem ser digitados manualmente. |

**Identidade do documento (regra atual):** o documento é identificado pelo **Código**; se o código estiver vazio, pelo **Título**. Registrar algo com um código já existente **atualiza o documento existente** (não cria um cartão novo). É assim que a revisão substitui o registro anterior no Painel. ⚠ P-06

Comportamento atual ao voltar para a aba Novo Documento: o N° de Revisão volta para 0 mesmo que o usuário tenha digitado outro número. ⚠ P-05

---

## 4. Fluxo: cadastrar um documento novo

Ponto de entrada: menu **Novo Registro** ou botão **Novo** no Painel.

1. Aba **Novo Documento** selecionada (padrão).
2. Usuário preenche **Título do Documento** (obrigatório).
3. **Código do Documento**, se já houver (ex.: `MR-IND-0001-CTO-001`).
4. **Tipo de Documento** (obrigatório).
5. **Status da Tramitação** vem como **Recebido**. ⚠ P-03
6. **Data de Recebimento** (obrigatória).
7. **Data de Revisão (Prazo)**, opcional; alimenta os alertas de prazo do Painel.
8. **Remetente / Solicitante** (obrigatório), pré-preenchido com o nome do usuário logado.
9. **N° de Revisão** = 0.
10. **Área / Setor** pré-preenchida com a área do usuário; **Disciplina** opcional.
11. **Arquivo do Documento Principal** (obrigatório) via botão **Procurar Arquivo**; o nome do arquivo aparece ao lado do rótulo.
12. **Documentos Complementares (Pasta Anexos)** via **Adicionar Anexos**, cumulativo.
13. **Observações Complementares**, opcional.
14. Clique em **Registrar Documento** → ver [seção 8](#8-comportamento-ao-enviar-o-formulário).
15. O registro aparece em **Documentos Registrados Recentemente** e no **Painel**.

---

## 5. Fluxo: cadastrar uma revisão

1. **Novo Registro** → aba **Revisão Técnica** (N° de Revisão passa a 1; foco vai para Código).
2. Usuário informa o **Código do Documento** igual ao do original.
3. Ajusta o **N° de Revisão** se não for a revisão 1.
4. Preenche os obrigatórios: **Título**, **Tipo de Documento**, **Data de Recebimento**, **Remetente / Solicitante**. O título deve ser mantido igual ao do original sempre que possível.
5. Informa a nova **Data de Revisão (Prazo)**, se houver.
6. Anexa o **arquivo principal** da nova versão (obrigatório) e anexos, se houver.
7. Em **Observações Complementares**, descreve o que mudou (ex.: "Atualizado item 4.2 conforme auditoria interna").
8. **Registrar Documento**.

Resultado: como o código é o mesmo, o documento existente no Painel é **atualizado** com os novos dados (status, revisão, datas etc.). Não se cria um segundo cartão. ⚠ P-06

---

## 6. Especificação dos campos do formulário

Formulário **Registro de Documento – DocFlow** (tela **Novo Registro**). Campos com asterisco (*) no rótulo são obrigatórios; o envio só é aceito com todos preenchidos.

| Rótulo | Obrigatório | Formato | Valor padrão / autopreenchimento | Opções | Observações de comportamento |
|---|---|---|---|---|---|
| **Título do Documento \*** | Sim | Texto livre | Vazio | — | Também dá nome à pasta no SharePoint (seção 7). ⚠ P-07 |
| **Código do Documento** | Não | Texto livre | Vazio | — | Ex.: `MR-IND-0001-CTO-001`. Chave de identidade do documento; essencial em revisões. ⚠ P-06 |
| **Tipo de Documento \*** | Sim | Lista | "Selecione o tipo..." (nenhum) | MP - Mapas / Riscos; PR - Procedimento; IT - Instrução de Trabalho; ET - Especificação Técnica; RL - Relatório; AT - Ata de Reunião; LD - Lista de Documentos | ⚠ P-10 (Memorial Descritivo só existe na edição) |
| **Status da Tramitação** | Não | Lista agrupada | **Recebido** | Ver tabela de status abaixo | Na versão atual todos os status podem ser escolhidos no cadastro. ⚠ P-03 |
| **Data de Recebimento \*** | Sim | Data (seletor de calendário) | Vazio | — | Data em que o documento chegou/foi enviado. |
| **Data de Revisão (Prazo)** | Não | Data | Vazio | — | Prazo da análise. Sem ela, o Painel não mostra "Vence em..." nem "Atrasado". |
| **Remetente / Solicitante \*** | Sim | Texto livre | **Nome do usuário logado** | — | Editável (cadastro em nome de outra pessoa). |
| **N° de Revisão** | Não | Inteiro, mínimo 0 | **0** (Novo Documento) ou **1** (Revisão Técnica) | — | Não aceita negativos. ⚠ P-05 |
| **Área / Setor** | Não | Texto livre | **Área do usuário logado** | — | Ex.: Custos, Engenharia. O filtro "Filtrar por Área" do Painel usa este texto literalmente. ⚠ P-11 |
| **Disciplina** | Não | Texto livre | Vazio | — | Ex.: Corporativo, Mecânica. |
| **Arquivo do Documento Principal \*** | Sim | Um único arquivo | "Nenhum selecionado" | — | Botão **Procurar Arquivo**. ⚠ P-02 |
| **Documentos Complementares (Pasta Anexos)** | Não | Vários arquivos | "0 anexos adicionados" | — | Botão **Adicionar Anexos**. Cada arquivo vira uma etiqueta com 📎 e um **×** para remover. |
| **Observações Complementares** | Não | Texto livre multilinha | Vazio | — | Também é gravado no primeiro evento do histórico. |

### Status disponíveis (texto exato)

| Grupo | Status |
|---|---|
| 1. Entrada & Triagem | Recebido |
| 2. Em Análise Técnica (Qualidade) | Em revisão da qualidade · Em revisão junto à área · Em Revisão (Geral) |
| 3. Devolvido para a Área | Devolvido para área para revisão · Devolvido para correção · Em revisão do solicitante |
| 4. Em Validação & Aprovação | Para aprovação da área solicitante · Para aprovação qualidade |
| 5. Conclusão & Arquivo | Aprovado · Cancelado |

### Botão ✕ (Limpar formulário)

Fica no canto superior direito do formulário e deve limpar os campos digitados. ⚠ P-04

---

## 7. Regras de arquivos (principal e anexos)

### Arquivo principal

- Obrigatório no cadastro; **um único arquivo**.
- Selecionar outro arquivo substitui o anterior.

### Anexos complementares

- Opcionais; **vários arquivos**.
- Seleções sucessivas em **Adicionar Anexos** **se somam** à lista "Arquivos complementares a salvar na pasta /Anexos:".
- Cada anexo pode ser removido individualmente pelo **×** da etiqueta.

### Formatos e tamanho

- Versão atual: **nenhuma restrição de tipo nem de tamanho** em nenhum campo de upload. ⚠ P-09
- Formatos esperados na prática: **PDF** (leitura/aprovação), **Word (.docx)** e **Excel (.xlsx)** (quando a Qualidade precisa editar).

### Estrutura no SharePoint

Para cada documento é criada uma pasta no repositório de Tramitação de Documentos do SharePoint:

- **Nome da pasta = Título do Documento**, sanitizado:
  - os caracteres `~ " # % & * : < > ? / \ { | }` são substituídos por hífen (`-`);
  - espaços repetidos são reduzidos a um só.
- O **arquivo principal** fica na raiz da pasta do documento.
- Os **anexos complementares** ficam na subpasta **/Anexos**.

Exemplos de sanitização (casos de teste):

| Título digitado | Nome da pasta |
|---|---|
| `Manual de Procedimentos` | `Manual de Procedimentos` |
| `Procedimento: Compras & Contratos` | `Procedimento- Compras - Contratos` |
| `IT 05/2026 - Solda` | `IT 05-2026 - Solda` |

Consequência na versão atual: dois documentos com o mesmo título vão para a mesma pasta. ⚠ P-07

---

## 8. Comportamento ao enviar o formulário

Sequência ao clicar em **Registrar Documento**:

1. Validação dos campos obrigatórios. ⚠ P-02
2. O botão muda para **"Enviando com Anexos..."** e fica desabilitado (sem duplo envio).
3. O documento é gravado imediatamente no DocFlow e aparece em **Documentos Registrados Recentemente** e no **Painel**.
4. É criado o primeiro evento do histórico, tipo **"Cadastro Inicial"**, com:
   - o status escolhido (normalmente "Recebido");
   - o **Remetente** como autor;
   - as **Observações Complementares** como texto do evento.
5. Os dados, o arquivo principal e os anexos são enviados ao **Excel e à pasta do SharePoint**.
6. Ao terminar: o botão volta ao estado normal, o formulário é limpo e **Remetente** e **Área** são preenchidos de novo com os dados do usuário logado.

Na versão atual não há mensagem de sucesso nem de erro ao final, e falhas no envio ao SharePoint são silenciosas. ⚠ P-01, P-08

---

## 9. Painel: KPIs, filtros, quadro e detalhes

### 9.1 Indicadores (KPIs)

Quatro indicadores no topo. Regras gerais:

- Consideram apenas documentos **não cancelados**.
- **Respeitam** a busca e o filtro de área aplicados.
- "Em andamento" = qualquer status exceto **Aprovado** e **Cancelado**.

| Indicador (título — subtítulo) | Regra de cálculo |
|---|---|
| **Total Cadastrado** — "documentos em tramitação ativa" | Documentos em andamento. ⚠ P-13 |
| **Vencendo esta semana** — "prazo entre hoje e 5 dias" | Documentos em andamento com **Data de Revisão (Prazo)** entre hoje e hoje + 5 dias (inclusive). ⚠ P-13 |
| **Atrasados** — "passaram do prazo de revisão" | Documentos em andamento com **Data de Revisão (Prazo)** anterior a hoje. |
| **Aprovados** — "concluídos este mês" | Versão atual: **todos** os documentos com status Aprovado, não só os do mês. ⚠ P-12 |

Documentos sem **Data de Revisão (Prazo)** entram no Total, mas nunca em "Vencendo" nem em "Atrasados".

### 9.2 Busca e filtros

| Controle | Comportamento |
|---|---|
| **Buscar por título, código ou remetente...** | Filtra o quadro em tempo real, enquanto o usuário digita. |
| **Filtrar por Área** | Lista as áreas distintas existentes nos documentos. "Todas as Áreas" remove o filtro. ⚠ P-11 |
| **Cancelados** | Abre uma janela com os documentos cancelados; o botão mostra a contagem. |
| **Novo** | Abre o formulário de cadastro. |

### 9.3 Colunas do Kanban

| Coluna | Status mapeados |
|---|---|
| **Recebido** | Recebido |
| **Em Revisão** | Em revisão da qualidade · Em revisão junto à área · Em Revisão (Geral) |
| **Devolvido à Área** | Devolvido para área para revisão · Devolvido para correção · Em revisão do solicitante |
| **Em Aprovação** | Para aprovação da área solicitante · Para aprovação qualidade |
| **Aprovado** | Aprovado |

Documentos **Cancelados** não aparecem no quadro; ficam acessíveis pelo botão **Cancelados**.

### 9.4 Conteúdo do cartão

- **Código** (ou "S/ CÓDIGO") e **Rev.** (número da revisão);
- **Título**, **status** e **tipo**;
- **Etiqueta de prazo** (só com Data de Revisão e documento não aprovado);
- **↺ N×**: quantas vezes o documento foi devolvido à área/solicitante (indicador de retrabalho);
- **Remetente** e data (📅): "Revisão até" (data de revisão) ou, na falta dela, "Recebido em" (data de recebimento);
- Botões **Editar**, **Detalhes** e **Histórico**.

### 9.5 Cores de prazo

| Cor | Texto | Condição |
|---|---|---|
| Verde | "Prazo: dd/mm/aaaa" | Faltam mais de 5 dias. |
| Âmbar | "Vence hoje" / "Vence em N dias" | Prazo hoje ou nos próximos 5 dias. |
| Vermelho (coral) | "Atrasado há N dias" | Prazo vencido. |
| Sem etiqueta | — | Sem Data de Revisão ou documento Aprovado. |

### 9.6 Janela de detalhes

Abre ao clicar no cartão ou em **Detalhes**. Fecha com **✕** ou tecla **Esc**.

- **Topo**: ID, código, revisão, status; botões **Histórico Completo**, **Editar**, **✕**.
- **Esquerda**: Remetente / Responsável, Área & Disciplina, Data de Recebimento, Data Limite de Revisão, Observações da Tramitação, **Arquivos & Pastas Vinculadas**.
- **Direita**: **Fluxo de Tramitação** (linha do tempo do mais recente para o mais antigo; cada evento expande em "▾ Detalhes") e o bloco **Atualizar Etapa**.
- **Rodapé**: **Abrir Pasta no SharePoint** (ou **🔗 Inserir link da pasta do SharePoint**, se não houver link), **✏️ Alterar Link** e **botões de ação rápida**.

**Arquivos & Pastas Vinculadas:**

- Mostra o nome do documento principal e a quantidade de anexos em /Anexos.
- Sem arquivo e sem link: aviso **"Nenhum arquivo anexado ou link disponível"**.
- Painel **Anexar Arquivos ao SharePoint** (envio posterior ao cadastro): campos **Documento Principal (PDF/DOC)** e/ou **Anexos Complementares**, botão **Criar Pasta & Salvar Arquivos no SharePoint**. Exige ao menos um arquivo selecionado. ⚠ P-09
- **✏️ Link / ✏️ Alterar Link**: permite colar manualmente a URL da pasta e **Salvar Link**.

**Histórico Completo:** lista todas as movimentações com data/hora e autor. Tipos de evento:

- **Cadastro Inicial**
- **Mudança de Status**
- **Edição de Dados** (cada campo com valor anterior ➔ novo)
- **Arquivos / SharePoint**
- **Cancelamento**

---

## 10. Mudança de status e edição de documento

Há três formas de mudar o status. **Todas DEVEM gerar evento no histórico com o nome de quem alterou.**

### 10.1 Botões de ação rápida (rodapé da janela de detalhes)

| Coluna atual | Botões | Status aplicado |
|---|---|---|
| Recebido | **🔍 Iniciar Revisão** / **↩ Devolver à Área** | Em revisão da qualidade / Devolvido para área para revisão |
| Em Revisão | **↩ Devolver à Área** / **📋 P/ Aprovação** / **✓ Aprovar** | Devolvido para área para revisão / Para aprovação da área solicitante / Aprovado |
| Devolvido à Área | **🔍 Retomar Revisão** / **📋 P/ Aprovação** | Em revisão da qualidade / Para aprovação da área solicitante |
| Em Aprovação | **↩ Devolver p/ Correção** / **✓ Aprovar** | Devolvido para correção / Aprovado |
| Aprovado | **↺ Reabrir Revisão** | Em revisão da qualidade |
| Cancelado | **↺ Reativar Documento** | Recebido |

Todas as colunas ativas também exibem **🚫 Cancelar** (ver 10.4).

### 10.2 Bloco "Atualizar Etapa"

Para status fora dos botões rápidos ou quando é preciso registrar observação.

1. **Status**: lista completa (seção 6).
2. **Observação**: texto livre. Se vazio, o sistema registra automaticamente "Etapa alterada de ... para ...".
3. **Definir responsável**: aparece e é **obrigatório** para status de **devolução** (Devolvido para área para revisão, Devolvido para correção) e de **aprovação** (Para aprovação da área solicitante, Para aprovação qualidade). Vem com sugestão, por exemplo:
   - "Área Solicitante (Custos)"
   - "Gestor da Área (Custos)"
   - "Coordenação da Qualidade"
   
   Se vazio, mensagem: "Por favor, preencha o campo 'Definir responsável' para esta etapa."
4. **Registrar Alteração**: o botão exibe "✓ Registrado!" e a linha do tempo é atualizada.

### 10.3 Edição de dados (botão Editar)

- Acessível pelo cartão ou pela janela de detalhes.
- Campos editáveis: Título do Documento \*, Código do Documento, Tipo de Documento, Status da Tramitação, N° de Revisão, Remetente / Responsável, Área / Setor, Disciplina, Data de Recebimento, Data Limite de Revisão, Observações Complementares.
- Na versão atual, apenas o **Título** é obrigatório na edição. ⚠ P-14
- A lista de tipos inclui também **Memorial Descritivo**. ⚠ P-10
- **Salvar Alterações** → mensagem "Dados do documento atualizados com sucesso!" e evento **Edição de Dados** no histórico, com valor antigo e novo de cada campo alterado.
- **Cancelar** descarta as alterações.
- Alterar **Código** ou **Título** para o de outro documento existente pode unificar os dois em um só cartão. ⚠ P-06

### 10.4 Cancelar e reativar

- **🚫 Cancelar** pede confirmação: "Tem certeza que deseja cancelar este documento?" → **Sim, cancelar**.
- Após confirmar, o documento sai do quadro e aparece por **4 segundos** o aviso "Documento cancelado com sucesso." com botão **Desfazer**.
- Reativação (versão atual, dois caminhos com resultados diferentes): ⚠ P-17
  - botão **Reativar** no cartão, dentro da janela **Cancelados** → status **Em Revisão**;
  - **↺ Reativar Documento** na janela de detalhes → status **Recebido**.

---

## 11. Exportação de dados (CSV)

- Local na versão atual: tela **Novo Registro**, seção **Documentos Registrados Recentemente**, botão **Exportar Excel (CSV)**. O Painel não tem esse botão. ⚠ P-18
- Nome do arquivo baixado: **`tramitacao_documentos.csv`**.
- Colunas, nesta ordem: Código; Título; Tipo de Documento; N° de Revisão; Status; Data de Recebimento; Data de Revisão; Remetente; Área; Disciplina; Observação.
- Separador: **ponto e vírgula (;)**. Codificação que preserve acentos ao abrir no Excel em português (UTF-8 com BOM).
- Datas no formato **aaaa-mm-dd** (ex.: 2026-09-28).
- Conteúdo: **todos** os documentos da base, incluindo aprovados e cancelados. Links de pasta e nomes de arquivos **não** são exportados.
- Base vazia: aviso "Não existem registos para exportar." ⚠ P-19

---

## 12. Problemas de comportamento a NÃO repetir

> **Atenção:** os itens abaixo existem na versão atual e aparecem descritos no guia de uso, mas são **defeitos**, não regras de negócio. Eles **não devem ser copiados** na reconstrução. A nova versão deve evitá-los desde o primeiro commit. A coluna "Comportamento esperado" é a direção recomendada; os detalhes finais podem ser decididos pelo dono do produto.

| ID | Defeito na versão atual | Por que é um problema | Comportamento esperado na nova versão |
|---|---|---|---|
| **P-01** | Ao enviar o formulário, **não aparece nenhuma mensagem** de sucesso nem de erro. O usuário só percebe o fim porque o formulário é limpo. | O usuário não sabe se o cadastro deu certo; o guia atual pede que ele confira manualmente no SharePoint. | Exibir confirmação explícita de sucesso (com link para o documento criado) e mensagem de erro clara em caso de falha, sem limpar o formulário quando der erro. |
| **P-02** | O **Arquivo do Documento Principal é obrigatório, mas o input fica escondido** atrás do botão "Procurar Arquivo". Sem arquivo, o navegador bloqueia o envio **sem mostrar aviso**: o usuário clica e "nada acontece". | Principal causa de "não funciona" relatada pelos usuários. | Validação visível do campo de arquivo, com mensagem junto ao campo e foco/rolagem até ele. Todos os erros de validação devem ser visíveis. |
| **P-03** | No cadastro, o **Status da Tramitação** pode ser qualquer um, inclusive **Aprovado** ou **Cancelado** direto. | Permite pular todo o fluxo de análise e aprovação sem nenhum registro de quem aprovou. | No cadastro, o status inicial é sempre **Recebido** (campo oculto ou somente leitura). Mudanças de status só pelo Painel, respeitando o fluxo e o perfil do usuário. |
| **P-04** | O botão **✕ (Limpar)** pode deixar **Remetente** e **Área** vazios e pode não limpar a lista de anexos e o nome do arquivo principal. O guia atual recomenda "recarregar a página (F5)". | Estado inconsistente do formulário; risco de enviar anexos de um cadastro anterior. | Limpar retorna o formulário ao estado inicial completo: arquivos e anexos zerados, Remetente e Área repreenchidos com os dados do usuário. |
| **P-05** | Voltar para a aba **Novo Documento** **sobrescreve para 0** o N° de Revisão já digitado. | Perda silenciosa de dado digitado; o guia precisa ensinar a "escolher a aba antes". | A troca de aba não apaga valores digitados pelo usuário sem avisar (ou a aba passa a ser apenas um valor inicial). |
| **P-06** | A identidade do documento é o **Código**, ou o **Título** quando não há código. Um cadastro ou edição com código/título igual ao de outro documento **substitui ou unifica silenciosamente** o registro existente. | Perda de dados ("um documento sumiu ou teve os dados trocados por outro"); um erro de digitação cria cartão duplicado em vez de revisão. | Cada documento tem um ID interno próprio. Código deve ser único e validado; revisões são vinculadas explicitamente a um documento existente (ex.: selecionar o documento a revisar) e mantêm o histórico das revisões anteriores. Conflito de código gera erro, não merge. |
| **P-07** | O **nome da pasta no SharePoint vem do Título**; dois documentos com o mesmo título **compartilham a mesma pasta**. | Arquivos de documentos diferentes se misturam e podem ser sobrescritos. | Pasta com nome único e estável (ex.: baseado no código e/ou ID), independente de títulos repetidos e de edições do título. |
| **P-08** | Falhas no envio ao **Excel/SharePoint são silenciosas**; o usuário descobre depois que a pasta está vazia. | Documento aparece no Painel sem os arquivos, sem ninguém saber. | Registrar e exibir o status da sincronização por documento (pendente, concluído, falhou), com opção de reenviar e aviso claro de falha. |
| **P-09** | **Nenhuma restrição de tipo ou tamanho de arquivo** em nenhum upload, inclusive executáveis e compactados. O campo "Documento Principal (PDF/DOC)" sugere restrição que não existe. | Risco de segurança e de envio de arquivos inúteis ou enormes; rótulo enganoso. | Lista de extensões permitidas (ex.: PDF, DOC/DOCX, XLS/XLSX, imagens), limite de tamanho informado na tela e validado antes do envio e no servidor. |
| **P-10** | O tipo **Memorial Descritivo** existe na edição, mas **não no cadastro**. | Listas divergentes para o mesmo campo. | Uma única lista de tipos, de uma fonte única, usada no cadastro, na edição e nos filtros. |
| **P-11** | **Área / Setor é texto livre**; o filtro do Painel usa o texto literal, gerando duplicatas ("Custos" × "custos") e áreas ausentes. | Filtros e relatórios não confiáveis. | Área selecionada de uma lista mantida (cadastro de áreas), com o padrão vindo do perfil do usuário. |
| **P-12** | O KPI **Aprovados — "concluídos este mês"** conta **todos** os aprovados, de qualquer período. | Indicador mente sobre o que diz medir. | Contar apenas documentos aprovados no mês corrente, usando a data do evento de aprovação no histórico. |
| **P-13** | Rótulos de KPI não batem com a regra: **"Total Cadastrado"** mostra só os ativos; **"Vencendo esta semana"** usa janela de 5 dias, não a semana. | Leitura errada dos indicadores. | Rótulo e regra coerentes (ex.: "Em tramitação" e "Vencendo em até 5 dias"), ou ajustar a regra ao rótulo. |
| **P-14** | Na **edição**, só o Título é obrigatório: Tipo, Data de Recebimento e Remetente, obrigatórios no cadastro, podem ser apagados. Além disso, a edição permite trocar o status livremente. | Documentos ficam incompletos; o status pode ser alterado fora do fluxo. | Mesmas regras de obrigatoriedade no cadastro e na edição. Mudança de status apenas pelos caminhos de fluxo (ações rápidas / Atualizar Etapa), sempre com evento de histórico. |
| **P-15** | O login diferencia "Usuário não cadastrado" de "Senha incorreta". | Permite descobrir quais e-mails existem na base (enumeração de usuários). | Mensagem única e genérica para credenciais inválidas (ex.: "E-mail ou senha inválidos."). |
| **P-16** | A base de usuários é mantida numa **planilha do SharePoint** pelo administrador, sem fluxo de recuperação de senha. | Gestão manual e frágil de credenciais. | Autenticação apropriada (ex.: SSO corporativo ou senhas com hash e fluxo de redefinição), com gestão de usuários dentro do sistema. |
| **P-17** | Há **dois caminhos de reativação com resultados diferentes**: "Reativar" na lista de Cancelados leva a **Em Revisão**; "↺ Reativar Documento" nos detalhes leva a **Recebido**. | Mesmo gesto, efeitos diferentes; comportamento imprevisível. | Uma única regra de reativação (definir o status de destino, ex.: voltar ao status anterior ao cancelamento ou a Recebido), igual em todos os pontos de acesso. |
| **P-18** | A exportação CSV existe **só na tela Novo Registro**, não no Painel, e ignora a busca e os filtros aplicados. | Quem acompanha pelo Painel não encontra a exportação. | Exportar a partir do Painel, com opção de exportar o resultado filtrado ou a base completa. |
| **P-19** | A mensagem "Não existem **registos** para exportar." usa grafia de português europeu. | Inconsistência de idioma na interface. | Todos os textos em português do Brasil ("Não existem registros para exportar."). |


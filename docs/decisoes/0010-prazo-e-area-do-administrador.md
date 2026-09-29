# 0010 — Prazo fora do cadastro e área do Administrador

- **Data:** 2026-09-29
- **Status:** Aprovada pelo Eric

## 1. Prazo (Data de revisão)

### Contexto
O documento 03 prevê o campo "Data de revisão (Prazo)" preenchido à mão no cadastro. O Eric decidiu que o prazo será **calculado automaticamente** no futuro; a regra do cálculo ainda não foi definida.

### Decisão
- O campo sai do formulário de cadastro.
- O banco e a API continuam com `dataRevisao` opcional (nulo nos cadastros novos), para não perder o dado de documentos importados da base antiga (F12) e para receber o cálculo automático depois.
- A regra do cálculo automático será uma decisão nova, antes do código correspondente.

### Consequências
- Enquanto não houver cálculo, os KPIs "Vencendo" e "Atrasados" e as etiquetas de prazo do Kanban (F3) só terão valor para documentos importados com prazo. Isso será mostrado de forma honesta na tela (sem número inventado).
- A pergunta "recusar prazo anterior à data de recebimento" deixa de se aplicar ao cadastro.

## 2. Área do Administrador

### Decisão
- O Administrador pertence à área **Qualidade**.
- O primeiro Administrador (bootstrap da decisão 0007) passa a nascer com a área definida pela variável `AREA_ADMINISTRADOR_INICIAL` (padrão `Qualidade`; não é segredo).
- A regra de permissão continua aceitando Administrador sem área, para que ninguém fique trancado fora do sistema; a tela de Pessoas permite ao Administrador definir a própria área.

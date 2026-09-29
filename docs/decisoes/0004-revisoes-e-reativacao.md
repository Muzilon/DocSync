# 0004 — Revisões de documento e reativação de cancelados

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric

## Contexto
O documento 02 diz que "Aprovado é final" e que uma revisão é um cadastro novo. O documento 03 (10.1) tinha "Reabrir Revisão" no Aprovado, e o P-06 pede revisão vinculada ao documento existente. O P-17 aponta dois caminhos de reativação com resultados diferentes.

## Decisão
1. **Aprovado é estado final.** Não existe "Reabrir Revisão".
2. **Uma revisão é um documento novo** (ID novo), com o campo `idDocumentoOrigem` apontando para o documento revisado. O histórico de cada revisão fica preservado.
3. **O código é único na combinação código + revisão.** Um cadastro com código e revisão já existentes é recusado com erro, nunca mesclado.
4. **Reativação:** um documento cancelado volta ao **status que tinha antes do cancelamento** (lido do evento de cancelamento), pela mesma regra em todos os pontos da interface. Gera evento STATUS.

## Consequências
O evento de cancelamento precisa guardar `statusAnterior` (já previsto no modelo). A lista mestra (módulo futuro) usa a revisão mais alta aprovada de cada código.

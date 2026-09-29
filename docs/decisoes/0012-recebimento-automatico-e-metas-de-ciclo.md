# 0012 — Data de recebimento automática e metas de tempo do fluxo

- **Data:** 2026-09-29
- **Status:** Aprovada pelo Eric
- **Muda:** o formulário de cadastro validado na F2 (documento 03, campo "Data de recebimento") e completa a decisão [0011](0011-prazo-automatico-e-reprogramacao.md).

## Contexto
Na F2 a "Data de recebimento" era digitada. Com o prazo automático (0011), o Eric definiu que a referência de todas as contagens é o dia em que o **sistema** recebeu o documento. Ele também definiu metas de tempo para medir o fluxo.

## Decisão
1. **Data de recebimento automática:** o campo sai do formulário. O servidor grava `dataRecebimento` = dia do cadastro no fuso de São Paulo. Enviar `dataRecebimento` no `POST /documentos` passa a ser recusado (esquema fechado). Documentos já cadastrados mantêm a data que tinham; importados (F12) trazem a sua.
2. **Prazo** (0011) = data de recebimento + 30 dias corridos.
3. **Reprogramação só adia:** o novo prazo precisa ser posterior ao prazo atual (e não anterior a hoje). Antecipar não é permitido.
4. **Aprovado conclui o fluxo.** O tempo de conclusão é medido da data de recebimento até a aprovação.
5. **Metas de tempo** (contadas da data de recebimento, dias corridos):
   - **14 dias** até o início da revisão pela Qualidade (entrada na fase Em Revisão);
   - **40 dias** até a conclusão (Aprovado).
   A medição depende das mudanças de status e entra na **F5** (junto com o KPI "Aprovados no mês"); o modo de exibir (KPI, etiqueta, relatório) será proposto ao Eric na F5.

## Consequências
- F3: remover o campo da tela Novo documento e ajustar a API (mudança mínima, com testes).
- F5: gravar a data de entrada em Em Revisão e a de aprovação a partir dos eventos STATUS, para calcular as metas.
- Ponto a observar: o prazo de 30 dias (reprogramável) e a meta de 40 dias para conclusão são medidas diferentes; a relação entre elas pode ser revista quando as metas forem exibidas.

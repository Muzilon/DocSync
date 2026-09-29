# 0011 — Prazo automático de 30 dias e reprogramação com justificativa

- **Data:** 2026-09-29
- **Status:** Aprovada pelo Eric (regra base). Detalhes da reprogramação a configurar em etapas.
- **Completa:** a decisão [0010](0010-prazo-e-area-do-administrador.md), que tirou o prazo do formulário e deixou a regra do cálculo para uma decisão nova.

## Contexto
O documento 03 previa a "Data de Revisão (Prazo)" preenchida à mão. A decisão 0010 tirou o campo do cadastro e prometeu um cálculo automático. Sem prazo, os KPIs "Vencendo" e "Atrasados" e as etiquetas de prazo do Kanban (F3) ficam vazios para documentos novos.

## Decisão
1. **Prazo automático:** todo documento cadastrado recebe prazo = **data do cadastro + 30 dias**. O cálculo é feito **no servidor**, nunca na interface.
2. **Reprogramação:** o prazo pode ser reprogramado por um botão "Reprogramar", que exige uma **justificativa** obrigatória. A reprogramação:
   - grava o novo prazo e a justificativa;
   - gera um evento no histórico (imutável, autor do token), com prazo anterior, prazo novo e justificativa;
   - marca o documento como **Reprogramado** (exibido numa coluna/indicador "Reprogramado").
3. Documentos importados da base antiga (F12) mantêm o prazo que tinham.
4. Os detalhes (quem pode reprogramar, limites, dias corridos ou úteis, onde fica "Reprogramado") serão definidos aos poucos; cada ajuste que mude regra vira atualização desta decisão ou decisão nova, antes do código.

## Pontos a confirmar com o Eric
- "Coluna Reprogramado": é uma **coluna do Kanban** (uma sexta coluna ao lado das 5 fases) ou uma **coluna/etiqueta de dado** (o documento continua na sua fase e mostra "Reprogramado")?
- Dias corridos (proposta) ou dias úteis?
- Quem pode reprogramar: Qualidade e Administrador (proposta)?
- Documentos já cadastrados na F2 (sem prazo) recebem prazo = cadastro + 30 dias (proposta)?

## Consequências
- O cadastro (F2, já validado) passa a gravar o prazo calculado: mudança pequena no servidor, feita no início da F3, com migração nova (nunca editar a 0002).
- Nova ação de permissão (`reprogramarPrazo`) e novo tipo de evento no histórico, com linha nova na tabela de testes de `pode`.
- Os KPIs "Vencendo" e "Atrasados" e as etiquetas de prazo passam a ter valor para todos os documentos.

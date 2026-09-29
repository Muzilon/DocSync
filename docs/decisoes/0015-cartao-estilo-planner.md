# 0015 — Cartão do Kanban no estilo do Planner, sem botões

- **Data:** 2026-09-29
- **Status:** Aprovada pelo Eric (respostas ao contrato da F5)
- **Muda:** o cartão definido nos contratos da F3 e da F4 e a regra de reprogramação da decisão [0011](0011-prazo-automatico-e-reprogramacao.md).

## Contexto
O Eric usa o Microsoft Planner e quer o Painel com a mesma leitura rápida: cartões limpos, sem botões, e rolagem dentro de cada coluna. Ele enviou uma captura do Planner como referência.

## Opções
1. Cartão com ação principal + Reprogramar (proposta do contrato da F5): descartada.
2. Cartão só de leitura, igual ao Planner; todas as ações nos detalhes: escolhida.

## Decisão
1. **Nenhum botão no cartão.** Clicar (ou Enter/Espaço) abre os detalhes; todas as ações (mudar status, cancelar, reativar, reprogramar) ficam no modal de detalhes.
2. **Conteúdo do cartão, de cima para baixo:**
   - **etiquetas** no topo (status e, quando houver, "Reprogramado");
   - **título** do documento;
   - **área** (no lugar da lista de verificação do Planner);
   - **rodapé:** o **prazo** (data curta, como "10/09") à esquerda e o **responsável** (iniciais em círculo, com o nome como texto acessível) à direita.
   - Nada além disso (código, revisão, remetente, contagem de devoluções saem do cartão e ficam nos detalhes).
3. **Cor do prazo:** neutra quando em dia; **laranja** quando vencendo (hoje até 5 dias); **vermelha** quando vencido. Cor nunca sozinha: o texto acessível diz "Vence em N dias" / "Atrasado há N dias".
4. **Rolagem por coluna:** cada coluna rola na vertical por dentro, como no Planner; a página não rola inteira por causa do quadro (a rolagem horizontal do quadro, decisão da F3, continua).
5. **Reprogramar só com prazo vencido:** o botão "Reprogramar" (nos detalhes) só aparece quando o prazo já passou; a API recusa reprogramação de prazo ainda não vencido (409 `acao_nao_permitida`).
6. A visão do usuário (cartão, Painel e futuras telas de consulta) fica sob o cuidado de um agente próprio, `agente-visao-minimalista`, que revisa cada tela contra este padrão enxuto.

## Consequências
- F5: o cartão é refeito por este padrão junto com as ações de status no modal.
- Contratos da F3/F4: as partes sobre botões no cartão e conteúdo do cartão ficam superadas por esta decisão.

## Atualização 2026-09-29 (validação da F6)
- **Rodapé do modal de detalhes só com o necessário:** "Atualizar etapa…" (todas as mudanças de etapa, sem botão de ação principal separado), "Cancelar documento" (ou "Reativar", quando o documento está cancelado) e "Reprogramar". Sem "Fechar" (o ✕ do cabeçalho já fecha). "Editar dados" sai do rodapé e vira um botão discreto "Editar" no título da seção Dados.
- **Reprogramar também quando o prazo está chegando:** vencido ou vencendo (hoje até 5 dias, a mesma janela do KPI "Vencendo"). Com isso a regra "só adia" volta a ter efeito.

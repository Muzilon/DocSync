# Pendências da implementação — Estado em 2026-09-29

Consolidação: o que falta para fechar a F5, próximas fatias, correções pós-QA abertas e perguntas em aberto.

## Situação da F5

| Item | Fatia | Situação | Próximo passo | Quem decide |
|---|---|---|---|---|
| Validação funcional | F5 | QA aprovado com ressalvas (2026-09-29); correções B1–B4 aplicadas (rodapé enxuto, quadro com altura, "Cancelar documento", seletor `.titulo` único, datas coerentes) | Eric roda o roteiro em `docs/estado-atual.md` seção da F5 (11 passos: cartão Planner, detalhes com ações, transições, cancelar/Desfazer, reativar, reprogramar, conflito versão, contas de teste) | Eric |
| Atualizar registros | F5 → F6 | Se Eric disser "F5 validada" | Marcar F5 como validada no `plano-fundacao.md`, adicionar linha no CHANGELOG e iniciar F6 | Claude (após Eric) |

## Próximas fatias do plano (por ordem)

| # | Fatia | Escopo | Dependências | Situação |
|---|---|---|---|---|
| F6 | Edição de dados | Formulário de edição com mesma obrigatoriedade do cadastro (P-14); evento EDICAO com diferenças antes/depois | F5 validada | Por começar |
| F7 | Anexos posteriores + versões | Anexo não cria documento (F2); evento ANEXO; versão de arquivo com justificativa (decisão 0014) | F6 | Por começar |
| F8 | Revisão técnica vinculada | Documento novo com `idDocumentoOrigem`; código único por código + revisão (decisão 0004) | F7 | Por começar |
| F9 | Offline e fila de envio | Rascunho local, faixa offline, fila com intervalo crescente, chave de idempotência por evento gerada no cliente | F8 | Por começar |
| F10 | Exportação CSV | Do Painel filtrada ou completa (P-18, P-19) | F9 | Por começar |
| F11 | Administração | Áreas e tipos (ordem alfabética), complemento da tela de pessoas | F10 | Por começar |
| F12 | Importação + validação paralela | Preserva IDs e histórico; comparação tela por tela | F11 | Por começar |

## Correções pós-QA (concluídas em 2026-09-29)

| Defeito | Descrição | Corrigido por | Validação |
|---|---|---|---|
| B1 | "Cancelar" ambíguo (fechar vs. cancelar documento) | Renomeado para "Cancelar documento" em `apps/web/src/componentes/DialogoCancelar.tsx` | 4 testes em `TelaPainel.test.tsx` + `DetalhesDocumento.test.tsx` |
| B2 | Rodapé com 7 botões em 2 linhas | Implementado `MAXIMO_ACOES_RAPIDAS = 1`; rodapé final: principal, "Atualizar etapa", "Cancelar documento", "Reprogramar" (vencido), "Reativar" (cancelado), Fechar | Captura `detalhes-acoes-claro.png` (1440px, rodapé enxuto) |
| B3 | Seletor `.titulo` duplicado em 2 arquivos CSS | Unificado em `ColunaKanban.module.css` | `npm run typecheck`, `npm test` (490/490) |
| B4 | Datas inconsistentes na vitrine (`DOC-P4`) | Recebido 40 dias atrás, prazo original −10 dias, reprogramado −9 dias para −2 dias, eventos próprios (CRIACAO, STATUS, REPROGRAMACAO) | e2e status.spec.ts, captura `painel-planner-*` |

## Lacunas decididas pelo menor risco (registrar ou reverter)

Anotadas no `f5-api-status.md` (seção "O que ficou pendente", itens 1–5). Aprovadas pelo Eric no contrato F5 seção 13 ou acopladas a decisões existentes.

| Item | Descrição | Impacto | Próximo passo | Quem decide |
|---|---|---|---|---|
| Documento sem prazo (importados) | Pode ser reprogramado mesmo sem prazo vencido; é a única forma de ganhar prazo | Baixo (raro, só importados) | Se rejeitar: alterar `podeReprogramarAgora` em `packages/compartilhado/src/documentos.ts` | Eric (confirmar ou reverter) |
| Duplo clique em "Aprovar"/"Cancelar" | Reenvio responde 200 (idempotente) em vez de 409; checa versão depois do estado final | Mitigado (preHandler `exigir`, formulário com disabled) | Acompanhar em testes e produção | Eric + Claude (QA) |
| `statusDeReativacao` com dado corrompido | Trata `statusAnterior` nulo, 'Cancelado' ou 'Aprovado' como reserva 'Recebido' | Muito baixo (proteção) | Manter como está | Eric (confirmar) |
| Busca por responsável no Painel | Interface deve trocar rótulo de "Buscar por título, código, remetente" para "…responsável" (F3) | Já feito em `apps/web/src/telas/TelaPainel.tsx` | Validar no teste de busca | Claude |
| `EventoHistorico.responsavelId` | Ganhou coluna (contrato só cita documentos.responsavel_id); idempotência da transição precisa dele | Implementado e testado | Nenhum | — |

## Pendências técnicas (não bloqueiam F6–F12)

| Item | Descrição | Fatia esperada | Ação recomendada |
|---|---|---|---|
| Chave de idempotência por evento | F5 usa versão + último evento; F9 deve usar `HIST-uuid` gerado no cliente (contrato F5, 3.6) | F9 | Criar migração `0006_chave_idempotencia.sql` |
| Upload de arquivos em memória | Até ~120 MB por requisição; trocar por streaming | Produção | Decisão e escopo (antes do deploy) |
| Regra "só adia" da reprogramação | Ficou inalcançável após decisão 0015 (prazo vencido é anterior a hoje); validação fica morta em `validarNovoPrazo` | Limpeza técnica (sem pressa) | Remover em F6 ou manter como documentação |
| Download de arquivos em memória | Até 20 MB; trocar por streaming | Produção | Decisão e escopo |
| Histórico sem paginação | Pode ficar lento com centenas de eventos | F12 (importação em massa) | Implementar `?apos=` na rota |
| Sem verificação de antivírus | Arquivos não são escaneados | Segurança (futuro) | Avaliar com TI antes da produção |
| Registros de acesso sem tela | Tabela `registros_acesso_arquivos` gravada, sem interface | Auditoria (futuro) | Criar tela em módulo separado |

## Perguntas em aberto com o Eric

| Pergunta | Contexto | Urgência |
|---|---|---|
| Contas de teste do Entra | Script `scripts/entra/criar-contas-teste.ps1` pronto, aguarda execução no locatário de teste (cria `teste.qualidade`, `teste.solicitante`, `teste.leitor`) | Alta (validação F5) |
| Painel próprio para "visualizador" | Ideia do Eric (2026-09-29): painel diferente do Kanban para quem só acompanha; até lá, Solicitante usa Painel travado na sua área | Baixa (pós-Fundação) |

## Resumo de validação

- **Typecheck:** 490 testes, build e verificação de segredos ✓
- **E2E:** 99 aprovados (39 capturas); test status.spec.ts com 19 casos ✓
- **Roteiro do Eric:** 11 passos em `docs/estado-atual.md` seção da F5 (pendente)
- **CLAUDE.md:** Atualizado com convenções da F5 ✓
- **CHANGELOG:** Linha datada da F5 ✓
- **Contratos:** F5 aprovado pelo Eric (seção 13) ✓

---

**Próximo:** Eric roda o roteiro; se "F5 validada", marcar no plano e iniciar F6 (edição de dados).

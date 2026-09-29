# 0014 — Download na tramitação, nome do arquivo e versões (substitui a decisão 0013)

- **Data:** 2026-09-29
- **Status:** Aprovada pelo Eric
- **Substitui:** a decisão [0013](0013-visualizador-marca-dagua-e-registro-de-acesso.md), exceto o registro de acesso (item 3 abaixo). O Eric esclareceu que a marca d'água e o visualizador eram do **repositório de documentos do Vigen**, não da tramitação.

## Decisão
1. **Sem marca d'água e sem visualizador de PDF** na tramitação. O PDF é baixado direto.
2. **Quem baixa (ação `baixarArquivo`):** Administrador, Qualidade e Solicitante (só documentos da sua área). Leitor **não** baixa.
3. **Registro de acesso mantido:** cada download grava um registro imutável (tabela `registros_acesso_arquivos`, migração 0004). O tipo VISUALIZACAO fica previsto no banco, mas sem uso.
4. **Nome do arquivo principal baixado:** `[código]-[título]_[revisão]=[versão].[extensão]`, ex.: `PR-QUA-0010-Procedimento de auditoria interna_1=3.pdf`. Título inteiro, só sem caracteres que o Windows não aceita. Sem código: `SEM-CODIGO-[título]_[revisão]=[versão]`. **Anexos** mantêm o nome original.
5. **Versões do arquivo (F7):** quem altera um arquivo envia uma **nova versão** com justificativa obrigatória; a versão sobe em ordem crescente (1, 2, 3…), a anterior nunca é apagada, e a linha do tempo mostra quem enviou, quando e por quê. Podem enviar: Qualidade (e Administrador) e o Solicitante da área quando o documento estiver devolvido a ela. Até a F7, todo arquivo está na versão 1.
6. **Abrir Word e Excel no Office Online:** depende do SharePoint/OneDrive (os arquivos hoje ficam em pasta local, decisão 0003). Fica para a fatia de integração com o SharePoint; até lá, só "Baixar".

## Consequências
- API da F4: remover a marca d'água (`pdf-lib`), a rota de visualização e o prefixo "COPIA-NAO-CONTROLADA_"; ajustar `pode` e o nome do download.
- F7 passa a incluir o versionamento de arquivos (migração própria).

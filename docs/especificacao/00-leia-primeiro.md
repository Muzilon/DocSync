# Leia primeiro — DocFlow, reconstrução do zero

Este é o pacote de especificação para reconstruir o DocFlow **num repositório novo**, numa conversa nova, com outra ferramenta de codificação. Não é código, é a base de conhecimento para começar do zero sem perder o que já foi aprendido nas duas tentativas anteriores.

## Como usar este pacote

Cole este arquivo e os outros cinco no início da conversa nova, nesta ordem de leitura:

1. **[01 — Visão de produto e lições aprendidas](01-visao-produto-e-licoes-aprendidas.md).** Comece por aqui. Explica o que é o DocFlow, quem é o dono do produto e — mais importante — o que aconteceu nas duas tentativas anteriores e o que não fazer de novo.
2. **[02 — Modelo de dados e integrações](02-modelo-de-dados-e-integracoes.md).** As entidades do sistema, a identidade estável dos documentos, e o padrão de sincronização com a nuvem que já foi validado em produção e deve ser reaproveitado, não reinventado.
3. **[03 — Guia de preenchimento e fluxos](03-guia-de-preenchimento-e-fluxos.md).** O comportamento esperado de cada tela, campo a campo, e a lista de problemas de comportamento a não repetir.
4. **[04 — Design system](04-design-system.md).** Paleta, tipografia, componentes e a barra lateral estática (ver abaixo). Tem também o arquivo do Figma com o design de referência.
5. **[05 — Backlog de módulos](05-backlog-de-modulos.md).** As 14 ideias de funcionalidade já pensadas, priorizadas, para construir depois da base.
6. **[06 — Opções de stack](06-opcoes-de-stack.md).** As alternativas de tecnologia para a reconstrução, com prós e contras, sem uma decisão fechada — isso é conversa para a nova sessão, com o Eric.

## O ponto mais importante deste pacote

O DocFlow já funcionou bem uma vez. A versão em JavaScript puro, com os ajustes de sincronização, acessibilidade e um primeiro módulo de indicadores, provou que o modelo de dados e o fluxo de aprovação de documentos fazem sentido. **O problema nunca foi a ideia do produto — foi o processo de reescrita.** Uma tentativa de migração para React/TypeScript apagou essa versão de uma vez só, sem validar a nova por etapas, e saiu incompleta.

A reconstrução do zero não deve repetir isso. Confira as regras da seção 5 do documento 01 antes de escrever a primeira linha de código.

## Design no Figma

O arquivo com o design de referência está em:

**https://www.figma.com/design/N81a9PbiHbGLvuR5wG3qwW**

Ele traz: o componente da barra lateral estática (a versão simples, sem colapso e sem animação, que o Eric pediu de volta), as telas de Login, Painel (Kanban) e Novo Documento com esse design aplicado, e três conceitos de baixa fidelidade para os módulos novos (Indicadores SGI, Minha Fila, Portal do SGI). É um ponto de partida visual, não um arquivo de componentes prontos para produção — refine antes de implementar.

## O que NÃO está neste pacote

- Código. Nenhum arquivo `.js`, `.ts`, `.html` ou `.css` do projeto anterior foi copiado para cá — de propósito, para forçar uma implementação nova, não uma cópia.
- Segredos: nenhuma URL de webhook nem senha real aparece em nenhum documento.
- Uma decisão de stack fechada — isso é para decidir na conversa nova.

## Onde ficam os detalhes técnicos da versão anterior

Se a nova conversa precisar consultar como algo funcionava exatamente no código antigo (não recomendado como ponto de partida, mas útil como referência pontual), o repositório original continua em `tramitacao_de_documentos`, com a documentação completa em `doc_projeto/` e o histórico em `CHANGELOG.md`.

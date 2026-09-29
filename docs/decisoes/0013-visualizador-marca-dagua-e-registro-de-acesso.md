# 0013 — Visualizador de PDF, marca d'água "CÓPIA NÃO CONTROLADA" e registro de acesso a arquivos

- **Data:** 2026-09-29
- **Status:** Aprovada pelo Eric (respostas ao contrato da F4). O item 5 aguarda confirmação.
- **Muda:** o contrato da F4 (seção 8, pontos 3 e 4) e acrescenta duas bibliotecas à stack (decisão 0001).

## Contexto
No SGI, a cópia válida (controlada) de um documento é a que está no sistema. Qualquer cópia baixada ou impressa precisa se identificar como **não controlada**, e a Qualidade precisa saber quem acessou os arquivos.

## Decisão
1. **Visualizador de PDF dentro do DocSync:** o botão "Visualizar" abre o PDF num visualizador próprio, dentro de um diálogo (páginas renderizadas pelo `pdfjs-dist`). O PDF não é aberto como arquivo solto numa aba do navegador.
2. **Marca d'água:** todo PDF entregue pelo sistema, no visualizador ou no download, recebe em **cada página**, no fundo, o texto **"CÓPIA NÃO CONTROLADA"** em diagonal, com cerca de **60% de transparência** (opacidade ≈ 0,4). A marca é aplicada **no servidor**, na hora da entrega (biblioteca `pdf-lib`). O arquivo original guardado no armazenamento **nunca é alterado**.
3. **Download:** só baixar (sem abrir o arquivo solto no navegador). Vale para todos os perfis que podem baixar (Administrador, Qualidade, Solicitante da sua área e Leitor, ação `baixarArquivo`).
4. **Registro de acesso:** cada visualização e cada download grava um registro **imutável** (tabela própria, gatilho que bloqueia UPDATE, DELETE e TRUNCATE): quem (do token), quando, documento, arquivo e tipo (VISUALIZACAO ou DOWNLOAD). Não vai para a linha do tempo de tramitação. A tela para consultar esses registros fica para uma fatia futura (Administração/Auditoria); até lá, eles só ficam gravados.
5. **Arquivos que não são PDF** (Word, Excel e imagens), proposta a confirmar: sem visualizador e sem marca d'água (o formato não permite aplicar a marca com segurança), download registrado igual e nome do arquivo baixado começando com "COPIA-NAO-CONTROLADA_". Converter para PDF fica como ideia futura.

## Consequências
- Novas dependências: `pdf-lib` (API) e `pdfjs-dist` (web), ambas de código aberto e sem chamada externa.
- Migração nova para a tabela de registros de acesso.
- Um PDF com senha ou corrompido não recebe a marca: o sistema recusa a entrega com a mensagem "arquivo_indisponivel", nunca entrega sem marca.
- O botão "Reprogramar" também aparece dentro dos detalhes já na F4 (resposta 5 do Eric).

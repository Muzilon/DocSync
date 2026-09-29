# 0008 — Locatário Entra ID de teste para a construção

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric

## Contexto
O Eric não tem permissão para registrar aplicativos no Entra ID da Monto, e a TI não será acionada por enquanto (decisão 0003: testes locais). A F1 exige login real (decisão 0007).

## Opções
1. Registro no locatário da Monto: sem permissão.
2. **Locatário Entra ID gratuito de teste, separado da Monto:** login real, com contas de teste `@<nome>.onmicrosoft.com`. Escolhida.
3. Login simulado só no ambiente local: descartado, porque contraria a especificação (R2).

## Decisão
- O Eric cria um locatário Entra ID Free com uma conta Microsoft **pessoal** (não a da Monto), registra o aplicativo SPA de desenvolvimento (retorno `http://localhost:5173`, escopo `acesso_usuario`) e cria usuários de teste.
- O tenant ID e o client ID vão só para o `.env` local (não versionado). Senhas das contas de teste nunca vão para o repositório, chat, ticket ou documentação.
- O código não sabe qual locatário é: trocar para o locatário da Monto no futuro é só trocar os dois IDs no `.env` (mais o registro feito pela TI).

## Consequências
- Nenhum dado real da Monto no locatário de teste; só pessoas fictícias.
- Antes de qualquer uso real, o registro no locatário da Monto passa a ser pendência obrigatória (a registrar quando a TI for acionada).
- Pontos não confirmados na pesquisa: se o portal exige cartão para criar o locatário; comportamento de renovação de sessão (a medir na F1).

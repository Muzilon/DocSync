# 0002 — Fonte da verdade: PostgreSQL próprio

- **Data:** 2026-09-28
- **Status:** Aprovada pelo Eric

## Contexto
O sistema antigo usava Excel no SharePoint via Power Automate, sem transação, chave única nem controle de acesso ([02, seção 5](../especificacao/02-modelo-de-dados-e-integracoes.md)).

## Opções
SharePoint Lists (limite de 5 mil itens na exibição, consultas limitadas), Dataverse (licença por usuário) ou banco próprio atrás de API.

## Decisão
**PostgreSQL próprio atrás da API** é a fonte da verdade. O Excel passa a ser só importação (migração da base antiga, fatia F12) e exportação (CSV, fatia F10). Concorrência otimista por número de versão em cada documento; gravações idempotentes pelo ID.

## Consequências
Os padrões do documento 02 (ID estável, fila, histórico acumulativo, atualizar nunca insere) continuam valendo. O Power Automate deixa de ser necessário.

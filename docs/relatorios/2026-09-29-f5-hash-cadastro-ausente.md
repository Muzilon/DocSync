# Relatório — F5 — Coluna hash_cadastro ausente no banco local

- **Data:** 2026-09-29
- **Agente / modelo:** agente-arquitetura-dados / Fable
- **Fatia:** F5 (correção)

## O que foi feito

**Causa.** `hash_cadastro` nasce em `apps/api/migracoes/0002_documentos.sql`, presente desde o primeiro commit (5f2f437, 2026-09-29 04:49 -03). O banco do Eric (`dados-locais/banco`, lido numa cópia) registra a 0002 aplicada em 2026-09-29 07:25 UTC (04:25 -03), 24 minutos antes desse commit. Ou seja, a 0002 foi aplicada numa versão anterior do arquivo, sem a coluna, e o arquivo foi editado depois (antes de qualquer commit). O executor de migrações só olha o número da versão e por isso não percebeu. Migrações 0001 a 0005 constam como aplicadas; `documentos` tem 0 linhas. Comparei o esquema completo (colunas, índices, restrições, gatilhos) do banco real com um banco migrado do zero: a única diferença é `hash_cadastro`.

**Correção.** Migração nova `0006_hash_cadastro_reparo.sql` (plano de volta no topo): `ADD COLUMN IF NOT EXISTS`, preenchimento de linhas existentes com `legado:<id>` (nunca coincide com SHA-256; reenvio de um legado responde "ID já existe" em vez de falsa idempotência) e `SET NOT NULL`. Em banco novo não muda nada. A 0002 não foi tocada. Testada na cópia do banco real: 0006 aplica e a coluna fica NOT NULL.

**Executor.** Não alterado. Sugestão (decisão pequena, não feita): gravar checksum de cada migração e avisar na subida quando divergir. Só evitaria repetir o caso; não conserta o banco.

**Google Drive.** Existem no repo `docs/decisoes/0016-armazenamento-google-drive.md` e `apps/api/src/armazenamento/google-drive.ts` (não foram usados nem alterados aqui).

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| apps/api/migracoes/0006_hash_cadastro_reparo.sql | novo |
| apps/api/src/migracao-0006.test.ts | novo: banco antigo -> atual, legado preenchido, cadastro 201 e reenvio 200; idempotência da 0006 |
| CHANGELOG.md | linha datada |

`npm test` (493 passam) e `npm run typecheck` ok.

## O que ficou pendente

- Eric reiniciar a API (ver abaixo). Sem commit feito.
- Decidir se o executor passa a checar checksum.

## Como validar

1. Parar a API (`npm run dev`), copiar `dados-locais/banco` para outro lugar (já existe cópia em `dados-locais/backup-2026-09-29-antes-0006`, feita com a API rodando; refaça com a API parada para garantir consistência).
2. Subir a API de novo: a 0006 roda sozinha na subida. Não há nada a fazer manualmente no banco.
3. Registrar um documento pela interface: deve dar certo.
4. Volta: parar a API, apagar `dados-locais/banco` e restaurar a cópia.

## Decisões tomadas ou necessárias

Nenhuma decisão grande. Checksum de migrações: opcional, a critério do Eric.

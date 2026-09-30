-- 0006 — Reparo: garante documentos.hash_cadastro em bancos cuja 0002 foi aplicada antes de
-- a coluna entrar no arquivo (a 0002 foi editada depois de aplicada, antes do primeiro commit;
-- ver docs/relatorios/2026-09-29-f5-hash-cadastro-ausente.md).
-- SQL padrão do PostgreSQL. Idempotente: em banco criado do zero (coluna já existe e é
-- NOT NULL) não muda nada. Aplicada uma única vez, dentro de uma transação.
--
-- Plano de volta (só com aprovação do Eric, depois de copiar a pasta BANCO_PASTA; a API
-- atual depende da coluna, então só faz sentido junto de uma versão antiga do código):
--   ALTER TABLE documentos DROP COLUMN hash_cadastro;
--   DELETE FROM migracoes WHERE versao = '0006';

ALTER TABLE documentos ADD COLUMN IF NOT EXISTS hash_cadastro text;

-- Documentos que já existiam não têm o resumo do pedido original. Valor marcador que nunca
-- coincide com um SHA-256 em hexadecimal: reenviar o cadastro de um deles responde "ID já
-- existe" (409) em vez de fingir idempotência com dados que não temos.
UPDATE documentos SET hash_cadastro = 'legado:' || id WHERE hash_cadastro IS NULL;

ALTER TABLE documentos ALTER COLUMN hash_cadastro SET NOT NULL;

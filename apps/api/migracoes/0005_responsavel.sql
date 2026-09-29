-- 0005 — Responsável pela etapa (fatia F5; contrato docs/contratos/f5-mudanca-de-status.md,
-- seção 7, com a resposta 2 do Eric na seção 11).
-- SQL padrão do PostgreSQL. Aplicada uma única vez, dentro de uma transação.
--
-- Plano de volta (só com aprovação do Eric, depois de exportar os dados; os eventos de
-- histórico são imutáveis e o nome do responsável continua gravado neles em `responsavel`):
--   DROP INDEX eventos_historico_documento_tipo_status;
--   ALTER TABLE eventos_historico DROP COLUMN responsavel_id;
--   ALTER TABLE documentos DROP COLUMN responsavel_id;
--   DELETE FROM migracoes WHERE versao = '0005';

-- documentos: responsável atual pela etapa (pessoa cadastrada; NULL em Recebido, Aprovado e
-- importados). Sem dados a preencher: documentos existentes ficam sem responsável.
ALTER TABLE documentos ADD COLUMN responsavel_id text REFERENCES usuarios (id);

-- eventos_historico: ID do responsável ao lado do nome já gravado (o nome fica como estava
-- no momento). ADD COLUMN é DDL: o gatilho de imutabilidade bloqueia UPDATE/DELETE/TRUNCATE
-- de linhas, não a coluna nova; as linhas existentes ficam com NULL sem passar pelo gatilho.
ALTER TABLE eventos_historico ADD COLUMN responsavel_id text REFERENCES usuarios (id);

-- Subconsultas do Painel (início da revisão, aprovação, devoluções, último cancelamento).
CREATE INDEX eventos_historico_documento_tipo_status ON eventos_historico (id_documento, tipo_acao, status);

-- Nenhuma restrição CHECK muda: 'STATUS' e 'CANCELAMENTO' já constam desde a 0002.

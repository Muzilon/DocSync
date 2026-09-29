-- 0003 — Prazo automático e reprogramação (fatia F3; decisões 0011 e 0012;
-- contrato docs/contratos/f3-painel-kanban.md, seção 2.3).
-- SQL padrão do PostgreSQL. Aplicada uma única vez, dentro de uma transação.
--
-- Plano de volta (só com aprovação do Eric, depois de exportar os dados):
--   UPDATE documentos SET data_revisao = NULL
--    WHERE id IN (SELECT id_documento FROM migracao_0003_prazos) AND qtd_reprogramacoes = 0;
--   DROP TABLE migracao_0003_prazos;
--   ALTER TABLE documentos DROP COLUMN qtd_reprogramacoes;
--   ALTER TABLE documentos DROP COLUMN reprogramado;
--   -- Eventos REPROGRAMACAO são imutáveis: a restrição antiga só volta se não houver nenhum
--   -- (SELECT count(*) FROM eventos_historico WHERE tipo_acao = 'REPROGRAMACAO' deve ser 0).
--   ALTER TABLE eventos_historico DROP CONSTRAINT eventos_historico_tipo_acao_check;
--   ALTER TABLE eventos_historico ADD CONSTRAINT eventos_historico_tipo_acao_check
--     CHECK (tipo_acao IN ('CRIACAO', 'STATUS', 'EDICAO', 'ANEXO', 'CANCELAMENTO'));
--   DELETE FROM migracoes WHERE versao = '0003';

-- documentos: etiqueta e contagem de reprogramações (justificativa fica só no evento).
ALTER TABLE documentos ADD COLUMN reprogramado boolean NOT NULL DEFAULT false;
ALTER TABLE documentos ADD COLUMN qtd_reprogramacoes integer NOT NULL DEFAULT 0 CHECK (qtd_reprogramacoes >= 0);

-- Tabela auxiliar que guarda quais documentos receberam prazo por esta migração
-- (torna o plano de volta exato). Não é lida pela aplicação.
CREATE TABLE migracao_0003_prazos (id_documento text PRIMARY KEY REFERENCES documentos (id));
INSERT INTO migracao_0003_prazos SELECT id FROM documentos WHERE data_revisao IS NULL;

-- Documentos sem prazo: data do cadastro (fuso de São Paulo) + 30 dias corridos (decisão 0011).
-- Documentos com prazo próprio (importados, F12) não são tocados.
UPDATE documentos
   SET data_revisao = (criado_em AT TIME ZONE 'America/Sao_Paulo')::date + 30
 WHERE data_revisao IS NULL;

-- Novo tipo de evento no histórico.
ALTER TABLE eventos_historico DROP CONSTRAINT eventos_historico_tipo_acao_check;
ALTER TABLE eventos_historico ADD CONSTRAINT eventos_historico_tipo_acao_check
  CHECK (tipo_acao IN ('CRIACAO', 'STATUS', 'EDICAO', 'ANEXO', 'CANCELAMENTO', 'REPROGRAMACAO'));

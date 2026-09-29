-- 0004 — Registro imutável de acesso a arquivos (fatia F4; decisão 0013, item 4;
-- contrato docs/contratos/f4-detalhes-historico.md, seção 9, resposta 3).
-- SQL padrão do PostgreSQL. Aplicada uma única vez, dentro de uma transação.
--
-- Plano de volta (só com aprovação do Eric, e depois de exportar os registros, que são
-- evidência de auditoria e não voltam):
--   DROP TABLE registros_acesso_arquivos;
--   DELETE FROM migracoes WHERE versao = '0004';

-- Cada visualização e cada download de um arquivo grava uma linha: quem (do token),
-- quando, documento, arquivo e tipo. Fora da linha do tempo de tramitação; sem tela
-- de consulta nesta fatia. Só INSERT: UPDATE, DELETE e TRUNCATE são bloqueados.
CREATE TABLE registros_acesso_arquivos (
  id           text PRIMARY KEY CHECK (id LIKE 'ACS-%'),
  -- Ordem de gravação (desempate estável quando a hora coincide).
  ordem        bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id_documento text NOT NULL REFERENCES documentos (id),
  id_arquivo   text NOT NULL REFERENCES arquivos_documento (id),
  tipo         text NOT NULL CHECK (tipo IN ('VISUALIZACAO', 'DOWNLOAD')),
  -- Autor sempre da identidade autenticada; o nome é guardado como era no momento.
  autor_id     text NOT NULL REFERENCES usuarios (id),
  autor_nome   text NOT NULL,
  -- clock_timestamp(): hora real de cada INSERT, mesmo dentro da mesma transação.
  data_hora    timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX registros_acesso_arquivos_documento ON registros_acesso_arquivos (id_documento, ordem);
CREATE INDEX registros_acesso_arquivos_autor ON registros_acesso_arquivos (autor_id, ordem);

-- Reaproveita a função genérica de tabelas só-de-acréscimo criada na 0002.
CREATE TRIGGER registros_acesso_arquivos_imutavel
  BEFORE UPDATE OR DELETE ON registros_acesso_arquivos
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_registro_imutavel();

-- TRUNCATE não dispara gatilhos de linha: bloqueado à parte.
CREATE TRIGGER registros_acesso_arquivos_sem_truncate
  BEFORE TRUNCATE ON registros_acesso_arquivos
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_registro_imutavel();

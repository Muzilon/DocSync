-- 0001 — Áreas, usuários e auditoria de pessoas (fatia F1; decisões 0003, 0006 e 0007).
-- SQL padrão do PostgreSQL. Aplicada uma única vez, dentro de uma transação.
--
-- Plano de volta (só com aprovação do Eric, e depois de exportar os dados):
--   DROP TABLE auditoria_pessoas; DROP FUNCTION impedir_alteracao_auditoria();
--   DROP TABLE usuarios; DROP TABLE areas;
--   DELETE FROM migracoes WHERE versao = '0001';

CREATE TABLE areas (
  id        text PRIMARY KEY CHECK (id LIKE 'AREA-%'),
  nome      text NOT NULL UNIQUE,
  ativa     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Áreas iniciais (decisão 0006). A ordem de exibição é calculada (pt-BR), nunca a daqui.
INSERT INTO areas (id, nome) VALUES
  ('AREA-' || gen_random_uuid(), 'Comercial'),
  ('AREA-' || gen_random_uuid(), 'Custos'),
  ('AREA-' || gen_random_uuid(), 'Engenharia'),
  ('AREA-' || gen_random_uuid(), 'Qualidade'),
  ('AREA-' || gen_random_uuid(), 'Saúde Ocupacional'),
  ('AREA-' || gen_random_uuid(), 'Segurança do Trabalho'),
  ('AREA-' || gen_random_uuid(), 'Sistema de Gestão Ambiental'),
  ('AREA-' || gen_random_uuid(), 'Suprimentos');

CREATE TABLE usuarios (
  id            text PRIMARY KEY CHECK (id LIKE 'USR-%'),
  -- ID do objeto no Entra (claim oid). Nulo até o primeiro login (pré-cadastro).
  id_entra      text UNIQUE,
  nome          text NOT NULL,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  perfil        text CHECK (perfil IN ('Administrador', 'Qualidade', 'Solicitante', 'Leitor')),
  area_id       text REFERENCES areas (id),
  status        text NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo', 'Inativo')),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- Auditoria imutável: só INSERT. autor_id é um ID de usuário ou 'sistema'.
CREATE TABLE auditoria_pessoas (
  id         text PRIMARY KEY CHECK (id LIKE 'AUD-%'),
  -- Ordem de gravação (desempate estável quando a hora coincide).
  ordem      bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id_usuario text NOT NULL REFERENCES usuarios (id),
  autor_id   text NOT NULL,
  -- clock_timestamp(): hora real de cada INSERT, mesmo dentro da mesma transação.
  data_hora  timestamptz NOT NULL DEFAULT clock_timestamp(),
  campo      text NOT NULL,
  antes      text,
  depois     text
);

CREATE INDEX auditoria_pessoas_id_usuario ON auditoria_pessoas (id_usuario, ordem);

CREATE FUNCTION impedir_alteracao_auditoria() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria_pessoas é imutável: % não é permitido', TG_OP;
END;
$$;

CREATE TRIGGER auditoria_pessoas_imutavel
  BEFORE UPDATE OR DELETE ON auditoria_pessoas
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_auditoria();

-- TRUNCATE não dispara gatilhos de linha: bloqueado à parte.
CREATE TRIGGER auditoria_pessoas_sem_truncate
  BEFORE TRUNCATE ON auditoria_pessoas
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_auditoria();

-- 0002 — Tipos de documento, documentos, eventos de histórico e arquivos (fatia F2;
-- documento 02, seções 1 a 3; decisões 0002 e 0004).
-- SQL padrão do PostgreSQL. Aplicada uma única vez, dentro de uma transação.
--
-- Plano de volta (só com aprovação do Eric, e depois de exportar os dados e copiar
-- a pasta ARMAZENAMENTO_PASTA; os arquivos em disco não são apagados por este plano):
--   DROP TABLE arquivos_documento;
--   DROP TABLE eventos_historico;
--   DROP FUNCTION impedir_alteracao_registro_imutavel();
--   DROP TABLE documentos;
--   DROP TABLE tipos_documento;
--   DELETE FROM migracoes WHERE versao = '0002';

-- Lista única de tipos (P-10), inclusive "Memorial Descritivo".
-- Tipo é inativado, nunca apagado. A ordem de exibição é calculada (pt-BR).
CREATE TABLE tipos_documento (
  id        text PRIMARY KEY CHECK (id LIKE 'TIPO-%'),
  nome      text NOT NULL UNIQUE,
  ativo     boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tipos_documento (id, nome) VALUES
  ('TIPO-' || gen_random_uuid(), 'PR - Procedimento'),
  ('TIPO-' || gen_random_uuid(), 'MP - Mapas / Riscos'),
  ('TIPO-' || gen_random_uuid(), 'IT - Instrução de Trabalho'),
  ('TIPO-' || gen_random_uuid(), 'ET - Especificação Técnica'),
  ('TIPO-' || gen_random_uuid(), 'RL - Relatório'),
  ('TIPO-' || gen_random_uuid(), 'AT - Ata de Reunião'),
  ('TIPO-' || gen_random_uuid(), 'LD - Lista de Documentos'),
  ('TIPO-' || gen_random_uuid(), 'Memorial Descritivo');

CREATE TABLE documentos (
  -- ID gerado pelo cliente ('DOC-' + UUID) antes do primeiro envio; nunca muda nem é
  -- reaproveitado. Dados migrados podem ter 'DOC-' + código (documento 02, seção 2.8).
  id                     text PRIMARY KEY CHECK (id LIKE 'DOC-%'),
  codigo                 text CHECK (codigo IS NULL OR btrim(codigo) <> ''),
  titulo                 text NOT NULL CHECK (btrim(titulo) <> ''),
  status                 text NOT NULL CHECK (status IN (
                           'Recebido',
                           'Em revisão da qualidade',
                           'Em revisão junto à área',
                           'Em Revisão',
                           'Devolvido para área para revisão',
                           'Devolvido para correção',
                           'Em revisão do solicitante',
                           'Para aprovação da área solicitante',
                           'Para aprovação qualidade',
                           'Aprovado',
                           'Cancelado')),
  tipo_documento_id      text NOT NULL REFERENCES tipos_documento (id),
  revisao                integer NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  data_recebimento       date NOT NULL,
  -- Prazo da tramitação.
  data_revisao           date,
  remetente              text NOT NULL,
  area_id                text NOT NULL REFERENCES areas (id),
  disciplina             text,
  observacao             text,
  -- Título sanitizado, só para exibição. A pasta real é nomeada pelo id (P-07).
  nome_pasta             text NOT NULL,
  nome_arquivo_principal text NOT NULL,
  qtd_anexos             integer NOT NULL DEFAULT 0 CHECK (qtd_anexos >= 0),
  -- Revisão = documento novo vinculado ao de origem (decisão 0004).
  id_documento_origem    text REFERENCES documentos (id),
  -- Concorrência otimista (decisão 0002).
  versao                 integer NOT NULL DEFAULT 1 CHECK (versao >= 1),
  criado_por             text NOT NULL REFERENCES usuarios (id),
  -- Resumo (SHA-256) do pedido de cadastro normalizado (dados + papel, nome e conteúdo
  -- dos arquivos). Serve à idempotência: reenvio igual do mesmo autor → mesmo documento,
  -- mesmo depois de edições futuras.
  hash_cadastro          text NOT NULL,
  criado_em              timestamptz NOT NULL DEFAULT now(),
  data_modificacao       timestamptz NOT NULL DEFAULT now()
);

-- Código único na combinação código + revisão (decisão 0004), sem diferenciar
-- maiúsculas. Documentos sem código não entram na regra.
CREATE UNIQUE INDEX documentos_codigo_revisao ON documentos (lower(codigo), revisao) WHERE codigo IS NOT NULL;
CREATE INDEX documentos_area_criado ON documentos (area_id, criado_em DESC);
CREATE INDEX documentos_criado ON documentos (criado_em DESC);

-- Histórico acumulativo e imutável (documento 02, seções 1.2 e 4.3).
CREATE TABLE eventos_historico (
  id              text PRIMARY KEY CHECK (id LIKE 'HIST-%'),
  -- Ordem de gravação (desempate estável quando a hora coincide).
  ordem           bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id_documento    text NOT NULL REFERENCES documentos (id),
  codigo          text,
  tipo_acao       text NOT NULL CHECK (tipo_acao IN ('CRIACAO', 'STATUS', 'EDICAO', 'ANEXO', 'CANCELAMENTO')),
  status          text NOT NULL CHECK (status IN (
                    'Recebido', 'Em revisão da qualidade', 'Em revisão junto à área', 'Em Revisão',
                    'Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante',
                    'Para aprovação da área solicitante', 'Para aprovação qualidade', 'Aprovado', 'Cancelado')),
  status_anterior text CHECK (status_anterior IS NULL OR status_anterior IN (
                    'Recebido', 'Em revisão da qualidade', 'Em revisão junto à área', 'Em Revisão',
                    'Devolvido para área para revisão', 'Devolvido para correção', 'Em revisão do solicitante',
                    'Para aprovação da área solicitante', 'Para aprovação qualidade', 'Aprovado', 'Cancelado')),
  -- clock_timestamp(): hora real de cada INSERT, mesmo dentro da mesma transação.
  data_hora       timestamptz NOT NULL DEFAULT clock_timestamp(),
  destino         text,
  responsavel     text,
  -- Autor sempre da identidade autenticada; o nome é guardado como era no momento.
  autor_id        text NOT NULL REFERENCES usuarios (id),
  autor_nome      text NOT NULL,
  detalhes        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(detalhes) = 'array'),
  observacao      text
);

CREATE INDEX eventos_historico_documento ON eventos_historico (id_documento, ordem);

-- Função genérica para tabelas só-de-acréscimo (a de 0001 cita auditoria_pessoas no
-- texto e migração aplicada não é editada).
CREATE FUNCTION impedir_alteracao_registro_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é imutável: % não é permitido', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER eventos_historico_imutavel
  BEFORE UPDATE OR DELETE ON eventos_historico
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_registro_imutavel();

-- TRUNCATE não dispara gatilhos de linha: bloqueado à parte.
CREATE TRIGGER eventos_historico_sem_truncate
  BEFORE TRUNCATE ON eventos_historico
  FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_registro_imutavel();

-- Arquivos do documento, guardados em ARMAZENAMENTO_PASTA/<id do documento>/
-- (principal na raiz, anexos em Anexos/).
CREATE TABLE arquivos_documento (
  id              text PRIMARY KEY CHECK (id LIKE 'ARQ-%'),
  id_documento    text NOT NULL REFERENCES documentos (id),
  papel           text NOT NULL CHECK (papel IN ('principal', 'anexo')),
  -- Nome como veio do usuário (só exibição).
  nome_original   text NOT NULL,
  -- Caminho relativo à pasta do documento (ex.: 'Anexos/planilha.xlsx'), sanitizado.
  nome_armazenado text NOT NULL,
  tamanho         bigint NOT NULL CHECK (tamanho > 0),
  tipo_mime       text NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_documento, nome_armazenado)
);

-- Um único arquivo principal por documento (P-02).
CREATE UNIQUE INDEX arquivos_documento_um_principal ON arquivos_documento (id_documento) WHERE papel = 'principal';

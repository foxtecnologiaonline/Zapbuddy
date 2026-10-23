-- Busca semântica em notas e documentos + leitura do conteúdo de
-- imagem/PDF (2026-10, pedido explícito do dono do produto — antes o
-- ADR 0002 decisão 2 deixava documento só com busca por nome/legenda).
--
-- Reaproveita pgvector e text-embedding-3-small (1536 dim) da base de
-- conhecimento (migration 0011). `embedding` fica NULL quando a chave da
-- OpenAI não está configurada ou a chamada falha — a busca textual
-- (ILIKE em notas, tsvector em documentos) continua funcionando sozinha, e
-- o backfill horário do worker preenche o que ficou pra trás.
--
-- Documentos: extracted_text é uma descrição curta em português do que o
-- modelo LEU no arquivo (sem número de documento pessoal/cartão — ver
-- packages/core/src/documents/extract.ts); extracted_data guarda os campos
-- estruturados (tipo, estabelecimento, valor, datas). Nada disso vira
-- transação sozinho: gasto só existe via record_transaction.

create extension if not exists vector;

alter table notes add column if not exists embedding vector(1536);

alter table documents add column if not exists extracted_text text;
alter table documents add column if not exists extracted_data jsonb;
alter table documents add column if not exists embedding vector(1536);

-- search_tsv é coluna gerada: pra incluir extracted_text precisa ser
-- recriada (o índice GIN cai junto com a coluna e é refeito abaixo).
alter table documents drop column if exists search_tsv;
alter table documents add column search_tsv tsvector generated always as (
  to_tsvector(
    'portuguese',
    -- ponto/underscore/hífen viram espaço: sem isso o parser trata "cupom.jpg" como
    -- um token só e buscar "cupom" nunca achava o arquivo (já era assim na 0006).
    regexp_replace(coalesce(file_name, ''), '[._-]+', ' ', 'g') || ' ' || coalesce(caption, '') || ' ' || coalesce(extracted_text, '')
  )
) stored;
create index if not exists idx_documents_search_tsv on documents using gin (search_tsv);

-- Sem índice ivfflat/hnsw de propósito (mesmo raciocínio da 0011): a busca
-- é sempre filtrada por account_id, que já é seletivo (idx_notes_account_created
-- / idx_documents_account_created), então o scan sequencial dentro da conta
-- é pequeno.
create or replace function match_notes(
  p_account_id uuid,
  query_embedding vector(1536),
  match_count int,
  min_similarity float
)
returns table (id uuid, content text, created_at timestamptz, similarity float)
language sql stable
as $$
  select n.id, n.content, n.created_at, 1 - (n.embedding <=> query_embedding) as similarity
  from notes n
  where n.account_id = p_account_id
    and n.embedding is not null
    and 1 - (n.embedding <=> query_embedding) >= min_similarity
  order by n.embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_documents(
  p_account_id uuid,
  query_embedding vector(1536),
  match_count int,
  min_similarity float
)
returns table (
  id uuid,
  account_id uuid,
  uploaded_by_user_id uuid,
  storage_path text,
  file_name text,
  mime_type text,
  caption text,
  extracted_text text,
  extracted_data jsonb,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select d.id, d.account_id, d.uploaded_by_user_id, d.storage_path, d.file_name, d.mime_type,
         d.caption, d.extracted_text, d.extracted_data, d.created_at,
         1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where d.account_id = p_account_id
    and d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) >= min_similarity
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

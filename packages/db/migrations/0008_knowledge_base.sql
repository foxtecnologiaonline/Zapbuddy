-- Pesquisa autônoma e aprendizado contínuo (ver CLAUDE.md, amendamento
-- 2026-10) — exceção explícita ao gating de Fase 2/3, pedida pelo dono do
-- produto. Base de conhecimento que cresce com buscas do Tom (pergunta de
-- usuário, pesquisa proativa em background, apoio à categorização
-- financeira) e relatório periódico de erros de interpretação.

create extension if not exists vector;

-- Cache + RAG simples: antes de bater numa API de busca externa de novo, o
-- client (packages/core/src/llm/web-search/client.ts) confere se já existe
-- entrada recente com a mesma normalized_query. `embedding` é usado pra
-- recuperação por similaridade (função match_knowledge_entries abaixo) —
-- fica null se a chamada de embedding falhar, a entrada ainda serve de
-- cache exato por normalized_query.
create table if not exists knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('user_query', 'proactive_research', 'categorization')),
  query text not null,
  normalized_query text not null,
  summary text not null,
  source_urls text[] not null default '{}',
  embedding vector(1536),
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_knowledge_entries_normalized_query on knowledge_entries (normalized_query);
create index if not exists idx_knowledge_entries_created on knowledge_entries (created_at desc);

-- Índice ivfflat (busca aproximada por similaridade) fica pra uma migration
-- futura: ele precisa de uma massa de linhas + ANALYZE pra ter um plano bom,
-- e a tabela nasce vazia aqui. Até lá, match_knowledge_entries() faz scan
-- sequencial — aceitável no volume inicial desta feature.
create or replace function match_knowledge_entries(query_embedding vector(1536), match_count int)
returns table (
  id uuid,
  origin text,
  query text,
  summary text,
  source_urls text[],
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    id,
    origin,
    query,
    summary,
    source_urls,
    created_at,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_entries
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

alter table knowledge_entries enable row level security;

-- Relatório periódico (job interpretation-feedback) minerado de
-- tool_call_logs — "o principal insumo de debug de erros de interpretação
-- de linguagem natural" (CLAUDE.md). Só pra revisão humana: nada aqui
-- altera prompt ou comportamento sozinho.
create table if not exists interpretation_insights (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  summary text not null,
  stats jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_interpretation_insights_period on interpretation_insights (period_start desc);

alter table interpretation_insights enable row level security;

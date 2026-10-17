-- Fase 2 (docs/adr/0002): documentos com storage + busca textual (nome do
-- arquivo + legenda — sem OCR/extração de conteúdo, ver decisão 2 do ADR).

-- webhook_events.event_type precisa aceitar 'document' agora que o webhook
-- passa a tratar mensagens de documento/imagem como um tipo aceito, não mais
-- caindo em 'other' (ver apps/web/app/api/whatsapp/webhook/route.ts).
alter table webhook_events drop constraint if exists webhook_events_event_type_check;
alter table webhook_events add constraint webhook_events_event_type_check
  check (event_type in ('verify', 'text', 'audio', 'document', 'other', 'rejected'));

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  uploaded_by_user_id uuid references users(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  caption text,
  search_tsv tsvector generated always as (
    to_tsvector('portuguese', coalesce(file_name, '') || ' ' || coalesce(caption, ''))
  ) stored,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_account_created on documents (account_id, created_at desc);
create index if not exists idx_documents_search_tsv on documents using gin (search_tsv);

alter table documents enable row level security;

-- Bucket privado — acesso só via service-role (mesma defesa em profundidade
-- das tabelas: nenhuma policy pública/anon aqui).
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

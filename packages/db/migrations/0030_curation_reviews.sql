-- Curadoria das interações (docs/adr/0011): veredito de quem revisou cada caso da fila /admin/curadoria.
-- Idempotente. O código tolera esta tabela ainda não existir (a página avisa em vez de quebrar).
--
-- Sem FK pra tool_call_logs de propósito: o job de retenção apaga logs com mais de 90 dias e a revisão
-- precisa sobreviver a isso — por isso o `snapshot` (trecho do caso, já com CPF/e-mail/telefone mascarados)
-- é guardado junto, e não só o id.

create table if not exists curation_reviews (
  tool_call_log_id uuid primary key,
  signal text not null check (signal in ('undone', 'failed', 'corrected', 'category_fallback')),
  verdict text not null check (verdict in ('acertou', 'errou', 'ruido')),
  -- Pra onde o caso vai quando o Tom errou; nulo nos outros vereditos.
  destination text check (destination in ('prompt', 'categoria', 'bug', 'exemplo')),
  note text check (note is null or char_length(note) <= 500),
  snapshot jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default now(),
  constraint curation_destination_only_when_wrong check (
    (verdict = 'errou' and destination is not null) or (verdict <> 'errou' and destination is null)
  )
);

create index if not exists idx_curation_reviews_reviewed on curation_reviews (reviewed_at desc);

-- Mesma defesa em profundidade das outras tabelas: service-role bypassa RLS, isto só blinda contra uso
-- futuro acidental de uma chave anon/authenticated.
alter table curation_reviews enable row level security;

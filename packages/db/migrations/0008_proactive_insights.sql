-- Fase 3 (docs/adr/0003): insights proativos de IA — log serve tanto de
-- idempotência (nunca mais de 1 insight/dia por conta) quanto de auditoria.

create table if not exists proactive_insight_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  signal_type text not null check (signal_type in ('category_spike', 'monthly_pace')),
  summary text not null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_proactive_insight_logs_account_sent on proactive_insight_logs (account_id, sent_at desc);

alter table proactive_insight_logs enable row level security;

-- Admin do Tom: observabilidade operacional (visitas, erros, assinaturas).
-- Não é feature de produto do MVP (CLAUDE.md) — é instrumentação pra operar
-- o que já existe, por isso entra sem precisar revisitar o escopo travado.

-- Status de assinatura é manual por enquanto: não há billing/Open Finance
-- implementado (Fase 3, CLAUDE.md). Serve de placeholder editável à mão pelo
-- admin até existir gateway de pagamento real.
alter table users add column if not exists plan_status text not null default 'trial'
  check (plan_status in ('trial', 'active', 'canceled'));
alter table users add column if not exists plan_status_updated_at timestamptz;

-- Toda requisição que chega nos webhooks do WhatsApp (oficial ou Evolution),
-- aceita ou rejeitada — é o equivalente a "visita" pra um produto sem páginas
-- web: cada hit é um contato tentando falar com o Tom.
create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('cloud-api', 'evolution')),
  whatsapp_number text,
  event_type text not null check (event_type in ('verify', 'text', 'audio', 'other', 'rejected')),
  status text not null check (status in ('accepted', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_events_created on webhook_events (created_at desc);

-- Log genérico de erro de aplicação, fora do que já cabe em tool_call_logs
-- (que cobre só falha de tool call) — cobre webhook e worker.
create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('webhook', 'worker', 'orchestrator')),
  message text not null,
  detail jsonb,
  user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_error_logs_created on error_logs (created_at desc);

-- Mesma defesa em profundidade da 0002: service-role bypassa RLS, isto só
-- blinda contra uso futuro acidental de uma chave anon/authenticated.
alter table webhook_events enable row level security;
alter table error_logs enable row level security;

-- Novas capacidades do Tom (2026-10): listas, parcelamentos, memória de conversa
-- longa, log de mensagens proativas e preferências de rotinas. Idempotente
-- (if not exists) e sem dado destrutivo — pode rodar mais de uma vez.

-- Listas (compras, viagem, presentes...). `name_key` é o nome normalizado (sem
-- acento/caixa) e é o que garante uma lista por nome na conta.
create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  name_key text not null,
  created_at timestamptz not null default now(),
  unique (account_id, name_key)
);
alter table lists enable row level security;

create table if not exists list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_list_items_list on list_items (list_id, done, created_at);
alter table list_items enable row level security;

-- Parcelamentos que a PESSOA informou ("10x de 120"). Nunca vira transação
-- sozinho: é só o calendário do que já está comprometido nos próximos meses.
create table if not exists installment_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  description text not null,
  installment_cents integer not null check (installment_cents > 0),
  total_installments smallint not null check (total_installments between 1 and 120),
  -- Primeiro dia do mês da 1ª parcela.
  first_due_month date not null,
  due_day smallint not null check (due_day between 1 and 31),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists idx_installment_plans_account on installment_plans (account_id, status);
alter table installment_plans enable row level security;

-- Resumo corrido da conversa por pessoa (memória que atravessa os dias; o
-- contexto curto no Redis só guarda 40 trocas / 24h).
create table if not exists conversation_summaries (
  user_id uuid primary key references users(id) on delete cascade,
  summary text not null,
  updated_at timestamptz not null default now()
);
alter table conversation_summaries enable row level security;

-- Log de mensagens proativas (check-in, fechamento do dia, revisão da semana,
-- dica). A unique (account, kind, ref) faz o INSERT servir de trava de
-- idempotência: quem insere primeiro é quem manda.
create table if not exists proactive_message_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (account_id, kind, ref)
);
create index if not exists idx_proactive_logs_account_kind on proactive_message_logs (account_id, kind, sent_at desc);
alter table proactive_message_logs enable row level security;

-- Preferências das rotinas proativas. Check-in e dica ligados por padrão
-- (leves, no máximo um por dia/semana); fechamento do dia e revisão da semana
-- DESLIGADOS — a pessoa liga quando quiser ("ativar fechamento do dia").
alter table users add column if not exists routine_checkins boolean not null default true;
alter table users add column if not exists routine_weekly_tip boolean not null default true;
alter table users add column if not exists routine_day_close boolean not null default false;
alter table users add column if not exists routine_week_review boolean not null default false;

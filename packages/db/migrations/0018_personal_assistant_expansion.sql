-- Expansao do posicionamento B2C (2026-10): datas importantes e metas
-- pessoais, mesmo padrao de memory_facts/notes - tabela propria por
-- conceito, nunca misturando com dado financeiro/estruturado.
--
-- important_dates: data recorrente (aniversario, data comemorativa) que a
-- pessoa conta uma vez via remember_important_date e o Tom passa a lembrar
-- sozinho todo ano (ver insights-sweep.ts no worker, que reusa a mesma
-- varredura horaria da Fase 3). month/day em vez de uma data completa de
-- propósito: é recorrente ano a ano, não um evento único (isso é
-- create_calendar_event).
--
-- personal_goals: meta pessoal qualitativa ("quero ler mais", "ir mais na
-- academia") - diferente de task (sem due_at, não é "a fazer até tal dia")
-- e diferente de note (tem status, é algo pra acompanhar/concluir, não só
-- texto solto).
--
-- important_date_logs: idempotencia do lembrete anual (mesmo raciocinio de
-- weekly_digest_logs) - sem isso, o sweep horario podia mandar o mesmo
-- "parabens" varias vezes no mesmo dia se rodar mais de uma vez na janela
-- de hora certa.

create table if not exists important_dates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  label text not null,
  month smallint not null check (month between 1 and 12),
  day smallint not null check (day between 1 and 31),
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_important_dates_account_month_day on important_dates (account_id, month, day);

alter table important_dates enable row level security;

create table if not exists personal_goals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  description text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_personal_goals_account_created on personal_goals (account_id, created_at desc);

alter table personal_goals enable row level security;

create table if not exists important_date_logs (
  id uuid primary key default gen_random_uuid(),
  important_date_id uuid not null references important_dates(id) on delete cascade,
  sent_year smallint not null,
  sent_at timestamptz not null default now(),
  unique (important_date_id, sent_year)
);

alter table important_date_logs enable row level security;

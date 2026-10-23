-- Hábitos e rotina com acompanhamento (2026-10, pedido explícito do dono do
-- produto — antes "conscientemente fora" da rodada de expansão B2C, ver
-- CLAUDE.md). Meta pessoal (personal_goals) é "algo a alcançar"; hábito é
-- "algo que se repete" e o que importa é a constância (sequência de dias).
--
-- habit_checkins.checkin_date é a DATA LOCAL da pessoa (date, sem hora): o
-- check-in de "fui pra academia hoje" pertence ao dia dela, não a um instante
-- UTC — senão uma marcação às 22h em Brasília cairia no dia seguinte. A
-- unicidade (habit_id, checkin_date) torna marcar duas vezes no mesmo dia
-- idempotente, e é daí que a sequência (streak) é calculada, em código puro
-- (packages/core/src/habits/streak.ts), nunca estimada pelo modelo.

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_habits_account_active on habits (account_id, active, created_at desc);

alter table habits enable row level security;

create table if not exists habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  checkin_date date not null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (habit_id, checkin_date)
);

create index if not exists idx_habit_checkins_account_date on habit_checkins (account_id, checkin_date desc);

alter table habit_checkins enable row level security;

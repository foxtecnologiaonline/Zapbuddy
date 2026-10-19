-- Pacote de diferenciais de assistente pessoal B2C (2026-10, pedido do dono do produto):
--  - horário de silêncio: nenhuma mensagem proativa (resumo, insight, resumo semanal)
--    fora da janela que a pessoa definiu. Lembretes que ela mesma agendou não são
--    afetados (são pedidos explícitos, com hora marcada).
--  - contas recorrentes: aluguel, luz, assinatura — aviso antecipado sem depender de
--    Open Finance. Só o que a pessoa cadastrou; nunca vira transação sozinho.
--  - metas com prazo: valor e prazo informados pela pessoa; progresso é o que ela declara.

alter table users
  add column if not exists quiet_hours_start smallint not null default 22 check (quiet_hours_start between 0 and 23),
  add column if not exists quiet_hours_end smallint not null default 7 check (quiet_hours_end between 0 and 23);

create table if not exists recurring_bills (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  due_day smallint not null check (due_day between 1 and 31),
  active boolean not null default true,
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_recurring_bills_account_active on recurring_bills (account_id, active);

alter table recurring_bills enable row level security;

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  title text not null,
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_goals_account_status on goals (account_id, status);

alter table goals enable row level security;

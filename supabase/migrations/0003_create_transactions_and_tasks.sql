-- MVP item 2: financeiro básico (gasto/receita, categorização, resumo)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  amount_cents integer not null check (amount_cents > 0),
  category text not null,
  description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists transactions_client_id_occurred_at_idx on transactions (client_id, occurred_at);

alter table transactions enable row level security;

create policy "service role full access" on transactions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- MVP item 3: tarefas e lembretes
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_client_id_status_idx on tasks (client_id, status);

create trigger tasks_set_updated_at
  before update on tasks
  for each row
  execute function set_updated_at();

alter table tasks enable row level security;

create policy "service role full access" on tasks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

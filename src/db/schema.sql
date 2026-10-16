create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text unique not null,
  name text,
  onboarded_at timestamptz,
  onboarding_prompted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  amount_cents bigint not null check (amount_cents > 0),
  category text not null,
  description text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_user_occurred on transactions(user_id, occurred_at desc);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_tasks_user_status on tasks(user_id, status);

-- Regra não-negociável do projeto: toda tool call da IA é logada (nome + params + resultado)
-- desde o primeiro commit. É o principal insumo de debug de erro de interpretação de linguagem natural.
create table if not exists tool_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  tool_name text not null,
  params jsonb not null,
  result jsonb,
  error text,
  duration_ms integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tool_call_logs_user_created on tool_call_logs(user_id, created_at desc);
create index if not exists idx_tool_call_logs_errors on tool_call_logs(tool_name) where error is not null;

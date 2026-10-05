-- ZapBuddy — schema inicial do MVP (Fase 1)
-- Camadas: dados estruturados de longo prazo (esta migration).
-- Contexto de conversa de curto prazo NÃO entra aqui — vive em Redis (ver packages/core/src/context).

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number text not null unique,
  name text,
  timezone text not null default 'America/Sao_Paulo',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('expense', 'income')),
  amount_cents bigint not null check (amount_cents > 0),
  category text not null default 'outros',
  description text,
  source text not null default 'text' check (source in ('text', 'audio')),
  raw_input text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_occurred on transactions (user_id, occurred_at desc);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'completed')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_user_status on tasks (user_id, status);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  message text not null,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_reminders_due on reminders (status, remind_at);

-- Log de toda tool call da IA (nome + parâmetros + resultado) — requisito não-negociável do CLAUDE.md.
create table if not exists tool_call_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  tool_name text not null,
  parameters jsonb not null default '{}'::jsonb,
  result jsonb,
  success boolean not null,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_call_logs_user_created on tool_call_logs (user_id, created_at desc);

-- Magic links para login no dashboard web, disparados via WhatsApp.
create table if not exists magic_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_magic_links_user on magic_links (user_id);

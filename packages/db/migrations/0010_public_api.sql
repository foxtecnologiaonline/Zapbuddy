-- Fase 3 (docs/adr/0003): API pública (só leitura) + webhooks de saída.
-- Chave de API nunca é armazenada em claro — só o hash (mesmo padrão de
-- magic_links.token_hash), igual um token de sessão: comparável, não
-- reversível (não precisa decriptar, diferente do refresh token do Google
-- Agenda na Fase 2, que precisa ser usado de novo — por isso lá é AES e
-- aqui é hash).

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_api_keys_account on api_keys (account_id);

create table if not exists webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  url text not null,
  secret text not null,
  event_types text[] not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create index if not exists idx_webhook_subscriptions_account on webhook_subscriptions (account_id);

create table if not exists webhook_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  success boolean not null,
  status_code integer,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_delivery_logs_subscription on webhook_delivery_logs (subscription_id, created_at desc);

alter table api_keys enable row level security;
alter table webhook_subscriptions enable row level security;
alter table webhook_delivery_logs enable row level security;

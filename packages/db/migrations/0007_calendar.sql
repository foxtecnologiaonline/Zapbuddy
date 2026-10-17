-- error_logs.source precisa aceitar 'web' agora que o callback OAuth do
-- Google Agenda (apps/web/app/api/calendar/callback) loga falhas de conexão
-- — não é webhook do WhatsApp nem worker nem orquestrador.
alter table error_logs drop constraint if exists error_logs_source_check;
alter table error_logs add constraint error_logs_source_check
  check (source in ('webhook', 'worker', 'orchestrator', 'web'));

-- Fase 2 (docs/adr/0002): conexão com Google Agenda, por conta (não por
-- usuário — ver decisão 3 do ADR). Refresh token é gravado já criptografado
-- pela aplicação (AES-256-GCM, packages/core/src/security/crypto.ts) — esta
-- coluna nunca guarda o token em claro.

create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references accounts(id) on delete cascade,
  google_refresh_token_encrypted text not null,
  google_calendar_id text not null default 'primary',
  connected_by_user_id uuid references users(id) on delete set null,
  connected_at timestamptz not null default now()
);

alter table calendar_connections enable row level security;

-- Fase 2 (docs/adr/0002): introduz "conta" como unidade de escopo de dado,
-- separada de "usuário" (identidade de login = 1 número de WhatsApp).
-- Todo usuário existente ganha uma conta própria (owner) via backfill abaixo
-- — do ponto de vista de quem usa sozinho, nada muda.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now()
);

create table if not exists account_members (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null unique references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

-- Convite determinístico (nunca decidido pelo LLM — ver ADR 0002). Código
-- numérico curto, não um token longo: é pra ser lido em voz alta/digitado
-- manualmente no WhatsApp pela pessoa convidada.
create table if not exists account_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  code text not null unique,
  created_by_user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_invites_code on account_invites (code);

-- Backfill: 1 conta nova por usuário existente, como owner. O uuid da conta
-- é gerado uma vez por usuário na CTE e reusado nos dois inserts — não dá
-- pra casar por created_at (dois usuários podem ter o mesmo timestamp).
with to_migrate as (
  select u.id as user_id, u.created_at, gen_random_uuid() as account_id
  from users u
  where not exists (select 1 from account_members m where m.user_id = u.id)
),
ins_accounts as (
  insert into accounts (id, created_at)
  select account_id, created_at from to_migrate
  returning id
)
insert into account_members (account_id, user_id, role, created_at)
select account_id, user_id, 'owner', created_at from to_migrate;

-- Escopo de dado passa de user_id pra account_id. user_id é mantido em cada
-- tabela como "quem lançou" (auditoria em conta compartilhada), não mais
-- como filtro de leitura.
alter table transactions add column if not exists account_id uuid references accounts(id);
alter table tasks add column if not exists account_id uuid references accounts(id);
alter table reminders add column if not exists account_id uuid references accounts(id);

update transactions t set account_id = m.account_id
from account_members m where m.user_id = t.user_id and t.account_id is null;

update tasks t set account_id = m.account_id
from account_members m where m.user_id = t.user_id and t.account_id is null;

update reminders r set account_id = m.account_id
from account_members m where m.user_id = r.user_id and r.account_id is null;

alter table transactions alter column account_id set not null;
alter table tasks alter column account_id set not null;
alter table reminders alter column account_id set not null;

drop index if exists idx_transactions_user_occurred;
create index if not exists idx_transactions_account_occurred on transactions (account_id, occurred_at desc);

drop index if exists idx_tasks_user_status;
create index if not exists idx_tasks_account_status on tasks (account_id, status);

create index if not exists idx_reminders_account on reminders (account_id);

alter table accounts enable row level security;
alter table account_members enable row level security;
alter table account_invites enable row level security;

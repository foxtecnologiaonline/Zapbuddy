-- Fase 3 (docs/adr/0003): programa de indicação — código por conta +
-- atribuição de quem indicou quem.

alter table accounts add column if not exists referral_code text unique;

-- Backfill pras contas que já existem: deriva do próprio uuid da conta (já
-- único) em vez de um gerador com retry em SQL puro — probabilidade de
-- colisão nos 8 chars é desprezível pro volume esperado, e a constraint
-- unique acima faria a migration falhar alto (não silenciosamente) se algum
-- dia colidir de verdade. Contas novas (app code, accounts.ts) usam geração
-- com retry de colisão, igual ao código de convite da Fase 2.
update accounts
set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8))
where referral_code is null;

alter table accounts alter column referral_code set not null;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_account_id uuid not null references accounts(id) on delete cascade,
  referred_account_id uuid not null unique references accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_referrals_referrer on referrals (referrer_account_id);

alter table referrals enable row level security;

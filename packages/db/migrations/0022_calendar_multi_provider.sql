-- Generaliza calendar_connections pra suportar Outlook além de Google
-- (2026-10, pedido explícito do dono do produto — ver CLAUDE.md). Uma
-- conexão por conta continua valendo (account_id já é unique): conectar um
-- provider novo substitui o anterior via upsert, nunca os dois ao mesmo
-- tempo — decisão explícita, evita a complexidade de criar/checar conflito
-- em dois calendários simultâneos.
alter table calendar_connections add column if not exists provider text not null default 'google'
  check (provider in ('google', 'microsoft'));

alter table calendar_connections rename column google_refresh_token_encrypted to refresh_token_encrypted;
alter table calendar_connections rename column google_calendar_id to calendar_id;

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  whatsapp_id text not null unique,
  name text,
  status text not null default 'onboarding' check (status in ('onboarding', 'active')),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clients_set_updated_at
  before update on clients
  for each row
  execute function set_updated_at();

alter table clients enable row level security;

-- Escrita/leitura via service role apenas (backend do webhook).
-- Políticas para o login do dashboard (magic link) entram junto com essa feature.
create policy "service role full access" on clients
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

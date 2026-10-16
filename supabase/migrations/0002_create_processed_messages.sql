-- Dedup de mensagens do webhook: a Meta reenvia a mesma entrega em caso de
-- timeout/erro, e sem isso o mesmo wamid processado duas vezes duplica
-- efeitos (ex: duas mensagens de boas-vindas, onboarding completado 2x).
create table if not exists processed_messages (
  message_id text primary key,
  processed_at timestamptz not null default now()
);

alter table processed_messages enable row level security;

create policy "service role full access" on processed_messages
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

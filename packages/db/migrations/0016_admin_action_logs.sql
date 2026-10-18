-- Log de auditoria das ações do admin (não confundir com tool_call_logs, que
-- é da IA): toda escrita feita a partir do painel /admin fica registrada
-- aqui — hoje sem usuário por trás (login é senha única, sem conta por
-- admin), mas já guarda O QUE mudou e QUANDO, que é o que falta hoje pra
-- investigar "quem cancelou esse lembrete" quando mais de uma pessoa operar
-- o painel. Se/quando o login ganhar conta por admin, um `admin_user` vira
-- coluna nova aqui, não uma tabela nova.

create table if not exists admin_action_logs (
  id uuid primary key default gen_random_uuid(),
  -- snake_case curto e estável (ex.: 'plan_status_updated', 'reminder_cancelled',
  -- 'evolution_instance_created') — não é enum fechado no banco de propósito:
  -- cada rota de escrita do admin define a sua própria, sem precisar de
  -- migration nova a cada ação adicionada.
  action text not null,
  target_type text not null,
  target_id text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_action_logs_created on admin_action_logs (created_at desc);

-- Mesma defesa em profundidade da 0002/0004: service-role bypassa RLS, isto
-- só blinda contra uso futuro acidental de uma chave anon/authenticated.
alter table admin_action_logs enable row level security;

-- Melhorias de revisão (2026-10): observabilidade de latência, correção/cancelamento
-- de tarefa e lembrete, lembrete recorrente, resumo semanal proativo e alerta de
-- orçamento por categoria. Todas dentro do escopo de Fase 1 (financeiro/tarefas/
-- lembretes) — nenhuma depende de Open Finance, Google Agenda ou multiusuário.

-- Quanto tempo cada tool call levou — sem isso, não dá pra saber no admin se uma
-- lentidão percebida pelo usuário vem do Claude, do fallback OpenAI, ou de uma tool
-- específica (ex.: a busca web). Nullable: linhas antigas não têm esse dado.
alter table tool_call_logs add column if not exists duration_ms integer;

-- Lembrete recorrente: null = ocorrência única (comportamento atual, inalterado).
-- Cada disparo recorrente cria uma NOVA linha pra próxima ocorrência (reminder-dispatch.ts)
-- em vez de usar `repeat` do BullMQ — mantém cada ocorrência cancelável/consultável
-- individualmente, igual a um lembrete comum.
alter table reminders add column if not exists recurrence text
  check (recurrence in ('daily', 'weekly', 'monthly'));

-- Idempotência do resumo semanal proativo (1x/semana por conta, análogo a
-- proactive_insight_logs da Fase 3 — mas é tabela separada de propósito: resumo
-- agendado e sinal de anomalia são conceitos diferentes, não deve haver acoplamento
-- entre o cap de 1/dia de um e o cap de 1/semana do outro).
create table if not exists weekly_digest_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists idx_weekly_digest_logs_account_sent on weekly_digest_logs (account_id, sent_at desc);

-- Limite de gasto mensal por categoria, definido pela própria pessoa via tool
-- (set_budget_alert). Um valor por (conta, categoria) — pedir de novo substitui o
-- anterior (upsert), não acumula histórico de alterações.
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  category text not null,
  limit_cents bigint not null check (limit_cents > 0),
  period text not null default 'monthly' check (period in ('monthly')),
  created_at timestamptz not null default now(),
  unique (account_id, category)
);

alter table weekly_digest_logs enable row level security;
alter table budgets enable row level security;

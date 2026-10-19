-- Duas camadas novas, confirmadas com o dono do produto (2026-10, posicionamento
-- reafirmado: "gestão do tempo, tarefas e notas pessoais, gestão financeira"):
--
-- memory_facts: o Tom lembrando algo SOBRE a pessoa (preferência, rotina,
-- relação) pra conversas futuras — nunca dado financeiro (isso sempre passa
-- por record_transaction, nunca por aqui). Append-only de propósito: sem
-- key-value/upsert, evita decidir "o que conta como a mesma chave" — uma
-- lista crescente de fatos curtos, mais recente primeiro, com teto de
-- leitura no código (não aqui).
--
-- notes: a PESSOA anotando algo pra si mesma ("anota aí: ...") — sem data,
-- sem conceito de concluir (diferente de tasks). Mesmo padrão de tasks
-- (CRUD simples por conta).

create table if not exists memory_facts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  fact text not null,
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_facts_account_created on memory_facts (account_id, created_at desc);

alter table memory_facts enable row level security;

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  content text not null,
  created_by_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_notes_account_created on notes (account_id, created_at desc);

alter table notes enable row level security;

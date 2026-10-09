-- Defesa em profundidade: habilita RLS em todas as tabelas, sem nenhuma
-- policy permissiva. O app só acessa o banco via service-role key (que
-- bypassa RLS por padrão no Postgres do Supabase), então isto não muda o
-- comportamento atual — só garante que, se uma chave anon/authenticated
-- algum dia vazar ou for usada por engano, nenhuma linha fica legível ou
-- gravável sem uma policy explícita (que não existe aqui de propósito).

alter table users enable row level security;
alter table transactions enable row level security;
alter table tasks enable row level security;
alter table reminders enable row level security;
alter table tool_call_logs enable row level security;
alter table magic_links enable row level security;

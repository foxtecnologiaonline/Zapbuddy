-- Indicadores econômicos no bom dia (2026-10): a pessoa escolhe quais quer
-- receber (dólar, euro, libra, Selic, CDI, IPCA) numa mensagem à parte depois
-- do resumo da manhã. Vazio = não recebe. Idempotente.
alter table users add column if not exists morning_digest_indicators text[] not null default '{}';

-- A oferta ("quer receber indicadores?") sai UMA vez no resumo da manhã; esta
-- coluna marca que já foi feita (ou que a pessoa já configurou) pra não repetir.
alter table users add column if not exists indicators_offered_at timestamptz;

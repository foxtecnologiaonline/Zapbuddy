-- Onboarding turbinado (2026-10, ver ADR 0005): ocupação capturada uma vez
-- no cadastro (contexto pra categorização, sem forçar formulário) e
-- variante de abertura pra comparar taxa de conclusão (split determinístico
-- por número de WhatsApp — ver packages/db/src/onboarding-variant.ts, nunca
-- aleatório, pra ser reproduzível). O fuso (coluna já existente desde
-- 0001_init.sql) passa a ser inferido pelo DDD em código
-- (timezone-from-ddd.ts, chamado por createUser) em vez de sempre cair no
-- default da coluna — não precisa de migration pra isso, só preenche melhor
-- o valor desde a criação do usuário.
alter table users add column if not exists occupation text;
alter table users add column if not exists onboarding_variant text not null default 'ask_name_first'
  check (onboarding_variant in ('ask_name_first', 'ask_action_first'));

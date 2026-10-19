-- Cadastro progressivo ao longo do teste de 7 dias (2026-10, decisao do
-- dono do produto) — campos que o Tom vai preenchendo conforme a
-- conversa permite, sem formulario nem interrogatorio. cpf_cnpj ja
-- existe (migration 0020, so era pedido na hora do checkout); occupation
-- ja existe (so era capturada no onboarding). Novos aqui:
alter table users add column if not exists email text;
-- Marca que o horario de silencio foi CONFIRMADO pela pessoa (via
-- set_quiet_hours), nao só o default da coluna (que sempre tem um valor,
-- 22/7) — sem isso não dava pra saber se "ainda falta perguntar" ou se
-- a pessoa já respondeu e o default coincide com o que ela quer.
alter table users add column if not exists quiet_hours_confirmed_at timestamptz;
-- So a preferencia declarada (PIX/boleto/cartao) — nunca dado de
-- pagamento de verdade, isso continua só na hora real do checkout
-- (register_plan_intent -> Asaas).
alter table users add column if not exists preferred_payment_method text
  check (preferred_payment_method in ('pix', 'boleto', 'cartao'));

-- Checkout real de assinatura (2026-10, decisao do dono do produto): preco
-- fechado R$27,90/mes (packages/core/src/payments/plan.ts), provedor Asaas
-- escolhido explicitamente. Guarda o vinculo da pessoa com o cliente e a
-- assinatura no Asaas pra o webhook de pagamento confirmado achar quem
-- ativar sem precisar perguntar nada de novo na conversa.
--
-- cpf_cnpj: exigencia da propria API da Asaas pra criar um cliente (POST
-- /customers) - nao existia antes porque nunca precisou de dado fiscal pra
-- nada no produto.
alter table users add column if not exists cpf_cnpj text;
alter table users add column if not exists asaas_customer_id text;
alter table users add column if not exists asaas_subscription_id text;
-- Guardado junto pra reusar o link sem precisar de uma segunda chamada
-- (GET /subscriptions/{id}) toda vez que a pessoa pedir de novo.
alter table users add column if not exists asaas_payment_link text;

create index if not exists idx_users_asaas_subscription_id on users (asaas_subscription_id);

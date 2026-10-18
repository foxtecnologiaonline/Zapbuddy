-- Momento de venda (onboarding/vendas, ADR 0004): captura a intenção de
-- assinar/cancelar que a pessoa manifesta na conversa com o Tom, como um
-- registro estruturado — mesma lógica do "nunca inventa dado financeiro":
-- o Tom só pode dizer que "anotou" depois de chamar register_plan_intent, e
-- essa chamada precisa de uma coluna pra persistir em. Não há billing real
-- ainda (CLAUDE.md, Fase 3), então isso não dispara cobrança nem muda
-- plan_status sozinho — só vira um sinal que o admin vê e trata manualmente,
-- igual plan_status já funciona hoje.
alter table users add column if not exists plan_intent text
  check (plan_intent in ('upgrade', 'cancel'));
alter table users add column if not exists plan_intent_requested_at timestamptz;

# ADR 0004 — Onboarding e vendas: momento de venda, indicação proativa, captura de intenção

**Status:** aceito e implementado (2026-10). Escopo decidido com o usuário: **sem preço de
assinatura fechado e sem cobrança real nesta rodada** — ninguém decidiu provedor de pagamento
(Stripe/Mercado Pago/Pix não existem no código) nem valor da mensalidade. O Tom passa a vender a
ideia de continuar (capturar "sim, quero continuar"), não a cobrar de verdade. Trial de 7 dias.
Indicação continua sem recompensa concreta — decisão explícita de deixar pra decidir depois.

## Contexto

`plan_status` existe desde a Fase 1 (`0004_admin.sql`) como "placeholder editável à mão pelo admin
até existir gateway de pagamento real" — mas nada no produto até agora falava disso: o Tom nunca
mencionava trial, nunca pedia pra continuar assinando, nunca pedia indicação por conta própria
(`get_referral_info` só respondia se perguntado). O pedido do usuário foi trabalhar onboarding e
vendas pra converter trial → assinante e gerar indicação, aplicando o Straight Line System (Jordan
Belfort) de forma assertiva.

## Decisão 1 — Adaptação ética do Straight Line System, não a versão de manual de vendas agressivo

O Straight Line original depende pesado de certeza fabricada: urgência artificial ("promoção
acaba hoje"), prova social inventada/exagerada, e insistência repetida até o "sim". Isso conflita
direto com a regra não-negociável do CLAUDE.md ("a IA nunca inventa dado") e com o tom de "parceiro
caloroso" já fixado (commit `07df167`) — um parceiro não inventa urgência pra pressionar.

O que foi reaproveitado do método (e é honesto o bastante pra manter):
- **Certeza construída em fato real**, nunca em promessa — o Tom só pode citar algo que já
  aconteceu de verdade na conversa/histórico, nunca estatística ou número inventado.
- **Um convite direto e único** por conversa, em vez de enrolação — straight line é literalmente
  "o caminho mais curto até o pedido claro".
- **Loop de objeção** — mas limitado a **uma volta só**: acolhe, devolve um ponto concreto, pede de
  novo uma vez. Depois disso, aceita a resposta sem insistir — a versão original do método permite
  várias voltas; aqui isso virou pressão/manipulação, então foi cortado deliberadamente.

O que foi descartado de propósito:
- Urgência fabricada (prazo que "acaba hoje" sem ser real).
- Prova social inventada (não existem depoimentos/números de cliente pra citar — o produto não tem
  isso ainda).
- Preço/condição inventados — ver Decisão 2.
- Insistir de novo depois da segunda resposta, ou fazer a pessoa sentir que "perde" algo.

## Decisão 2 — Sem preço fechado: o "fechamento" é intenção, não compra

Decisão do usuário: não decidir preço/ciclo de cobrança nesta rodada, e o Tom não cobra nada real
(sem Stripe/Mercado Pago/Pix). Então o convite do Tom não pode prometer valor, prazo de cobrança
nem forma de pagamento — ele convida a pessoa a **topar continuar**, deixando claro que um humano
combina os detalhes depois. Isso evita o risco central de simular uma venda: fazer parecer que uma
cobrança aconteceu quando não aconteceu (o mesmo raciocínio do ADR 0003 pra não simular cobrança a
terceiro/nota fiscal sem provedor real).

## Decisão 3 — Captura de intenção como registro estruturado (`register_plan_intent`)

Extensão direta da regra "a IA nunca inventa dado financeiro, toda ação só existe depois da tool":
se o Tom disser "anotei que você quer continuar" sem ter persistido isso em lugar nenhum, é a
mesma classe de problema que confirmar uma transação inventada. Por isso:

- Nova tool `register_plan_intent({ intent: 'upgrade' | 'cancel' })`, grava
  `users.plan_intent` + `plan_intent_requested_at` (migration `0012_plan_intent.sql`).
- Não dispara cobrança nem cancelamento sozinha — só cria o sinal que aparece no admin
  (`/admin` → card "Pedidos de assinatura"; `/admin/contacts` → badge por contato) pra um humano
  tratar manualmente, exatamente como `plan_status` já funciona hoje.
- `updateUserPlanStatus` (ação manual do admin) zera `plan_intent` ao mudar o status — o próprio
  tratamento manual "resolve" o sinal, sem precisar de uma segunda ação de admin só pra limpar.

## Decisão 4 — Gatilho de venda por dia de trial, não por evento de produto

Mais simples que rastrear "marco de uso" (ex.: N ações), e suficiente pro objetivo: calculado a
partir de `users.created_at` direto no `system-prompt.ts` (`daysSince`), sem nova coluna nem job.
Três regimes:
- `< 5 dias`: nada — deixa a pessoa sentir valor antes de qualquer menção comercial.
- `5–6 dias`: "prepara o terreno" (menciona de passagem que o teste tá acabando), sem pedir nada.
- `≥ 7 dias` e `plan_status = 'trial'`: o convite direto (Decisão 1), no máximo uma vez por
  conversa, nunca interrompendo o pedido real da pessoa.

`plan_status = 'active'`/`'canceled'` nunca disparam esse bloco — quem já é assinante ou já saiu
não recebe o pitch de trial.

## Decisão 5 — Indicação proativa, sem prometer recompensa

Hoje `get_referral_info` só respondia se perguntado, e `referrals` só registra atribuição (sem
recompensa — decisão explícita do usuário de deixar pra decidir depois). Em vez de esperar, o Tom
agora pode, num momento genuinamente positivo da conversa (satisfação expressa, marco concluído) e
no máximo uma vez por conversa, chamar `get_referral_info` por conta própria e sugerir indicar
alguém — enquadrado como "ajuda um amigo", nunca como oferta com prêmio, porque prêmio nenhum
existe ainda. Quando houver decisão de recompensa, ela entra numa rodada separada (nova coluna/
lógica de aplicação, não cabe só em texto de prompt).

## Decisão 6 — Cancelamento: uma tentativa de retenção, nunca duas

Antes não existia nenhuma orientação pra "quero cancelar" — o Tom não tinha o que fazer com isso.
Agora: uma pergunta genuína sobre o motivo, uma alternativa se existir solução simples (ex.: só
silenciar um tipo de mensagem), e se a pessoa confirmar, `register_plan_intent(intent: 'cancel')`
sem insistir de novo. Simetria deliberada com o convite de venda (mesmo limite de "uma volta" nos
dois sentidos) — não é retenção agressiva.

## Consequências

- `users` ganha `plan_intent` + `plan_intent_requested_at` (migration `0012`), espelhando o padrão
  já existente de `plan_status`/`plan_status_updated_at`.
- Admin (`/admin`, `/admin/contacts`) ganha visibilidade do sinal de intenção — vira a fila de
  acompanhamento manual até existir billing real.
- Quando houver decisão de preço, provedor de cobrança e recompensa de indicação, essas partes do
  system prompt são as que mudam — a estrutura (certeza em fato real, convite único, loop de
  objeção limitado, sem invenção) continua valendo.

## Amendamento 2026-10 — preço fechado e checkout real (Asaas)

Decisão explícita do dono do produto: reverte a Decisão 2 acima. Preço fechado em **R$ 27,90/mês**
(`packages/core/src/payments/plan.ts`) e provedor escolhido (**Asaas**) — `register_plan_intent`
(intent: `"upgrade"`) deixa de só avisar um humano e passa a gerar um checkout real:

1. **Collecta CPF/CNPJ só na hora de fechar** — exigência da própria API da Asaas (POST
   `/customers`), nunca pedido antes/separado do momento de venda. Novas colunas `users.cpf_cnpj`,
   `asaas_customer_id`, `asaas_subscription_id`, `asaas_payment_link` (migration `0020`).
2. **Cliente + assinatura criados sob demanda** (`packages/core/src/payments/asaas-client.ts`) —
   `billingType: "UNDEFINED"` deixa a pessoa escolher PIX/boleto/cartão na própria página
   hospedada pela Asaas (nunca entra no nosso código). Resultado reusado em pedidos seguintes (sem
   criar cliente/assinatura duplicada).
3. **Ativação automática via webhook** (`apps/web/app/api/payments/webhook-asaas`) — eventos
   `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` localizam o usuário por `asaas_subscription_id` e viram
   `plan_status = 'active'`. Token fixo (`ASAAS_WEBHOOK_TOKEN`), comparado em tempo constante —
   mesmo raciocínio do HMAC do webhook do WhatsApp, só que a Asaas não assina o corpo, então a
   defesa é um token configurado manualmente no painel dela.
4. **Cancelamento continua manual** — decisão explícita de não automatizar isso agora (o webhook
   só ativa, nunca cancela); `register_plan_intent(intent: "cancel")` continua só avisando um
   humano, que cancela a assinatura na Asaas e atualiza `plan_status` pelo admin, exatamente como
   antes deste amendamento.
5. **`ASAAS_ENV=sandbox` por padrão** — freio de segurança explícito: nenhuma cobrança real
   acontece até alguém trocar pra `production` depois de testar.

O resto da Decisão 1 (certeza em fato real, convite único, loop de objeção limitado a uma volta,
sem urgência/prova social fabricada) continua valendo sem mudança — só a Decisão 2 foi revertida.

# ADR 0008 — Painel e cobrança inibidos; onboarding reescrito (2026-10)

## Contexto

O dono do produto mandou **inibir até próxima ordem** o painel web e a cobrança/trial: o link do painel,
oferecido logo no começo do onboarding, estava gerando erro (a tool `send_dashboard_login_link` lança
`WEB_APP_URL must be set` quando a variável não existe no ambiente do worker), e a cobrança será
melhorada antes de ser habilitada.

## Decisão

1. **Dois interruptores, desligados por padrão** (`packages/core/src/features.ts`): `DASHBOARD_ENABLED` e
   `BILLING_ENABLED`. Só o valor exato `true` liga. Desligados por padrão = nenhuma configuração é necessária
   em servidor nenhum para inibir; religar é uma variável nos dois lugares (worker e Vercel) + redeploy.
2. **Painel desligado:** a tool `send_dashboard_login_link` some do que o modelo vê (`getActiveTools()`); o
   prompt deixa de oferecer link, exportação e conexão de agenda pelo painel; no site, `apps/web/middleware.ts`
   troca as telas por "painel indisponível" e responde 503 nas rotas de API do painel (`/api/auth`,
   `/api/dashboard`, `/api/calendar`). Webhook do WhatsApp, health, webhook de pagamento, API pública e admin
   ficam de fora. **Efeito colateral:** conectar Google/Outlook depende do painel (OAuth exige sessão), então
   novas conexões de agenda ficam indisponíveis; as já feitas continuam funcionando. O Tom orienta salvar o
   compromisso como tarefa com data e hora.
3. **Cobrança desligada:** `isAccessBlocked` devolve `false` (ninguém é bloqueado, nem quem tem
   `plan_status = canceled`); a tool `register_plan_intent` some; o prompt não fala de teste, preço,
   assinatura nem cancelamento — se perguntarem, "por enquanto o Tom está liberado, sem cobrança", sem valor,
   prazo ou promessa de futuro. Código de checkout, webhook Asaas e colunas ficam intactos para a reativação.
4. **Onboarding reescrito** (roteiro de 2 passos, textos de referência no prompt):
   - Passo 1 (abertura): quem é o Tom + o que ele faz + pergunta SÓ o nome. O e-mail saiu da abertura
     (reverte a decisão anterior): sem o painel ele não tem uso imediato, e menos campos = menos abandono.
     Continua no cadastro progressivo, com motivo honesto (segundo contato).
   - Valor antes de burocracia: se a primeira mensagem já traz um pedido (gasto, tarefa...), o Tom atende e só
     depois pede o nome.
   - Passo 2 (boas-vindas): usa o primeiro nome e dá 4 exemplos concretos (dinheiro, lembrete, nota, agenda),
     texto ou áudio, e pergunta qual a primeira coisa a organizar.
   - Primeira ação registrada no 1º dia: reforço de uma frase + convite (uma vez) ao resumo matinal com
     previsão do tempo, que pede a cidade (`set_city`) — o pedido de cadastro ganha um motivo visível.
   - Casos de borda tratados no prompt: repetição, "o que você faz?", recusa de nome (apelido; depois "Amigo"),
     sobrenome, ocupação espontânea, pergunta de preço.
   - Reengajamento (2h/24h): sem menção a teste; pede o nome e convida a mandar a primeira coisa.

## Reativação

Quando o dono do produto mandar: `DASHBOARD_ENABLED=true` e/ou `BILLING_ENABLED=true` no worker e na Vercel.
Ligando a cobrança, o roteiro volta a incluir a linha "Você tem 3 dias de teste, por minha conta ✨" e o trial
volta a bloquear — revisar a mensagem de bloqueio e o fluxo de checkout antes (é o que vai ser "melhorado
para habilitar a cobrança"). Ligando o painel, conferir antes que `WEB_APP_URL` existe no worker.

# ADR 0007 — Recados a terceiros (o Tom escreve para outra pessoa)

Data: 2026-10 · Status: implementado · Decisão do dono do produto (pedido explícito: "tom, envie uma mensagem para a
Aline de bom dia" por áudio ou texto, com log do que foi enviado e se houve resposta, para a própria pessoa ver).

## Decisões (perguntadas ao dono do produto)
- **Canal: número do Tom, identificado.** Sem preferência declarada, valeu a recomendação. O Tom NUNCA se passa pela
  pessoa: toda mensagem termina com "— {nome}, via Tom (assistente pessoal). Pode responder aqui que eu aviso."
  Enviar pelo WhatsApp pessoal da pessoa (Evolution/Baileys) ficou de fora: viola a regra de produção do CLAUDE.md
  (Evolution só em teste/contingência), arrisca banir o número dela e exige parear QR por usuário.
- **Sempre confirmar antes de enviar.** Envio a terceiro não tem volta e áudio pode ser transcrito errado.

## Como funciona
1. **Contatos** (`contacts`): a Cloud API não dá acesso à lista de contatos do WhatsApp. A pessoa diz o número ("o da
   Aline é 11 99999-9999" → `save_contact`) ou **encaminha o cartão de contato** ao Tom (o webhook trata `contacts`).
   Só números do Brasil. A busca por nome ignora acento/caixa e **pergunta quando é ambíguo** — nunca escolhe.
2. **Dois passos** — `prepare_message_to_contact` (nada é enviado) e `send_prepared_message`. A confirmação é imposta
   **em código**, não só no prompt: o recado fica preso ao `turnId` da mensagem em que foi preparado e o envio recusa o
   mesmo turno (`needs_confirmation_from_person`). Só existe um recado pendente por pessoa (preparar outro cancela o
   anterior), por isso `send_prepared_message` não recebe id — o histórico curto é só texto e o Tom não lembraria dele.
   Expira em 15 min. O envio é reivindicado atomicamente (`pending → sent`), então retry/concorrência não duplicam.
3. **Log** (`outbound_messages`): status `sent → delivered → read` ou `failed` (+ motivo), via os webhooks de status da
   Meta (só avançam, nunca regridem). `list_sent_messages` e a seção "Recados enviados pelo Tom" do painel mostram
   quem recebeu, o texto, o status e a resposta. Entra no export da conta.
4. **Respostas** (`outbound_replies`): a resposta chega ao número do Tom. Se o remetente **ainda não é usuário** e
   recebeu um recado nos últimos 7 dias, `routeRecipientReply` (no webhook, antes de `getOrCreateUser`) a registra e
   avisa quem pediu ("📩 Aline respondeu: ..."), também gravando no histórico da conversa para "responde pra ela que ok"
   ter contexto. Sem isso a Aline viraria um cliente novo, com onboarding. Idempotente por `wa_message_id`.
5. **Janela de 24h da Meta**: texto livre só se o número escreveu pro Tom nas últimas 24h (`contacts.last_inbound_at`);
   fora disso só **template aprovado** (`WHATSAPP_CONTACT_TEMPLATE_NAME`, texto sugerido no `.env.example`). Erro 131047
   no texto livre cai no template, se houver. Sem template, o Tom explica que só escreve a quem falou com ele nas últimas
   24h. **Aprovar o template na Meta é um passo externo ao código** e é o que destrava o "primeiro contato".
6. **Proteções**: teto de 20 recados/24h por pessoa (`OUTBOUND_DAILY_LIMIT`); um destinatário por pedido; prompt recusa
   massa/propaganda/ameaça/golpe/falsa identidade; **opt-out** — se o destinatário responder PARAR/SAIR/STOP, o número é
   descadastrado em TODAS as contas e nunca mais recebe. O painel mostra só o nome do contato, nunca o número inteiro.

## Limitações conhecidas (v1, deliberadas)
- Quem **já é usuário do Tom** e responde ao recado cai na conversa normal dele com o Tom: não dá para distinguir de uma
  conversa própria, então a resposta não entra no log.
- Resposta em áudio/imagem é registrada e avisada, mas o conteúdo não é transcrito.
- Canal Evolution (contingência) envia texto, mas não recebe status nem roteia respostas.
- Só recado a UMA pessoa por pedido; sem agendamento ("manda amanhã às 8h") — hoje seria um lembrete, não um envio.
- Aviso de resposta fora da janela de 24h da PESSOA com o Tom pode falhar na Meta; a resposta continua no painel.

## Consequências
- Migration `0027_contacts_and_outbound_messages.sql` precisa ser aplicada antes do deploy.
- +6 tools (57 → 63 no registro; ~33KB / ~8,3K tokens de schema, perto do teto de ~10K — próxima rodada deve avaliar
  `defer_loading` antes de adicionar tools).
- Armazena número e texto de resposta de terceiros que não consentiram com o Tom: retenção e pedido de exclusão
  (LGPD) devem ser tratados — `delete_contact` remove o contato, mas o log guarda `recipient_number`.

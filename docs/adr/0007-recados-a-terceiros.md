# ADR 0007 — Recados para outras pessoas: o Tom redige, a pessoa envia

Data: 2026-10 · Status: implementado · Decisão do dono do produto.

## Contexto e reviravolta
O pedido original era o Tom **enviar** a mensagem ("tom, envie uma mensagem para a Aline de bom dia"), com log de envio e
resposta. Uma primeira versão com envio pelo número do Tom (Cloud API, confirmação em código, template da Meta, roteamento
de respostas, opt-out) chegou a ser construída na branch, mas **nunca foi para `main` nem para produção**. A decisão final
do dono do produto, depois de avaliar também usar a infraestrutura do ZapScript (WhatsApp pessoal via Evolution): **"o Tom
gera a mensagem e o próprio usuário encaminha pelo WhatsApp — nós não vamos enviar"**. Todo o código de envio foi removido.

## O que fica
- `draft_message_for_contact(contact_name?, message)`: o Tom redige na voz da pessoa, só com o que ela pediu, e devolve um
  **link `wa.me` com o texto preenchido** — ela toca, o WhatsApp dela abre a conversa e ela mesma envia. Com contato salvo,
  o link abre direto na conversa; sem número, `wa.me/?text=` deixa ela escolher a conversa (o texto sai igual). O Tom
  mostra o texto também por escrito, para ela copiar ou conferir uma transcrição de áudio.
- **Contatos** (`contacts`): só nome + número, para o link cair na conversa certa. Salvos por conversa
  ("o da Aline é 11 99999-9999") ou encaminhando o cartão de contato (o webhook trata o tipo `contacts`). Só números do
  Brasil; a busca por nome ignora acento/caixa e **pergunta quando é ambíguo**.
- **Log** (`message_drafts`): redigido → enviado → respondido/descartado. **O Tom só sabe o que a pessoa conta**
  ("mandei", "ela respondeu que ...") — não vê entrega, leitura nem resposta. O painel e o `list_message_log` deixam isso
  explícito no texto do status ("Enviado (você confirmou)", "Respondeu (você informou)").
- Painel: seção "Recados redigidos pelo Tom" com botão "abrir no WhatsApp" (reabre o link do rascunho) e a lista de contatos.

## Por que é melhor para este momento
Sem envio a terceiros não há: template da Meta, janela de 24h, risco de banimento, opt-out/consentimento de quem recebe,
número de terceiro respondendo ao Tom, nem armazenamento de resposta de pessoa que nunca falou com o produto. A ação
irreversível (enviar) continua sendo um toque da própria pessoa — a confirmação é intrínseca.

## Caminhos descartados por ora (registrados para o futuro)
- **Enviar pelo número do Tom** (Cloud API): viável, mas exige template aprovado pela Meta para primeiro contato, tratamento
  de respostas/opt-out e pesa na reputação do número. Implementado e removido (ver histórico da branch, commit e08155e).
- **Enviar pelo WhatsApp pessoal da pessoa** (Evolution/Baileys, como o ZapScript faz): permitiria achar os contatos reais e
  enviar como ela, mas o risco de banimento recai sobre o número pessoal dela e o CLAUDE.md proíbe Evolution em produção.
  Se vier a ser retomado, reaproveitar do ZapScript: pareamento por instância, listagem de conversas/nomes, e os guardrails
  anti-banimento (ritmo lento com variação, limite diário, janela de horário, disjuntor, consentimento de risco).

## Consequências
- Migration `0027_contacts_and_message_drafts.sql` precisa ser aplicada antes do deploy. É **idempotente e apaga**
  `outbound_messages`/`outbound_replies` se a versão antiga dela (com envio) tiver sido aplicada — essas tabelas nunca
  tiveram uso.
- Tools: 63 → 60 no registro. O limite de tokens do schema (~10K) continua sendo o watch item.

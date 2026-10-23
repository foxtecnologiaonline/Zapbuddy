-- Recados a terceiros (2026-10, pedido explícito do dono do produto): a
-- pessoa pede ("tom, manda um bom dia pra Aline"), o Tom confirma, envia
-- PELO NÚMERO DO TOM (identificado — nunca se passa pela pessoa), registra
-- tudo num log e avisa quando a Aline responder. Ver
-- docs/adr/0007-recados-a-terceiros.md.
--
-- contacts: agenda que a pessoa monta conversando com o Tom (ou encaminhando
-- um cartão de contato) — a Cloud API não dá acesso à lista real de contatos
-- do WhatsApp dela. Por conta (compartilhada entre membros), como tasks/notes.
--   whatsapp_number: só dígitos, com 55 + DDD (ex.: 5511999999999).
--   last_inbound_at: última vez que ESSE número escreveu pro Tom — abre a
--     janela de 24h em que a Meta aceita texto livre; fora dela só template.
--   opted_out_at: a pessoa respondeu PARAR — o Tom nunca mais escreve pra ela
--     (vale pra todas as contas que tenham esse número).
--
-- outbound_messages: o log. Nasce 'pending_confirmation' (o Tom mostra o texto
-- final e espera um "sim" em OUTRA mensagem — created_turn_id garante isso em
-- código, não só no prompt) e segue sent -> delivered -> read, ou failed.
-- outbound_replies: cada resposta recebida (idempotente por wa_message_id).

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  name_normalized text not null,
  whatsapp_number text not null check (whatsapp_number ~ '^\d{10,15}$'),
  last_inbound_at timestamptz,
  opted_out_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, whatsapp_number)
);

create index if not exists idx_contacts_account_name on contacts (account_id, name_normalized);
create index if not exists idx_contacts_number on contacts (whatsapp_number);

alter table contacts enable row level security;

create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  recipient_name text not null,
  recipient_number text not null,
  body text not null,
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  send_mode text check (send_mode in ('free_form', 'template')),
  created_turn_id text not null,
  expires_at timestamptz not null,
  wa_message_id text,
  failed_reason text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_outbound_messages_account_created on outbound_messages (account_id, created_at desc);
create index if not exists idx_outbound_messages_user_status on outbound_messages (user_id, status, created_at desc);
create index if not exists idx_outbound_messages_wa_id on outbound_messages (wa_message_id) where wa_message_id is not null;
create index if not exists idx_outbound_messages_recipient on outbound_messages (recipient_number, sent_at desc);

alter table outbound_messages enable row level security;

create table if not exists outbound_replies (
  id uuid primary key default gen_random_uuid(),
  outbound_message_id uuid not null references outbound_messages(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  wa_message_id text not null unique,
  message_type text not null,
  body text,
  created_at timestamptz not null default now()
);

create index if not exists idx_outbound_replies_message on outbound_replies (outbound_message_id, created_at);

alter table outbound_replies enable row level security;

-- Recados redigidos pelo Tom (2026-10, pedido explícito do dono do produto —
-- ver docs/adr/0007-recados-a-terceiros.md): a pessoa pede ("tom, manda um bom
-- dia pra Aline"), o Tom REDIGE o texto e entrega um link wa.me com ele
-- preenchido; quem envia é a própria pessoa, pelo WhatsApp dela. O Tom NÃO
-- envia nada a terceiros.
--
-- contacts: agenda que a pessoa monta conversando com o Tom (ou encaminhando um
-- cartão de contato) — serve só pra deixar o link já na conversa certa.
--   whatsapp_number: só dígitos, com 55 + DDD (ex.: 5511999999999).
--
-- message_drafts: o log. O Tom só sabe o que a PESSOA conta: 'draft' (redigido) ->
-- 'sent' ("mandei") -> 'replied' ("ela respondeu ...", reply_note guarda o resumo
-- que ela informou) ou 'discarded'.
--
-- Idempotente de propósito: uma versão anterior desta migration (que previa o Tom
-- enviando, com outbound_messages/outbound_replies) pode ou não ter sido aplicada;
-- aqui o que não é mais usado é removido e o que sobra é ajustado. Essas tabelas
-- antigas nunca tiveram uso em produção (o envio nunca foi ligado).

drop table if exists outbound_replies;
drop table if exists outbound_messages;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  name_normalized text not null,
  whatsapp_number text not null check (whatsapp_number ~ '^\d{10,15}$'),
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, whatsapp_number)
);

alter table contacts drop column if exists last_inbound_at;
alter table contacts drop column if exists opted_out_at;

create index if not exists idx_contacts_account_name on contacts (account_id, name_normalized);
drop index if exists idx_contacts_number;

alter table contacts enable row level security;

create table if not exists message_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  recipient_name text,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'replied', 'discarded')),
  reply_note text,
  sent_confirmed_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_message_drafts_account_created on message_drafts (account_id, created_at desc);
create index if not exists idx_message_drafts_user_status on message_drafts (user_id, status, created_at desc);

alter table message_drafts enable row level security;

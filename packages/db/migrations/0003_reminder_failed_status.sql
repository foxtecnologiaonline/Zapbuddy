-- Lembretes podem falhar de forma permanente ao enviar (ex.: a WhatsApp
-- Cloud API exige template aprovado pra mensagem livre fora da janela de
-- 24h desde a última mensagem do usuário — ver nota em
-- apps/worker/src/handlers/reminder-dispatch.ts). Sem este status, um
-- lembrete que falhasse ficava preso em 'pending' pra sempre, indistinguível
-- de um que ainda vai disparar.

alter table reminders drop constraint if exists reminders_status_check;
alter table reminders add constraint reminders_status_check
  check (status in ('pending', 'sent', 'cancelled', 'failed'));

alter table reminders add column if not exists failed_reason text;

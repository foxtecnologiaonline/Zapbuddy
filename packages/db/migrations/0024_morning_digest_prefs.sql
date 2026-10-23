-- Resumo matinal personalizavel (2026-10, pedido do dono do produto):
-- cidade real da pessoa (melhora a previsao do tempo e a UF do feriado
-- estadual, que antes eram so a aproximacao pelo DDD do WhatsApp) e
-- preferencias do proprio resumo (liga/desliga, horario, quais secoes).
alter table users add column if not exists city text;
alter table users add column if not exists city_uf text;
alter table users add column if not exists city_latitude double precision;
alter table users add column if not exists city_longitude double precision;

alter table users add column if not exists morning_digest_enabled boolean not null default true;
-- Hora local (0-23) em que o resumo chega. Default 8 = o horario fixo de antes.
alter table users add column if not exists morning_digest_hour smallint not null default 8
  check (morning_digest_hour between 0 and 23);
alter table users add column if not exists morning_digest_agenda boolean not null default true;
alter table users add column if not exists morning_digest_finance boolean not null default true;

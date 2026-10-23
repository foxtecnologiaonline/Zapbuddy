import type { Job } from 'bullmq';
import { inferLocationFromWhatsappNumber, listActiveRecurringBills, listTasks, logger } from '@zapbuddy/db';
import {
  billsDueWithin,
  datePartsInZone,
  describeHolidayToday,
  estacaoDoAno,
  formatMorningNarrative,
  formatTodayAgendaMessage,
  formatTodayFinanceMessage,
  getTodayAgendaLines,
  getTodayRange,
  getTodayWeatherSummary,
  sendWhatsappTextMessage,
  type MorningDigestGenerateJob,
} from '@zapbuddy/core';

function weekdayLabel(timeZone: string, referenceDate: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone }).format(referenceDate);
}

function dateLabel(timeZone: string, referenceDate: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone }).format(referenceDate);
}

/**
 * Resumo matinal: 3 mensagens separadas.
 * 1) Narrativa (dia da semana, data, estação, previsão do tempo, feriado se
 *    houver) — sempre mandada, é a abertura do dia.
 * 2) Agenda + tarefas de hoje (atrasada não entra) — só se houver algo.
 * 3) Contas recorrentes que vencem hoje — só se houver alguma.
 * Localização (cidade/UF/coordenadas) é aproximada a partir do DDD do
 * WhatsApp — ver `location-from-ddd.ts`. Clima e feriado nunca travam as
 * mensagens: se a busca de clima falhar ou não houver chave configurada, a
 * narrativa sai sem a frase de previsão, nunca com dado inventado.
 *
 * As mensagens 2 e 3 são isoladas em try/catch próprio: se uma delas falhar
 * (erro de banco ou do envio em si), a outra ainda é tentada, e a falha não
 * propaga pro BullMQ. Propagar faria o job inteiro re-tentar (`attempts: 3`
 * em DEFAULT_JOB_OPTIONS) e reenviar a narrativa — que já foi entregue com
 * sucesso — como duplicata. A narrativa (1ª mensagem) continua propagando
 * erro normalmente: nada foi mandado ainda nesse ponto, então re-tentar o
 * job é seguro.
 */
export async function handleMorningDigestGenerate(job: Job<MorningDigestGenerateJob>): Promise<void> {
  const { accountId, ownerWhatsappNumber, ownerTimezone } = job.data;
  const now = new Date();
  const location = inferLocationFromWhatsappNumber(ownerWhatsappNumber);
  const { year, month, day } = datePartsInZone(ownerTimezone, now);

  const weather = await getTodayWeatherSummary({
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: ownerTimezone,
  }).catch((error) => {
    logger.error('morning_digest_weather_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
    return null;
  });

  const narrative = formatMorningNarrative({
    weekdayLabel: weekdayLabel(ownerTimezone, now),
    dateLabel: dateLabel(ownerTimezone, now),
    season: estacaoDoAno(month, day),
    weather,
    holiday: describeHolidayToday(location.uf, year, month, day),
  });
  await sendWhatsappTextMessage(ownerWhatsappNumber, narrative);

  try {
    const agendaLines = await getTodayAgendaLines(accountId, ownerTimezone).catch((error) => {
      logger.error('morning_digest_agenda_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
      return [] as string[];
    });
    const today = getTodayRange(ownerTimezone);
    // Comparação por instante real (Date.getTime), não por string: timestamptz do Postgres via
    // Supabase não necessariamente serializa no mesmo formato de Date.toISOString() usado em
    // today.startIso/endIso (ex.: "+00:00" vs ".000Z") — comparar as strings diretamente arrisca
    // excluir/incluir errado uma tarefa com due_at bem na borda do dia.
    const todayStartMs = new Date(today.startIso).getTime();
    const todayEndMs = new Date(today.endIso).getTime();
    const pendingTasks = await listTasks(accountId, 'pending');
    const taskTitlesToday = pendingTasks
      .filter((task) => {
        if (task.due_at === null) return false;
        const dueAtMs = new Date(task.due_at).getTime();
        return dueAtMs >= todayStartMs && dueAtMs <= todayEndMs;
      })
      .map((task) => task.title);

    const agendaMessage = formatTodayAgendaMessage({ agendaLines, taskTitles: taskTitlesToday });
    if (agendaMessage !== null) await sendWhatsappTextMessage(ownerWhatsappNumber, agendaMessage);
  } catch (error) {
    logger.error('morning_digest_agenda_message_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const bills = billsDueWithin(
      (await listActiveRecurringBills(accountId)).map((bill) => ({
        name: bill.name,
        amountCents: bill.amount_cents,
        dueDay: bill.due_day,
      })),
      year,
      month,
      day,
    );
    const financeMessage = formatTodayFinanceMessage({ bills });
    if (financeMessage !== null) await sendWhatsappTextMessage(ownerWhatsappNumber, financeMessage);
  } catch (error) {
    logger.error('morning_digest_finance_message_failed', { accountId, error: error instanceof Error ? error.message : String(error) });
  }
}

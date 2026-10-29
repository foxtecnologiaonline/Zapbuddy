import { describe, expect, it } from 'vitest';
import {
  formatCountdown,
  formatFinanceSnapshot,
  formatHabitsAndGoals,
  formatImportantDatesLine,
  formatMorningExtras,
  formatTomorrowPreview,
  humanHour,
  nextEventCountdownLine,
  upcomingImportantDates,
} from './extras.js';

const TZ = 'America/Sao_Paulo';
const nbsp = (text: string | null) => (text ?? '').replace(/ /g, ' ');
// 2026-10-22 08:00 em São Paulo
const NOW_MS = Date.UTC(2026, 9, 22, 11, 0, 0);

describe('contagem regressiva do próximo compromisso', () => {
  it('formata minutos e horas como se fala', () => {
    expect(formatCountdown(0.4)).toBe('daqui a poucos minutos');
    expect(formatCountdown(45)).toBe('daqui a 45 min');
    expect(formatCountdown(75)).toBe('daqui a 1h15');
    expect(formatCountdown(120)).toBe('daqui a 2h');
    expect(formatCountdown(125)).toBe('daqui a 2h05');
  });

  it('hora falada: 9h, 9h30', () => {
    expect(humanHour('2026-10-22T12:00:00.000Z', TZ)).toBe('9h');
    expect(humanHour('2026-10-22T12:30:00.000Z', TZ)).toBe('9h30');
  });

  it('primeiro compromisso do dia, com contagem', () => {
    const line = nextEventCountdownLine([{ startIso: '2026-10-22T12:15:00.000Z' }], TZ, NOW_MS);
    expect(line).toBe('⏰ Seu primeiro compromisso é às 9h15, daqui a 1h15.');
  });

  it('se já passou algum, vira "o próximo compromisso" e pula os que já começaram', () => {
    const line = nextEventCountdownLine(
      [{ startIso: '2026-10-22T10:00:00.000Z' }, { startIso: '2026-10-22T14:00:00.000Z' }],
      TZ,
      NOW_MS,
    );
    expect(line).toBe('⏰ O próximo compromisso é às 11h, daqui a 3h.');
  });

  it('sem compromisso futuro, ou só dia inteiro (sem hora), não há linha', () => {
    expect(nextEventCountdownLine([], TZ, NOW_MS)).toBeNull();
    expect(nextEventCountdownLine([{ startIso: '2026-10-22T10:00:00.000Z' }], TZ, NOW_MS)).toBeNull();
    expect(nextEventCountdownLine([{ startIso: '2026-10-22' }], TZ, NOW_MS)).toBeNull();
  });
});

describe('datas importantes: hoje + próximos 3 dias', () => {
  const dates = [
    { id: 'a', label: 'aniversário da Ana', month: 10, day: 22 },
    { id: 'b', label: 'aniversário de casamento', month: 10, day: 23 },
    { id: 'c', label: 'consulta da vó', month: 10, day: 25 },
    { id: 'd', label: 'muito longe', month: 10, day: 30 },
  ];

  it('encontra as dos próximos 3 dias, com hoje, amanhã e o dia da semana', () => {
    const upcoming = upcomingImportantDates(dates, 2026, 10, 22);
    expect(upcoming.map((item) => [item.id, item.offsetDays])).toEqual([['a', 0], ['b', 1], ['c', 3]]);
    expect(formatImportantDatesLine(upcoming)).toBe('🗓️ Hoje: aniversário da Ana · Amanhã: aniversário de casamento · Domingo: consulta da vó');
  });

  it('atravessa virada de mês e de ano', () => {
    const upcoming = upcomingImportantDates([{ id: 'x', label: 'Ano Novo', month: 1, day: 1 }], 2026, 12, 30);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({ offsetDays: 2, weekdayLabel: 'Sexta' });
  });

  it('sem nada na janela, sem linha', () => {
    expect(formatImportantDatesLine(upcomingImportantDates([dates[3]!], 2026, 10, 22))).toBeNull();
  });
});

describe('retrato financeiro leve', () => {
  it('ontem, mês comparado e limite perto de estourar — só fatos', () => {
    const text = nbsp(
      formatFinanceSnapshot({
        yesterdayExpenseCents: 8500,
        monthExpenseCents: 180000,
        previousMonthExpenseCents: 200000,
        budgets: [{ category: 'mercado', limitCents: 100000, spentCents: 85000 }],
      }),
    );
    expect(text).toContain('💰 *Seu dinheiro*');
    expect(text).toContain('• Ontem: R$ 85,00 em gastos');
    expect(text).toContain('• No mês, até ontem: R$ 1.800,00 — 10% abaixo do mesmo período do mês passado');
    expect(text).toContain('• ⚠️ Mercado está em 85% do limite (R$ 850,00 de R$ 1.000,00)');
  });

  it('limite estourado ganha frase própria; abaixo de 80% nem aparece', () => {
    const text = nbsp(
      formatFinanceSnapshot({
        yesterdayExpenseCents: 0,
        monthExpenseCents: null,
        previousMonthExpenseCents: null,
        budgets: [
          { category: 'lazer', limitCents: 50000, spentCents: 61000 },
          { category: 'transporte', limitCents: 50000, spentCents: 20000 },
        ],
      }),
    );
    expect(text).toContain('Lazer passou do limite do mês (R$ 610,00 de R$ 500,00)');
    expect(text).not.toContain('Transporte');
  });

  it('sem base de comparação não inventa porcentagem; gasto zero ontem é omitido', () => {
    const text = nbsp(
      formatFinanceSnapshot({ yesterdayExpenseCents: 0, monthExpenseCents: 50000, previousMonthExpenseCents: 0, budgets: [] }),
    );
    expect(text).toContain('• No mês, até ontem: R$ 500,00');
    expect(text).not.toContain('%');
    expect(text).not.toContain('Ontem');
  });

  it('nada a dizer: null', () => {
    expect(formatFinanceSnapshot({ yesterdayExpenseCents: 0, monthExpenseCents: null, previousMonthExpenseCents: null, budgets: [] })).toBeNull();
  });
});

describe('hábitos e metas', () => {
  it('sequência com fogo, falta marcar hoje, e meta com prazo chegando', () => {
    const text = nbsp(
      formatHabitsAndGoals(
        [
          { name: 'Caminhada', currentStreak: 5, doneToday: false },
          { name: 'Leitura', currentStreak: 2, doneToday: true },
        ],
        [{ title: 'Viagem', savedCents: 300000, targetCents: 500000, daysLeft: 12 }],
      ),
    );
    expect(text).toContain('🎯 *Hábitos e metas*');
    expect(text).toContain('• Caminhada: 5 dias seguidos 🔥 — hoje ainda falta marcar');
    expect(text).toContain('• Leitura: 2 dias seguidos 🔥 (hoje já marcado)');
    expect(text).toContain('• Meta Viagem: 60% (R$ 3.000,00 de R$ 5.000,00) — prazo em 12 dias');
    expect(text).toContain('Fez algum hoje?');
  });

  it('meta longe ou já vencida não entra; sem nada, null', () => {
    expect(formatHabitsAndGoals([], [{ title: 'Longe', savedCents: 1, targetCents: 100, daysLeft: 40 }])).toBeNull();
    expect(formatHabitsAndGoals([], [{ title: 'Passou', savedCents: 1, targetCents: 100, daysLeft: -3 }])).toBeNull();
  });

  it('sem sequência não cobra: convida', () => {
    expect(formatHabitsAndGoals([{ name: 'Yoga', currentStreak: 0, doneToday: false }], [])).toContain('sem sequência por enquanto');
  });

  it('meta com prazo hoje/amanhã usa linguagem natural', () => {
    expect(formatHabitsAndGoals([], [{ title: 'A', savedCents: 0, targetCents: 100, daysLeft: 0 }])).toContain('prazo é hoje');
    expect(formatHabitsAndGoals([], [{ title: 'A', savedCents: 0, targetCents: 100, daysLeft: 1 }])).toContain('prazo é amanhã');
  });
});

describe('prévia de amanhã', () => {
  const weather = { minTempC: 17, maxTempC: 29, description: 'chuva leve', conditionId: 500, rainChancePercent: 70 };

  it('compromissos, tarefas e previsão numa linha', () => {
    const text = formatTomorrowPreview(
      {
        events: [{ startIso: '2026-10-23T17:00:00.000Z', title: 'Reunião' }, { startIso: '2026-10-23T12:00:00.000Z', title: 'Dentista' }],
        tasks: [{ title: 'Ligar pro banco' }],
        weather,
      },
      TZ,
    );
    expect(text).toBe('🔜 *Amanhã*: 2 compromissos (o primeiro às 9h: Dentista) e 1 tarefa\n🌧️ 17°C a 29°C, chuva leve (70% de chuva)');
  });

  it('só a previsão, quando não há agenda — sem afirmar "nada marcado"', () => {
    const text = formatTomorrowPreview({ events: [], tasks: [], weather: { ...weather, rainChancePercent: 10 } }, TZ);
    expect(text).toBe('🔜 *Amanhã*\n🌧️ 17°C a 29°C, chuva leve');
    expect(text).not.toContain('nada');
  });

  it('sem agenda e sem previsão: null', () => {
    expect(formatTomorrowPreview({ events: [], tasks: [], weather: null }, TZ)).toBeNull();
  });
});

describe('formatMorningExtras', () => {
  it('junta só as seções com conteúdo, separadas por linha em branco; vazio vira null', () => {
    const empty = { importantDates: [], finance: null, habits: [], goals: [], tomorrow: null };
    expect(formatMorningExtras(empty, TZ)).toBeNull();

    const text = formatMorningExtras(
      { ...empty, importantDates: [{ id: 'a', label: 'aniversário da Ana', offsetDays: 0, weekdayLabel: 'Quinta' }], habits: [{ name: 'Yoga', currentStreak: 3, doneToday: true }] },
      TZ,
    )!;
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text.startsWith('🗓️ Hoje: aniversário da Ana')).toBe(true);
  });
});

describe('regra de emoji: no máximo um por linha', () => {
  const emojiCount = (line: string) => line.match(/\p{Extended_Pictographic}/gu)?.length ?? 0;

  it('todas as seções de extras, no cenário mais cheio possível', () => {
    const text = formatMorningExtras(
      {
        importantDates: [{ id: 'a', label: 'aniversário da Ana', offsetDays: 0, weekdayLabel: 'Quinta' }],
        finance: { yesterdayExpenseCents: 8500, monthExpenseCents: 180000, previousMonthExpenseCents: 200000, budgets: [{ category: 'mercado', limitCents: 100000, spentCents: 120000 }] },
        habits: [{ name: 'Caminhada', currentStreak: 5, doneToday: true }, { name: 'Leitura', currentStreak: 2, doneToday: false }],
        goals: [{ title: 'Viagem', savedCents: 300000, targetCents: 500000, daysLeft: 3 }],
        tomorrow: { events: [{ startIso: '2026-10-23T12:00:00.000Z', title: 'Consulta' }], tasks: [{ title: 'x' }], weather: { minTempC: 17, maxTempC: 27, description: 'céu limpo', conditionId: 800, rainChancePercent: 60 } },
      },
      TZ,
    )!;
    for (const line of text.split('\n')) expect(emojiCount(line), line).toBeLessThanOrEqual(1);
  });
});

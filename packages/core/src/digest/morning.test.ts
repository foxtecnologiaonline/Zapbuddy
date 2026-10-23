import { describe, expect, it } from 'vitest';
import type { TodayWeatherSummary } from '../weather/openweathermap.js';
import {
  billsDueWithin,
  buildDateLabels,
  composeMorningDigest,
  daysUntilDueDay,
  formatMorningNarrative,
  taskHourLabel,
  type MorningDigestData,
  type MorningNarrativeInput,
} from './morning.js';

const TZ = 'America/Sao_Paulo';
// 2026-10-22 (quinta) 08:00 em São Paulo
const NOW_MS = Date.UTC(2026, 9, 22, 11, 0, 0);
const nbspToSpace = (text: string) => text.replace(/ /g, ' ');

describe('daysUntilDueDay', () => {
  it('dia de vencimento ainda não passou neste mês', () => {
    expect(daysUntilDueDay(25, 2026, 10, 19)).toBe(6);
  });
  it('vence hoje', () => {
    expect(daysUntilDueDay(19, 2026, 10, 19)).toBe(0);
  });
  it('já passou neste mês: conta até o mês seguinte', () => {
    expect(daysUntilDueDay(5, 2026, 10, 19)).toBe(17);
  });
  it('virada de ano', () => {
    expect(daysUntilDueDay(3, 2026, 12, 30)).toBe(4);
  });
  it('dia 31 em mês de 30 dias cai no último dia do mês', () => {
    expect(daysUntilDueDay(31, 2026, 4, 28)).toBe(2);
  });
});

describe('billsDueWithin', () => {
  it('mantém só contas dentro da janela, ordenadas pela proximidade', () => {
    const bills = [
      { name: 'Luz', amountCents: 18000, dueDay: 22 },
      { name: 'Aluguel', amountCents: 120000, dueDay: 20 },
      { name: 'Internet', amountCents: 9900, dueDay: 30 },
    ];
    const due = billsDueWithin(bills, 2026, 10, 19, 2);
    expect(due.map((b) => b.name)).toEqual(['Aluguel']);
    expect(due[0]?.daysUntilDue).toBe(1);
  });

  it('default (sem windowDays): só contas que vencem hoje', () => {
    const bills = [
      { name: 'Aluguel', amountCents: 120000, dueDay: 19 },
      { name: 'Internet', amountCents: 9900, dueDay: 20 },
    ];
    expect(billsDueWithin(bills, 2026, 10, 19).map((b) => b.name)).toEqual(['Aluguel']);
  });
});

describe('buildDateLabels / taskHourLabel', () => {
  it('rótulos pt-BR no fuso da pessoa', () => {
    expect(buildDateLabels(TZ, new Date(NOW_MS))).toEqual({ weekdayLabel: 'quinta-feira', dateLabel: '22 de outubro', weekdayIndex: 4 });
  });

  it('hora só quando é uma hora de verdade (00:00 e 23:59 = dia todo)', () => {
    expect(taskHourLabel('2026-10-22T17:00:00.000Z', TZ)).toBe('14:00');
    expect(taskHourLabel('2026-10-22T03:00:00.000Z', TZ)).toBeNull();
    expect(taskHourLabel('2026-10-23T02:59:00.000Z', TZ)).toBeNull();
  });
});

const baseNarrative: MorningNarrativeInput = {
  name: null,
  digestHour: 8,
  month: 10,
  day: 22,
  weekdayIndex: 4,
  weekdayLabel: 'quinta-feira',
  dateLabel: '22 de outubro',
  season: 'primavera',
  weather: null,
  holiday: null,
  nothingScheduled: false,
  followUpComing: false,
};

const sunnyWeather: TodayWeatherSummary = {
  minTempC: 18,
  maxTempC: 27,
  description: 'céu limpo',
  conditionId: 800,
  rainExpected: false,
  periods: { morning: null, afternoon: null, evening: null },
};

describe('formatMorningNarrative', () => {
  it('mínima: saudação, dia/data/estação, sem clima nem feriado', () => {
    const text = formatMorningNarrative(baseNarrative);
    expect(text).toContain('*Bom dia!*');
    expect(text).toContain('Hoje é *quinta-feira, 22 de outubro*');
    expect(text).toContain('primavera');
    expect(text).not.toContain('previsão');
    expect(text).not.toContain('feriado');
  });

  it('usa o nome e a saudação pela hora', () => {
    expect(formatMorningNarrative({ ...baseNarrative, name: 'Ana', digestHour: 8 })).toContain('*Bom dia, Ana!*');
    expect(formatMorningNarrative({ ...baseNarrative, name: 'Ana', digestHour: 14 })).toContain('*Boa tarde, Ana!*');
    expect(formatMorningNarrative({ ...baseNarrative, name: 'Ana', digestHour: 20 })).toContain('*Boa noite, Ana!*');
  });

  it('tira caracteres de formatação do nome (não quebra o negrito)', () => {
    expect(formatMorningNarrative({ ...baseNarrative, name: '*Ana_*' })).toContain('*Bom dia, Ana!*');
    expect(formatMorningNarrative({ ...baseNarrative, name: '***' })).toContain('*Bom dia!*');
  });

  it('abertura varia pelo dia da semana e é determinística', () => {
    const friday = { ...baseNarrative, weekdayIndex: 5, weekdayLabel: 'sexta-feira' };
    const first = formatMorningNarrative(friday);
    expect(first).toMatch(/Sextou!|Chegamos na sexta\./);
    expect(formatMorningNarrative(friday)).toBe(first);
    expect(formatMorningNarrative(baseNarrative)).not.toMatch(/Sextou|Começo de semana/);
  });

  it('clima com emoji e dicas', () => {
    const text = formatMorningNarrative({
      ...baseNarrative,
      weather: { ...sunnyWeather, maxTempC: 33, conditionId: 500, description: 'chuva leve', rainExpected: true },
    });
    expect(text).toContain('🌧️ A previsão é de 18°C a 33°C, com chuva leve.');
    expect(text).toContain('guarda-chuva');
    expect(text).toContain('Calorão');
  });

  it('feriados: nacional, estadual e ponto facultativo', () => {
    expect(formatMorningNarrative({ ...baseNarrative, holiday: { name: 'Tiradentes', official: true, scope: 'nacional' } })).toContain(
      'feriado nacional: *Tiradentes*',
    );
    expect(
      formatMorningNarrative({ ...baseNarrative, holiday: { name: 'Revolução Constitucionalista', official: true, scope: 'estadual' } }),
    ).toContain('feriado por aqui: *Revolução Constitucionalista*');
    expect(formatMorningNarrative({ ...baseNarrative, holiday: { name: 'Carnaval', official: false, scope: 'nacional' } })).toContain(
      '*Carnaval* — ponto facultativo',
    );
  });

  it('fecha com "dia livre" quando não há nada, ou com "já te mando" quando há mais mensagens', () => {
    expect(formatMorningNarrative({ ...baseNarrative, nothingScheduled: true })).toMatch(/nada registrado|dia está livre/);
    expect(formatMorningNarrative({ ...baseNarrative, followUpComing: true })).toContain('👇');
    expect(formatMorningNarrative(baseNarrative)).not.toContain('👇');
  });
});

const baseData: MorningDigestData = {
  name: 'Ana',
  timezone: TZ,
  digestHour: 8,
  nowMs: NOW_MS,
  month: 10,
  day: 22,
  season: 'primavera',
  weather: null,
  holiday: null,
  agendaEvents: [],
  tasks: [],
  bills: [],
  includeAgenda: true,
  includeFinance: true,
  dataComplete: true,
};

const aluguel = { name: 'Aluguel', amountCents: 120000, dueDay: 22 };

describe('composeMorningDigest', () => {
  it('sem nada: só a narrativa, com linha de dia livre', () => {
    const messages = composeMorningDigest(baseData);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/nada registrado|dia está livre/);
  });

  it('agenda ordenada com o próximo destacado, tarefas com hora quando houver, e CTA', () => {
    const messages = composeMorningDigest({
      ...baseData,
      agendaEvents: [
        { startIso: '2026-10-22T10:00:00.000Z', title: 'Café da manhã' }, // 07:00, já passou
        { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' }, // 09:00, próximo
        { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' }, // 14:00
      ],
      tasks: [
        { title: 'Pagar IPTU', dueAtIso: '2026-10-23T02:59:00.000Z' },
        { title: 'Ligar pro banco', dueAtIso: '2026-10-22T19:30:00.000Z' },
      ],
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('👇');
    const agenda = messages[1]!;
    expect(agenda).toContain('• 07:00 Café da manhã');
    expect(agenda).toContain('👉 *09:00* Dentista');
    expect(agenda).toContain('• 14:00 Reunião');
    expect(agenda).toContain('• Pagar IPTU');
    expect(agenda).toContain('• 16:30 Ligar pro banco');
    expect(agenda).toContain('Quer que eu te lembre');
  });

  it('financeiro em mensagem própria quando há mais itens', () => {
    const messages = composeMorningDigest({
      ...baseData,
      agendaEvents: [
        { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' },
        { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' },
      ],
      bills: [aluguel],
    });
    expect(messages).toHaveLength(3);
    expect(nbspToSpace(messages[2]!)).toContain('• Aluguel — R$ 1.200,00');
    expect(messages[2]).toContain('Já pagou alguma?');
  });

  it('1 item de agenda + 1 conta (<= 2 itens) viram uma mensagem só', () => {
    const messages = composeMorningDigest({
      ...baseData,
      agendaEvents: [{ startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' }],
      bills: [aluguel],
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain('Compromissos de hoje');
    expect(messages[1]).toContain('Compromissos financeiros de hoje');
    expect(messages[1]).toContain('registre um pagamento');
  });

  it('fonte que falhou: vazio não vira "dia livre"', () => {
    const [narrative] = composeMorningDigest({ ...baseData, dataComplete: false });
    expect(narrative).not.toMatch(/nada registrado|dia está livre/);
  });

  it('seção desligada não aparece nem conta pro "dia livre"', () => {
    const messages = composeMorningDigest({ ...baseData, includeFinance: false, bills: [aluguel] });
    expect(messages).toHaveLength(1);
    expect(messages[0]).not.toMatch(/nada registrado|dia está livre/);
    expect(messages[0]).not.toContain('Aluguel');
  });
});

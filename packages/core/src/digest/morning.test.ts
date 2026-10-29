import { describe, expect, it } from 'vitest';
import type { TodayWeatherSummary } from '../weather/openweathermap.js';
import {
  billsDueWithin,
  buildDateLabels,
  composeMorningDigest,
  daysOverdue,
  daysUntilDueDay,
  formatMorningNarrative,
  formatTaskFollowUpMessage,
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
  rainChancePercent: 0,
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

describe('daysOverdue / formatTaskFollowUpMessage (pergunta de conclusão — migration 0022)', () => {
  it('conta dias de atraso entre datas locais', () => {
    expect(daysOverdue(2026, 10, 20, 2026, 10, 21)).toBe(1);
    expect(daysOverdue(2026, 10, 20, 2026, 10, 22)).toBe(2);
    expect(daysOverdue(2026, 9, 30, 2026, 10, 2)).toBe(2);
  });

  it('sem tarefa atrasada, não manda mensagem', () => {
    expect(formatTaskFollowUpMessage([])).toBeNull();
  });

  it('pergunta pela tarefa e oferece remarcar, não só concluir', () => {
    const text = formatTaskFollowUpMessage([{ title: 'Reunião do Colegiado', daysOverdue: 2 }]);
    expect(text).toContain('Preciso confirmar com você');
    expect(text).toContain('• Reunião do Colegiado (era pra 2 dias atrás)');
    expect(text).toMatch(/Já rolou\?/);
    expect(text).toContain('remarcar');
  });

  it('ontem vira "era pra ontem" e várias tarefas viram uma mensagem só', () => {
    const text = formatTaskFollowUpMessage([
      { title: 'Ligar pro banco', daysOverdue: 1 },
      { title: 'Pagar IPTU', daysOverdue: 3 },
    ])!;
    expect(text).toContain('• Ligar pro banco (era pra ontem)');
    expect(text).toContain('• Pagar IPTU (era pra 3 dias atrás)');
    expect(text).toContain('Alguma dessas já rolou?');
  });
});

describe('formatMorningNarrative — emojis e detalhe do tempo', () => {
  it('a flor da primavera aparece só no corpo, junto da frase da estação — nunca no início', () => {
    const text = formatMorningNarrative({ ...baseNarrative, season: 'primavera' });
    expect(text.startsWith('🌸')).toBe(false);
    expect(text.split('\n')[0]).not.toContain('🌸');
    expect(text).toContain('já estamos na primavera por aqui 🌸');
  });

  it('o cabeçalho tem emoji pela hora do dia, não pelo clima nem pela estação', () => {
    expect(formatMorningNarrative({ ...baseNarrative, digestHour: 8 }).startsWith('🌅 *Bom dia!*')).toBe(true);
    expect(formatMorningNarrative({ ...baseNarrative, digestHour: 14 }).startsWith('👋 *Boa tarde!*')).toBe(true);
    expect(formatMorningNarrative({ ...baseNarrative, digestHour: 20 }).startsWith('🌙 *Boa noite!*')).toBe(true);
    const withWeather = formatMorningNarrative({ ...baseNarrative, weather: { ...sunnyWeather, conditionId: 500 } });
    expect(withWeather.startsWith('🌅')).toBe(true);
  });

  it('todo dia da semana tem abertura com emoji', () => {
    for (let weekdayIndex = 0; weekdayIndex <= 6; weekdayIndex++) {
      const text = formatMorningNarrative({ ...baseNarrative, weekdayIndex });
      expect(text.split('\n\n')[1]).toMatch(/\p{Extended_Pictographic} Hoje é/u);
    }
    expect(formatMorningNarrative({ ...baseNarrative, weekdayIndex: 3 })).toContain('Meio da semana, seguimos. 🙌');
  });

  it('o clima traz temperatura por período e chance de chuva (só quando relevante)', () => {
    const text = formatMorningNarrative({
      ...baseNarrative,
      weather: {
        ...sunnyWeather,
        conditionId: 500,
        description: 'chuva leve',
        rainExpected: true,
        rainChancePercent: 60,
        periods: { morning: { avgTempC: 19, rain: false }, afternoon: { avgTempC: 27, rain: true }, evening: { avgTempC: 22, rain: false } },
      },
    });
    expect(text).toContain('🌡️ Manhã 19°C · Tarde 27°C · Noite 22°C');
    expect(text).toContain('💧 Chance de chuva: 60%.');

    const dry = formatMorningNarrative({ ...baseNarrative, weather: { ...sunnyWeather, rainChancePercent: 10 } });
    expect(dry).not.toContain('Chance de chuva');
    expect(dry).not.toContain('🌡️');
  });
});

describe('composeMorningDigest — informações extras', () => {
  const extras = {
    importantDates: [{ id: 'a', label: 'aniversário da Ana', offsetDays: 0, weekdayLabel: 'Quinta' }],
    finance: null,
    habits: [],
    goals: [],
    tomorrow: null,
  };

  it('extras vão numa mensagem própria, por último, e a narrativa avisa', () => {
    const messages = composeMorningDigest({
      ...baseData,
      agendaEvents: [
        { startIso: '2026-10-22T12:00:00.000Z', title: 'Dentista' },
        { startIso: '2026-10-22T17:00:00.000Z', title: 'Reunião' },
      ],
      extras,
    });
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain('👇');
    expect(messages[2]).toContain('🗓️ Hoje: aniversário da Ana');
  });

  it('dia livre com extras: troca a frase de "dia livre" por uma que anuncia as informações', () => {
    const [narrative, extrasMessage] = composeMorningDigest({ ...baseData, extras });
    expect(narrative).toContain('separei');
    expect(narrative).not.toMatch(/nada registrado/);
    expect(extrasMessage).toContain('🗓️');
  });

  it('extras sem conteúdo não geram mensagem nem mudam a narrativa', () => {
    const messages = composeMorningDigest({ ...baseData, extras: { importantDates: [], finance: null, habits: [], goals: [], tomorrow: null } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/nada registrado|dia está livre/);
  });

  it('só extras (agenda desligada): a narrativa anuncia sem prometer agenda', () => {
    const [narrative] = composeMorningDigest({ ...baseData, includeAgenda: false, extras });
    expect(narrative).toMatch(/Separei umas informações|Olha o que separei/);
    expect(narrative).not.toContain('o que tem pra hoje');
  });

  it('a contagem regressiva do próximo compromisso fica logo abaixo da lista de compromissos', () => {
    const messages = composeMorningDigest({ ...baseData, agendaEvents: [{ startIso: '2026-10-22T12:15:00.000Z', title: 'Dentista' }] });
    expect(messages[1]).toContain('⏰ Seu primeiro compromisso é às 9h15, daqui a 1h15.');
    expect(messages[1]!.indexOf('Dentista')).toBeLessThan(messages[1]!.indexOf('⏰ Seu primeiro'));
  });
});

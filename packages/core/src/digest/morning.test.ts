import { describe, expect, it } from 'vitest';
import {
  billsDueWithin,
  daysUntilDueDay,
  formatMorningNarrative,
  formatTodayAgendaMessage,
  formatTodayFinanceMessage,
} from './morning.js';

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
    const due = billsDueWithin(bills, 2026, 10, 19);
    expect(due.map((b) => b.name)).toEqual(['Aluguel']);
  });
});

describe('formatMorningNarrative', () => {
  const base = {
    weekdayLabel: 'quinta-feira',
    dateLabel: '22 de outubro',
    season: 'primavera' as const,
    weather: null,
    holiday: null,
  };

  it('narrativa mínima: só dia/data/estação, sem clima nem feriado', () => {
    const text = formatMorningNarrative(base);
    expect(text).toContain('Bom dia! Hoje é quinta-feira, 22 de outubro');
    expect(text).toContain('primavera');
    expect(text).not.toContain('previsão');
    expect(text).not.toContain('feriado');
  });

  it('inclui clima quando disponível, sem aviso de chuva se não houver chance', () => {
    const text = formatMorningNarrative({
      ...base,
      weather: { minTempC: 18, maxTempC: 27, description: 'céu limpo', rainExpected: false },
    });
    expect(text).toContain('18°C a 27°C');
    expect(text).toContain('céu limpo');
    expect(text).not.toContain('guarda-chuva');
  });

  it('avisa sobre guarda-chuva quando chuva é esperada', () => {
    const text = formatMorningNarrative({
      ...base,
      weather: { minTempC: 18, maxTempC: 24, description: 'chuva leve', rainExpected: true },
    });
    expect(text).toContain('guarda-chuva');
  });

  it('feriado nacional oficial', () => {
    const text = formatMorningNarrative({
      ...base,
      holiday: { name: 'Tiradentes', official: true, scope: 'nacional' },
    });
    expect(text).toContain('feriado nacional: Tiradentes');
  });

  it('feriado estadual oficial', () => {
    const text = formatMorningNarrative({
      ...base,
      holiday: { name: 'Revolução Constitucionalista', official: true, scope: 'estadual' },
    });
    expect(text).toContain('feriado por aqui: Revolução Constitucionalista');
  });

  it('ponto facultativo (não oficial)', () => {
    const text = formatMorningNarrative({
      ...base,
      holiday: { name: 'Carnaval', official: false, scope: 'nacional' },
    });
    expect(text).toContain('Carnaval — ponto facultativo');
  });
});

describe('formatTodayAgendaMessage', () => {
  it('retorna null quando não há agenda nem tarefa', () => {
    expect(formatTodayAgendaMessage({ agendaLines: [], taskTitles: [] })).toBeNull();
  });

  it('monta as seções que têm conteúdo', () => {
    const text = formatTodayAgendaMessage({ agendaLines: ['09:00 Dentista'], taskTitles: ['Pagar IPTU'] });
    expect(text).toContain('📅 Compromissos de hoje:');
    expect(text).toContain('• 09:00 Dentista');
    expect(text).toContain('✅ Tarefas de hoje:');
    expect(text).toContain('• Pagar IPTU');
  });

  it('omite seção vazia', () => {
    const text = formatTodayAgendaMessage({ agendaLines: [], taskTitles: ['Ligar pro banco'] });
    expect(text).not.toContain('Compromissos de hoje');
    expect(text).toContain('Ligar pro banco');
  });
});

describe('formatTodayFinanceMessage', () => {
  it('retorna null quando não há conta vencendo hoje', () => {
    expect(formatTodayFinanceMessage({ bills: [] })).toBeNull();
  });

  it('lista as contas de hoje', () => {
    const text = formatTodayFinanceMessage({ bills: [{ name: 'Aluguel', amountCents: 120000, dueDay: 19 }] });
    expect((text ?? '').replace(/ /g, ' ')).toContain('• Aluguel — R$ 1.200,00');
  });
});

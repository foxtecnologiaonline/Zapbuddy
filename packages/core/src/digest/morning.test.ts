import { describe, expect, it } from 'vitest';
import { billsDueWithin, daysUntilDueDay, formatMorningDigest } from './morning.js';

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
});

describe('formatMorningDigest', () => {
  it('retorna null quando não há nada pra hoje (sem mensagem vazia)', () => {
    expect(formatMorningDigest({ agendaLines: [], taskTitles: [], bills: [] })).toBeNull();
  });

  it('monta as seções que têm conteúdo', () => {
    const text = formatMorningDigest({
      agendaLines: ['09:00 Dentista'],
      taskTitles: ['Pagar IPTU'],
      bills: [{ name: 'Aluguel', amountCents: 120000, dueDay: 20, daysUntilDue: 1 }],
    });
    expect(text).toContain('📅 Agenda de hoje:');
    expect(text).toContain('• 09:00 Dentista');
    expect(text).toContain('✅ Tarefas de hoje e atrasadas:');
    expect(text).toContain('• Pagar IPTU');
    expect((text ?? '').replace(/\u00a0/g, ' ')).toContain('• Aluguel (R$ 1.200,00) vence amanhã');
  });

  it('omite seções vazias', () => {
    const text = formatMorningDigest({ agendaLines: [], taskTitles: ['Ligar pro banco'], bills: [] });
    expect(text).not.toContain('Agenda');
    expect(text).not.toContain('Contas a vencer');
    expect(text).toContain('Ligar pro banco');
  });
});

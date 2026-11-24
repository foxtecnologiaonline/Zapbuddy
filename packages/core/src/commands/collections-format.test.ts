import { describe, expect, it } from 'vitest';
import {
  daysUntilNextOccurrence,
  formatGoalsOverview,
  formatHabitsOverview,
  formatImportantDates,
  formatPendingReminders,
  formatRecentNotes,
  formatRecurringBills,
} from './collections-format.js';

const TZ = 'America/Sao_Paulo';
// 2026-11-24 12:00 em São Paulo
const NOW = new Date('2026-11-24T15:00:00.000Z');
const emoji = /\p{Extended_Pictographic}/gu;

function expectOneEmojiPerLine(text: string): void {
  for (const line of text.split('\n')) expect((line.match(emoji) ?? []).length, `emoji demais em: ${line}`).toBeLessThanOrEqual(1);
}

describe('formatPendingReminders', () => {
  it('vazio: ensina a criar com uma frase de exemplo pra pessoa dizer', () => {
    const text = formatPendingReminders([], TZ, NOW);
    expect(text).toContain('não tem lembretes');
    expect(text).toContain('me lembra de');
  });

  it('ordena por horário, usa hoje/amanhã/data e mostra a recorrência', () => {
    const text = formatPendingReminders(
      [
        { message: 'pagar o IPTU', remindAt: '2026-12-05T12:00:00.000Z', recurrence: null },
        { message: 'ligar pro João', remindAt: '2026-11-25T12:00:00.000Z', recurrence: null }, // amanhã 9h
        { message: 'tomar o remédio', remindAt: '2026-11-24T23:30:00.000Z', recurrence: 'daily' }, // hoje 20h30
      ],
      TZ,
      NOW,
    );
    const lines = text.split('\n');
    expect(lines[0]).toContain('Seus próximos lembretes');
    expect(lines[1]).toBe('• tomar o remédio (hoje, 20h30, todo dia)');
    expect(lines[2]).toBe('• ligar pro João (amanhã, 9h)');
    expect(lines[3]).toBe('• pagar o IPTU (05/12, 9h)');
    expectOneEmojiPerLine(text);
  });

  it('o dia é o do FUSO da pessoa (23h30 em Manaus ainda é hoje; em UTC já seria amanhã)', () => {
    const text = formatPendingReminders([{ message: 'x', remindAt: '2026-11-25T03:30:00.000Z', recurrence: null }], 'America/Manaus', new Date('2026-11-24T20:00:00.000Z'));
    expect(text).toContain('(hoje, 23h30)');
  });

  it('corta no teto e avisa quantos ficaram de fora; mensagem longa é encurtada', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ message: 'm'.repeat(200), remindAt: `2026-12-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`, recurrence: null }));
    const text = formatPendingReminders(many, TZ, NOW);
    expect(text).toContain('…e mais 3.');
    expect(text.split('\n')[1]!.length).toBeLessThan(110);
    expect(text).toContain('…');
  });
});

describe('formatRecentNotes', () => {
  it('vazio ensina "anota:"', () => {
    expect(formatRecentNotes([], TZ)).toContain('anota:');
  });

  it('mostra data local, junta quebras de linha e dá a dica de busca', () => {
    const text = formatRecentNotes([{ content: 'ideia de presente\npra minha mãe', createdAt: '2026-11-20T02:00:00.000Z' }], TZ);
    expect(text).toContain('• 19/11 — ideia de presente pra minha mãe'); // 02h UTC = 23h do dia 19 em SP
    expect(text).toContain('nota sobre');
    expectOneEmojiPerLine(text);
  });

  it('mostra no máximo 8 e conta o resto', () => {
    const notes = Array.from({ length: 10 }, (_, i) => ({ content: `nota ${i}`, createdAt: '2026-11-20T12:00:00.000Z' }));
    expect(formatRecentNotes(notes, TZ)).toContain('…e mais 2.');
  });
});

describe('formatRecurringBills', () => {
  it('lista por dia de vencimento e soma só o que a pessoa informou', () => {
    const text = formatRecurringBills([
      { name: 'Internet', amountCents: 9990, dueDay: 10 },
      { name: 'Aluguel', amountCents: 120000, dueDay: 5 },
    ]);
    const lines = text.split('\n');
    expect(lines[1]).toContain('Aluguel');
    expect(lines[1]).toContain('todo dia 5');
    expect(lines[2]).toContain('Internet');
    expect(text).toMatch(/Somam R\$\s?1\.299,90 por mês \(só o que você me contou\)/);
    expectOneEmojiPerLine(text);
  });

  it('vazio ensina como guardar uma conta', () => {
    expect(formatRecurringBills([])).toContain('vence dia 10');
  });
});

describe('formatGoalsOverview', () => {
  it('meta com valor mostra progresso real (nunca passa de 100%) e prazo; pessoal vem em outro bloco', () => {
    const text = formatGoalsOverview({
      savings: [
        { title: 'Viagem', targetCents: 100000, savedCents: 25000, deadline: '2026-12-15' },
        { title: 'Reserva', targetCents: 50000, savedCents: 70000, deadline: null },
      ],
      personal: ['ler mais'],
    });
    expect(text).toMatch(/Viagem: R\$\s?250,00 de R\$\s?1\.000,00 \(25%\), até 15\/12\/2026/);
    expect(text).toContain('(100%)');
    expect(text).toContain('🌱 *Metas pessoais*');
    expect(text).toContain('• ler mais');
    expectOneEmojiPerLine(text);
  });

  it('meta com valor-alvo zero não divide por zero', () => {
    expect(formatGoalsOverview({ savings: [{ title: 'x', targetCents: 0, savedCents: 0, deadline: null }], personal: [] })).toContain('(0%)');
  });

  it('só pessoal, só com valor e nenhuma', () => {
    expect(formatGoalsOverview({ savings: [], personal: ['correr'] })).not.toContain('Metas com valor');
    expect(formatGoalsOverview({ savings: [], personal: [] })).toContain('quero juntar');
  });
});

describe('formatHabitsOverview', () => {
  it('sequência, marcação de hoje e últimos 7 dias; fecha convidando a marcar', () => {
    const text = formatHabitsOverview([
      { name: 'Caminhar', doneToday: false, currentStreak: 1, last7Days: 4 },
      { name: 'Ler', doneToday: true, currentStreak: 5, last7Days: 6 },
    ]);
    expect(text).toContain('• Caminhar: 1 dia seguido, falta marcar hoje (4 dos últimos 7 dias)');
    expect(text).toContain('• Ler: 5 dias seguidos, já marcou hoje (6 dos últimos 7 dias)');
    expect(text).toContain('fiz a caminhada');
    expectOneEmojiPerLine(text);
  });

  it('tudo marcado: parabeniza em vez de cobrar; vazio ensina a criar', () => {
    expect(formatHabitsOverview([{ name: 'Ler', doneToday: true, currentStreak: 2, last7Days: 3 }])).toContain('Tudo marcado hoje');
    expect(formatHabitsOverview([])).toContain('criar o hábito');
  });
});

describe('daysUntilNextOccurrence / formatImportantDates', () => {
  it('hoje = 0; já passou este ano = próxima ocorrência no ano seguinte', () => {
    expect(daysUntilNextOccurrence(11, 24, TZ, NOW)).toBe(0);
    expect(daysUntilNextOccurrence(11, 25, TZ, NOW)).toBe(1);
    expect(daysUntilNextOccurrence(11, 23, TZ, NOW)).toBe(364);
    expect(daysUntilNextOccurrence(3, 12, TZ, NOW)).toBe(108); // 12/03/2027
  });

  it('29/02 em ano comum cai em 28/02, nunca em 01/03', () => {
    expect(daysUntilNextOccurrence(2, 29, TZ, NOW)).toBe(96); // 28/02/2027
  });

  it('o "hoje" é o do fuso da pessoa', () => {
    // 02h UTC do dia 25 ainda é dia 24 em São Paulo.
    expect(daysUntilNextOccurrence(11, 24, TZ, new Date('2026-11-25T02:00:00.000Z'))).toBe(0);
  });

  it('ordena pela mais próxima e escreve hoje/amanhã/daqui a N dias', () => {
    const text = formatImportantDates(
      [
        { label: 'Aniversário da mãe', month: 3, day: 12 },
        { label: 'Aniversário da Ana', month: 11, day: 25 },
        { label: 'Casamento', month: 11, day: 24 },
      ],
      TZ,
      NOW,
    );
    const lines = text.split('\n');
    expect(lines[1]).toBe('• 24/11 — Casamento (hoje)');
    expect(lines[2]).toBe('• 25/11 — Aniversário da Ana (amanhã)');
    expect(lines[3]).toBe('• 12/03 — Aniversário da mãe (daqui a 108 dias)');
    expectOneEmojiPerLine(text);
  });

  it('vazio ensina a guardar uma data', () => {
    expect(formatImportantDates([], TZ, NOW)).toContain('12 de março');
  });
});

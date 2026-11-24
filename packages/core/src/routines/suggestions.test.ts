import { describe, expect, it } from 'vitest';
import { formatSuggestions, pickSuggestions, type SuggestionSignals } from './suggestions.js';

const emoji = /\p{Extended_Pictographic}/gu;
const none: SuggestionSignals = {
  overdueCount: 0,
  undatedPendingCount: 0,
  habitsMissingToday: [],
  hasGoals: true,
  hasBills: true,
  hasReminders: true,
  upcomingDate: null,
  spendChangePercent: null,
};

describe('pickSuggestions', () => {
  it('sem nenhum sinal não sugere nada (nunca inventa uma sugestão)', () => {
    expect(pickSuggestions(none)).toEqual([]);
  });

  it('o que está pesando vem antes da oportunidade, e no máximo 3', () => {
    const picked = pickSuggestions({
      ...none,
      overdueCount: 5,
      upcomingDate: { label: 'Aniversário da Ana', days: 1 },
      habitsMissingToday: ['Caminhar'],
      spendChangePercent: 40,
      hasGoals: false,
    });
    expect(picked.map((item) => item.id)).toEqual(['overdue-many', 'upcoming-date', 'habits-missing']);
  });

  it('tarefa atrasada: poucas pedem "rolou ou remarca"; muitas pedem faxina', () => {
    expect(pickSuggestions({ ...none, overdueCount: 1 })[0]!.text).toBe('Tem 1 tarefa atrasada.');
    expect(pickSuggestions({ ...none, overdueCount: 2 })[0]!.text).toBe('Tem 2 tarefas atrasadas.');
    expect(pickSuggestions({ ...none, overdueCount: 4 })[0]!.id).toBe('overdue-many');
  });

  it('data próxima usa hoje/amanhã/daqui a N dias e oferece redigir a mensagem (quem manda é a pessoa)', () => {
    expect(pickSuggestions({ ...none, upcomingDate: { label: 'Aniversário', days: 0 } })[0]!.text).toBe('Aniversário é hoje.');
    expect(pickSuggestions({ ...none, upcomingDate: { label: 'Aniversário', days: 2 } })[0]!.text).toBe('Aniversário é daqui a 2 dias.');
    expect(pickSuggestions({ ...none, upcomingDate: { label: 'x', days: 1 } })[0]!.say).toContain('eu escrevo uma mensagem pra você mandar');
  });

  it('gasto só vira sugestão a partir de +20% (variação pequena é ruído)', () => {
    expect(pickSuggestions({ ...none, spendChangePercent: 19 })).toEqual([]);
    expect(pickSuggestions({ ...none, spendChangePercent: 20 })[0]!.text).toContain('20% acima');
    expect(pickSuggestions({ ...none, spendChangePercent: -30 })).toEqual([]);
  });

  it('tarefas sem data só a partir de 5', () => {
    expect(pickSuggestions({ ...none, undatedPendingCount: 4 })).toEqual([]);
    expect(pickSuggestions({ ...none, undatedPendingCount: 5 })[0]!.id).toBe('undated');
  });

  it('fonte que NÃO deu pra ler (null) nunca vira "você não tem": só false de verdade sugere criar', () => {
    const unknown: SuggestionSignals = {
      overdueCount: null,
      undatedPendingCount: null,
      habitsMissingToday: null,
      hasGoals: null,
      hasBills: null,
      hasReminders: null,
      upcomingDate: null,
      spendChangePercent: null,
    };
    expect(pickSuggestions(unknown)).toEqual([]);
    expect(pickSuggestions({ ...unknown, hasGoals: false })[0]!.id).toBe('no-goal');
    expect(pickSuggestions({ ...unknown, hasBills: false, hasReminders: false }).map((item) => item.id)).toEqual(['no-bills', 'no-reminders']);
  });
});

describe('formatSuggestions', () => {
  it('cada sugestão traz o que dizer pra o Tom agir (nada é criado sozinho)', () => {
    const text = formatSuggestions(pickSuggestions({ ...none, overdueCount: 1, hasGoals: false }));
    expect(text).toContain('💡 *Sugestões pra agora*');
    expect(text).toContain('• Tem 1 tarefa atrasada.\n  Manda "tarefas"');
    expect(text).toContain('• Você ainda não tem nenhuma meta.\n  Diga, por exemplo, "quero juntar R$ 1.000 até junho"');
  });

  it('sem sugestão: diz que está tudo em ordem e aponta pra revisão do mês e pra dica', () => {
    const text = formatSuggestions([]);
    expect(text).toContain('Está tudo em ordem');
    expect(text).toContain('revisão do mês');
    expect(text).toContain('"dica"');
  });

  it('1 emoji por linha e nada de painel, preço ou teste grátis', () => {
    const all = formatSuggestions(
      pickSuggestions({ ...none, overdueCount: 9, upcomingDate: { label: 'x', days: 1 }, habitsMissingToday: ['a', 'b', 'c', 'd'], spendChangePercent: 50, undatedPendingCount: 9, hasGoals: false }, 8),
    );
    for (const line of all.split('\n')) expect((line.match(emoji) ?? []).length, line).toBeLessThanOrEqual(1);
    expect(all).not.toMatch(/painel|dashboard|assinatura|trial|teste gr[aá]tis|plano|R\$ ?27/i);
  });

  it('lista no máximo 3 hábitos pendentes no texto', () => {
    expect(pickSuggestions({ ...none, habitsMissingToday: ['a', 'b', 'c', 'd'] })[0]!.text).toBe('Falta marcar hoje: a, b, c.');
  });
});

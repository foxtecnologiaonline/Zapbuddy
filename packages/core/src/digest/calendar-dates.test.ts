import { describe, expect, it } from 'vitest';
import { buildUpcomingDatesBlock, describeCommemorativeDate, listUpcomingDates } from './calendar-dates.js';

const BRT = 'America/Sao_Paulo';
const at = (iso: string) => new Date(`${iso}T15:00:00.000Z`); // meio-dia em Brasília, longe de virada de dia

describe('describeCommemorativeDate — regras, não datas digitadas', () => {
  it('Dia das Mães = 2º domingo de maio, em anos diferentes', () => {
    expect(describeCommemorativeDate(2026, 5, 10)).toBe('Dia das Mães'); // 10/05/2026 é domingo
    expect(describeCommemorativeDate(2027, 5, 9)).toBe('Dia das Mães');
    expect(describeCommemorativeDate(2025, 5, 11)).toBe('Dia das Mães');
    expect(describeCommemorativeDate(2026, 5, 3)).toBeNull(); // 1º domingo não é
    expect(describeCommemorativeDate(2026, 5, 17)).toBeNull(); // 3º também não
  });

  it('Dia dos Pais = 2º domingo de agosto', () => {
    expect(describeCommemorativeDate(2026, 8, 9)).toBe('Dia dos Pais');
    expect(describeCommemorativeDate(2027, 8, 8)).toBe('Dia dos Pais');
  });

  it('Black Friday = sexta depois da 4ª quinta de novembro (difere da "última sexta" em anos com 5 quintas)', () => {
    expect(describeCommemorativeDate(2026, 11, 27)).toBe('Black Friday');
    expect(describeCommemorativeDate(2027, 11, 26)).toBe('Black Friday');
    // 2029: quintas em 1, 8, 15, 22 e 29 → a 4ª é 22 → Black Friday dia 23 (e NÃO 30, a última sexta).
    expect(describeCommemorativeDate(2029, 11, 23)).toBe('Black Friday');
    expect(describeCommemorativeDate(2029, 11, 30)).toBeNull();
  });

  it('Páscoa acompanha o cálculo móvel (2026 = 5 de abril)', () => {
    expect(describeCommemorativeDate(2026, 4, 5)).toBe('Páscoa');
    expect(describeCommemorativeDate(2027, 3, 28)).toBe('Páscoa');
  });

  it('datas fixas', () => {
    expect(describeCommemorativeDate(2026, 6, 12)).toBe('Dia dos Namorados');
    expect(describeCommemorativeDate(2026, 12, 31)).toBe('Réveillon');
    expect(describeCommemorativeDate(2026, 7, 4)).toBeNull();
  });
});

describe('listUpcomingDates', () => {
  it('a partir de 21/11/2026 acha a Black Friday e deixa de fora o que está além da janela', () => {
    const names = listUpcomingDates(at('2026-11-21'), BRT, 21).map((d) => d.name);
    expect(names).toContain('Black Friday'); // 27/11
    expect(names).not.toContain('Natal'); // 25/12 está a 34 dias
    expect(names).not.toContain('Dia dos Namorados');
  });

  it('conta os dias a partir do "hoje" da pessoa e inclui o dia de hoje', () => {
    const dates = listUpcomingDates(at('2026-11-27'), BRT, 5);
    expect(dates[0]).toMatchObject({ name: 'Black Friday', daysAhead: 0, kind: 'data comemorativa' });
  });

  it('feriado nacional e data comemorativa no mesmo dia aparecem os dois (12/10)', () => {
    const names = listUpcomingDates(at('2026-10-12'), BRT, 0).map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(['Nossa Senhora Aparecida', 'Dia das Crianças']));
  });

  it('feriado móvel vem do módulo de feriados e ponto facultativo é marcado como tal', () => {
    const carnaval = listUpcomingDates(at('2026-02-10'), BRT, 10).find((d) => d.name === 'Carnaval');
    expect(carnaval).toMatchObject({ kind: 'ponto facultativo', month: 2, day: 17 }); // terça de Carnaval 2026
  });

  it('atravessa a virada do ano', () => {
    const dates = listUpcomingDates(at('2026-12-28'), BRT, 10);
    expect(dates.map((d) => `${d.year}-${d.month}-${d.day}:${d.name}`)).toEqual(['2026-12-31:Réveillon', '2027-1-1:Confraternização Universal']);
  });

  it('usa o dia da pessoa, não o de UTC (22h30 em Brasília já é amanhã em UTC)', () => {
    const lateNight = new Date('2026-11-27T01:30:00.000Z'); // 26/11 22:30 em Brasília
    const dates = listUpcomingDates(lateNight, BRT, 2);
    expect(dates[0]).toMatchObject({ name: 'Black Friday', daysAhead: 1 });
  });
});

describe('buildUpcomingDatesBlock', () => {
  it('fora de época vem vazio: o prompt não ganha nenhuma linha', () => {
    // 12/08 a 02/09/2026: nenhuma data na janela (o Dia dos Pais, 9/08, já passou e a Independência, 7/09, ainda não chegou).
    expect(buildUpcomingDatesBlock(BRT, at('2026-08-12'))).toBe('');
    // E o contrário: 23/07 já enxerga o Dia dos Pais (9/08) dentro dos 21 dias.
    expect(buildUpcomingDatesBlock(BRT, at('2026-07-23'))).toContain('Dia dos Pais');
  });

  it('descreve quando cai (hoje, amanhã, em N dias com dia da semana) e limita a 3 datas', () => {
    const near = buildUpcomingDatesBlock(BRT, at('2026-11-21'));
    expect(near).toContain('Black Friday (data comemorativa): sexta, 27/11, em 6 dias');
    expect(buildUpcomingDatesBlock(BRT, at('2026-11-27'))).toContain('hoje (27/11)');
    expect(buildUpcomingDatesBlock(BRT, at('2026-11-26'))).toContain('amanhã (27/11)');

    // 20/12/2026: Natal, Véspera, Réveillon e Ano-Novo cabem na janela, mas o bloco mostra no máximo 3 linhas.
    const many = buildUpcomingDatesBlock(BRT, at('2026-12-20'), 21);
    expect(many.split('\n').filter((line) => line.startsWith('- ')).length).toBeLessThanOrEqual(3);
  });

  it('carrega a regra de uso: no máximo uma menção, em forma de pergunta, sem criar nada sozinho', () => {
    const block = buildUpcomingDatesBlock(BRT, at('2026-11-21'));
    expect(block).toMatch(/no máximo UMA/);
    expect(block).toMatch(/nunca pra vender/);
    expect(block).toMatch(/sem o "sim" dela/);
  });
});

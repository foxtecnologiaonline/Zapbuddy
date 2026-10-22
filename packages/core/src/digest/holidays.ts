export interface HolidayToday {
  name: string;
  /** false = ponto facultativo (não é feriado por lei federal, mas tratado como tal na prática — ex.: Carnaval). */
  official: boolean;
  scope: 'nacional' | 'estadual';
}

interface MonthDay {
  month: number;
  day: number;
}

/**
 * Domingo de Páscoa (algoritmo gregoriano anônimo/Meeus — padrão, determinístico).
 * Base pros feriados móveis: Carnaval, Sexta-feira Santa e Corpus Christi.
 */
function easterSunday(year: number): MonthDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function shiftDate(year: number, month: number, day: number, deltaDays: number): MonthDay {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Feriados nacionais de data fixa (Lei nº 10.607/2002 + Lei nº 14.759/2023, que incluiu 20/11). */
const NATIONAL_FIXED_HOLIDAYS: Array<MonthDay & { name: string }> = [
  { month: 1, day: 1, name: 'Confraternização Universal' },
  { month: 4, day: 21, name: 'Tiradentes' },
  { month: 5, day: 1, name: 'Dia do Trabalho' },
  { month: 9, day: 7, name: 'Independência do Brasil' },
  { month: 10, day: 12, name: 'Nossa Senhora Aparecida' },
  { month: 11, day: 2, name: 'Finados' },
  { month: 11, day: 15, name: 'Proclamação da República' },
  { month: 11, day: 20, name: 'Dia Nacional de Zumbi e da Consciência Negra' },
  { month: 12, day: 25, name: 'Natal' },
];

/**
 * Feriados estaduais de "melhor esforço" — um por UF, o mais citado como
 * data magna/feriado estadual em fontes oficiais e de referência (pesquisa
 * feita em 2026-10). AC, MT e PR ficam de fora de propósito: a pesquisa não
 * encontrou uma data única confiável pra eles (fontes divergentes ou
 * nenhum feriado estadual vigente) — preferível não checar feriado regional
 * nessas 3 UFs do que arriscar informar uma data errada (mesmo princípio de
 * nunca inventar dado do CLAUDE.md, estendido aqui a fato, não só a
 * finanças). DF e MG ficam de fora porque a data magna de ambos coincide
 * com Tiradentes (21/04), já coberto como feriado nacional — sem duplicar.
 * Feriado municipal (de uma cidade específica, não do estado todo) não é
 * coberto — não temos o dado de cidade exata da pessoa, só a aproximação de
 * região do DDD (ver `location-from-ddd.ts`).
 */
const STATE_FIXED_HOLIDAYS: Record<string, MonthDay & { name: string }> = {
  AL: { month: 9, day: 16, name: 'Emancipação Política de Alagoas' },
  AM: { month: 9, day: 5, name: 'Elevação do Amazonas a Província' },
  AP: { month: 9, day: 13, name: 'Criação do Território Federal do Amapá' },
  BA: { month: 7, day: 2, name: 'Independência da Bahia' },
  CE: { month: 3, day: 25, name: 'Abolição da Escravidão no Ceará' },
  GO: { month: 10, day: 24, name: 'Fundação de Goiânia' },
  MA: { month: 7, day: 28, name: 'Adesão do Maranhão à Independência do Brasil' },
  MS: { month: 10, day: 11, name: 'Criação do Estado de Mato Grosso do Sul' },
  PA: { month: 8, day: 15, name: 'Adesão do Grão-Pará à Independência do Brasil' },
  PB: { month: 8, day: 5, name: 'Fundação do Estado da Paraíba' },
  PE: { month: 3, day: 6, name: 'Data Magna de Pernambuco' },
  PI: { month: 10, day: 19, name: 'Dia do Piauí' },
  RJ: { month: 4, day: 23, name: 'Dia de São Jorge' },
  RN: { month: 10, day: 3, name: 'Mártires de Cunhaú e Uruaçu' },
  RO: { month: 1, day: 4, name: 'Criação do Estado de Rondônia' },
  RR: { month: 10, day: 5, name: 'Criação do Estado de Roraima' },
  RS: { month: 9, day: 20, name: 'Revolução Farroupilha' },
  SC: { month: 8, day: 11, name: 'Data Magna de Santa Catarina' },
  SE: { month: 7, day: 8, name: 'Emancipação Política de Sergipe' },
  SP: { month: 7, day: 9, name: 'Revolução Constitucionalista' },
  TO: { month: 10, day: 5, name: 'Criação do Estado do Tocantins' },
};

/** Feriado/ponto facultativo nacional de hoje, se houver — data fixa ou móvel (baseada na Páscoa do ano). */
export function describeNationalHolidayToday(year: number, month: number, day: number): HolidayToday | null {
  const fixed = NATIONAL_FIXED_HOLIDAYS.find((h) => h.month === month && h.day === day);
  if (fixed) return { name: fixed.name, official: true, scope: 'nacional' };

  const easter = easterSunday(year);
  const goodFriday = shiftDate(year, easter.month, easter.day, -2);
  if (goodFriday.month === month && goodFriday.day === day) {
    return { name: 'Sexta-feira Santa', official: true, scope: 'nacional' };
  }

  const carnavalTuesday = shiftDate(year, easter.month, easter.day, -47);
  if (carnavalTuesday.month === month && carnavalTuesday.day === day) {
    return { name: 'Carnaval', official: false, scope: 'nacional' };
  }

  const corpusChristi = shiftDate(year, easter.month, easter.day, 60);
  if (corpusChristi.month === month && corpusChristi.day === day) {
    return { name: 'Corpus Christi', official: false, scope: 'nacional' };
  }

  return null;
}

/** Feriado estadual de hoje pra essa UF, se houver (só as UFs cobertas — ver comentário da tabela acima). */
export function describeStateHolidayToday(uf: string, year: number, month: number, day: number): HolidayToday | null {
  if (uf === 'ES') {
    const easter = easterSunday(year);
    const penha = shiftDate(year, easter.month, easter.day, 8);
    if (penha.month === month && penha.day === day) {
      return { name: 'Nossa Senhora da Penha', official: true, scope: 'estadual' };
    }
    return null;
  }

  const holiday = STATE_FIXED_HOLIDAYS[uf];
  if (holiday && holiday.month === month && holiday.day === day) {
    return { name: holiday.name, official: true, scope: 'estadual' };
  }
  return null;
}

/** Nacional tem prioridade (mais gente afetada); só olha o estadual se não houver nacional hoje. */
export function describeHolidayToday(uf: string, year: number, month: number, day: number): HolidayToday | null {
  return describeNationalHolidayToday(year, month, day) ?? describeStateHolidayToday(uf, year, month, day);
}

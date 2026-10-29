import { describe, expect, it } from 'vitest';
import { describeIndicatorSelection, formatIndicatorsMessage, formatIndicatorsOffer, INDICATOR_CHOICES, normalizeIndicatorSelection } from './digest.js';
import type { MarketRate } from './bcb.js';

const nbsp = (text: string) => text.replace(/ /g, ' ');
const emojiCount = (line: string) => (line.match(/\p{Extended_Pictographic}/gu) ?? []).length;

const rate = (indicator: MarketRate['indicator'], value: number, referenceDate: string): MarketRate => ({
  indicator,
  label: indicator,
  value,
  unit: '',
  referenceDate,
  source: 'Banco Central do Brasil (SGS)',
});

describe('normalizeIndicatorSelection', () => {
  it('filtra o desconhecido, tira repetição e ordena como na oferta', () => {
    expect(normalizeIndicatorSelection(['selic', 'bitcoin', 'usd', 'selic'])).toEqual(['usd', 'selic']);
    expect(normalizeIndicatorSelection([])).toEqual([]);
  });

  it('descreve a seleção em português', () => {
    expect(describeIndicatorSelection(['cdi', 'usd'])).toBe('Dólar, CDI');
  });
});

describe('formatIndicatorsMessage', () => {
  it('uma linha por indicador, com a data de referência e o aviso de câmbio', () => {
    const text = nbsp(
      formatIndicatorsMessage([
        rate('selic', 14.25, '2026-09-17'),
        rate('usd', 5.0383, '2026-10-28'),
        rate('ipca', 0.48, '2026-09-01'),
        rate('ipca_12m', 5.17, '2026-09-01'),
      ])!,
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('📊 *Indicadores de hoje*');
    expect(lines[1]).toBe('💵 Dólar: R$ 5,04 (fechamento de 28/10)'); // ordem da oferta, não da entrada
    expect(lines).toContain('🏦 Selic (meta): 14,25% ao ano');
    expect(lines).toContain('🧾 IPCA do mês: 0,48% (set/2026)');
    expect(lines).toContain('🧮 IPCA em 12 meses: 5,17%');
    expect(text).toContain('não a cotação ao vivo');
  });

  it('sem câmbio, não fala de câmbio', () => {
    expect(formatIndicatorsMessage([rate('selic', 14.25, '2026-09-17')])).toContain('Dados oficiais do Banco Central.');
    expect(formatIndicatorsMessage([rate('selic', 14.25, '2026-09-17')])).not.toContain('Câmbio');
  });

  it('nenhum valor da fonte = nenhuma mensagem (nunca número inventado)', () => {
    expect(formatIndicatorsMessage([])).toBeNull();
  });

  it('no máximo 1 emoji por linha', () => {
    const all = INDICATOR_CHOICES.map((choice) => rate(choice.code, 1.5, '2026-10-28'));
    for (const line of formatIndicatorsMessage(all)!.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
  });
});

describe('formatIndicatorsOffer', () => {
  it('lista todos os indicadores, explica o "a partir de amanhã" e não promete insistir', () => {
    const text = formatIndicatorsOffer();
    for (const choice of INDICATOR_CHOICES) expect(text).toContain(choice.label);
    expect(text).toContain('a partir de amanhã');
    expect(text).toContain('não pergunto de novo');
    expect(text).not.toMatch(/painel|preço|R\$ ?27|teste gr[aá]tis|assinatura/i);
    for (const line of text.split('\n')) expect(emojiCount(line)).toBeLessThanOrEqual(1);
  });
});

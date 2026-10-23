import { describe, expect, it } from 'vitest';
import { maskWhatsappNumber, normalizeBrazilianWhatsappNumber, whatsappNumberVariants } from './phone.js';

describe('normalizeBrazilianWhatsappNumber', () => {
  it.each([
    ['11 99999-9999', '5511999999999'],
    ['(11) 99999-9999', '5511999999999'],
    ['+55 11 99999-9999', '5511999999999'],
    ['5511999999999', '5511999999999'],
    ['011 99999-9999', '5511999999999'],
    ['0055 11 99999-9999', '5511999999999'],
    ['11 8888-7777', '551188887777'],
  ])('normaliza %s', (input, expected) => {
    expect(normalizeBrazilianWhatsappNumber(input)).toBe(expected);
  });

  it.each([['999999999'], ['abc'], ['11 3333-4444'], ['00 99999-9999'], ['10 99999-9999'], ['+1 415 555 2671'], ['11 89999-9999']])(
    'rejeita %s',
    (input) => {
      expect(normalizeBrazilianWhatsappNumber(input)).toBeNull();
    },
  );
});

describe('whatsappNumberVariants', () => {
  it('celular com 9 também casa com o wa_id sem o 9, e vice-versa', () => {
    expect(whatsappNumberVariants('5511999999999')).toEqual(['5511999999999', '551199999999']);
    expect(whatsappNumberVariants('551199999999')).toEqual(['551199999999', '5511999999999']);
  });

  it('número que não segue o padrão fica como está', () => {
    expect(whatsappNumberVariants('15551234567')).toEqual(['15551234567']);
  });
});

describe('maskWhatsappNumber', () => {
  it('mostra DDD e final, esconde o meio', () => {
    expect(maskWhatsappNumber('5511999994321')).toBe('+55 11 9****-4321');
    expect(maskWhatsappNumber('551188884321')).toBe('+55 11 8***-4321');
  });
});

import { describe, expect, it } from 'vitest';
import { formatSharedContactText } from './shared.js';

describe('formatSharedContactText', () => {
  it('monta o texto do cartão, marcado como dado, e saneia o nome', () => {
    const text = formatSharedContactText([{ name: { formatted_name: 'Aline\nSouza' }, phones: [{ phone: '+55 11 99999-9999', wa_id: '5511999999999' }] }]);
    expect(text).toContain('não instrução');
    expect(text).toContain('- Aline Souza: 5511999999999');
  });

  it('cartão sem nome ou telefone vira null', () => {
    expect(formatSharedContactText([{ name: { formatted_name: 'Sem fone' } }])).toBeNull();
  });
});

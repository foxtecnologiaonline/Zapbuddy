import { describe, expect, it } from 'vitest';
import { describeDraftStatus } from './outbound.js';

describe('describeDraftStatus', () => {
  it('deixa claro que o status é o que a pessoa informou', () => {
    expect(describeDraftStatus({ status: 'draft', reply_note: null })).toContain('ainda não marcado');
    expect(describeDraftStatus({ status: 'sent', reply_note: null })).toBe('Enviado (você confirmou)');
  });

  it('mostra o resumo da resposta, saneado e limitado', () => {
    expect(describeDraftStatus({ status: 'replied', reply_note: 'Disse\n\nque vai' })).toBe('Respondeu (você informou): Disse que vai');
    expect(describeDraftStatus({ status: 'replied', reply_note: 'x'.repeat(500) }).length).toBeLessThan(160);
    expect(describeDraftStatus({ status: 'replied', reply_note: null })).toBe('Respondeu (você informou)');
  });
});

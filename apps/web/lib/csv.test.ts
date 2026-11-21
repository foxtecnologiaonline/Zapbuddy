import { describe, expect, it } from 'vitest';
import { neutralizeFormula, toCsv } from './csv';

describe('neutralizeFormula', () => {
  it('prefixa texto que a planilha trataria como fórmula', () => {
    for (const bad of ['=SUM(A1)', '+55 11 9', '-cmd|calc', '@usuario', '\tfoo', '\rbar', '=HYPERLINK("http://x","y")']) {
      expect(neutralizeFormula(bad), bad).toBe(`'${bad}`);
    }
  });

  it('texto comum fica como está', () => {
    for (const ok of ['Marina', 'gastei 35', '2026-11-21', 'a=b', 'preço - 10%', '']) expect(neutralizeFormula(ok)).toBe(ok);
  });
});

describe('toCsv', () => {
  it('neutraliza fórmula em campo de texto, mas número negativo continua número', () => {
    const csv = toCsv([{ name: '=cmd()', delta: -5, note: 'ok' }], [
      { key: 'name', label: 'nome' },
      { key: 'delta', label: 'delta' },
      { key: 'note', label: 'nota' },
    ]);
    const lines = csv.replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('nome,delta,nota');
    expect(lines[1]).toBe("'=cmd(),-5,ok"); // fórmula neutralizada; -5 intocado
  });

  it('continua escapando vírgula, aspas e quebra de linha, e mantém o BOM do Excel', () => {
    const csv = toCsv([{ t: 'a,"b"\nc' }], [{ key: 't', label: 't' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"a,""b""\nc"');
  });

  it('nulo e indefinido viram campo vazio', () => {
    expect(toCsv([{ a: null, b: undefined }], [{ key: 'a', label: 'a' }, { key: 'b', label: 'b' }]).split('\r\n')[1]).toBe(',');
  });
});

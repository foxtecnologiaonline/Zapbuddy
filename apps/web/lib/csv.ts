export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  value?: (row: T) => string | number | null | undefined;
}

/** Escapa só quando precisa (RFC 4180) — aspas duplicadas pra escapar aspas internas, campo entre aspas se tiver vírgula/aspas/quebra de linha. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Planilha (Excel, Sheets) executa como FÓRMULA qualquer célula de texto que comece com = + - @ (ou tab/CR). O admin exporta
 * campos que a pessoa digitou (nome, mensagem de lembrete, parâmetros), então "=HYPERLINK(...)" num nome viraria código no
 * computador de quem abre o CSV. Prefixo com apóstrofo é a mitigação padrão (OWASP "CSV Injection"). Só texto: número negativo
 * (-5) continua número.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** CSV simples, sem dependência externa — volume dos exports do admin (contatos/chamadas/lembretes) não justifica uma lib. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((col) => escapeCsvField(col.label)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const raw = col.value ? col.value(row) : (row as Record<string, unknown>)[col.key as string];
        if (raw === null || raw === undefined) return escapeCsvField('');
        return escapeCsvField(typeof raw === 'string' ? neutralizeFormula(raw) : String(raw));
      })
      .join(','),
  );
  // BOM UTF-8 na frente — Excel (ainda muito usado por quem opera o admin) só
  // detecta acentuação corretamente com o BOM; sem isso "ã"/"ç" viram lixo.
  return `﻿${[header, ...lines].join('\r\n')}`;
}

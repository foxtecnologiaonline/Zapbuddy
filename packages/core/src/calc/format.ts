/** Valor em reais no formato brasileiro ("R$ 1.234,56") a partir de centavos inteiros. */
export function formatBrl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Número comum em pt-BR sem moeda (ex.: 12,5), até 4 casas. */
export function formatNumberPtBr(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

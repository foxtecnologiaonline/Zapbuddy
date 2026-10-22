export type Estacao = 'verão' | 'outono' | 'inverno' | 'primavera';

/**
 * Estação do ano no hemisfério sul, pelas datas astronômicas aproximadas
 * (variam até ±1 dia por ano por conta do calendário — não vale a pena
 * calcular o equinócio/solstício exato pra uma frase de bom dia). Aplicado
 * pro Brasil inteiro, mesmo nos estados mais próximos da linha do Equador
 * onde a variação climática real entre estações é pequena — mesmo tipo de
 * aproximação nacional já aceito em `timezone-from-ddd.ts`.
 */
export function estacaoDoAno(month: number, day: number): Estacao {
  if ((month === 12 && day >= 21) || month === 1 || month === 2 || (month === 3 && day <= 20)) return 'verão';
  if ((month === 3 && day >= 21) || month === 4 || month === 5 || (month === 6 && day <= 20)) return 'outono';
  if ((month === 6 && day >= 21) || month === 7 || month === 8 || (month === 9 && day <= 22)) return 'inverno';
  return 'primavera';
}

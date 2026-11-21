import type { CalendarEventSummary } from './types.js';

/**
 * Convenção do projeto (já usada pelo resumo, pelo "monta meu dia" e pelo split por dia): evento de DIA INTEIRO tem
 * `startIso` só com a data (`2026-11-21`, sem "T"); evento com hora tem instante ISO. Os dois provedores precisam
 * entregar nesse formato — o Google já entregava; o Outlook agora também (ver `microsoft.ts`).
 */
export function isAllDayStart(startIso: string): boolean {
  return !startIso.includes('T');
}

/**
 * Um evento só "colide" com outro se ocupa o horário: tem hora marcada e não está marcado como livre ou recusado.
 * Dia inteiro (aniversário, feriado, "viagem") nunca bloqueia horário, e cancelado nem chega aqui (os provedores o descartam).
 */
export function blocksTime(event: Pick<CalendarEventSummary, 'startIso' | 'busy'>): boolean {
  return event.busy !== false && !isAllDayStart(event.startIso);
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;

/**
 * O Graph descreve dia inteiro como meia-noite no fuso da agenda, e com `Prefer: outlook.timezone="UTC"` isso chega
 * deslocado (ex.: 03:00Z pra uma agenda em Brasília, 22:00Z do dia anterior pra UTC+2). Arredondar pra meia-noite mais
 * próxima (somar 12h e pegar a data UTC) devolve o dia certo em qualquer fuso de -12h a +12h, sem precisar saber o fuso.
 */
export function nearestUtcDate(iso: string): string {
  return new Date(Date.parse(iso) + HALF_DAY_MS).toISOString().slice(0, 10);
}

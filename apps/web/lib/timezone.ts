/**
 * Reexporta de @zapbuddy/core — a lógica de limites de data por fuso agora é
 * compartilhada com o resumo financeiro via WhatsApp (packages/core/src/llm
 * /tools/finance.ts), em vez de duplicada aqui e lá. Ver
 * packages/core/src/time/zoned-ranges.ts pra implementação.
 */
export { getCurrentMonthRange, type DateRange as MonthRange } from '@zapbuddy/core';

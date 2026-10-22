export interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

/**
 * Microsoft Graph quer `dateTime` SEM offset + um `timeZone` IANA separado
 * (não aceita o formato `2026-10-20T15:00:00-03:00` que o resto do projeto
 * usa — ver CalendarEventInput). Convertido sempre pra UTC aqui: mais simples
 * que mapear o fuso da pessoa pro nome IANA que o Graph espera, e o horário
 * final é o mesmo de qualquer forma (Graph só usa `timeZone` pra converter o
 * `dateTime` informado, não pra exibir — exibição é sempre no fuso do
 * cliente/app que lê o evento depois).
 */
export function toGraphDateTime(iso: string): GraphDateTime {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida pro Microsoft Graph: "${iso}"`);
  }
  return { dateTime: date.toISOString().slice(0, -1), timeZone: 'UTC' };
}

/**
 * O Graph devolve `start.dateTime`/`end.dateTime` em UTC por padrão, mas
 * SEM o sufixo `Z` (só quando o caller pede outro fuso via header `Prefer:
 * outlook.timezone=...`, que não usamos) — sem isso, `new Date(...)` na
 * ponta que lê de volta trataria o valor como horário local do processo,
 * não UTC. Idempotente: já vem com `Z`/offset, devolve como está.
 */
export function fromGraphDateTime(dateTime: string): string {
  return /[Zz]|[+-]\d{2}:\d{2}$/.test(dateTime) ? dateTime : `${dateTime}Z`;
}

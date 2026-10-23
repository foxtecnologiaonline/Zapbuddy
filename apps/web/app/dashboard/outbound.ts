/** Rótulos do log de recados a terceiros — puro, testável sem banco. */

export interface OutboundRow {
  status: string;
  failed_reason: string | null;
  replies: Array<{ body: string | null; message_type: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Enviada',
  delivered: 'Entregue',
  read: 'Lida',
  failed: 'Falhou',
};

const FAILURE_HINT: Array<[RegExp, string]> = [
  [/131047/, 'fora da janela de 24h da Meta'],
  [/131026/, 'número sem WhatsApp'],
  [/13(1049|0472)/, 'bloqueada por política da Meta'],
];

export function describeOutboundStatus(row: OutboundRow): string {
  const label = STATUS_LABEL[row.status] ?? row.status;
  if (row.status !== 'failed' || !row.failed_reason) return label;
  const hint = FAILURE_HINT.find(([pattern]) => pattern.test(row.failed_reason!))?.[1];
  return hint ? `${label} — ${hint}` : label;
}

/** "Respondeu" com o trecho da última resposta (ou o tipo, se for mídia) — ou "Sem resposta". */
export function describeOutboundReply(row: OutboundRow): string {
  const last = row.replies.at(-1);
  if (!last) return 'Sem resposta';
  const preview = last.body ? last.body.replace(/\s+/g, ' ').trim().slice(0, 120) : `[${last.message_type}]`;
  return `Respondeu: ${preview}`;
}

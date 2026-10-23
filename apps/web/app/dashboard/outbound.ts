/** Rótulos do log de recados — puro, testável sem banco. O status é o que a PESSOA contou ao Tom (ele não vê o que acontece no WhatsApp dela). */

export interface DraftRow {
  status: string;
  reply_note: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Redigido (ainda não marcado como enviado)',
  sent: 'Enviado (você confirmou)',
  replied: 'Respondeu (você informou)',
};

export function describeDraftStatus(row: DraftRow): string {
  const label = STATUS_LABEL[row.status] ?? row.status;
  if (row.status !== 'replied' || !row.reply_note) return label;
  return `${label}: ${row.reply_note.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
}

import { checkDatabaseConnection } from '@zapbuddy/db';
import { checkWhatsappConnection, getWorkerHeartbeatAgeMs, isHeartbeatFresh, pingRedis } from '@zapbuddy/core';
import { CardRow, Section, StatusCard } from '../components';

export const dynamic = 'force-dynamic';

function formatAge(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `há ${seconds}s`;
  return `há ${Math.round(seconds / 60)}min`;
}

/** Só dígitos (com ou sem DDI 55) → "+55 (34) 99102-0000"-like, pra bater visualmente com o número configurado. Formato inesperado: devolve como veio. */
function formatBrazilianNumber(digits: string): string {
  const withoutCountryCode = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  const match = /^(\d{2})(\d{4,5})(\d{4})$/.exec(withoutCountryCode);
  if (!match) return digits;
  const [, ddd, prefix, suffix] = match;
  return `+55 (${ddd}) ${prefix}-${suffix}`;
}

export default async function StatusPage() {
  const [databaseOk, redisOk, whatsapp, workerHeartbeatAgeMs] = await Promise.all([
    checkDatabaseConnection(),
    pingRedis(),
    checkWhatsappConnection(),
    getWorkerHeartbeatAgeMs(),
  ]);
  const workerOk = isHeartbeatFresh(workerHeartbeatAgeMs);

  const workerDetail =
    workerHeartbeatAgeMs === null
      ? 'nenhum heartbeat recebido ainda'
      : `último sinal ${formatAge(workerHeartbeatAgeMs)}`;

  const checkedAt = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return (
    <Section title="Status dos serviços" action={<span style={{ fontSize: 12, opacity: 0.5 }}>checado às {checkedAt} — atualiza a cada load</span>}>
      <CardRow>
        <StatusCard name="Dashboard web (Vercel)" ok detail="se esta página carregou, o servidor está respondendo" />
        <StatusCard name="Banco de dados (Supabase)" ok={databaseOk} />
        <StatusCard name="Fila (Redis/BullMQ)" ok={redisOk} />
        <StatusCard
          name={`WhatsApp (${whatsapp.provider === 'evolution' ? 'Evolution' : 'Cloud API'})`}
          ok={whatsapp.ok}
          detail={
            <>
              {whatsapp.number ? <div style={{ fontWeight: 600, color: '#e6edf3' }}>{formatBrazilianNumber(whatsapp.number)}</div> : null}
              {whatsapp.detail ? <div>{whatsapp.detail}</div> : null}
            </>
          }
        />
        <StatusCard name="Worker (filas/lembretes)" ok={workerOk} detail={workerDetail} />
      </CardRow>
    </Section>
  );
}

import { checkDatabaseConnection } from '@zapbuddy/db';
import { checkWhatsappConnection, getWorkerHeartbeatAgeMs, isWorkerHealthy, pingRedis } from '@zapbuddy/core';
import { CardRow, Section, StatusCard } from '../components';

export const dynamic = 'force-dynamic';

function formatAge(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `há ${seconds}s`;
  return `há ${Math.round(seconds / 60)}min`;
}

export default async function StatusPage() {
  const [databaseOk, redisOk, whatsapp, workerOk, workerHeartbeatAgeMs] = await Promise.all([
    checkDatabaseConnection(),
    pingRedis(),
    checkWhatsappConnection(),
    isWorkerHealthy(),
    getWorkerHeartbeatAgeMs(),
  ]);

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
          detail={whatsapp.detail}
        />
        <StatusCard name="Worker (filas/lembretes)" ok={workerOk} detail={workerDetail} />
      </CardRow>
    </Section>
  );
}

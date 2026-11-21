import { getSupabaseClient } from '../client.js';
import { ACTION_TOOL_NAMES, computeMvpMetrics, DAY_MS, type MvpMetrics, type MvpUser } from '../mvp-metrics.js';

/** O Supabase corta cada consulta em 1000 linhas: pagina até acabar, com teto pra uma conta gigante não travar a página do admin. */
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_QUERY = 20_000;
/** `.in()` vira parte da URL: lotes pequenos evitam estourar o tamanho dela. */
const IN_CHUNK = 100;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

async function paginate<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS_PER_QUERY; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface MvpMetricsReport {
  metrics: MvpMetrics;
  /** Quantos dias de cadastros entraram na coorte. */
  cohortDays: number;
  generatedAt: string;
  /** true = alguma consulta bateu no teto de linhas: o número é uma aproximação. */
  truncated: boolean;
}

/**
 * Métricas do MVP da coorte que se cadastrou nos últimos `cohortDays` dias. Só leitura, sem migration:
 * usa `users`, `webhook_events` (toda mensagem aceita) e `tool_call_logs` (toda ação da IA).
 * Definições em `mvp-metrics.ts`.
 */
export async function getMvpMetricsReport(cohortDays = 30, now: Date = new Date()): Promise<MvpMetricsReport> {
  const client = getSupabaseClient();
  const since = new Date(now.getTime() - cohortDays * DAY_MS).toISOString();
  let truncated = false;

  const usersResult = await paginate<{ id: string; whatsapp_number: string; created_at: string }>((from, to) =>
    client.from('users').select('id, whatsapp_number, created_at').gte('created_at', since).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to),
  );
  truncated ||= usersResult.truncated;
  const users: MvpUser[] = usersResult.rows.map((row) => ({ id: row.id, whatsappNumber: row.whatsapp_number, createdAt: row.created_at }));

  const messageTimesByNumber = new Map<string, string[]>();
  const firstActionAtByUser = new Map<string, string>();

  await Promise.all([
    (async () => {
      for (const numbers of chunk(users.map((user) => user.whatsappNumber), IN_CHUNK)) {
        const events = await paginate<{ whatsapp_number: string | null; created_at: string }>((from, to) =>
          client
            .from('webhook_events')
            .select('whatsapp_number, created_at')
            .in('whatsapp_number', numbers)
            .eq('status', 'accepted')
            .in('event_type', ['text', 'audio', 'document'])
            .gte('created_at', since)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        );
        truncated ||= events.truncated;
        for (const event of events.rows) {
          if (event.whatsapp_number === null) continue;
          const list = messageTimesByNumber.get(event.whatsapp_number) ?? [];
          list.push(event.created_at);
          messageTimesByNumber.set(event.whatsapp_number, list);
        }
      }
    })(),
    (async () => {
      for (const ids of chunk(users.map((user) => user.id), IN_CHUNK)) {
        const actions = await paginate<{ user_id: string | null; created_at: string }>((from, to) =>
          client
            .from('tool_call_logs')
            .select('user_id, created_at')
            .in('user_id', ids)
            .eq('success', true)
            .in('tool_name', [...ACTION_TOOL_NAMES])
            .gte('created_at', since)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to),
        );
        truncated ||= actions.truncated;
        for (const action of actions.rows) {
          if (action.user_id === null) continue;
          const current = firstActionAtByUser.get(action.user_id);
          if (current === undefined || action.created_at < current) firstActionAtByUser.set(action.user_id, action.created_at);
        }
      }
    })(),
  ]);

  return {
    metrics: computeMvpMetrics({ users, messageTimesByNumber, firstActionAtByUser, now }),
    cohortDays,
    generatedAt: now.toISOString(),
    truncated,
  };
}

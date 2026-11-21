import {
  DESTINATION_LABELS,
  SIGNAL_LABELS,
  VERDICT_LABELS,
  getCurationQueue,
  signalRatePer100,
  type CurationCase,
  type CurationQueue,
  type CurationReview,
  type CurationSignal,
} from '@zapbuddy/db';
import { OUTCOME_OPTIONS, outcomeValue } from '@/lib/curation-form';
import { Badge, CardRow, EmptyState, Section, StatCard, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

const DAYS = 14;
const PAGE_LIMIT = 50;
const SIGNALS = Object.keys(SIGNAL_LABELS) as CurationSignal[];
const STATUSES = ['pendentes', 'revisados', 'todos'] as const;
type Status = (typeof STATUSES)[number];

interface PageProps {
  searchParams: Promise<{ status?: string; sinal?: string; ok?: string; erro?: string }>;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const inputStyle = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid #2a3340',
  background: '#0d131b',
  color: '#e6edf3',
  fontSize: 13,
} as const;

function CaseCard({ item, review, canReview, back }: { item: CurationCase; review: CurationReview | undefined; canReview: boolean; back: string }) {
  return (
    <article style={{ background: '#121821', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
        <Badge tone={item.signal === 'category_fallback' || item.signal === 'corrected' ? 'neutral' : 'bad'}>{SIGNAL_LABELS[item.signal]}</Badge>
        <code style={{ fontSize: 12, opacity: 0.8 }}>{item.toolName}</code>
        <span style={{ fontSize: 12, opacity: 0.55 }}>{formatDateTime(item.at)}</span>
        {item.userId ? (
          <a href={`/admin/calls?userId=${item.userId}`} style={{ fontSize: 12, color: '#9fb0c0' }}>
            contato {item.userId.slice(0, 8)}…
          </a>
        ) : null}
        {review ? <Badge tone="ok">revisado</Badge> : null}
      </div>

      <p style={{ margin: '4px 0 8px', fontSize: 14 }}>{item.summary}</p>

      <details style={{ marginBottom: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, opacity: 0.7 }}>Ver o que o Tom entendeu e o que devolveu</summary>
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '8px 0 0', opacity: 0.85 }}>
          {`parâmetros: ${truncate(JSON.stringify(item.parameters, null, 2), 900)}\nresultado: ${truncate(JSON.stringify(item.result, null, 2) ?? 'null', 900)}${item.error ? `\nerro: ${truncate(item.error, 300)}` : ''}`}
        </pre>
      </details>

      {review ? (
        <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 8px' }}>
          {VERDICT_LABELS[review.verdict]}
          {review.destination ? ` → ${DESTINATION_LABELS[review.destination]}` : ''}
          {review.note ? ` — “${review.note}”` : ''} · {formatDateTime(review.reviewedAt)}
        </p>
      ) : null}

      {canReview ? (
        <form action="/api/admin/curadoria/review" method="POST" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="hidden" name="log_id" value={item.logId} />
          <input type="hidden" name="back" value={back} />
          <select name="outcome" defaultValue={review ? outcomeValue(review) : 'acertou'} style={inputStyle} aria-label="Veredito">
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="note"
            maxLength={500}
            defaultValue={review?.note ?? ''}
            placeholder="Nota (não cole dado pessoal)"
            style={{ ...inputStyle, flex: '1 1 220px' }}
          />
          <button type="submit" style={{ ...inputStyle, cursor: 'pointer', color: '#9fb0c0' }}>
            {review ? 'Refazer' : 'Salvar veredito'}
          </button>
        </form>
      ) : null}
    </article>
  );
}

function filterHref(status: Status, sinal: string | undefined): string {
  const params = new URLSearchParams();
  if (status !== 'pendentes') params.set('status', status);
  if (sinal) params.set('sinal', sinal);
  const qs = params.toString();
  return qs ? `/admin/curadoria?${qs}` : '/admin/curadoria';
}

export default async function CuradoriaPage({ searchParams }: PageProps) {
  const { status: statusParam, sinal, ok, erro } = await searchParams;
  const status: Status = (STATUSES as readonly string[]).includes(statusParam ?? '') ? (statusParam as Status) : 'pendentes';
  const signalFilter = SIGNALS.includes(sinal as CurationSignal) ? (sinal as CurationSignal) : undefined;

  let queue: CurationQueue | null = null;
  let failure: string | null = null;
  try {
    queue = await getCurationQueue(DAYS);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (queue === null) {
    return (
      <Section title="Curadoria">
        <EmptyState>Não consegui montar a fila agora: {failure}</EmptyState>
      </Section>
    );
  }

  const { scan, reviews } = queue;
  const reviewedCount = scan.cases.filter((item) => reviews.has(item.logId)).length;
  const pendingCount = scan.cases.length - reviewedCount;
  const rate = signalRatePer100(scan);

  const visible = scan.cases
    .filter((item) => (signalFilter ? item.signal === signalFilter : true))
    .filter((item) => (status === 'todos' ? true : status === 'revisados' ? reviews.has(item.logId) : !reviews.has(item.logId)));
  const shown = visible.slice(0, PAGE_LIMIT);
  const back = filterHref(status, signalFilter);

  return (
    <>
      <Section
        title={`Curadoria das interações — últimos ${queue.days} dias`}
        action={
          <a href="/api/admin/curadoria/export" style={{ color: '#9fb0c0', fontSize: 13 }}>
            Exportar vereditos (CSV) →
          </a>
        }
      >
        {ok ? <p style={{ color: '#4ade80', fontSize: 13 }}>Veredito salvo.</p> : null}
        {erro ? <p style={{ color: '#f87171', fontSize: 13 }}>{erro}</p> : null}
        {!queue.reviewsAvailable ? (
          <p style={{ color: '#fbbf24', fontSize: 13 }}>
            A fila já funciona, mas ainda não dá para salvar veredito: aplique a migration <code>0030_curation_reviews.sql</code> no Supabase.
          </p>
        ) : null}
        {queue.truncated ? (
          <p style={{ color: '#fbbf24', fontSize: 13 }}>A janela tem mais chamadas que o teto de leitura: os casos mais antigos podem não aparecer.</p>
        ) : null}

        <CardRow>
          <StatCard label="Casos na janela" value={scan.cases.length} hint={`em ${scan.callsTotal} chamadas da IA`} />
          <StatCard label="A revisar" value={pendingCount} hint={`${reviewedCount} já revisados`} />
          <StatCard
            label="Sinais por 100 chamadas"
            value={rate === null ? '—' : rate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
            hint="compare antes e depois de mudar prompt/regra"
          />
        </CardRow>
        <div style={{ marginTop: 12 }}>
          <CardRow>
            {SIGNALS.map((signal) => (
              <StatCard key={signal} label={SIGNAL_LABELS[signal]} value={scan.countsBySignal[signal]} />
            ))}
          </CardRow>
        </div>
      </Section>

      <Section title="Fila">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
          {STATUSES.map((item) => (
            <a key={item} href={filterHref(item, signalFilter)} style={{ color: item === status ? '#e6edf3' : '#9fb0c0', fontWeight: item === status ? 600 : 400 }}>
              {item === 'pendentes' ? 'A revisar' : item === 'revisados' ? 'Revisados' : 'Todos'}
            </a>
          ))}
          <span style={{ opacity: 0.3 }}>|</span>
          <a href={filterHref(status, undefined)} style={{ color: signalFilter ? '#9fb0c0' : '#e6edf3' }}>
            Todos os sinais
          </a>
          {SIGNALS.map((signal) => (
            <a key={signal} href={filterHref(status, signal)} style={{ color: signalFilter === signal ? '#e6edf3' : '#9fb0c0', fontWeight: signalFilter === signal ? 600 : 400 }}>
              {SIGNAL_LABELS[signal]}
            </a>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState>{scan.cases.length === 0 ? 'Nenhum sinal na janela. Bom sinal: ninguém desfez, corrigiu ou esbarrou em falha.' : 'Nada com esse filtro.'}</EmptyState>
        ) : (
          <>
            {visible.length > shown.length ? (
              <p style={{ fontSize: 12, opacity: 0.6 }}>
                Mostrando {shown.length} de {visible.length}, dos mais urgentes para os menos.
              </p>
            ) : null}
            {shown.map((item) => (
              <CaseCard key={item.logId} item={item} review={reviews.get(item.logId)} canReview={queue.reviewsAvailable} back={back} />
            ))}
          </>
        )}
      </Section>

      <Section title="Como exercer a curadoria">
        <ul style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
          <li>
            <strong>Ritual semanal (~30 min):</strong> revise os mais urgentes (desfeito → falha → corrigido → categoria). Para cada um, responda só: o Tom errou ou o sinal enganou? Se errou, para onde vai.
          </li>
          <li>
            <strong>Regra do 3:</strong> o mesmo padrão em 3 casos vira mudança de prompt, categoria ou bug. Caso isolado vira, no máximo, um caso de teste.
          </li>
          <li>
            <strong>Nunca copie o texto real</strong> de uma pessoa para a nota ou para um teste: reescreva o caso de forma sintética. Os trechos guardados com o veredito já saem com CPF, e-mail e telefone mascarados.
          </li>
          <li>
            <strong>Depois de mudar o prompt ou a regra,</strong> espere ~2 semanas e compare “sinais por 100 chamadas”. Se não caiu, a mudança não resolveu.
          </li>
          <li>
            Isto cura as <strong>interpretações</strong> do Tom (o que ele entendeu e executou). As frases das pessoas e as respostas do Tom não são guardadas — ver docs/adr/0011.
          </li>
        </ul>
      </Section>
    </>
  );
}

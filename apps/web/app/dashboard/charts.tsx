// Componentes visuais puros (SVG/CSS, zero dependência nova) — mesmo padrão
// do Sparkline já usado no admin (apps/web/app/admin/(authenticated)/components.tsx),
// copiado/adaptado aqui em vez de compartilhado: evita um refactor
// cross-cutting pra reusar ~15 linhas de SVG, mantém o diff isolado do admin.
//
// Uma série só: matiz de gasto (expense) e nada mais. Sem paleta categórica
// nova — a identidade de cada barra vem do rótulo ao lado, não da cor.

const SPARKLINE_WIDTH = 240;
const SPARKLINE_HEIGHT = 72;

/**
 * Linha de tendência que ocupa a largura do cartão (viewBox fixo + escala
 * responsiva). Área preenchida bem suave embaixo, pra leitura de "volume" sem
 * pesar. stroke com non-scaling-stroke pra espessura não esticar.
 */
export function Sparkline({ data, color = 'var(--expense)' }: { data: number[]; color?: string }) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? SPARKLINE_WIDTH / (data.length - 1) : 0;
  const coords = data.map((value, index) => ({
    x: index * stepX,
    y: SPARKLINE_HEIGHT - (value / max) * SPARKLINE_HEIGHT,
  }));
  const linePoints = coords.map(({ x, y }) => `${x},${y}`).join(' ');
  const areaPoints = `0,${SPARKLINE_HEIGHT} ${linePoints} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`;

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      preserveAspectRatio="none"
      style={{ height: 72 }}
      role="img"
      aria-label={`tendência dos últimos ${data.length} dias`}
    >
      <polygon points={areaPoints} fill={color} fillOpacity={0.12} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const CATEGORY_BARS_TOP_N = 6;

const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Barras horizontais por categoria, ordenadas por valor desc — top N + "outros" agregado. */
export function CategoryBars({ byCategory }: { byCategory: Record<string, number> }) {
  const entries = Object.entries(byCategory).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  const top = entries.slice(0, CATEGORY_BARS_TOP_N);
  const rest = entries.slice(CATEGORY_BARS_TOP_N);
  const restTotal = rest.reduce((sum, [, cents]) => sum + cents, 0);
  const rows = restTotal > 0 ? [...top, ['outros', restTotal] as [string, number]] : top;
  const max = Math.max(...rows.map(([, cents]) => cents), 1);

  return (
    <div className="bars">
      {rows.map(([category, cents]) => (
        <div key={category} className="bar-row">
          <span className="bar-label">{category}</span>
          <div className="bar-track" role="presentation">
            <div className="bar-fill" style={{ width: `${(cents / max) * 100}%` }} />
          </div>
          <span className="bar-value">{formatBRL(cents)}</span>
        </div>
      ))}
    </div>
  );
}

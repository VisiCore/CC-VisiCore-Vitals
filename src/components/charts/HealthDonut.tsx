import type { HealthCounts } from '../../lib/metrics';

interface Seg {
  key: 'Green' | 'Yellow' | 'Red' | 'Unknown';
  label: string;
  color: string;
}
const ALL_SEGS: Seg[] = [
  { key: 'Green', label: 'Healthy', color: 'var(--good)' },
  { key: 'Yellow', label: 'Warning', color: 'var(--warning)' },
  { key: 'Red', label: 'Unhealthy', color: 'var(--critical)' },
  { key: 'Unknown', label: 'Unknown', color: 'var(--muted)' },
];

/** Donut of Green/Yellow/Red counts with a centered total and a legend. */
export function HealthDonut({ counts, size = 132 }: { counts: HealthCounts; size?: number }) {
  const r = size / 2 - 11;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = counts.Green + counts.Yellow + counts.Red + counts.Unknown || 1;
  // Show the three health states always; show Unknown only when present.
  const SEGS = ALL_SEGS.filter((s) => s.key !== 'Unknown' || counts.Unknown > 0);

  let offset = 0;
  const arcs = SEGS.map((s) => {
    const val = counts[s.key];
    const frac = val / total;
    const dash = frac * circ;
    const el = (
      <circle
        key={s.key}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={11}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += dash;
    return val > 0 ? el : null;
  });

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <svg width={size} height={size} style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={11} />
        {arcs}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontSize={26}
          fontWeight={700}
          fill="var(--text)"
        >
          {counts.total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
          total
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {SEGS.map((s) => (
          <div key={s.key} className="legend-item" style={{ fontSize: 13 }}>
            <span className="legend-swatch" style={{ background: s.color }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            <span style={{ fontWeight: 650, color: 'var(--text)' }}>{counts[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
import { formatTime, formatDate } from '../../lib/format';

export interface ChartPoint {
  t: number; // epoch ms
  v: number;
}
export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
}

interface Props {
  series: ChartSeries[];
  height?: number;
  valueFormat: (n: number) => string;
  /** Show filled area under lines (default true). */
  area?: boolean;
  /** Use date instead of time for x labels (for multi-day ranges). */
  dateAxis?: boolean;
}

const M = { top: 12, right: 14, bottom: 26, left: 56 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function TimeSeriesChart({
  series,
  height = 220,
  valueFormat,
  area = true,
  dateAxis = false,
}: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const base = series[0]?.points ?? [];
  const n = base.length;
  const hasData = n > 0 && series.some((s) => s.points.some((p) => p.v > 0));

  const plotW = Math.max(10, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const rawMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.v)));
  const yMax = niceMax(rawMax);
  const step = n > 1 ? plotW / (n - 1) : plotW;

  const xAt = (i: number) => M.left + i * step;
  const yAt = (v: number) => M.top + plotH - (v / yMax) * plotH;

  const linePath = (pts: ChartPoint[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(' ');
  const areaPath = (pts: ChartPoint[]) =>
    `${linePath(pts)} L${xAt(pts.length - 1).toFixed(1)},${(M.top + plotH).toFixed(1)} L${xAt(0).toFixed(
      1,
    )},${(M.top + plotH).toFixed(1)} Z`;

  // y gridlines
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  // x ticks (about 5)
  const xTickCount = Math.min(6, Math.max(2, Math.floor(plotW / 90)));
  const xTicks: number[] = [];
  if (n > 1) {
    for (let k = 0; k < xTickCount; k++) xTicks.push(Math.round((k / (xTickCount - 1)) * (n - 1)));
  }

  const gid = useRef(`g${Math.floor(performance.now() % 1e6)}`).current;

  function onMove(e: React.MouseEvent) {
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round((x - M.left) / step);
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  if (!hasData) {
    return (
      <div ref={holderRef} className="chart-holder">
        <div className="center-state" style={{ height }}>
          No data in this window
        </div>
      </div>
    );
  }

  const hx = hover != null ? xAt(hover) : 0;
  const tooltipLeft = Math.min(Math.max(hx + 12, 4), width - 150);
  const hoverTime = hover != null ? base[hover]?.t : 0;

  return (
    <div ref={holderRef} className="chart-holder">
      <div className="chart-legend">
        {series.map((s) => (
          <span className="legend-item" key={s.name}>
            <span className="legend-swatch" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
      >
        <defs>
          {series.map((s, si) => (
            <linearGradient id={`${gid}-${si}`} key={si} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* y gridlines + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={M.left}
              x2={width - M.right}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={M.left - 8}
              y={yAt(v) + 3.5}
              textAnchor="end"
              fontSize={10.5}
              fill="var(--muted)"
            >
              {valueFormat(v)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {xTicks.map((i) => (
          <text
            key={i}
            x={xAt(i)}
            y={height - 8}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            fontSize={10.5}
            fill="var(--muted)"
          >
            {dateAxis ? formatDate(base[i].t) : formatTime(base[i].t)}
          </text>
        ))}

        {/* series */}
        {area &&
          series.map((s, si) => (
            <path key={`a${si}`} d={areaPath(s.points)} fill={`url(#${gid}-${si})`} />
          ))}
        {series.map((s, si) => (
          <path
            key={`l${si}`}
            d={linePath(s.points)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}

        {/* hover */}
        {hover != null && (
          <g>
            <line
              x1={hx}
              x2={hx}
              y1={M.top}
              y2={M.top + plotH}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
            {series.map((s, si) => (
              <circle
                key={si}
                cx={hx}
                cy={yAt(s.points[hover]?.v ?? 0)}
                r={3.6}
                fill="var(--surface)"
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
          </g>
        )}
      </svg>

      {hover != null && (
        <div className="chart-tooltip" style={{ left: tooltipLeft, top: 8 }}>
          <div className="tt-time">
            {dateAxis ? formatDate(hoverTime) : formatTime(hoverTime)}
          </div>
          {series.map((s) => (
            <div className="tt-row" key={s.name}>
              <span className="lab">
                <span className="legend-swatch" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="val">{valueFormat(s.points[hover]?.v ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

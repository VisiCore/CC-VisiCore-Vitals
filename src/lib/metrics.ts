import type { ChartPoint } from '../components/charts/TimeSeriesChart';
import type { Health, MetricRow } from '../api/types';

/** Pull one alias out of metric rows as chart points (epoch-seconds → ms). */
export function toPoints(rows: MetricRow[], alias: string): ChartPoint[] {
  return rows.map((r) => ({
    t: Number(r.starttime) * 1000,
    v: Number(r[alias] ?? 0),
  }));
}

/** Sum one alias across all rows. */
export function sumAlias(rows: MetricRow[], alias: string): number {
  return rows.reduce((acc, r) => acc + Number(r[alias] ?? 0), 0);
}

/**
 * Least-squares linear trend over (t ms, v) points. Returns the slope per day
 * and a predictor, or null with fewer than 2 points. Used to project daily
 * license usage toward the quota.
 */
export function linearTrend(
  points: ChartPoint[],
): { slopePerDay: number; at: (tMs: number) => number } | null {
  if (points.length < 2) return null;
  const DAY = 86_400_000;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / DAY);
  const ys = points.map((p) => p.v);
  const n = points.length;
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = yMean - slope * xMean;
  return {
    slopePerDay: slope,
    at: (tMs: number) => intercept + slope * ((tMs - t0) / DAY),
  };
}

/** Normalize a Cribl health string to our union. */
export function normHealth(h: string | undefined): Health {
  if (h === 'Green' || h === 'Yellow' || h === 'Red') return h;
  return 'Unknown';
}

export interface HealthCounts {
  Green: number;
  Yellow: number;
  Red: number;
  Unknown: number;
  total: number;
}

export function countHealth(healths: (string | undefined)[]): HealthCounts {
  const c: HealthCounts = { Green: 0, Yellow: 0, Red: 0, Unknown: 0, total: 0 };
  for (const h of healths) {
    c[normHealth(h)]++;
    c.total++;
  }
  return c;
}

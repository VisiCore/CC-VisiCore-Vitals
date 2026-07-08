// Pure route-health analysis: fold per-bucket route throughput samples into a
// per-route verdict. Kept free of React / fetch so the logic stays testable.

import type { MetricRow } from '../api/types';

export type RouteStatus = 'stalled' | 'active';

export interface RouteHealth {
  /** Stable key: `${workerGroup}::${routeId}`. */
  key: string;
  routeId: string;
  /** Friendly name when available, else the route id. */
  name: string;
  workerGroup: string;
  /** Unix **seconds** of the most recent bucket that carried data. */
  lastDataTime: number;
  /** Seconds since `lastDataTime` (clamped at 0). */
  gapSeconds: number;
  /** Total events into the route across the lookback window. */
  events: number;
  /** Total bytes into the route across the lookback window. */
  bytes: number;
  status: RouteStatus;
}

export interface AnalyzeOptions {
  /** Current time in Unix **seconds** (defaults to wall clock). */
  nowSec?: number;
  /** A route is "stalled" once its gap reaches this many seconds. */
  stallSeconds: number;
}

interface Accumulator {
  routeId: string;
  name: string;
  workerGroup: string;
  lastDataTime: number;
  events: number;
  bytes: number;
}

function num(v: number | string | undefined): number {
  return typeof v === 'number' ? v : 0;
}

function str(v: number | string | undefined): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Fold raw metric rows into one verdict per (route, worker group).
 *
 * Only routes that reported data somewhere in the window are returned — a route
 * with no data at all was never "reporting", so it can't have "stopped". A
 * route counts as `stalled` when its newest data bucket is at least
 * `stallSeconds` old; otherwise it is `active`.
 *
 * Sort order: stalled first (longest silence first), then active routes
 * (most recently seen first).
 */
export function analyzeRoutes(rows: MetricRow[], opts: AnalyzeOptions): RouteHealth[] {
  const nowSec = opts.nowSec ?? Date.now() / 1000;
  const byKey = new Map<string, Accumulator>();

  for (const row of rows) {
    const routeId = str(row.route) ?? str(row.name) ?? '(unknown)';
    const workerGroup = str(row.__worker_group) ?? '(unknown)';
    const key = `${workerGroup}::${routeId}`;

    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        routeId,
        name: str(row.name) ?? routeId,
        workerGroup,
        lastDataTime: 0,
        events: 0,
        bytes: 0,
      };
      byKey.set(key, acc);
    }

    const events = num(row.eventsIn);
    const bytes = num(row.bytesIn);
    acc.events += events;
    acc.bytes += bytes;
    if ((events > 0 || bytes > 0) && typeof row.endtime === 'number') {
      acc.lastDataTime = Math.max(acc.lastDataTime, row.endtime);
    }
  }

  const out: RouteHealth[] = [];
  for (const acc of byKey.values()) {
    // Never reported within the window → not a "stopped" route.
    if (acc.lastDataTime === 0 && acc.events === 0 && acc.bytes === 0) continue;

    const gapSeconds = Math.max(0, nowSec - acc.lastDataTime);
    const status: RouteStatus = gapSeconds >= opts.stallSeconds ? 'stalled' : 'active';
    out.push({
      key: `${acc.workerGroup}::${acc.routeId}`,
      routeId: acc.routeId,
      name: acc.name,
      workerGroup: acc.workerGroup,
      lastDataTime: acc.lastDataTime,
      gapSeconds,
      events: acc.events,
      bytes: acc.bytes,
      status,
    });
  }

  out.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'stalled' ? -1 : 1;
    // Stalled: longest silence first. Active: most recently seen first.
    return a.status === 'stalled' ? b.gapSeconds - a.gapSeconds : a.gapSeconds - b.gapSeconds;
  });

  return out;
}

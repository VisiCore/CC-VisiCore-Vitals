// Cribl API client. Uses the platform fetch proxy (window.CRIBL_API_URL) when
// running inside Cribl; falls back to captured fixtures for standalone demo/dev.
import type {
  Group,
  IOStatus,
  LicenseUsageDay,
  MetricRow,
  SystemInfo,
  SystemMessage,
  WorkerNode,
} from './types';

declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_BASE_PATH?: string;
  }
}

const API_URL = (typeof window !== 'undefined' && window.CRIBL_API_URL) || '';

/** True when no live Cribl API is available and the app renders captured demo data. */
export const IS_DEMO = !API_URL;

/** Cribl UI origin (derived from the API URL), e.g. https://tenant.cribl.cloud. */
export const CRIBL_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, '');

/**
 * Deep link to a Source, Destination, or the Data Routes page in the Cribl
 * Stream UI for a group. Absolute URL so it works from inside the app's
 * sandboxed iframe with target="_top". Returns '' in demo mode (no live origin).
 */
export function streamLink(kind: 'source' | 'destination' | 'route', group: string): string {
  if (!CRIBL_ORIGIN) return '';
  const seg = kind === 'source' ? 'inputs' : kind === 'destination' ? 'outputs' : 'routes';
  return `${CRIBL_ORIGIN}/stream/m/${group}/${seg}`;
}

const IN_OUT_AGGS = [
  'sum("total.in_events").as("eventsIn")',
  'sum("total.out_events").as("eventsOut")',
  'sum("total.in_bytes").as("bytesIn")',
  'sum("total.out_bytes").as("bytesOut")',
];

// ---------------------------------------------------------------------------
// Low-level transport
// ---------------------------------------------------------------------------

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface Fixtures {
  capturedAt: number;
  groups: { items: Group[] };
  workers: { items: WorkerNode[] };
  systemInfo: { items: SystemInfo[] };
  health: unknown;
  licenseUsage: { items: LicenseUsageDay[] };
  throughputAll: MetricRow[];
  droppedAll: MetricRow[];
  byGroup: MetricRow[];
  topSourcesDefault: MetricRow[];
  topDestsDefault: MetricRow[];
  statusInputs: Record<string, { items?: IOStatus[] }>;
  statusOutputs: Record<string, { items?: IOStatus[] }>;
  messages: { items: SystemMessage[] };
}

let fixturesPromise: Promise<Fixtures> | null = null;
function fixtures(): Promise<Fixtures> {
  if (!fixturesPromise) {
    fixturesPromise = fetch(`${import.meta.env.BASE_URL}fixtures.json`).then((r) => {
      if (!r.ok) throw new Error('Unable to load demo fixtures');
      return r.json() as Promise<Fixtures>;
    });
  }
  return fixturesPromise;
}

// ---------------------------------------------------------------------------
// Metric query
// ---------------------------------------------------------------------------

export interface MetricQuery {
  where: string;
  aggregations: string[];
  splitBys?: string[];
  timeWindowSeconds: number; // -1 = natural buckets, N = N-second buckets
  earliestSeconds: number;
}

function whereForGroup(group: string | 'all'): string {
  if (group === 'all') return '((__dist_mode=="worker") || (__dist_mode=="managed-edge"))';
  return `(__worker_group=="${group}")`;
}

async function runQuery(q: MetricQuery): Promise<MetricRow[]> {
  const body: Record<string, unknown> = {
    where: q.where,
    aggs: {
      aggregations: q.aggregations,
      timeWindowSeconds: q.timeWindowSeconds,
      ...(q.splitBys ? { splitBys: q.splitBys } : {}),
    },
    earliest: `${q.earliestSeconds}s`,
    latest: Date.now(),
  };
  const res = await apiPost<{ results?: MetricRow[] }>('/system/metrics/query', body);
  return res.results ?? [];
}

// ---------------------------------------------------------------------------
// High-level, semantic data access (each has a demo fallback)
// ---------------------------------------------------------------------------

export async function getGroups(): Promise<Group[]> {
  if (IS_DEMO) return (await fixtures()).groups.items;
  return (await apiGet<{ items: Group[] }>('/master/groups')).items;
}

export async function getWorkers(): Promise<WorkerNode[]> {
  if (IS_DEMO) return (await fixtures()).workers.items;
  return (await apiGet<{ items: WorkerNode[] }>('/master/workers')).items;
}

export async function getSystemInfo(): Promise<SystemInfo | null> {
  if (IS_DEMO) return (await fixtures()).systemInfo.items[0] ?? null;
  const r = await apiGet<{ items: SystemInfo[] }>('/system/info');
  return r.items[0] ?? null;
}

/** System notifications — errors, warnings, info (failed inits, zero-volume routes, etc). */
export async function getMessages(): Promise<SystemMessage[]> {
  if (IS_DEMO) return (await fixtures()).messages.items;
  return (await apiGet<{ items: SystemMessage[] }>('/system/messages')).items ?? [];
}

export async function getLicenseUsage(): Promise<LicenseUsageDay[]> {
  if (IS_DEMO) return (await fixtures()).licenseUsage.items;
  return (await apiGet<{ items: LicenseUsageDay[] }>('/system/licenses/usage')).items;
}

interface ConfigIOItem {
  id: string;
  type: string;
  disabled?: boolean | null;
  status?: IOStatus['status'];
}

// The Source/Destination config endpoints (/system/inputs, /system/outputs) carry
// the authoritative runtime health in each item's `status.health`. The
// /system/status/* endpoints report "loaded" state and show everything Green, so
// we deliberately use the config endpoints and drop disabled items (not running).
async function fetchConfigStatus(path: string): Promise<IOStatus[]> {
  const r = await apiGet<{ items: ConfigIOItem[] }>(path);
  return (r.items ?? [])
    .filter((i) => !i.disabled)
    .map((i) => ({ id: i.id, type: i.type, status: i.status ?? {} }));
}

export async function getInputStatus(group: string): Promise<IOStatus[]> {
  if (IS_DEMO) return (await fixtures()).statusInputs[group]?.items ?? [];
  return fetchConfigStatus(`/m/${group}/system/inputs`);
}

export async function getOutputStatus(group: string): Promise<IOStatus[]> {
  if (IS_DEMO) return (await fixtures()).statusOutputs[group]?.items ?? [];
  return fetchConfigStatus(`/m/${group}/system/outputs`);
}

export type IOStatusWithGroup = IOStatus & { group: string };

function tag(items: IOStatus[], group: string): IOStatusWithGroup[] {
  return items.map((i) => ({ ...i, group }));
}

/** Source status across several groups, each tagged with its group. */
export async function getInputStatuses(groupIds: string[]): Promise<IOStatusWithGroup[]> {
  const all = await Promise.all(
    groupIds.map((g) => getInputStatus(g).then((items) => tag(items, g)).catch(() => [])),
  );
  return all.flat();
}

/** Destination status across several groups, each tagged with its group. */
export async function getOutputStatuses(groupIds: string[]): Promise<IOStatusWithGroup[]> {
  const all = await Promise.all(
    groupIds.map((g) => getOutputStatus(g).then((items) => tag(items, g)).catch(() => [])),
  );
  return all.flat();
}

/** Throughput (events + bytes in/out) time series for a group or all groups. */
export async function getThroughputSeries(
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<MetricRow[]> {
  if (IS_DEMO) return (await fixtures()).throughputAll;
  return runQuery({
    where: `(has_no_dimensions) && ${whereForGroup(group)}`,
    aggregations: IN_OUT_AGGS,
    timeWindowSeconds: bucketSeconds,
    earliestSeconds: rangeSeconds,
  });
}

/** Dropped-events time series for a group or all worker groups. */
export async function getDroppedSeries(
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<MetricRow[]> {
  if (IS_DEMO) return (await fixtures()).droppedAll;
  const where =
    group === 'all'
      ? '(has_no_dimensions) && (__dist_mode=="worker")'
      : `(has_no_dimensions) && (__worker_group=="${group}")`;
  return runQuery({
    where,
    aggregations: ['sum("total.dropped_events").as("dropped")'],
    timeWindowSeconds: bucketSeconds,
    earliestSeconds: rangeSeconds,
  });
}

/** Per-worker-group throughput totals over the last 24h (split by group). */
export async function getGroupTotals(rangeSeconds: number): Promise<MetricRow[]> {
  if (IS_DEMO) return (await fixtures()).byGroup;
  return runQuery({
    where: '(has_no_dimensions)',
    aggregations: IN_OUT_AGGS,
    splitBys: ['__worker_group'],
    timeWindowSeconds: -1,
    earliestSeconds: rangeSeconds,
  });
}

// ---------------------------------------------------------------------------
// Destination backpressure & persistent queues
// ---------------------------------------------------------------------------

export interface OutputPQStat {
  /** Bare output id (type prefix stripped, matching the status API ids). */
  id: string;
  group: string;
  /** Persistent-queue size (bytes) in the most recent bucket that reported. */
  pqBytes: number;
  /** Peak persistent-queue size (bytes) across the window. */
  pqPeakBytes: number;
  /** Backpressure engaged in the most recent bucket that reported. */
  backpressureNow: boolean;
  /** Number of time buckets in the window where backpressure was engaged. */
  backpressureBuckets: number;
}

// Demo backpressure/PQ profiles keyed by `${group}::${outputId}` — one output
// currently backpressured with a deep PQ, one that recovered earlier.
const DEMO_PQ: Record<string, { pqBytes: number; peak: number; now: boolean; buckets: number }> = {
  'default::AIO_Splunk': { pqBytes: 3.2 * 1024 ** 3, peak: 4.1 * 1024 ** 3, now: true, buckets: 9 },
  'defaultHybrid::archive-lake': { pqBytes: 0, peak: 1.4 * 1024 ** 3, now: false, buckets: 3 },
};

function demoPQStats(group: string | 'all'): OutputPQStat[] {
  return Object.entries(DEMO_PQ)
    .map(([key, v]) => {
      const [g, id] = key.split('::');
      return {
        id,
        group: g,
        pqBytes: v.pqBytes,
        pqPeakBytes: v.peak,
        backpressureNow: v.now,
        backpressureBuckets: v.buckets,
      };
    })
    .filter((s) => group === 'all' || s.group === group);
}

/**
 * Per-destination backpressure + persistent-queue depth over the window.
 * `pq.queue_size` is a gauge (bytes); `backpressure.outputs` is non-zero while
 * the destination is exerting backpressure.
 */
export async function getOutputPQStats(
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<OutputPQStat[]> {
  if (IS_DEMO) return demoPQStats(group);
  const rows = await runQuery({
    where: whereForTop(group),
    aggregations: [
      'max("pq.queue_size").as("pqBytes")',
      'max("backpressure.outputs").as("bp")',
    ],
    splitBys: ['output', '__worker_group'],
    timeWindowSeconds: bucketSeconds,
    earliestSeconds: rangeSeconds,
  });

  interface Acc {
    id: string;
    group: string;
    latestTime: number;
    latestPQ: number;
    latestBP: number;
    peak: number;
    bpBuckets: number;
  }
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const raw = typeof r.output === 'string' ? r.output : '';
    if (!raw) continue;
    const id = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    const grp = typeof r.__worker_group === 'string' ? r.__worker_group : '(unknown)';
    const key = `${grp}::${id}`;
    const pq = Number(r.pqBytes ?? 0);
    const bp = Number(r.bp ?? 0);
    const end = Number(r.endtime ?? 0);

    let a = acc.get(key);
    if (!a) {
      a = { id, group: grp, latestTime: 0, latestPQ: 0, latestBP: 0, peak: 0, bpBuckets: 0 };
      acc.set(key, a);
    }
    a.peak = Math.max(a.peak, pq);
    if (bp > 0) a.bpBuckets++;
    if (end >= a.latestTime) {
      a.latestTime = end;
      a.latestPQ = pq;
      a.latestBP = bp;
    }
  }

  return [...acc.values()].map((a) => ({
    id: a.id,
    group: a.group,
    pqBytes: a.latestPQ,
    pqPeakBytes: a.peak,
    backpressureNow: a.latestBP > 0,
    backpressureBuckets: a.bpBuckets,
  }));
}

// ---------------------------------------------------------------------------
// Per-node system metrics (CPU / memory sparklines)
// ---------------------------------------------------------------------------

export interface NodePoint {
  /** Sample time, epoch ms. */
  t: number;
  /** CPU utilization percent (0-100), if reported. */
  cpu: number | null;
  /** Memory used percent (0-100), if reported. */
  memPct: number | null;
}

/** One sample entry from GET /w/:id/system/metrics — metric name → samples. */
type RawNodeEntry = Record<string, { model?: unknown; val?: number }[] | undefined>;

function entryVal(e: RawNodeEntry, key: string): number | null {
  const arr = e[key];
  const v = Array.isArray(arr) && arr.length > 0 ? arr[0]?.val : undefined;
  return typeof v === 'number' ? v : null;
}

function demoNodePoints(nodeId: string, rangeSeconds: number): NodePoint[] {
  // Deterministic per node: hash the id into a base load profile.
  let h = 0;
  for (const c of nodeId) h = (h * 31 + c.charCodeAt(0)) % 997;
  const baseCpu = 12 + (h % 45);
  const baseMem = 35 + (h % 40);
  const nowSec = Math.floor(Date.now() / 1000);
  const stepSec = Math.max(60, Math.floor(rangeSeconds / 48));
  const out: NodePoint[] = [];
  for (let t = nowSec - rangeSeconds; t <= nowSec; t += stepSec) {
    const wave = Math.sin(t / 1800 + h) * 8 + Math.sin(t / 300 + h * 2) * 4;
    out.push({
      t: t * 1000,
      cpu: Math.min(98, Math.max(1, baseCpu + wave)),
      memPct: Math.min(97, Math.max(5, baseMem + wave / 2)),
    });
  }
  return out;
}

/**
 * CPU / memory history for one worker or edge node from the per-node system
 * metrics endpoint (the aggregated metrics query has no per-node dimension).
 */
export async function getNodeMetrics(nodeId: string, rangeSeconds: number): Promise<NodePoint[]> {
  if (IS_DEMO) return demoNodePoints(nodeId, rangeSeconds);
  const now = Math.floor(Date.now() / 1000);
  const res = await apiGet<{ results?: { metrics?: RawNodeEntry[] } }>(
    `/w/${encodeURIComponent(nodeId)}/system/metrics?earliest=${now - rangeSeconds}&latest=${now}`,
  );
  const entries = res.results?.metrics ?? [];
  const points: NodePoint[] = [];
  for (const e of entries) {
    const t = entryVal(e, '_time');
    if (t == null) continue;
    const cpu = entryVal(e, 'system.cpu_perc');
    const free = entryVal(e, 'system.free_mem');
    const total = entryVal(e, 'system.total_mem');
    const memPct = free != null && total != null && total > 0 ? ((total - free) / total) * 100 : null;
    if (cpu == null && memPct == null) continue;
    points.push({ t: t * 1000, cpu, memPct });
  }
  points.sort((a, b) => a.t - b.t);
  return points;
}

// ---------------------------------------------------------------------------
// License quota (daily ingest allowance)
// ---------------------------------------------------------------------------

/**
 * Daily ingest quota in bytes from the license totals (`quota` is GB/day),
 * or null when the license reports no quota.
 */
export async function getLicenseQuota(): Promise<number | null> {
  if (IS_DEMO) return 20 * 1024 ** 3; // 20 GB/day pairs with the demo usage data
  const r = await apiGet<{ items?: { id?: string; quota?: number }[] }>('/system/licenses');
  const items = r.items ?? [];
  const total = items.find((i) => i.id === '_TOTAL_') ?? items[0];
  return total?.quota && total.quota > 0 ? total.quota * 1024 ** 3 : null;
}

// ---------------------------------------------------------------------------
// Route health
// ---------------------------------------------------------------------------

// Demo mode has no captured route metrics, so synthesize per-route samples:
// steady senders plus a couple that went quiet, mirroring what the live
// query returns. `silentSeconds` is how long ago the route stopped reporting.
const DEMO_ROUTES = [
  { route: 'default', group: 'default', eps: 1400, Bps: 980_000 },
  { route: 'syslog-to-s3', group: 'default', eps: 620, Bps: 710_000 },
  { route: 'firewall-archive', group: 'default', eps: 240, Bps: 380_000, silentSeconds: 3.4 * 3600 },
  { route: 'metrics-to-prometheus', group: 'defaultHybrid', eps: 900, Bps: 120_000 },
  { route: 'win-events', group: 'Windows_Fleet', eps: 310, Bps: 240_000, silentSeconds: 75 * 60 },
  { route: 'nessus-scans', group: 'tenable', eps: 45, Bps: 90_000 },
  { route: 'linux-journald', group: 'Linux_Fleet', eps: 150, Bps: 60_000 },
];

function demoRouteRows(group: string | 'all', rangeSeconds: number, bucketSeconds: number): MetricRow[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const rows: MetricRow[] = [];
  for (const r of DEMO_ROUTES) {
    if (group !== 'all' && r.group !== group) continue;
    const silent = r.silentSeconds ?? 0;
    for (let end = nowSec; end > nowSec - rangeSeconds; end -= bucketSeconds) {
      if (nowSec - end < silent) continue; // the route's silent tail: no rows
      const jitter = 0.75 + 0.5 * Math.abs(Math.sin(end / 977 + r.route.length));
      rows.push({
        starttime: end - bucketSeconds,
        endtime: end,
        route: r.route,
        name: r.route,
        __worker_group: r.group,
        eventsIn: Math.round(r.eps * bucketSeconds * jitter),
        bytesIn: Math.round(r.Bps * bucketSeconds * jitter),
      });
    }
  }
  return rows;
}

/**
 * Per-route throughput samples (split by route + worker group), bucketed by
 * `bucketSeconds`. Feeds the Route Health page's stall detection.
 */
export async function getRouteSeries(
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<MetricRow[]> {
  if (IS_DEMO) return demoRouteRows(group, rangeSeconds, bucketSeconds);
  return runQuery({
    where: whereForTop(group),
    aggregations: [
      'sum("route.in_events").as("eventsIn")',
      'sum("route.in_bytes").as("bytesIn")',
    ],
    splitBys: ['route', 'name', '__worker_group'],
    timeWindowSeconds: bucketSeconds,
    earliestSeconds: rangeSeconds,
  });
}

export interface TopItem {
  id: string;
  bytes: number;
  events: number;
}

function whereForTop(group: string | 'all'): string {
  return group === 'all'
    ? '((__dist_mode=="worker") || (__dist_mode=="managed-edge"))'
    : `(__worker_group=="${group}")`;
}

/** Top sources by bytes in for a group, aggregated across buckets. */
export async function getTopInputs(group: string | 'all', rangeSeconds: number): Promise<TopItem[]> {
  const rows = IS_DEMO
    ? (await fixtures()).topSourcesDefault
    : await runQuery({
        where: whereForTop(group),
        aggregations: ['sum("total.in_bytes").as("bytes")', 'sum("total.in_events").as("events")'],
        splitBys: ['input'],
        timeWindowSeconds: -1,
        earliestSeconds: rangeSeconds,
      });
  return aggregateSplit(rows, 'input', IS_DEMO ? 'bytesIn' : 'bytes', IS_DEMO ? 'eventsIn' : 'events');
}

/** Top destinations by bytes out for a group, aggregated across buckets. */
export async function getTopOutputs(group: string | 'all', rangeSeconds: number): Promise<TopItem[]> {
  const rows = IS_DEMO
    ? (await fixtures()).topDestsDefault
    : await runQuery({
        where: whereForTop(group),
        aggregations: ['sum("total.out_bytes").as("bytes")', 'sum("total.out_events").as("events")'],
        splitBys: ['output'],
        timeWindowSeconds: -1,
        earliestSeconds: rangeSeconds,
      });
  return aggregateSplit(rows, 'output', IS_DEMO ? 'bytesOut' : 'bytes', IS_DEMO ? 'eventsOut' : 'events');
}

/** Top routes by bytes in for a group, aggregated across buckets. */
export async function getTopRoutes(group: string | 'all', rangeSeconds: number): Promise<TopItem[]> {
  const rows = IS_DEMO
    ? demoRouteRows(group, rangeSeconds, Math.max(60, Math.floor(rangeSeconds / 60)))
    : await runQuery({
        where: whereForTop(group),
        aggregations: ['sum("route.in_bytes").as("bytes")', 'sum("route.in_events").as("events")'],
        splitBys: ['name'],
        timeWindowSeconds: -1,
        earliestSeconds: rangeSeconds,
      });
  return aggregateSplit(rows, 'name', IS_DEMO ? 'bytesIn' : 'bytes', IS_DEMO ? 'eventsIn' : 'events');
}

/** Collapse split time-bucket rows into one total per split key.
 *  Metric input/output dimensions are formatted `<type>:<id>`; strip the type
 *  prefix so ids line up with the bare ids from the Source/Destination status API. */
function aggregateSplit(rows: MetricRow[], dim: string, byteKey: string, evKey: string): TopItem[] {
  const acc = new Map<string, TopItem>();
  for (const r of rows) {
    const raw = (r[dim] as string) ?? '(none)';
    const id = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    const cur = acc.get(id) ?? { id, bytes: 0, events: 0 };
    cur.bytes += Number(r[byteKey] ?? 0);
    cur.events += Number(r[evKey] ?? 0);
    acc.set(id, cur);
  }
  return [...acc.values()].filter((x) => x.id !== '(none)').sort((a, b) => b.bytes - a.bytes);
}

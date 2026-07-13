// Cribl API client. Uses the platform fetch proxy (window.CRIBL_API_URL) when
// running inside Cribl; falls back to captured fixtures for standalone demo/dev.
import type {
  CollectionJob,
  CriblNotification,
  Group,
  IOStatus,
  LicenseUsageDay,
  MetricRow,
  NotificationTarget,
  SystemInfo,
  SystemMessage,
  WorkerNode,
} from './types';

export interface CriblUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  initials?: string;
}

declare global {
  interface Window {
    CRIBL_API_URL?: string;
    CRIBL_BASE_PATH?: string;
    getCriblUser?: () => Promise<CriblUser>;
  }
}

/** Signed-in Cribl user, or null in demo mode / on failure. */
export async function getCurrentUser(): Promise<CriblUser | null> {
  if (typeof window === 'undefined' || !window.getCriblUser) return null;
  try {
    return await window.getCriblUser();
  } catch {
    return null;
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
export function streamLink(
  kind: 'source' | 'destination' | 'route' | 'pipeline' | 'job' | 'notification',
  group: string,
): string {
  if (!CRIBL_ORIGIN) return '';
  const seg =
    kind === 'source'
      ? 'inputs'
      : kind === 'destination'
        ? 'outputs'
        : kind === 'route'
          ? 'routes'
          : kind === 'pipeline'
            ? 'pipelines'
            : kind === 'job'
              ? 'jobs'
              : 'notifications';
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

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status} ${res.statusText}`);
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

// Source-side PQ demo: one source spooling to disk while its pipeline backs up.
const DEMO_PQ_SOURCES: Record<string, { pqBytes: number; peak: number; now: boolean; buckets: number }> = {
  'default::in_syslog_tls': { pqBytes: 640 * 1024 ** 2, peak: 1.1 * 1024 ** 3, now: true, buckets: 5 },
};

function demoPQStatsFrom(
  table: Record<string, { pqBytes: number; peak: number; now: boolean; buckets: number }>,
  group: string | 'all',
): OutputPQStat[] {
  return Object.entries(table)
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
 * Per-source/destination backpressure + persistent-queue depth over the window.
 * `pq.queue_size` is a gauge (bytes) dimensioned by input or output;
 * `backpressure.outputs` / `backpressure.inputs` is non-zero while engaged.
 */
async function getPQStatsByDim(
  dim: 'input' | 'output',
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<OutputPQStat[]> {
  const rows = await runQuery({
    where: whereForTop(group),
    aggregations: [
      'max("pq.queue_size").as("pqBytes")',
      `max("backpressure.${dim}s").as("bp")`,
    ],
    splitBys: [dim, '__worker_group'],
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
    const raw = typeof r[dim] === 'string' ? (r[dim] as string) : '';
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

/** Destination-side PQ depth + backpressure over the window. */
export async function getOutputPQStats(
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<OutputPQStat[]> {
  if (IS_DEMO) return demoPQStatsFrom(DEMO_PQ, group);
  return getPQStatsByDim('output', group, rangeSeconds, bucketSeconds);
}

/** Source-side PQ depth + backpressure over the window. */
export async function getInputPQStats(
  group: string | 'all',
  rangeSeconds: number,
  bucketSeconds: number,
): Promise<OutputPQStat[]> {
  if (IS_DEMO) return demoPQStatsFrom(DEMO_PQ_SOURCES, group);
  return getPQStatsByDim('input', group, rangeSeconds, bucketSeconds);
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

// ---------------------------------------------------------------------------
// Pipeline health
// ---------------------------------------------------------------------------

export interface PipelineStat {
  id: string;
  group: string;
  eventsIn: number;
  eventsOut: number;
  dropped: number;
  errors: number;
}

// Demo pipelines: mostly clean, one dropping heavily (a filter pipeline), one erroring.
const DEMO_PIPELINES = [
  { id: 'passthru', group: 'default', eps: 1200, dropPct: 0, errPct: 0 },
  { id: 'syslog-clean', group: 'default', eps: 640, dropPct: 0.35, errPct: 0 },
  { id: 'firewall-filter', group: 'default', eps: 410, dropPct: 0.82, errPct: 0 },
  { id: 'win-events-shape', group: 'Windows_Fleet', eps: 300, dropPct: 0.12, errPct: 0.03 },
  { id: 'metrics-rollup', group: 'defaultHybrid', eps: 900, dropPct: 0.55, errPct: 0 },
  { id: 'vectra-enrich', group: 'default', eps: 260, dropPct: 0.05, errPct: 0.11 },
  { id: 'journald-trim', group: 'Linux_Fleet', eps: 150, dropPct: 0.4, errPct: 0 },
];

function demoPipelineStats(group: string | 'all', rangeSeconds: number): PipelineStat[] {
  return DEMO_PIPELINES.filter((p) => group === 'all' || p.group === group).map((p) => {
    const evIn = Math.round(p.eps * rangeSeconds);
    const dropped = Math.round(evIn * p.dropPct);
    const errors = Math.round(evIn * p.errPct);
    return { id: p.id, group: p.group, eventsIn: evIn, eventsOut: evIn - dropped - errors, dropped, errors };
  });
}

/** Per-pipeline event totals (in/out/dropped/errors) over the window. */
export async function getPipelineStats(
  group: string | 'all',
  rangeSeconds: number,
): Promise<PipelineStat[]> {
  if (IS_DEMO) return demoPipelineStats(group, rangeSeconds);
  const rows = await runQuery({
    where: whereForTop(group),
    aggregations: [
      'sum("pipe.in_events").as("evIn")',
      'sum("pipe.out_events").as("evOut")',
      'sum("pipe.dropped_events").as("evDrop")',
      'sum("pipe.err_events").as("evErr")',
    ],
    splitBys: ['id', '__worker_group'],
    timeWindowSeconds: -1,
    earliestSeconds: rangeSeconds,
  });
  const acc = new Map<string, PipelineStat>();
  for (const r of rows) {
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id) continue;
    const grp = typeof r.__worker_group === 'string' ? r.__worker_group : '(unknown)';
    const key = `${grp}::${id}`;
    const cur = acc.get(key) ?? { id, group: grp, eventsIn: 0, eventsOut: 0, dropped: 0, errors: 0 };
    cur.eventsIn += Number(r.evIn ?? 0);
    cur.eventsOut += Number(r.evOut ?? 0);
    cur.dropped += Number(r.evDrop ?? 0);
    cur.errors += Number(r.evErr ?? 0);
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.eventsIn - a.eventsIn);
}

// ---------------------------------------------------------------------------
// Collection jobs
// ---------------------------------------------------------------------------

export type JobWithGroup = CollectionJob & { group: string };

function demoJobs(): JobWithGroup[] {
  const nowMs = Date.now();
  const mk = (
    n: number,
    collector: string,
    group: string,
    state: string,
    failed: number,
    finished: number,
    opts: { cron?: string; events?: number; bytes?: number } = {},
  ): JobWithGroup => ({
    id: `${Math.floor(nowMs / 1000) - n * 300}.${1000 + n}.${opts.cron ? 'scheduled' : 'adhoc'}.${collector}`,
    group,
    args: {
      id: collector,
      type: 'collection',
      collector: { type: 'rest' },
      ...(opts.cron ? { schedule: { cronSchedule: opts.cron, enabled: true } } : {}),
    },
    status: { state },
    stats: {
      tasks: { finished, failed, cancelled: 0, inFlight: state === 'running' ? 1 : 0, count: finished + failed },
      state: { initializing: nowMs - n * 300_000, finished: state === 'finished' ? nowMs - n * 300_000 + 45_000 : 0 },
      collectedEvents: opts.events ?? 0,
      collectedBytes: opts.bytes ?? 0,
    },
  });
  return [
    mk(1, 'sailpoint-identity-sync', 'default', 'finished', 0, 4, { cron: '*/5 * * * *', events: 1840, bytes: 2.1e6 }),
    mk(2, 'webex-audit-pull', 'default', 'finished', 1, 1, { cron: '*/5 * * * *', events: 220, bytes: 4.4e5 }),
    mk(3, 's3-replay-window', 'default', 'running', 0, 2, { events: 51000, bytes: 8.2e7 }),
    mk(4, 'sailpoint-identity-sync', 'default', 'finished', 0, 4, { cron: '*/5 * * * *', events: 1795, bytes: 2.0e6 }),
    mk(5, 'tenable-scan-results', 'tenable', 'failed', 2, 0, { cron: '0 * * * *' }),
    mk(6, 'webex-audit-pull', 'default', 'finished', 0, 2, { cron: '*/5 * * * *', events: 305, bytes: 6.1e5 }),
  ];
}

/** Collection/scheduled job instances across groups, newest first. */
export async function getJobs(groupIds: string[]): Promise<JobWithGroup[]> {
  if (IS_DEMO) return demoJobs();
  const per = await Promise.all(
    groupIds.map((g) =>
      apiGet<{ items?: CollectionJob[] }>(`/m/${encodeURIComponent(g)}/jobs`)
        .then((r) => (r.items ?? []).map((j) => ({ ...j, group: g })))
        .catch(() => [] as JobWithGroup[]),
    ),
  );
  return per
    .flat()
    .sort((a, b) => (b.stats?.state?.initializing ?? 0) - (a.stats?.state?.initializing ?? 0));
}

// ---------------------------------------------------------------------------
// Email alerting — native Cribl Notifications (group-scoped) + targets
// ---------------------------------------------------------------------------

export type NotificationWithGroup = CriblNotification & { group: string };

const DEMO_ALERTS_KEY = 'vitals-demo-alerts';

function loadDemoAlerts(): NotificationWithGroup[] {
  try {
    const raw = localStorage.getItem(DEMO_ALERTS_KEY);
    if (raw) return JSON.parse(raw) as NotificationWithGroup[];
  } catch {
    /* fall through to seed */
  }
  return [
    {
      id: 'vitals-unhealthy-to-splunk',
      group: 'default',
      condition: 'unhealthy-dest',
      disabled: false,
      targets: ['system_email'],
      conf: { name: 'to-splunk-dev', timeWindow: '300s', notifyOnResolution: true },
      targetConfigs: [
        {
          id: 'system_email',
          conf: { subject: '[Vitals] to-splunk-dev unhealthy', emailRecipient: { to: 'ops@example.com' } },
        },
      ],
    },
    {
      id: 'vitals-nodata-win-events',
      group: 'Windows_Fleet',
      condition: 'no-data',
      disabled: true,
      targets: ['system_email'],
      conf: { name: 'win-data-gen', timeWindow: '15m', notifyOnResolution: true },
      targetConfigs: [
        {
          id: 'system_email',
          conf: { subject: '[Vitals] win-data-gen silent', emailRecipient: { to: 'ops@example.com' } },
        },
      ],
    },
  ];
}

function saveDemoAlerts(items: NotificationWithGroup[]): void {
  try {
    localStorage.setItem(DEMO_ALERTS_KEY, JSON.stringify(items));
  } catch {
    /* demo persistence is best-effort */
  }
}

/** Configured notification targets (email, in-product bulletin, webhooks…). */
export async function getNotificationTargets(): Promise<NotificationTarget[]> {
  if (IS_DEMO) {
    return [
      { id: 'system_email', type: 'smtp', status: { health: 'Green', metrics: { totalSent: 7, errorCnt: 0 } } },
      { id: 'system_notifications', type: 'bulletin_message', status: { health: 'Green' } },
    ];
  }
  return (await apiGet<{ items?: NotificationTarget[] }>('/notification-targets')).items ?? [];
}

/** All Notifications across the given groups, each tagged with its group. */
export async function getNotifications(groupIds: string[]): Promise<NotificationWithGroup[]> {
  if (IS_DEMO) return loadDemoAlerts();
  const per = await Promise.all(
    groupIds.map((g) =>
      apiGet<{ items?: CriblNotification[] }>(`/m/${encodeURIComponent(g)}/notifications`)
        .then((r) => (r.items ?? []).map((n) => ({ ...n, group: g })))
        .catch(() => [] as NotificationWithGroup[]),
    ),
  );
  return per.flat();
}

export async function createNotification(group: string, n: CriblNotification): Promise<void> {
  if (IS_DEMO) {
    const items = loadDemoAlerts();
    if (items.some((x) => x.id === n.id)) throw new Error(`Alert id "${n.id}" already exists`);
    items.push({ ...n, group });
    saveDemoAlerts(items);
    return;
  }
  await apiPost(`/m/${encodeURIComponent(group)}/notifications`, n);
}

export async function updateNotification(group: string, n: CriblNotification): Promise<void> {
  if (IS_DEMO) {
    const items = loadDemoAlerts().map((x) =>
      x.id === n.id && x.group === group ? { ...n, group } : x,
    );
    saveDemoAlerts(items);
    return;
  }
  await apiPatch(`/m/${encodeURIComponent(group)}/notifications/${encodeURIComponent(n.id)}`, n);
}

export async function deleteNotification(group: string, id: string): Promise<void> {
  if (IS_DEMO) {
    saveDemoAlerts(loadDemoAlerts().filter((x) => !(x.id === id && x.group === group)));
    return;
  }
  await apiDelete(`/m/${encodeURIComponent(group)}/notifications/${encodeURIComponent(id)}`);
}

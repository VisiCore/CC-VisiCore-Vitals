import { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import { useAsync } from '../hooks/useAsync';
import { getLicenseUsage, getLicenseQuota } from '../api/client';
import { usePref } from '../lib/prefs';
import { Card, StatTile, Loading, ErrorBanner, Meter } from '../components/ui';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart';
import { linearTrend } from '../lib/metrics';
import { formatBytes, formatPct, reductionPct } from '../lib/format';

const GB = 1024 ** 3;

function usd(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function usdPrecise(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

export function DataValue() {
  const { tick } = useApp();
  const usage = useAsync(() => getLicenseUsage(), [tick]);
  const quota = useAsync(() => getLicenseQuota(), [tick]);
  const [price, setPrice] = usePref('priceGB', 2.5);

  const items = usage.data ?? [];
  const days = items.length;

  const totals = useMemo(() => {
    let inB = 0;
    let outB = 0;
    for (const d of items) {
      inB += d.inBytes ?? 0;
      outB += d.outBytes ?? 0;
    }
    return { inB, outB };
  }, [items]);

  // Signed: negative means routes clone/fan out more than shaping removes.
  // Savings only accrue on net-positive reduction.
  const netBytes = totals.inB - totals.outB;
  const reducedBytes = Math.max(0, netBytes);
  const reducedGB = reducedBytes / GB;
  const savings = reducedGB * price;
  const dailySavings = days > 0 ? savings / days : 0;
  const monthly = dailySavings * 30;
  const annual = dailySavings * 365;

  const inPoints = items.map((d) => ({ t: d.startTime, v: d.inBytes }));
  const outPoints = items.map((d) => ({ t: d.startTime, v: d.outBytes }));

  // License headroom: trend the last two weeks of daily ingest toward the
  // daily quota. Null when the license reports no quota.
  const headroom = useMemo(() => {
    const quotaBytes = quota.data;
    if (!quotaBytes || items.length === 0) return null;
    const pts = items.slice(-14).map((d) => ({ t: d.startTime, v: d.inBytes }));
    const avg = pts.reduce((a, p) => a + p.v, 0) / pts.length;
    const peak = Math.max(...pts.map((p) => p.v));
    const trend = linearTrend(pts);
    let daysToLimit: number | null = null;
    if (avg >= quotaBytes) {
      daysToLimit = 0;
    } else if (trend && trend.slopePerDay > 0) {
      const days = (quotaBytes - trend.at(Date.now())) / trend.slopePerDay;
      daysToLimit = Math.max(0, Math.ceil(days));
    }
    return { quotaBytes, avg, peak, growthPerDay: trend?.slopePerDay ?? 0, daysToLimit };
  }, [items, quota.data]);

  return (
    <>
      <Card
        title="Data Reduction Value"
        right={
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span className="muted">Downstream cost $/GB</span>
            <input
              className="select"
              type="number"
              min={0}
              step={0.25}
              value={price}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 90 }}
            />
          </label>
        }
      >
        <div className="muted" style={{ fontSize: 12, margin: '-6px 0 12px' }}>
          Billing data across all groups, last {days} days — the group and time filters above don't
          apply to this card.
        </div>
        {usage.loading && !usage.data ? (
          <Loading height={120} />
        ) : usage.error ? (
          <ErrorBanner message={usage.error} />
        ) : (
          <div className="grid grid-4">
            <StatTile label="Ingested" value={formatBytes(totals.inB)} accent="var(--series-in)" foot={<span>{days}-day total</span>} />
            <StatTile label="Delivered" value={formatBytes(totals.outB)} accent="var(--series-out)" />
            <StatTile
              label={netBytes >= 0 ? 'Reduced' : 'Net Growth'}
              value={formatBytes(Math.abs(netBytes))}
              accent={netBytes >= 0 ? 'var(--good)' : 'var(--warning)'}
              delta={{
                text: formatPct(reductionPct(totals.inB, totals.outB)),
                dir: netBytes > 0 ? 'up' : netBytes < 0 ? 'down' : 'flat',
              }}
              foot={netBytes < 0 ? <span>clones/fan-out exceed shaping</span> : undefined}
            />
            <StatTile
              label="Est. Savings"
              value={usd(savings)}
              accent="var(--accent)"
              foot={
                netBytes < 0 ? (
                  <span>no net reduction to price</span>
                ) : (
                  <span>over {days} days</span>
                )
              }
            />
          </div>
        )}
        {!usage.loading && totals.outB > totals.inB && (
          <div className="muted" style={{ marginTop: 14, fontSize: 12.5, lineHeight: 1.5 }}>
            Delivered volume exceeds ingest because routes clone / fan out events to multiple
            destinations. Net reduction savings accrue when data is filtered, sampled, dropped, or
            routed to lower-cost tiers before a premium destination — set the $/GB to your premium
            tool's rate to model that scenario per group.
          </div>
        )}
      </Card>

      <div className="grid grid-3">
        <StatTile label="Projected Monthly Savings" value={usd(monthly)} accent="var(--good)" foot={<span>at {usdPrecise(price)}/GB</span>} />
        <StatTile label="Projected Annual Savings" value={usd(annual)} accent="var(--good)" foot={<span>at current rate</span>} />
        <StatTile
          label="Avg Daily Reduction"
          value={formatPct(reductionPct(totals.inB, totals.outB))}
          accent={netBytes >= 0 ? 'var(--accent)' : 'var(--warning)'}
          foot={
            <span>
              {formatBytes(Math.abs(netBytes) / Math.max(1, days))}/day{' '}
              {netBytes >= 0 ? 'removed' : 'added by clones'}
            </span>
          }
        />
      </div>

      <Card
        title="License Headroom"
        note={headroom ? 'Daily ingest vs. licensed daily quota, trended over the last 14 days' : undefined}
      >
        {(usage.loading && !usage.data) || (quota.loading && quota.data === null) ? (
          <Loading height={120} />
        ) : !headroom ? (
          <div className="muted" style={{ fontSize: 13, padding: '6px 0' }}>
            This license does not report a daily ingest quota, so there is nothing to project
            against.
          </div>
        ) : (
          <>
            <div className="grid grid-4">
              <StatTile
                label="Daily Quota"
                value={formatBytes(headroom.quotaBytes)}
                accent="var(--accent)"
                foot={<span>licensed ingest / day</span>}
              />
              <StatTile
                label="Avg Daily Ingest"
                value={formatBytes(headroom.avg)}
                accent="var(--series-in)"
                foot={<span>{((headroom.avg / headroom.quotaBytes) * 100).toFixed(1)}% of quota</span>}
              />
              <StatTile
                label="Peak Day"
                value={formatBytes(headroom.peak)}
                accent={headroom.peak >= headroom.quotaBytes ? 'var(--critical)' : 'var(--series-out)'}
                foot={headroom.peak >= headroom.quotaBytes ? <span>exceeded quota</span> : undefined}
              />
              <StatTile
                label="Days to Quota"
                value={
                  headroom.daysToLimit == null
                    ? '—'
                    : headroom.daysToLimit === 0
                      ? 'Now'
                      : headroom.daysToLimit > 365
                        ? '365+'
                        : `~${headroom.daysToLimit}d`
                }
                accent={
                  headroom.daysToLimit != null && headroom.daysToLimit <= 30
                    ? 'var(--critical)'
                    : headroom.daysToLimit != null && headroom.daysToLimit <= 90
                      ? 'var(--warning)'
                      : 'var(--good)'
                }
                foot={
                  headroom.daysToLimit == null ? (
                    <span>ingest is flat or shrinking</span>
                  ) : (
                    <span>{formatBytes(Math.abs(headroom.growthPerDay))}/day growth</span>
                  )
                }
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px' }}>
              <div style={{ flex: 1 }}>
                <Meter pct={(headroom.avg / headroom.quotaBytes) * 100} />
              </div>
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {((headroom.avg / headroom.quotaBytes) * 100).toFixed(1)}% utilized
              </span>
            </div>
            <TimeSeriesChart
              height={220}
              dateAxis
              area={false}
              valueFormat={formatBytes}
              series={[
                { name: 'Daily Ingest', color: 'var(--series-in)', points: inPoints },
                {
                  name: 'Daily Quota',
                  color: 'var(--critical)',
                  points: inPoints.map((p) => ({ t: p.t, v: headroom.quotaBytes })),
                },
              ]}
            />
          </>
        )}
      </Card>

      <Card title="Daily Ingested vs Delivered" note={`Billing data · all groups · ${days} days`}>
        {usage.loading && !usage.data ? (
          <Loading height={280} />
        ) : (
          <TimeSeriesChart
            height={300}
            dateAxis
            valueFormat={formatBytes}
            series={[
              { name: 'Ingested', color: 'var(--series-in)', points: inPoints },
              { name: 'Delivered', color: 'var(--series-out)', points: outPoints },
            ]}
          />
        )}
      </Card>
    </>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { get } from '@/lib/api';
import { formatDayLabel, formatDuration } from '@/lib/format';
import type {
  AnalyticsMetric,
  AnalyticsOverview,
  Page,
  Pdf,
  TimeseriesPoint,
  User,
} from '@/lib/types';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Spinner,
  Stat,
} from '@/components/ui';

const PIE_COLORS = ['#047857', '#d97706', '#64748b']; // published, draft, hidden

const METRICS: { value: AnalyticsMetric; label: string }[] = [
  { value: 'opens', label: 'Content opens' },
  { value: 'plays', label: 'Video plays' },
  { value: 'watch_time', label: 'Watch time' },
  { value: 'logins', label: 'Logins' },
  { value: 'signups', label: 'Signups' },
];

const DAY_RANGES = [7, 14, 30] as const;

interface ChartPoint {
  day: string;
  value: number;
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [metric, setMetric] = useState<AnalyticsMetric>('opens');
  const [days, setDays] = useState<number>(14);
  const [series, setSeries] = useState<ChartPoint[] | null>(null);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [recentUsers, setRecentUsers] = useState<User[]>([]);
  const [recentPdfs, setRecentPdfs] = useState<Pdf[]>([]);
  const [error, setError] = useState('');

  const loadStatic = useCallback(async () => {
    setError('');
    const [ov, users, pdfs, draft, published, hidden] = await Promise.all([
      get<AnalyticsOverview>('/admin/analytics/overview'),
      get<Page<User>>('/admin/users?limit=5'),
      get<Page<Pdf>>('/admin/pdfs?limit=5'),
      get<Page<Pdf>>('/admin/pdfs?status=DRAFT&limit=1'),
      get<Page<Pdf>>('/admin/pdfs?status=PUBLISHED&limit=1'),
      get<Page<Pdf>>('/admin/pdfs?status=HIDDEN&limit=1'),
    ]);
    setOverview(ov);
    setRecentUsers(users.data);
    setRecentPdfs(pdfs.data);
    setStatusBreakdown([
      { name: 'Published', value: published.total },
      { name: 'Draft', value: draft.total },
      { name: 'Hidden', value: hidden.total },
    ]);
  }, []);

  const loadSeries = useCallback(async () => {
    try {
      const q = new URLSearchParams({ metric, days: String(days) });
      const rows = await get<TimeseriesPoint[]>(`/admin/analytics/timeseries?${q}`);
      setSeries(
        rows.map((r) => ({ day: formatDayLabel(r.date), value: r.value })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chart');
    }
  }, [metric, days]);

  useEffect(() => {
    loadStatic().catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load dashboard'),
    );
  }, [loadStatic]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  if (error) return <ErrorState message={error} onRetry={() => { loadStatic(); loadSeries(); }} />;
  if (!overview) return <Spinner label="Loading dashboard…" />;

  const metricLabel = METRICS.find((m) => m.value === metric)?.label ?? metric;
  const tooltipValue = (v: unknown): string =>
    metric === 'watch_time' && typeof v === 'number' ? formatDuration(v) : String(v ?? '');

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Platform overview" />

      {/* Row 1: totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total Users" value={overview.totalUsers} />
        <Stat label="Active Users (30d)" value={overview.activeUsers30d} />
        <Stat label="Total PDFs" value={overview.totalPdfs} />
        <Stat label="Total Videos" value={overview.totalVideos} />
      </div>

      {/* Row 2: today's activity + alerts */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Opens today" value={overview.opensToday} sub="content opens" />
        <Stat label="Plays today" value={overview.playsToday} sub="video plays" />
        <Stat
          label="Watch time today"
          value={formatDuration(overview.watchTimeTodaySec)}
          sub="from heartbeats"
        />
        <Stat
          label="Denied today"
          value={overview.deniedToday}
          sub="unauthorized attempts"
        />
        <Link href="/security">
          <Stat
            label="Unseen Security Alerts"
            value={overview.unseenAlerts}
            sub={overview.unseenAlerts > 0 ? 'needs attention →' : 'all clear'}
          />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{metricLabel}</div>
              <div className="text-xs text-slate-400">
                Last {days} days · server-bucketed
              </div>
            </div>
            <div className="flex gap-2">
              <Select
                value={metric}
                onChange={(e) => setMetric(e.target.value as AnalyticsMetric)}
                className="w-40"
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-24"
              >
                {DAY_RANGES.map((d) => (
                  <option key={d} value={d}>
                    {d}d
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="h-64">
            {series === null ? (
              <Spinner label="Loading chart…" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11 }}
                    interval={Math.max(0, Math.floor(series.length / 8) - 1)}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) =>
                      metric === 'watch_time' ? formatDuration(v) : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v) => [tooltipValue(v), metricLabel]}
                    labelClassName="text-slate-600"
                  />
                  <Bar dataKey="value" fill="#047857" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-1 text-sm font-semibold text-slate-800">PDFs by status</div>
          <div className="mb-3 text-xs text-slate-400">All PDFs in the library</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusBreakdown} dataKey="value" nameKey="name" outerRadius={90} label>
                  {statusBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="text-sm font-semibold text-slate-800">Recent Users</div>
            <Link href="/users" className="text-sm font-medium text-emerald-700 hover:underline">
              View all
            </Link>
          </div>
          {recentUsers.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No users yet" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentUsers.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{u.name}</div>
                    <div className="text-xs text-slate-400">{u.phone}</div>
                  </div>
                  <Badge value={u.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="text-sm font-semibold text-slate-800">Recent PDFs</div>
            <Link href="/content" className="text-sm font-medium text-emerald-700 hover:underline">
              View all
            </Link>
          </div>
          {recentPdfs.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No PDFs yet" />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentPdfs.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div className="text-sm font-medium text-slate-800">{p.title}</div>
                  <Badge value={p.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

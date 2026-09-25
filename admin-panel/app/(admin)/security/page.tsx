'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { get, patch } from '@/lib/api';
import { formatDateTime, metaField } from '@/lib/format';
import type {
  DeniedAttempt,
  LoginAttempt,
  Page,
  SecurityAlert,
} from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  Toggle,
  useToast,
} from '@/components/ui';

const PAGE_SIZE = 20;

// ------------------------------------------------------------------ alerts --

function AlertsSection() {
  const toast = useToast();
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (unseenOnly) q.set('unseenOnly', 'true');
      const res = await get<Page<SecurityAlert>>(`/admin/security/alerts?${q}`);
      setAlerts(res.data);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [page, unseenOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset pagination when the filter changes.
  useEffect(() => {
    setPage(1);
  }, [unseenOnly]);

  async function markSeen(a: SecurityAlert) {
    setMarking(a.id);
    try {
      await patch(`/admin/security/alerts/${a.id}/seen`);
      setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, seen: true } : x)));
      toast('success', 'Alert marked as seen');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setMarking(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-800">Security alerts</div>
        <Toggle
          checked={unseenOnly}
          onChange={setUnseenOnly}
          label="Unseen only"
        />
      </div>
      {loading ? (
        <Spinner label="Loading alerts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : alerts.length === 0 ? (
        <EmptyState
          title="No alerts"
          hint={unseenOnly ? 'Everything has been reviewed — nothing unseen.' : 'Security alerts (refresh-token reuse, denied-access bursts, …) will appear here.'}
        />
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={`flex items-start justify-between gap-4 px-1 py-3 ${
                  a.seen ? '' : 'rounded-lg bg-amber-50 px-3 -mx-2'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge value={a.seen ? a.type : 'NEW'} />
                    <span className="font-mono text-xs text-slate-500">{a.type}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{a.detail}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {a.user ? (
                      <>
                        <Link
                          href={`/users/${a.user.id}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {a.user.name}
                        </Link>{' '}
                        · {a.user.phone}
                      </>
                    ) : (
                      'no user linked'
                    )}
                  </div>
                </div>
                {!a.seen && (
                  <Button
                    variant="secondary"
                    disabled={marking === a.id}
                    onClick={() => markSeen(a)}
                    className="shrink-0"
                  >
                    {marking === a.id ? 'Saving…' : 'Mark seen'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------ failed logins -

function FailedLoginsSection() {
  const [attempts, setAttempts] = useState<LoginAttempt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'failed' | 'success'>('failed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (filter === 'failed') q.set('success', 'false');
      else if (filter === 'success') q.set('success', 'true');
      const res = await get<Page<LoginAttempt>>(`/admin/security/login-attempts?${q}`);
      setAttempts(res.data);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load login attempts');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-800">Login attempts</div>
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="w-40"
        >
          <option value="failed">Failed only</option>
          <option value="success">Successful only</option>
          <option value="all">All attempts</option>
        </Select>
      </div>
      {loading ? (
        <Spinner label="Loading login attempts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : attempts.length === 0 ? (
        <EmptyState
          title="No login attempts"
          hint="Every admin/app login attempt is logged with its IP and device fingerprint."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-medium">Identifier</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Device fingerprint</th>
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attempts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{a.identifier}</td>
                    <td className="px-3 py-2.5">
                      <Badge value={a.success ? 'ACTIVE' : 'BLOCKED'} />
                      <span className="ml-1.5 text-xs text-slate-500">
                        {a.success ? 'success' : 'failed'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{a.ip ?? '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500" title={a.deviceFingerprint ?? ''}>
                      {a.deviceFingerprint ? `${a.deviceFingerprint.slice(0, 16)}…` : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {a.user ? (
                        <Link href={`/users/${a.user.id}`} className="font-medium text-emerald-700 hover:underline">
                          {a.user.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      {formatDateTime(a.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------- denied attempts -

function DeniedAttemptsSection() {
  const [rows, setRows] = useState<DeniedAttempt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      const res = await get<Page<DeniedAttempt>>(`/admin/security/denied-attempts?${q}`);
      setRows(res.data);
      setTotal(res.total);
      setPage(res.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load denied attempts');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="p-5">
      <div className="mb-3 text-sm font-semibold text-slate-800">Denied access attempts</div>
      <div className="mb-3 text-xs text-slate-400">
        Every denied /access request (no permission, revoked device, expired URL sharing…)
        with the server-side reason. The app has no download feature, so this is the
        unauthorized-access metric.
      </div>
      {loading ? (
        <Spinner label="Loading denied attempts…" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState title="No denied attempts" hint="Nothing was blocked — or the app has not generated any denied requests yet." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                  <th className="px-3 py-2 font-medium">User</th>
                  <th className="px-3 py-2 font-medium">Content</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      {r.user ? (
                        <div>
                          <Link
                            href={`/users/${r.user.id}`}
                            className="font-medium text-emerald-700 hover:underline"
                          >
                            {r.user.name}
                          </Link>
                          <div className="text-xs text-slate-400">{r.user.phone}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Badge value={r.contentType.toUpperCase()} />
                        <span className="font-mono text-xs text-slate-500" title={r.contentId}>
                          {r.contentId.slice(0, 8)}…
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {metaField(r.meta, 'reason')}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      {metaField(r.meta, 'ip')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
          </div>
        </>
      )}
    </Card>
  );
}

// --------------------------------------------------------------------- page -

export default function SecurityPage() {
  return (
    <div>
      <PageHeader
        title="Security"
        subtitle="Alerts, login attempts and denied access attempts"
      />
      <div className="flex flex-col gap-4">
        <AlertsSection />
        <FailedLoginsSection />
        <DeniedAttemptsSection />
      </div>
    </div>
  );
}

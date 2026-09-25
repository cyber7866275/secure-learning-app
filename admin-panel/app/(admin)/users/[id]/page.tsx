'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { del, get, patch, post } from '@/lib/api';
import { formatDateTime, formatDuration, relativeTime } from '@/lib/format';
import type {
  Category,
  Page,
  Pdf,
  Permission,
  PermissionTarget,
  UserActivity,
  UserDetail,
  Video,
} from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EVENT_LABELS: Record<string, string> = {
  access_granted: 'Opened content',
  access_denied: 'Access denied',
  video_play: 'Played video',
  video_heartbeat: 'Watching',
};

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

export default function UserDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const toast = useToast();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  // Editors
  const [maxDevices, setMaxDevices] = useState('1');
  const [expiry, setExpiry] = useState('');

  // Grant form
  const [grantTarget, setGrantTarget] = useState<'PDF' | 'VIDEO' | 'CATEGORY'>('PDF');
  const [grantId, setGrantId] = useState('');
  const [grantExpiry, setGrantExpiry] = useState('');
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      const [u, p, pdfList, vidList, catList, act] = await Promise.all([
        get<UserDetail>(`/admin/users/${id}`),
        get<Page<Permission>>(`/admin/permissions?userId=${id}&limit=100`),
        get<Page<Pdf>>('/admin/pdfs?limit=100'),
        get<Page<Video>>('/admin/videos?limit=100'),
        get<Category[]>('/admin/taxonomy/categories'),
        get<UserActivity>(`/admin/analytics/users/${id}`),
      ]);
      setUser(u);
      setPerms(p.data);
      setPdfs(pdfList.data);
      setVideos(vidList.data);
      setCategories(catList);
      setActivity(act);
      setMaxDevices(String(u.maxDevices));
      setExpiry(toLocalInput(u.accessExpiresAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings() {
    setBusy(true);
    try {
      await patch(`/admin/users/${id}`, {
        maxDevices: parseInt(maxDevices, 10) || 1,
        accessExpiresAt: expiry ? new Date(expiry).toISOString() : null,
      });
      toast('success', 'User settings saved');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!user) return;
    const next = user.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    setBusy(true);
    try {
      await patch(`/admin/users/${id}`, { status: next });
      toast('success', next === 'BLOCKED' ? 'User blocked' : 'User unblocked');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    setBusy(true);
    try {
      await post(`/admin/devices/${deviceId}/revoke`);
      toast('success', 'Device revoked — signed out remotely');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function revokeAll() {
    setBusy(true);
    try {
      await post(`/admin/users/${id}/revoke-all`);
      toast('success', 'All sessions revoked');
      setConfirmRevokeAll(false);
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    if (!grantId) {
      toast('error', 'Pick content to grant access to');
      return;
    }
    setBusy(true);
    try {
      await post('/admin/permissions', {
        userId: id,
        contentType: grantTarget.toLowerCase() as 'pdf' | 'video' | 'category',
        contentId: grantId,
        expiresAt: grantExpiry ? new Date(grantExpiry).toISOString() : null,
      });
      toast('success', 'Permission granted');
      setGrantId('');
      setGrantExpiry('');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Grant failed');
    } finally {
      setBusy(false);
    }
  }

  async function revokePerm(permId: string) {
    try {
      await del(`/admin/permissions/${permId}`);
      toast('success', 'Permission revoked');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!user) return <Spinner label="Loading user…" />;

  const grantOptions =
    grantTarget === 'PDF'
      ? pdfs.map((p) => ({ id: p.id, name: `${p.title} [${p.status}]` }))
      : grantTarget === 'VIDEO'
        ? videos.map((v) => ({ id: v.id, name: `${v.title} [${v.status}]` }))
        : categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <PageHeader
        title={user.name}
        subtitle={`${user.phone}${user.email ? ` · ${user.email}` : ''}`}
        actions={
          <Link href="/users" className="text-sm font-medium text-emerald-700 hover:underline">
            ← All users
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">Account</div>
            <Badge value={user.status} />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <Field label="Max devices">
                  <Input
                    type="number"
                    min={1}
                    value={maxDevices}
                    onChange={(e) => setMaxDevices(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex-1">
                <Field label="Access expires at" hint="Empty = no expiry">
                  <Input
                    type="datetime-local"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={saveSettings} disabled={busy}>
                Save settings
              </Button>
              <Button
                variant={user.status === 'ACTIVE' ? 'danger' : 'secondary'}
                onClick={toggleBlock}
                disabled={busy}
              >
                {user.status === 'ACTIVE' ? 'Block user' : 'Unblock user'}
              </Button>
              <Button onClick={() => setConfirmRevokeAll(true)} disabled={busy}>
                Revoke all sessions
              </Button>
            </div>
            <div className="text-xs text-slate-400">
              Joined {new Date(user.createdAt).toLocaleString('en-GB')}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">
            Devices ({user.devices.filter((d) => !d.revoked).length} active)
          </div>
          {user.devices.length === 0 ? (
            <EmptyState title="No devices" hint="Devices appear here after the user signs in." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {user.devices.map((d) => (
                <li key={d.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      {d.name ?? 'Unknown device'}
                    </div>
                    <div className="font-mono text-xs text-slate-400">
                      {d.fingerprint.slice(0, 16)}… · {d.ip ?? 'no ip'} · seen{' '}
                      {new Date(d.lastSeenAt).toLocaleString('en-GB')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.revoked && <Badge value="BLOCKED" />}
                    {!d.revoked && (
                      <button
                        onClick={() => revokeDevice(d.id)}
                        disabled={busy}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">Activity</div>
        {activity ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-400">PDFs opened</div>
                <div className="text-lg font-semibold text-slate-800">{activity.pdfsOpened}</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-400">Videos played</div>
                <div className="text-lg font-semibold text-slate-800">{activity.videosPlayed}</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-400">Total watch time</div>
                <div className="text-lg font-semibold text-slate-800">
                  {formatDuration(activity.totalWatchTimeSec)}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-400">Last active</div>
                <div className="text-lg font-semibold text-slate-800">
                  {activity.lastActiveAt ? relativeTime(activity.lastActiveAt) : 'never'}
                </div>
              </div>
            </div>
            {activity.recentEvents.length === 0 ? (
              <EmptyState title="No activity yet" hint="Events appear here once the user opens content in the app." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.recentEvents.slice(0, 20).map((e, idx) => (
                  <li key={`${e.createdAt}-${idx}`} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <Badge value={e.contentType.toUpperCase()} />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{eventLabel(e.event)}</div>
                        <div className="font-mono text-xs text-slate-400" title={e.contentId}>
                          {e.contentId.slice(0, 8)}…
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{formatDateTime(e.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <EmptyState title="No activity data" />
        )}
      </Card>

      <Card className="mt-4 p-5">
        <div className="mb-3 text-sm font-semibold text-slate-800">
          Content permissions ({perms.length})
        </div>
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <div className="w-32">
            <Field label="Type">
              <Select
                value={grantTarget}
                onChange={(e) => {
                  setGrantTarget(e.target.value as PermissionTarget);
                  setGrantId('');
                }}
              >
                <option value="PDF">PDF</option>
                <option value="VIDEO">Video</option>
                <option value="CATEGORY">Category</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-52 flex-1">
            <Field label="Content">
              <Select value={grantId} onChange={(e) => setGrantId(e.target.value)}>
                <option value="">Select…</option>
                {grantOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-48">
            <Field label="Expires (optional)">
              <Input
                type="datetime-local"
                value={grantExpiry}
                onChange={(e) => setGrantExpiry(e.target.value)}
              />
            </Field>
          </div>
          <Button variant="primary" onClick={grant} disabled={busy}>
            Grant access
          </Button>
        </div>
        {perms.length === 0 ? (
          <EmptyState
            title="No permissions granted"
            hint="Default-deny: this user sees nothing until you grant access."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {perms.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-3">
                  <Badge value={p.target} />
                  <div>
                    <div className="font-mono text-xs text-slate-600">{p.targetId}</div>
                    <div className="text-xs text-slate-400">
                      {p.expiresAt
                        ? `expires ${new Date(p.expiresAt).toLocaleString('en-GB')}`
                        : 'no expiry'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => revokePerm(p.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {confirmRevokeAll && (
        <ConfirmDialog
          title="Revoke all sessions"
          message={`Sign ${user.name} out of every device immediately? They will need to sign in again.`}
          confirmLabel="Revoke all"
          onConfirm={revokeAll}
          onCancel={() => setConfirmRevokeAll(false)}
          busy={busy}
        />
      )}
    </div>
  );
}

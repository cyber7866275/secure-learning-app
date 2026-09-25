'use client';

import { useCallback, useEffect, useState } from 'react';
import { get, put } from '@/lib/api';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Toggle,
  useToast,
} from '@/components/ui';

/**
 * App-wide settings. Backed by the backend's app_settings table
 * (GET/PUT /admin/settings). The Android app reads these in Stage 4.
 */
export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await get<{ settings: Record<string, string> }>('/admin/settings');
      setSettings(res.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(key: string, value: string) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await put<{ settings: Record<string, string> }>('/admin/settings', {
        settings,
      });
      setSettings(res.settings);
      toast('success', 'Settings saved');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!settings) return <Spinner label="Loading settings…" />;

  const bool = (k: string) => settings[k] === 'true';

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Security toggles and defaults — read by the Android app"
        actions={
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />
      <div className="grid max-w-3xl grid-cols-1 gap-4">
        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-slate-800">Content protection</div>
          <div className="flex flex-col gap-4">
            <div>
              <Toggle
                checked={bool('screenshot_protection')}
                onChange={(v) => set('screenshot_protection', String(v))}
                label="Screenshot protection"
              />
              <p className="mt-1 pl-14 text-xs text-slate-400">
                FLAG_SECURE on the PDF viewer and video player — blocks OS screenshots.
              </p>
            </div>
            <div>
              <Toggle
                checked={bool('recording_protection')}
                onChange={(v) => set('recording_protection', String(v))}
                label="Screen recording protection"
              />
              <p className="mt-1 pl-14 text-xs text-slate-400">
                FLAG_SECURE also blocks system screen recording on viewer/player screens.
              </p>
            </div>
            <div>
              <Toggle
                checked={bool('watermark_enabled')}
                onChange={(v) => set('watermark_enabled', String(v))}
                label="Dynamic watermark"
              />
              <p className="mt-1 pl-14 text-xs text-slate-400">
                Overlays name + user ID + date/time on PDFs and videos, moving periodically.
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-slate-800">Device integrity</div>
          <div className="flex flex-col gap-4">
            <div>
              <Toggle
                checked={bool('root_block_enabled')}
                onChange={(v) => set('root_block_enabled', String(v))}
                label="Block rooted devices"
              />
              <p className="mt-1 pl-14 text-xs text-slate-400">
                Logins from rooted devices are rejected (the app self-reports via RootBeer;
                the server also writes a ROOT_DETECTED alert).
              </p>
            </div>
            <div>
              <Field
                label="Play Integrity enforcement"
                hint="Hardware-backed app/device verdict, verified server-side. Requires PLAY_INTEGRITY_ENABLED and a Play-distributed build."
              >
                <Select
                  value={settings['integrity_enforcement'] ?? 'log'}
                  onChange={(e) => set('integrity_enforcement', e.target.value)}
                >
                  <option value="off">Off — skip verification</option>
                  <option value="log">Log — verify, alert on failure, allow login</option>
                  <option value="block">Block — reject login on failed/missing verdict</option>
                </Select>
              </Field>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-slate-800">Device limits</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Default max devices" hint="Applied to newly created users">
              <Input
                type="number"
                min={1}
                value={settings['default_max_devices'] ?? '2'}
                onChange={(e) => set('default_max_devices', e.target.value)}
              />
            </Field>
            <Field label="When the device limit is exceeded">
              <Select
                value={settings['device_limit_mode'] ?? 'revoke-oldest'}
                onChange={(e) => set('device_limit_mode', e.target.value)}
              >
                <option value="revoke-oldest">Revoke oldest device, allow login</option>
                <option value="deny">Deny the new login</option>
              </Select>
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}

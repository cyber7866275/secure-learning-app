'use client';

import { useCallback, useEffect, useState } from 'react';
import { del, get, patch, post } from '@/lib/api';
import type { Banner } from '@/lib/types';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
  Toggle,
  useToast,
} from '@/components/ui';

function BannerDialog({
  banner,
  onClose,
  onSaved,
}: {
  banner: Banner | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(banner?.title ?? '');
  const [body, setBody] = useState(banner?.body ?? '');
  const [active, setActive] = useState(banner?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim() || null,
        active,
        sortOrder: parseInt(sortOrder, 10) || 0,
      };
      if (banner) await patch(`/admin/banners/${banner.id}`, payload);
      else await post('/admin/banners', payload);
      toast('success', banner ? 'Banner updated' : 'Banner created');
      onSaved();
      onClose();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={banner ? 'Edit banner' : 'New banner'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Title">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
        </Field>
        <Field label="Body">
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex gap-6">
          <div className="flex-1">
            <Field label="Sort order">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </Field>
          </div>
          <div className="flex items-end pb-2">
            <Toggle checked={active} onChange={setActive} label="Active" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function BannersPage() {
  const toast = useToast();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Banner | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // NOTE: listAdmin returns a plain array, not a paginated page.
      setBanners(await get<Banner[]>('/admin/banners'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(b: Banner) {
    try {
      await patch(`/admin/banners/${b.id}`, { active: !b.active });
      toast('success', b.active ? 'Banner deactivated' : 'Banner activated');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await del(`/admin/banners/${deleting.id}`);
      toast('success', 'Banner deleted');
      setDeleting(null);
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Banners"
        subtitle="Home-page notices shown in the app"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            New banner
          </Button>
        }
      />
      <Card>
        {loading ? (
          <Spinner />
        ) : error ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : banners.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No banners" hint="Create one to show a notice on the app home screen." />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {banners.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{b.title}</span>
                    <Badge value={b.active ? 'ACTIVE' : 'HIDDEN'} />
                  </div>
                  {b.body && <div className="mt-0.5 truncate text-xs text-slate-400">{b.body}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" onClick={() => toggleActive(b)}>
                    {b.active ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing(b)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => setDeleting(b)}>
                    <span className="text-red-600">Delete</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <BannerDialog
          banner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete banner"
          message={`Delete "${deleting.title}"?`}
          onConfirm={doDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

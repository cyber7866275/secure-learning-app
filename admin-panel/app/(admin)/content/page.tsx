'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import { del, get, patch, post, uploadWithProgress } from '@/lib/api';
import { formatDuration, relativeTime } from '@/lib/format';
import type {
  Category,
  Chapter,
  ContentStats,
  ContentStatus,
  CreateContentResponse,
  Page,
  Pdf,
  ReplaceResponse,
  Subject,
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
  Modal,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  useToast,
} from '@/components/ui';

// ------------------------------------------------------------ taxonomy hook -

function useTaxonomy() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const reload = useCallback(async () => {
    const [c, s, ch] = await Promise.all([
      get<Category[]>('/admin/taxonomy/categories'),
      get<Subject[]>('/admin/taxonomy/subjects'),
      get<Chapter[]>('/admin/taxonomy/chapters'),
    ]);
    setCategories(c);
    setSubjects(s);
    setChapters(ch);
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return { categories, subjects, chapters, reload };
}

function TaxonomySelects({
  categoryId,
  subjectId,
  chapterId,
  onChange,
  type,
}: {
  categoryId: string;
  subjectId: string;
  chapterId: string;
  onChange: (c: string, s: string, ch: string) => void;
  type: 'PDF' | 'VIDEO';
}) {
  const { categories, subjects, chapters } = useTaxonomy();
  const cats = categories.filter((c) => c.type === 'BOTH' || c.type === type);
  const subs = subjects.filter((s) => !categoryId || s.categoryId === categoryId);
  const chs = chapters.filter((c) => !subjectId || c.subjectId === subjectId);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Field label="Category">
        <Select value={categoryId} onChange={(e) => onChange(e.target.value, '', '')}>
          <option value="">— None —</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subject">
        <Select value={subjectId} onChange={(e) => onChange(categoryId, e.target.value, '')}>
          <option value="">— None —</option>
          {subs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Chapter">
        <Select value={chapterId} onChange={(e) => onChange(categoryId, subjectId, e.target.value)}>
          <option value="">— None —</option>
          {chs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

// ------------------------------------------------------------------ upload --

function UploadDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: 'pdf' | 'video';
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('');
  const [sub, setSub] = useState('');
  const [ch, setCh] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const accept = kind === 'pdf' ? 'application/pdf' : 'video/*';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast('error', 'Please choose a file');
      return;
    }
    setBusy(true);
    setPct(0);
    try {
      // 1. Create the DB row -> backend returns a presigned PUT URL.
      const created = await post<CreateContentResponse>(`/admin/${kind}s`, {
        title: title.trim(),
        categoryId: cat || undefined,
        subjectId: sub || undefined,
        chapterId: ch || undefined,
      });
      const item = kind === 'pdf' ? created.pdf : created.video;
      setCreatedId(item?.id ?? null);
      // 2. Upload the file directly to private storage (never via the API).
      await uploadWithProgress(created.uploadUrl, file, file.type || 'application/octet-stream', setPct);
      toast('success', `${kind === 'pdf' ? 'PDF' : 'Video'} uploaded — publish it when ready`);
      onDone();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={kind === 'pdf' ? 'Upload PDF' : 'Upload Video'} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Title">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Thermodynamics — Chapter 1" />
        </Field>
        <TaxonomySelects
          type={kind === 'pdf' ? 'PDF' : 'VIDEO'}
          categoryId={cat}
          subjectId={sub}
          chapterId={ch}
          onChange={(c, s, ch2) => {
            setCat(c);
            setSub(s);
            setCh(ch2);
          }}
        />
        <Field label="File" hint={kind === 'video' ? 'Source file — HLS transcoding happens in Stage 5' : undefined}>
          <Input type="file" accept={accept} required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        {busy && (
          <div>
            <div className="mb-1 text-xs text-slate-500">Uploading… {pct}%</div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          {createdId ? (
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Uploading…' : 'Create & Upload'}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// -------------------------------------------------------------------- rows --

type Item = Pdf | Video;

function isVideo(i: Item): i is Video {
  return 'processingStatus' in i;
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type StatsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; stats: ContentStats };

/** Lazy-loaded per-content analytics, fetched once when a row is expanded. */
function RowStats({ kind, id }: { kind: 'pdf' | 'video'; id: string }) {
  const [state, setState] = useState<StatsState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    get<ContentStats>(`/admin/analytics/content/${kind}/${id}`)
      .then((stats) => {
        if (!cancelled) setState({ status: 'done', stats });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to load stats',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, id, attempt]);

  if (state.status === 'loading') return <Spinner label="Loading stats…" />;
  if (state.status === 'error')
    return (
      <div className="text-xs text-red-600">
        {state.message}{' '}
        <button
          onClick={() => setAttempt((a) => a + 1)}
          className="font-medium text-emerald-700 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  if (state.status !== 'done') return null;
  const s = state.stats;
  const cells: { label: string; value: string }[] = [
    { label: 'Opens', value: String(s.opens) },
    { label: 'Unique users', value: String(s.uniqueUsers) },
    { label: 'Total watch time', value: formatDuration(s.totalWatchTimeSec) },
    { label: 'Last opened', value: s.lastOpenedAt ? relativeTime(s.lastOpenedAt) : 'never' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs text-slate-400">{c.label}</div>
          <div className="text-sm font-semibold text-slate-800">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function ContentTable({
  kind,
  items,
  onEdit,
  onStatus,
  onReplace,
  onDelete,
  onReprocess,
}: {
  kind: 'pdf' | 'video';
  items: Item[];
  onEdit: (i: Item) => void;
  onStatus: (i: Item, s: 'publish' | 'unpublish' | 'hide') => void;
  onReplace: (i: Item) => void;
  onDelete: (i: Item) => void;
  onReprocess: (i: Item) => void;
}) {
  if (items.length === 0) return <EmptyState title={`No ${kind === 'pdf' ? 'PDFs' : 'videos'} found`} hint="Upload one to get started." />;

  // Which row's analytics are expanded (lazily fetched per row).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
            <th className="w-8 px-2 py-3" aria-label="Expand stats" />
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Size / Meta</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((i) => (
            <Fragment key={i.id}>
              <tr className="hover:bg-slate-50">
                <td className="w-8 px-2 py-3 align-top">
                  <button
                    onClick={() => setExpandedId((cur) => (cur === i.id ? null : i.id))}
                    aria-label={expandedId === i.id ? 'Hide stats' : 'Show stats'}
                    title="Usage stats"
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <span
                      className={`inline-block text-xs transition-transform ${
                        expandedId === i.id ? 'rotate-90' : ''
                      }`}
                    >
                      ▶
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{i.title}</div>
                  <div className="text-xs text-slate-400">
                    {[i.subject?.name, i.chapter?.name].filter(Boolean).join(' · ') || '—'}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{i.category?.name ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">
                  {isVideo(i) ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span>{i.durationSec ? `${Math.round(i.durationSec / 60)} min` : '—'}</span>
                        <Badge value={i.processingStatus} />
                      </div>
                      {i.processingStatus === 'FAILED' && i.processingError && (
                        <div className="max-w-xs text-xs text-red-600" title={i.processingError}>
                          {i.processingError.length > 90
                            ? `${i.processingError.slice(0, 90)}…`
                            : i.processingError}
                        </div>
                      )}
                    </div>
                  ) : (
                    `${fmtBytes(i.fileSize)}${i.pageCount ? ` · ${i.pageCount} pages` : ''}`
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge value={i.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" onClick={() => onEdit(i)}>
                      Edit
                    </Button>
                    {i.status !== 'PUBLISHED' ? (
                      <Button variant="ghost" onClick={() => onStatus(i, 'publish')}>
                        Publish
                      </Button>
                    ) : (
                      <Button variant="ghost" onClick={() => onStatus(i, 'unpublish')}>
                        Unpublish
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => onReplace(i)}>
                      Replace
                    </Button>
                    {isVideo(i) && i.processingStatus === 'FAILED' && (
                      <Button variant="ghost" onClick={() => onReprocess(i)}>
                        Reprocess
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => onDelete(i)}>
                      <span className="text-red-600">Delete</span>
                    </Button>
                  </div>
                </td>
              </tr>
              {expandedId === i.id && (
                <tr className="bg-slate-50">
                  <td className="w-8 px-2 py-2" />
                  <td colSpan={5} className="px-4 pb-4 pt-1">
                    <div className="mb-1.5 text-xs font-medium uppercase text-slate-400">
                      Usage stats
                    </div>
                    <RowStats kind={kind} id={i.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --------------------------------------------------------------- main page --

const PAGE_SIZE = 12;

export default function ContentPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'pdfs' | 'videos' | 'taxonomy'>('pdfs');
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ContentStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [replacing, setReplacing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const kind = tab === 'videos' ? 'video' : 'pdf';

  const load = useCallback(async () => {
    if (tab === 'taxonomy') return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) q.set('search', search.trim());
      if (status) q.set('status', status);
      const res = await get<Page<Item>>(`/admin/${tab}?${q}`);
      setItems(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset pagination when the tab changes.
  useEffect(() => {
    setPage(1);
    setSearch('');
    setStatus('');
  }, [tab]);

  async function changeStatus(i: Item, action: 'publish' | 'unpublish' | 'hide') {
    try {
      await post(`/admin/${kind}s/${i.id}/${action}`);
      toast('success', `${action === 'publish' ? 'Published' : action === 'unpublish' ? 'Unpublished' : 'Hidden'}`);
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Action failed');
    }
  }

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await del(`/admin/${kind}s/${deleting.id}`);
      toast('success', 'Deleted');
      setDeleting(null);
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  /** Reset a FAILED video to PENDING so the packaging worker picks it up again. */
  async function reprocessVideo(i: Item) {
    try {
      await post(`/admin/${kind}s/${i.id}/reprocess`);
      toast('success', 'Video queued for reprocessing');
      load();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Reprocess failed');
    }
  }

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle="PDFs, videos and taxonomy"
        actions={
          tab !== 'taxonomy' && (
            <Button variant="primary" onClick={() => setShowUpload(true)}>
              Upload {kind === 'pdf' ? 'PDF' : 'Video'}
            </Button>
          )
        }
      />

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {(['pdfs', 'videos', 'taxonomy'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize ${
              tab === t
                ? 'border-b-2 border-emerald-700 text-emerald-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'taxonomy' ? (
        <TaxonomyManager />
      ) : (
        <Card>
          <div className="flex flex-wrap gap-3 border-b border-slate-200 px-4 py-3">
            <div className="min-w-52 flex-1">
              <Input
                placeholder={`Search ${kind}s…`}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | ContentStatus);
                setPage(1);
              }}
              className="w-40"
            >
              <option value="">All statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="HIDDEN">Hidden</option>
            </Select>
          </div>
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="p-4">
              <ErrorState message={error} onRetry={load} />
            </div>
          ) : (
            <>
              <ContentTable
                kind={kind}
                items={items}
                onEdit={setEditing}
                onStatus={changeStatus}
                onReplace={setReplacing}
                onDelete={setDeleting}
                onReprocess={reprocessVideo}
              />
              <Pagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />
            </>
          )}
        </Card>
      )}

      {showUpload && (
        <UploadDialog
          kind={kind}
          onClose={() => setShowUpload(false)}
          onDone={() => {
            setShowUpload(false);
            load();
          }}
        />
      )}
      {editing && (
        <EditDialog
          item={editing}
          kind={kind}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {replacing && (
        <ReplaceDialog item={replacing} kind={kind} onClose={() => setReplacing(null)} onDone={load} />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${kind}`}
          message={`Delete "${deleting.title}"? The file will be removed from storage and this cannot be undone.`}
          onConfirm={doDelete}
          onCancel={() => setDeleting(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ edit ----

function EditDialog({
  item,
  kind,
  onClose,
  onSaved,
}: {
  item: Item;
  kind: 'pdf' | 'video';
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [cat, setCat] = useState(item.categoryId ?? '');
  const [sub, setSub] = useState(item.subjectId ?? '');
  const [ch, setCh] = useState(item.chapterId ?? '');
  const [extra, setExtra] = useState(
    isVideo(item) ? String(item.durationSec ?? '') : String(item.pageCount ?? ''),
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        categoryId: cat || null,
        subjectId: sub || null,
        chapterId: ch || null,
      };
      if (extra.trim()) {
        body[kind === 'pdf' ? 'pageCount' : 'durationSec'] = parseInt(extra, 10);
      }
      await patch(`/admin/${kind}s/${item.id}`, body);
      toast('success', 'Saved');
      onSaved();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${kind}`} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Title">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <TaxonomySelects
          type={kind === 'pdf' ? 'PDF' : 'VIDEO'}
          categoryId={cat}
          subjectId={sub}
          chapterId={ch}
          onChange={(c, s, ch2) => {
            setCat(c);
            setSub(s);
            setCh(ch2);
          }}
        />
        <Field label={kind === 'pdf' ? 'Page count' : 'Duration (seconds)'}>
          <Input
            type="number"
            min={0}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Optional"
          />
        </Field>
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

// ---------------------------------------------------------------- replace ---

function ReplaceDialog({
  item,
  kind,
  onClose,
  onDone,
}: {
  item: Item;
  kind: 'pdf' | 'video';
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast('error', 'Please choose a file');
      return;
    }
    setBusy(true);
    try {
      // Two-step swap: get a PUT URL for the new file, upload, then confirm.
      const { uploadUrl } = await post<ReplaceResponse>(`/admin/${kind}s/${item.id}/replace`);
      await uploadWithProgress(uploadUrl, file, file.type || 'application/octet-stream', setPct);
      await post(`/admin/${kind}s/${item.id}/replace/confirm`);
      toast('success', 'File replaced');
      onDone();
      onClose();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Replace ${kind} file`} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Upload a new file for <span className="font-medium">“{item.title}”</span>. The old file is
          removed from storage after you confirm.
        </p>
        <Field label="New file">
          <Input
            type="file"
            required
            accept={kind === 'pdf' ? 'application/pdf' : 'video/*'}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {busy && (
          <div>
            <div className="mb-1 text-xs text-slate-500">Uploading… {pct}%</div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Working…' : 'Upload & Replace'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --------------------------------------------------------------- taxonomy ---

function TaxonomyManager() {
  const toast = useToast();
  const { categories, subjects, chapters, reload } = useTaxonomy();
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newCatType, setNewCatType] = useState<'PDF' | 'VIDEO' | 'BOTH'>('BOTH');
  const [newSub, setNewSub] = useState('');
  const [newSubCat, setNewSubCat] = useState('');
  const [newCh, setNewCh] = useState('');
  const [newChSub, setNewChSub] = useState('');

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast('success', ok);
      await reload();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const addCat = () =>
    newCat.trim() && run(() => post('/admin/taxonomy/categories', { name: newCat.trim(), type: newCatType }), 'Category added').then(() => setNewCat(''));
  const addSub = () =>
    newSub.trim() && newSubCat && run(() => post('/admin/taxonomy/subjects', { name: newSub.trim(), categoryId: newSubCat }), 'Subject added').then(() => setNewSub(''));
  const addCh = () =>
    newCh.trim() && newChSub && run(() => post('/admin/taxonomy/chapters', { name: newCh.trim(), subjectId: newChSub }), 'Chapter added').then(() => setNewCh(''));

  const cols: {
    title: string;
    items: { id: string; name: string }[];
    del: (id: string) => Promise<unknown>;
    form: React.ReactNode;
  }[] = [
    {
      title: 'Categories',
      items: categories,
      del: (id) => del(`/admin/taxonomy/categories/${id}`),
      form: (
        <div className="flex gap-2">
          <Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
          <Select value={newCatType} onChange={(e) => setNewCatType(e.target.value as 'PDF' | 'VIDEO' | 'BOTH')} className="w-28">
            <option value="BOTH">Both</option>
            <option value="PDF">PDF</option>
            <option value="VIDEO">Video</option>
          </Select>
          <Button variant="primary" onClick={addCat} disabled={busy || !newCat.trim()}>
            Add
          </Button>
        </div>
      ),
    },
    {
      title: 'Subjects',
      items: subjects,
      del: (id) => del(`/admin/taxonomy/subjects/${id}`),
      form: (
        <div className="flex gap-2">
          <Select value={newSubCat} onChange={(e) => setNewSubCat(e.target.value)} className="w-36">
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input placeholder="New subject" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
          <Button variant="primary" onClick={addSub} disabled={busy || !newSub.trim() || !newSubCat}>
            Add
          </Button>
        </div>
      ),
    },
    {
      title: 'Chapters',
      items: chapters,
      del: (id) => del(`/admin/taxonomy/chapters/${id}`),
      form: (
        <div className="flex gap-2">
          <Select value={newChSub} onChange={(e) => setNewChSub(e.target.value)} className="w-36">
            <option value="">Subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input placeholder="New chapter" value={newCh} onChange={(e) => setNewCh(e.target.value)} />
          <Button variant="primary" onClick={addCh} disabled={busy || !newCh.trim() || !newChSub}>
            Add
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {cols.map((col) => (
        <Card key={col.title} className="p-5">
          <div className="mb-3 text-sm font-semibold text-slate-800">{col.title}</div>
          <div className="mb-4">{col.form}</div>
          <ul className="divide-y divide-slate-100">
            {col.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">{i.name}</span>
                <button
                  onClick={() => run(() => col.del(i.id), 'Deleted')}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
            {col.items.length === 0 && (
              <li className="py-4 text-center text-xs text-slate-400">Nothing here yet</li>
            )}
          </ul>
        </Card>
      ))}
    </div>
  );
}

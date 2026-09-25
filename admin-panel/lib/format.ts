/** Small display formatters shared by dashboard / content / user pages. */

/** Format seconds as "1h 30m" / "45m" / "30s". */
export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** "5 min ago" style relative time, falls back to a date for old timestamps. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  if (ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB');
}

/** YYYY-MM-DD -> "25 Sep". */
export function formatDayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? isoDay
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Extract meta.reason / meta.ip from a Prisma JsonValue-ish field. */
export function metaField(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!meta || typeof meta !== 'object') return '—';
  const v = meta[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '—';
}

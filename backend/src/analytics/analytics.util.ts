/**
 * Watch-time accounting + day bucketing.
 *
 * These are PURE functions (no DB, no framework) so the core analytics math
 * can be tested in plain node. See the Stage 6 verification notes.
 */

/** Max gap between consecutive heartbeats that still counts as continuous watching. */
export const HEARTBEAT_GAP_SEC = 120;

/** Credited watch time for the trailing heartbeat of a session. */
export const TRAILING_HEARTBEAT_SEC = 30;

export interface DayBucket {
  /** UTC calendar day, 'YYYY-MM-DD'. */
  date: string;
  value: number;
}

/**
 * Watch-time algorithm (documented for the admin UI + future maintainers):
 *
 * 1. Sort heartbeat timestamps ascending.
 * 2. Split into sessions: a gap strictly greater than HEARTBEAT_GAP_SEC starts
 *    a new session. The gap itself is NOT counted — the user had paused, closed
 *    the app, or lost network; we only credit time we have evidence for.
 * 3. Per session: (last - first) in seconds + TRAILING_HEARTBEAT_SEC. A lone
 *    heartbeat credits 30s: the heartbeat proves the user was watching at
 *    that moment, and the app sends one every 30s while playing.
 * 4. Sum across sessions, rounded to whole seconds.
 *
 * Deliberate simplifications: seeks are ignored (position is informational);
 * heartbeats from different videos are never mixed (callers group first).
 */
export function computeWatchTimeSec(timestamps: Date[]): number {
  if (timestamps.length === 0) return 0;
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  let total = 0;
  let sessionStart = sorted[0].getTime();
  let sessionLast = sessionStart;
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i].getTime();
    if ((t - sessionLast) / 1000 > HEARTBEAT_GAP_SEC) {
      total += (sessionLast - sessionStart) / 1000 + TRAILING_HEARTBEAT_SEC;
      sessionStart = t;
    }
    sessionLast = t;
  }
  total += (sessionLast - sessionStart) / 1000 + TRAILING_HEARTBEAT_SEC;
  return Math.round(total);
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Bucket timestamps into per-day counts for the last `days` days ending today
 * (UTC), filling days with no activity with 0 so charts never have gaps.
 */
export function bucketByDay(timestamps: Date[], days: number, now: Date = new Date()): DayBucket[] {
  const counts = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    counts.set(utcDay(d), 0);
  }
  for (const t of timestamps) {
    const key = utcDay(t);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([date, value]) => ({ date, value }));
}

/**
 * Group heartbeat timestamps by UTC day. Sessions that span midnight are
 * split across days — a documented, acceptable approximation for the
 * per-day watch_time chart.
 */
export function groupHeartbeatsByDay(timestamps: Date[]): Map<string, Date[]> {
  const groups = new Map<string, Date[]>();
  for (const t of timestamps) {
    const key = utcDay(t);
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }
  return groups;
}

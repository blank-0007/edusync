/** Formatting + small helpers shared across the web client. */

export function cls(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** HH:MM in the device's local timezone (status lines use this). */
export function fmtClock(timestamp: number | null | undefined): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "just now", "14s ago", "4 min ago", "2 h ago" — for sync timestamps. */
export function fmtAgo(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return 'never';
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}

export function fmtRetryIn(retryInMs: number | null | undefined): string | null {
  if (retryInMs == null) return null;
  const seconds = Math.max(0, Math.ceil(retryInMs / 1000));
  return `${seconds}s`;
}

/** "Fri 14 Nov · 23:59" from an ISO date string. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  return `${weekday} ${day} ${month} · ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getDate();
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  return `${day} ${month}`;
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

/** Split a HLC "1762598400123:3:dev_7f3a" for dense table cells. */
export function fmtHlc(hlc: string | null | undefined): string {
  if (!hlc) return '—';
  const [physical, counter, node] = hlc.split(':');
  const millis = Number(physical);
  const time = Number.isFinite(millis)
    ? new Date(millis).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : physical;
  return `${time} · ${counter} · ${(node ?? '').slice(0, 8)}…`;
}

export function shortId(id: string, head = 8): string {
  if (!id) return '—';
  return id.length <= head + 2 ? id : `${id.slice(0, head)}…`;
}

export function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** SHA-256 hex — content hash for submissions (WebCrypto). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Extremely defensive fallback (non-secure contexts): deterministic FNV-1a expansion.
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').repeat(8);
}

export function prettyJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed;
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

/** Cheap line diff for the conflict viewer: common prefix/suffix + changed middle. */
export function diffLines(left: string, right: string): { left: DiffLine[]; right: DiffLine[] } {
  const a = left.split('\n');
  const b = right.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }
  const leftLines: DiffLine[] = [
    ...a.slice(0, start).map((text) => ({ kind: 'same' as const, text })),
    ...a.slice(start, endA + 1).map((text) => ({ kind: 'del' as const, text })),
    ...a.slice(endA + 1).map((text) => ({ kind: 'same' as const, text })),
  ];
  const rightLines: DiffLine[] = [
    ...b.slice(0, start).map((text) => ({ kind: 'same' as const, text })),
    ...b.slice(start, endB + 1).map((text) => ({ kind: 'add' as const, text })),
    ...b.slice(endB + 1).map((text) => ({ kind: 'same' as const, text })),
  ];
  return { left: leftLines, right: rightLines };
}

/** Human label for a lesson media kind. */
export function mediaLabel(kind: 'video' | 'pdf' | 'audio'): string {
  if (kind === 'video') return 'Video';
  if (kind === 'pdf') return 'PDF';
  return 'Audio';
}

export function storageKb(value: unknown): number {
  try {
    return Math.max(1, Math.round(JSON.stringify(value).length / 1024));
  } catch {
    return 1;
  }
}

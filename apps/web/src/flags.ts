/** Dev/demo query flags (CONTRACT.md §3): ?as=…&page=…&offline=1&fresh=1&doc=… */

export type Page = 'library' | 'assignment' | 'sync' | 'review' | 'doc' | 'login';

export const PAGES: readonly Page[] = ['library', 'assignment', 'sync', 'review', 'doc', 'login'];

export interface Flags {
  /** Seeded user id to auto-login as (u_aarav | u_yuki | u_priya). */
  as: string | null;
  /** Initial page. */
  page: Page | null;
  /** Start in simulated-offline mode (network calls short-circuited). */
  offline: boolean;
  /** Clear the local IndexedDB database on boot. */
  fresh: boolean;
  /** Shared document to open on the Document page (?page=doc&doc=d_group2). */
  doc: string | null;
}

function parsePage(raw: string | null): Page | null {
  if (!raw) return null;
  return (PAGES as readonly string[]).includes(raw) ? (raw as Page) : null;
}

export function readFlags(): Flags {
  const params = new URLSearchParams(window.location.search);
  const as = params.get('as');
  const doc = params.get('doc');
  return {
    as: as && /^[A-Za-z0-9_-]{2,64}$/.test(as) ? as : null,
    page: parsePage(params.get('page')),
    offline: params.get('offline') === '1' || params.get('offline') === 'true',
    fresh: params.get('fresh') === '1' || params.get('fresh') === 'true',
    doc: doc && /^[A-Za-z0-9_-]{2,64}$/.test(doc) ? doc : null,
  };
}

/** Keep the URL in sync with the current page without reloading. */
export function writePageParam(page: Page): void {
  const url = new URL(window.location.href);
  url.searchParams.set('page', page);
  window.history.replaceState(null, '', url.toString());
}

/** Keep the URL in sync with the open shared document without reloading. */
export function writeDocParam(docId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('doc', docId);
  window.history.replaceState(null, '', url.toString());
}

export function clearPageParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  window.history.replaceState(null, '', url.toString());
}

/**
 * Dev-grade session handling (CONTRACT.md: bearer token from POST /api/auth/login).
 *
 * Local-first rule: the UI never waits on the network to sign in. We persist the
 * chosen seeded user + deviceId immediately, then exchange them for a bearer token
 * in the background. If the server is unreachable the app keeps working offline and
 * retries the login from the sync engine's backoff loop.
 */
import { ulid, isUlid } from '@edusync/protocol';
import type { User } from '@edusync/protocol';
import * as db from './db';
import { api } from './api';

export interface SeedAccount {
  user: User;
  tagline: string;
  blurb: string;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    user: {
      id: 'u_aarav',
      name: 'Aarav Menon',
      role: 'student',
      email: 'aarav.menon@student.edu',
      initials: 'AM',
    },
    tagline: 'Student · 2024 batch',
    blurb: 'Cell Biology — BIOL 201. Three devices, one very flaky campus Wi-Fi.',
  },
  {
    user: {
      id: 'u_yuki',
      name: 'Yuki Tanaka',
      role: 'student',
      email: 'yuki.tanaka@student.edu',
      initials: 'YT',
    },
    tagline: 'Student · lab group 2',
    blurb: 'Shares the membrane-data worksheet with Aarav. Edits most things offline.',
  },
  {
    user: {
      id: 'u_priya',
      name: 'Dr. Priya Nair',
      role: 'instructor',
      email: 'priya.nair@university.edu',
      initials: 'PN',
    },
    tagline: 'Instructor · BIOL 201',
    blurb: 'Reviews conflicts and submissions when the class reconnects.',
  },
];

export function getSeedAccount(userId: string): SeedAccount | undefined {
  return SEED_ACCOUNTS.find((account) => account.user.id === userId);
}

export function normalizeUser(candidate: User | null | undefined, fallback: User): User {
  if (!candidate || typeof candidate !== 'object') return fallback;
  return {
    id: candidate.id || fallback.id,
    name: candidate.name || fallback.name,
    role: candidate.role === 'instructor' ? 'instructor' : (candidate.role ?? fallback.role),
    email: candidate.email || fallback.email,
    initials:
      candidate.initials ||
      (candidate.name || fallback.name)
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') ||
      fallback.initials,
  };
}

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  deviceId: string;
  token: string | null;
  /** True once the server has confirmed the session (a bearer token exists). */
  live: boolean;
  error: string | null;
}

const initial: AuthState = {
  status: 'loading',
  user: null,
  deviceId: '',
  token: null,
  live: false,
  error: null,
};

let state: AuthState = initial;
let loginPromise: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  emit();
}

async function ensureDeviceId(): Promise<string> {
  const stored = await db.getMeta<string>('deviceId');
  if (stored && isUlid(stored)) return stored;
  const deviceId = ulid();
  await db.setMeta('deviceId', deviceId);
  return deviceId;
}

/** Restore a persisted session from IndexedDB (called once during boot). */
export async function loadAuthState(): Promise<AuthState> {
  const deviceId = await ensureDeviceId();
  const user = await db.getMeta<User>('user');
  const token = await db.getMeta<string>('token');
  state = user
    ? {
        status: 'signed-in',
        user: normalizeUser(user, user),
        deviceId,
        token: token ?? null,
        live: Boolean(token),
        error: null,
      }
    : { status: 'signed-out', user: null, deviceId, token: null, live: false, error: null };
  emit();
  return state;
}

/**
 * Sign in as one of the seeded users. Persists locally first (so the app is usable
 * immediately) and starts the remote token exchange in the background.
 */
export async function signIn(userId: string): Promise<void> {
  const account = getSeedAccount(userId);
  if (!account) throw new Error(`Unknown seeded user: ${userId}`);

  const deviceId = await ensureDeviceId();
  const previous = state.user;
  const switchingUser = previous !== null && previous.id !== account.user.id;

  if (switchingUser) {
    // Records and ops are scoped to the authenticated user; switching accounts on a
    // shared device starts a clean per-user cache.
    await db.clearOps();
    await db.clearRecords();
    await db.replaceConflicts([]);
    await db.setMeta('seq', 0);
    await db.delMeta('lastSyncAt');
  }

  await db.setMeta('user', account.user);
  await db.delMeta('token');
  state = {
    status: 'signed-in',
    user: account.user,
    deviceId,
    token: null,
    live: false,
    error: null,
  };
  emit();
  void remoteLogin();
}

async function remoteLogin(): Promise<string | null> {
  if (loginPromise) return loginPromise;
  if (state.status !== 'signed-in' || !state.user) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ live: false, error: 'Offline — sign-in will retry when the connection returns' });
    return null;
  }
  const currentUser = state.user;
  const currentDevice = state.deviceId;
  loginPromise = (async () => {
    try {
      const response = await api.login(currentUser.id, currentDevice);
      const user = normalizeUser(response.user, currentUser);
      await db.setMeta('token', response.token);
      await db.setMeta('user', user);
      state = { ...state, user, token: response.token, live: true, error: null };
      emit();
      return response.token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed';
      state = { ...state, live: false, error: message };
      emit();
      return null;
    } finally {
      loginPromise = null;
    }
  })();
  return loginPromise;
}

/** Use the persisted token, exchanging credentials again if we don't have one. */
export async function ensureToken(): Promise<string | null> {
  if (state.token) return state.token;
  if (state.status !== 'signed-in') return null;
  return remoteLogin();
}

/** Called by the sync engine when the server rejects our token. */
export async function notifyUnauthorized(): Promise<void> {
  await db.delMeta('token');
  state = { ...state, token: null, live: false, error: 'Session rejected — signing in again' };
  emit();
}

export async function signOut(): Promise<void> {
  await db.delMeta('token');
  await db.delMeta('user');
  state = { ...state, status: 'signed-out', user: null, token: null, live: false, error: null };
  emit();
}

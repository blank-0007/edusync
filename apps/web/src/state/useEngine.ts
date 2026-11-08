import { useSyncExternalStore } from 'react';
import { engine, type SyncSnapshot } from '../sync/engine';
import { getAuthState, subscribeAuth, type AuthState } from '../auth';

/** Subscribe React to the sync engine (state, queue, conflicts, counts). */
export function useSync(): SyncSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

/** Subscribe React to the persisted session (user, deviceId, bearer token). */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

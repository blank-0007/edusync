/** Application boot: dev flags -> local DB -> session -> sync engine. */
import { readFlags, type Flags } from './flags';
import * as db from './db';
import * as auth from './auth';
import { engine } from './sync/engine';
import * as dbApi from './db';

export async function boot(): Promise<Flags> {
  const flags = readFlags();

  if (flags.fresh) {
    await db.deleteDatabase();
  }
  await db.open();
  await auth.loadAuthState();

  // Connection simulator and initial page are applied before the first render.
  engine.setSimulateOffline(flags.offline);
  await engine.init();

  if (flags.as) {
    const already = auth.getAuthState();
    if (already.user?.id !== flags.as) {
      try {
        await auth.signIn(flags.as);
        // If the server is down, keep retrying sign-in on the engine's backoff loop
        // so the app upgrades itself from Offline to Degraded and self-heals.
        engine.retryNow();
      } catch (error) {
        console.warn('[edusync] auto-login failed', error);
      }
    } else if (!already.token) {
      // Session persisted but the token is gone: exchange in the background.
      void auth.ensureToken();
    }
  }

  if (import.meta.env.DEV) {
    // Dev-only handle used by the headless verification harness (no UI dependency).
    (window as unknown as Record<string, unknown>).__edusync = {
      engine,
      db: dbApi,
      auth,
    };
  }

  return flags;
}

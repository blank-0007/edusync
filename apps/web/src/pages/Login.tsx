import { useState } from 'react';
import type { Page } from '../flags';
import { SEED_ACCOUNTS, signIn } from '../auth';
import { engine } from '../sync/engine';
import { Icon } from '../components/Icon';

interface LoginPageProps {
  onSignedIn: (page: Page) => void;
  initialPage: Page;
}

/** Seeded-user sign-in. No password: the demo is about local-first sync, not auth. */
export function LoginPage({ onSignedIn, initialPage }: LoginPageProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(userId: string) {
    setBusyId(userId);
    setError(null);
    try {
      await signIn(userId);
      // Exchange the dev token in the background (retries with backoff if offline).
      engine.retryNow();
      onSignedIn(initialPage === 'login' ? 'library' : initialPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-intro">
          <div className="brand login-brand">
            <span className="brand-mark" aria-hidden="true">
              <Icon name="book" size={20} />
            </span>
            <span className="brand-text">
              <span className="brand-name">EduSync</span>
              <span className="brand-sub">Offline-first learning</span>
            </span>
          </div>
          <h1 className="login-title">Your work is saved before the network sees it.</h1>
          <p className="login-copy">
            Every edit lands in a durable operation log on this device, then reconciles with the
            server through an idempotent, conflict-aware sync protocol. No spinners between you and
            your own words.
          </p>
          <ul className="login-points">
            <li>
              <Icon name="checkCircle" size={15} /> Drafts and submissions survive reloads and dead Wi-Fi
            </li>
            <li>
              <Icon name="shield" size={15} /> Exactly-once submissions with a client-generated key
            </li>
            <li>
              <Icon name="inbox" size={15} /> Contested edits go to a Review Inbox — nothing is discarded
            </li>
          </ul>
          <div className="login-foot-note">
            <span className="pill teal">
              <span className="dot" aria-hidden="true" />
              BIOL 201 · Cell Biology
            </span>
            <span className="tiny">
              Demo device creates a ULID deviceId and stores it in IndexedDB.
            </span>
          </div>
        </div>

        <div className="login-form">
          <div className="eyebrow">Sign in</div>
          <h2 className="login-form-title">Choose a seeded account</h2>
          <p className="small muted login-form-copy">
            Local-first means sign-in never blocks: the app opens from the device even if the server
            is unreachable and exchanges the token in the background.
          </p>

          <div className="account-list" role="list">
            {SEED_ACCOUNTS.map((account) => (
              <button
                key={account.user.id}
                type="button"
                className="account-card"
                onClick={() => void choose(account.user.id)}
                disabled={busyId !== null}
                aria-busy={busyId === account.user.id}
              >
                <span className="avatar lg" aria-hidden="true">
                  {account.user.initials}
                </span>
                <span className="account-text">
                  <span className="account-name">{account.user.name}</span>
                  <span className="account-tagline">{account.tagline}</span>
                  <span className="account-blurb">{account.blurb}</span>
                </span>
                <span className="account-go" aria-hidden="true">
                  <Icon name={busyId === account.user.id ? 'refresh' : 'arrowRight'} size={17} />
                </span>
              </button>
            ))}
          </div>

          {error ? (
            <p className="login-error" role="alert">
              <Icon name="alertCircle" size={15} /> {error}
            </p>
          ) : null}

          <p className="tiny muted login-hint">
            Dev: <code>?as=u_aarav</code> auto-login · <code>?offline=1</code> simulated offline ·{' '}
            <code>?fresh=1</code> clear local DB
          </p>
        </div>
      </div>
    </div>
  );
}

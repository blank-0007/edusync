import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Page } from '../flags';
import { useAuth, useSync } from '../state/useEngine';
import { useCatalog } from '../state/useCatalog';
import { signOut } from '../auth';
import { Icon, type IconName } from './Icon';
import { StatusPill } from './StatusPill';
import { shortId } from '../lib/util';

interface NavDefinition {
  page: Page;
  label: string;
  icon: IconName;
  badge?: number;
  badgeTone?: 'amber' | 'red';
}

const PAGE_TITLES: Record<Page, string> = {
  library: 'Lesson library',
  assignment: 'Assignment workspace',
  doc: 'Shared document',
  sync: 'Sync Center',
  review: 'Review Inbox',
  login: 'Sign in',
};

interface NavItemProps {
  item: NavDefinition;
  active: boolean;
  onClick: () => void;
}

function NavItem({ item, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      className={`nav-item${active ? ' active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-icon" aria-hidden="true">
        <Icon name={item.icon} size={15} />
      </span>
      <span className="nav-label">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 ? (
        <span className={`nav-badge${item.badgeTone === 'red' ? ' red' : ''}`}>{item.badge}</span>
      ) : null}
    </button>
  );
}

interface AppShellProps {
  page: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}

/** App chrome: sidebar (LEARNING / SYNC & REVIEW) + top bar with status pill + user chip. */
export function AppShell({ page, onNavigate, children }: AppShellProps) {
  const auth = useAuth();
  const sync = useSync();
  const catalog = useCatalog();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const openConflicts = sync.conflicts.filter((conflict) => conflict.status === 'open').length;
  const learning: NavDefinition[] = [
    { page: 'library', label: 'Courses', icon: 'book' },
    {
      page: 'assignment',
      label: 'Assignments',
      icon: 'fileText',
      badge: catalog.assignments.length,
    },
    { page: 'doc', label: 'Shared document', icon: 'fileText' },
  ];
  const syncReview: NavDefinition[] = [
    { page: 'sync', label: 'Sync Center', icon: 'refresh', badge: sync.pending, badgeTone: 'amber' },
    { page: 'review', label: 'Review Inbox', icon: 'inbox', badge: openConflicts, badgeTone: 'red' },
  ];

  const course = catalog.course;
  const storageLabel = catalog.storageKb > 0 ? `${catalog.storageKb} KB cached on this device` : 'Not cached yet';
  const deviceId = auth.deviceId ? shortId(auth.deviceId, 10) : 'dev_…';

  async function handleSignOut() {
    await signOut();
    onNavigate('login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="EduSync navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="book" size={18} />
          </span>
          <span className="brand-text">
            <span className="brand-name">EduSync</span>
            <span className="brand-sub">Offline-first learning</span>
          </span>
        </div>

        <nav className="nav-groups" aria-label="Primary">
          <div className="nav-group-label">Learning</div>
          {learning.map((item) => (
            <NavItem key={item.page} item={item} active={page === item.page} onClick={() => onNavigate(item.page)} />
          ))}
          <div className="nav-group-label">Sync &amp; review</div>
          {syncReview.map((item) => (
            <NavItem key={item.page} item={item} active={page === item.page} onClick={() => onNavigate(item.page)} />
          ))}
        </nav>

        <div className="sidebar-foot">
          {course ? (
            <div className="side-course">
              <div className="side-course-title">
                <span className="mono tiny">{course.code}</span>
                <span className="side-course-name">{course.title}</span>
              </div>
              <div className="side-course-meta small">
                Section A · {course.instructorName ?? 'Instructor'}
              </div>
              <div className="side-course-row">
                <span className="pill teal sm">
                  <span className="dot" aria-hidden="true" />
                  {catalog.lessons.length} lessons cached
                </span>
              </div>
              <div className="side-course-storage tiny muted">{storageLabel}</div>
            </div>
          ) : (
            <div className="side-course empty">
              <div className="side-course-title">
                <span className="side-course-name">Course not cached</span>
              </div>
              <div className="side-course-storage tiny muted">
                Connect to the server to prefetch BIOL 201 for offline use.
              </div>
            </div>
          )}

          {auth.user ? (
            <div className="side-user">
              <span className="avatar" aria-hidden="true">
                {auth.user.initials}
              </span>
              <span className="side-user-text">
                <span className="side-user-name">{auth.user.name}</span>
                <span className="side-user-role">
                  {auth.user.role === 'instructor' ? 'Instructor' : 'Student'} · {deviceId}
                </span>
              </span>
              <button type="button" className="icon-button" onClick={() => void handleSignOut()} title="Sign out">
                <Icon name="logout" size={15} />
                <span className="sr-only">Sign out</span>
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-crumb">
            <span className="mono topbar-course">{course ? `${course.code} · ${course.title}` : 'EduSync'}</span>
            <Icon name="chevronRight" size={12} className="topbar-sep" />
            <span className="topbar-page">{PAGE_TITLES[page]}</span>
          </div>
          <div className="topbar-right">
            <span className="device-chip mono" title={`This device: ${auth.deviceId}`}>
              <span className={`device-dot${sync.simulateOffline ? ' offline' : ''}`} aria-hidden="true" />
              {deviceId}
            </span>
            <StatusPill sync={sync} onClick={() => onNavigate('sync')} />
            <span className="user-chip" title={auth.user?.email}>
              <span className="avatar sm" aria-hidden="true">
                {auth.user?.initials ?? '··'}
              </span>
              <span className="user-chip-name">{auth.user?.name ?? 'Not signed in'}</span>
            </span>
            <span className="sr-only" aria-live="polite">
              {openConflicts === 1
                ? '1 conflict needs review'
                : openConflicts > 1
                  ? `${openConflicts} conflicts need review`
                  : ''}
              {sync.pending === 1
                ? '1 operation queued'
                : sync.pending > 1
                  ? `${sync.pending} operations queued`
                  : ''}
            </span>
          </div>
          <span className="sr-only" data-now={now} />
        </header>

        <main className="page-scroll" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

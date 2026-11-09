import { useCallback, useEffect, useState } from 'react';
import type { Flags, Page } from './flags';
import { readFlags, writePageParam } from './flags';
import { useAuth } from './state/useEngine';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/Login';
import { LibraryPage } from './pages/Library';
import { AssignmentPage } from './pages/Assignment';
import { SyncCenterPage } from './pages/SyncCenter';
import { ReviewInboxPage } from './pages/ReviewInbox';
import { DocumentPage } from './pages/Document';

function renderPage(page: Page, navigate: (next: Page) => void) {
  switch (page) {
    case 'assignment':
      return <AssignmentPage navigate={navigate} />;
    case 'doc':
      return <DocumentPage navigate={navigate} />;
    case 'sync':
      return <SyncCenterPage navigate={navigate} />;
    case 'review':
      return <ReviewInboxPage navigate={navigate} />;
    case 'library':
    case 'login':
    default:
      return <LibraryPage navigate={navigate} />;
  }
}

export default function App({ flags }: { flags: Flags }) {
  const auth = useAuth();
  const [page, setPage] = useState<Page>(() => {
    if (flags.page && flags.page !== 'login') return flags.page;
    return 'library';
  });

  const navigate = useCallback((next: Page) => {
    setPage(next);
    writePageParam(next);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const current = readFlags().page;
      if (current && current !== 'login') setPage(current);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // The logged-in app has no login page: fall back to the library.
  const effectivePage: Page = page === 'login' ? 'library' : page;

  if (auth.status !== 'signed-in' || !auth.user) {
    return <LoginPage onSignedIn={(next) => navigate(next)} initialPage={effectivePage} />;
  }

  return (
    <AppShell page={effectivePage} onNavigate={navigate}>
      {renderPage(effectivePage, navigate)}
    </AppShell>
  );
}

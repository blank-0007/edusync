import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

/** Neutral empty state used by the queue, inbox and offline catalog. */
export function EmptyState({ icon = 'inbox', title, children, action, compact }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`}>
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <div className="empty-title">{title}</div>
      {children ? <div className="empty-copy">{children}</div> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

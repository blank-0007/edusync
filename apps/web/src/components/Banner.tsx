import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'amber' | 'red' | 'teal' | 'green' | 'indigo' | 'grey';

interface BannerProps {
  tone?: BannerTone;
  icon?: IconName | null;
  children: ReactNode;
  /** Optional trailing element (e.g. a "Retry now" button). */
  action?: ReactNode;
  className?: string;
}

/** Inline informational banner (offline notice, conflict warning, receipt). */
export function Banner({ tone = 'amber', icon = 'info', children, action, className }: BannerProps) {
  return (
    <div className={`banner ${tone}${className ? ` ${className}` : ''}`} role="status">
      {icon ? <Icon name={icon} size={17} /> : null}
      <div className="banner-body">{children}</div>
      {action ? <div className="banner-action">{action}</div> : null}
    </div>
  );
}

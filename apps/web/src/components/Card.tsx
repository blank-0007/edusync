import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Remove default padding for tables / flush layouts. */
  flush?: boolean;
  tone?: 'default' | 'navy' | 'teal' | 'amber' | 'red';
}

/** Card surface primitive from the design system. */
export function Card({ children, className, flush, tone = 'default' }: CardProps) {
  return (
    <section className={`card${flush ? ' flush' : ''}${tone !== 'default' ? ` card-${tone}` : ''}${className ? ` ${className}` : ''}`}>
      {children}
    </section>
  );
}

interface CardHeadProps {
  title: ReactNode;
  eyebrow?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  icon?: IconName;
}

/** Card header row: title, optional badge and right-aligned actions. */
export function CardHead({ title, eyebrow, badge, actions, icon }: CardHeadProps) {
  return (
    <header className="card-head">
      <div className="card-head-main">
        {icon ? (
          <span className="card-head-icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
        <div className="card-head-text">
          {eyebrow ? <div className="eyebrow card-eyebrow">{eyebrow}</div> : null}
          <h2 className="h3">{title}</h2>
        </div>
        {badge}
      </div>
      {actions ? <div className="card-head-actions">{actions}</div> : null}
    </header>
  );
}

interface MetaRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'amber' | 'red' | 'green' | 'teal';
  mono?: boolean;
}

/** Label/value row used in the right-hand rail cards. */
export function MetaRow({ label, value, tone = 'default', mono }: MetaRowProps) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className={`meta-value${tone !== 'default' ? ` ${tone}` : ''}${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  );
}

interface SectionHeadProps {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
}

export function SectionHead({ title, count, actions }: SectionHeadProps) {
  return (
    <div className="section-head">
      <div className="section-title">
        <h2 className="h3">{title}</h2>
        {count !== undefined && count !== null ? <span className="pill grey sm">{count}</span> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

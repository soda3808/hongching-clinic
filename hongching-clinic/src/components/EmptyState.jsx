import { memo } from 'react';

const EmptyState = memo(function EmptyState({ icon, title, description, action, actionLabel, compact }) {
  return (
    <div className="empty-state" style={compact ? { padding: '24px 16px' } : undefined}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      {title && <div className="empty-state-title">{title}</div>}
      {description && <div className="empty-state-desc">{description}</div>}
      {action && actionLabel && (
        <button className="btn btn-teal btn-sm" onClick={action}>{actionLabel}</button>
      )}
    </div>
  );
});

export default EmptyState;

export const SkeletonLoader = memo(function SkeletonLoader({ rows = 5, type = 'table' }) {
  if (type === 'stats') {
    return (
      <div className="stats-grid">
        {[1,2,3,4].map(i => (
          <div key={i} className="skeleton skeleton-stat" />
        ))}
      </div>
    );
  }
  if (type === 'cards') {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-text" />
          </div>
        ))}
      </div>
    );
  }
  // Default: table skeleton
  return (
    <div className="table-wrap">
      <div style={{ padding: 12 }}>
        <div className="skeleton skeleton-title" style={{ marginBottom: 16 }} />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton skeleton-row" style={{ marginBottom: 4 }} />
        ))}
      </div>
    </div>
  );
});

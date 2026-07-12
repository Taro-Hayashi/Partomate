import type { CSSProperties } from 'react';
import { LayoutGrid, List } from 'lucide-react';

export type ViewMode = 'card' | 'list';

interface ViewModeToggleProps {
  viewMode: ViewMode;
  onChange: (viewMode: ViewMode) => void;
  cardLabel: string;
  listLabel: string;
}

const containerStyle: CSSProperties = {
  display: 'flex',
  background: 'var(--bg-tertiary)',
  borderRadius: '8px',
  padding: '2px',
  border: '1px solid var(--border-color)',
  height: '36px',
  boxSizing: 'border-box',
  alignItems: 'center',
};

const getButtonStyle = (active: boolean): CSSProperties => ({
  width: '32px',
  height: '100%',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  border: 'none',
  background: active ? 'var(--accent-primary)' : 'transparent',
  boxShadow: active ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none',
  color: active ? '#fff' : 'var(--text-secondary)',
});

export function ViewModeToggle({ viewMode, onChange, cardLabel, listLabel }: ViewModeToggleProps) {
  return (
    <div style={containerStyle}>
      <button
        type="button"
        className={`btn ${viewMode === 'card' ? 'btn-primary' : 'btn-secondary'}`}
        style={getButtonStyle(viewMode === 'card')}
        onClick={() => onChange('card')}
        title={cardLabel}
        aria-label={cardLabel}
      >
        <LayoutGrid size={16} />
      </button>
      <button
        type="button"
        className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
        style={getButtonStyle(viewMode === 'list')}
        onClick={() => onChange('list')}
        title={listLabel}
        aria-label={listLabel}
      >
        <List size={16} />
      </button>
    </div>
  );
}

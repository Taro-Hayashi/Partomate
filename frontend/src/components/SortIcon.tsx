import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { SortOrder } from '../hooks/useSortableState';

interface SortIconProps {
  field: string;
  sortBy: string;
  sortOrder: SortOrder;
}

const iconStyle = {
  marginLeft: '4px',
  cursor: 'pointer',
  verticalAlign: 'middle',
};

export function SortIcon({ field, sortBy, sortOrder }: SortIconProps) {
  if (sortBy !== field) {
    return <ChevronsUpDown size={14} style={{ ...iconStyle, opacity: 0.4 }} />;
  }

  const activeStyle = { ...iconStyle, color: 'var(--accent-primary)' };
  return sortOrder === 'asc'
    ? <ChevronUp size={14} style={activeStyle} />
    : <ChevronDown size={14} style={activeStyle} />;
}

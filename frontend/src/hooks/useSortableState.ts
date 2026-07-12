import { usePersistentState } from './usePersistentState';

export type SortOrder = 'asc' | 'desc';

export const isSortOrder = (value: string): value is SortOrder => value === 'asc' || value === 'desc';

export function useSortableState(sortByKey: string, sortOrderKey: string) {
  const [sortBy, setSortBy] = usePersistentState(sortByKey, '');
  const [sortOrder, setSortOrder] = usePersistentState<SortOrder>(sortOrderKey, 'asc', isSortOrder);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortBy('');
        setSortOrder('asc');
      }
      return;
    }

    setSortBy(field);
    setSortOrder('asc');
  };

  const applySortValue = (value: string) => {
    if (!value) {
      setSortBy('');
      return;
    }

    const separatorIndex = value.lastIndexOf('_');
    if (separatorIndex < 0) return;

    const field = value.slice(0, separatorIndex);
    const order = value.slice(separatorIndex + 1);
    if (!field || !isSortOrder(order)) return;

    setSortBy(field);
    setSortOrder(order);
  };

  return {
    sortBy,
    sortOrder,
    setSortBy,
    setSortOrder,
    handleSort,
    applySortValue,
  } as const;
}

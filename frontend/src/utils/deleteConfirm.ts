const STORAGE_KEYS = {
  parts: 'partomate_skip_delete_confirm_parts',
  products: 'partomate_skip_delete_confirm_products',
} as const;

export type DeleteConfirmKind = keyof typeof STORAGE_KEYS;

export const isDeleteConfirmSkipped = (kind: DeleteConfirmKind): boolean => {
  return localStorage.getItem(STORAGE_KEYS[kind]) === '1';
};

export const setDeleteConfirmSkipped = (kind: DeleteConfirmKind): void => {
  localStorage.setItem(STORAGE_KEYS[kind], '1');
};

export const clearDeleteConfirmSkips = (): void => {
  localStorage.removeItem(STORAGE_KEYS.parts);
  localStorage.removeItem(STORAGE_KEYS.products);
};

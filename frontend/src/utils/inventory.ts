export type CurrencyCode = 'JPY' | 'USD' | 'EUR' | string;

export interface PricedItem {
  purchase_price: number;
  currency: CurrencyCode;
}

export interface PartSortItem extends PricedItem {
  name: string;
  category1: string | null;
  category2: string | null;
  category3: string | null;
  quantity?: number;
  purchase_date?: string | null;
  alert_threshold?: number;
}

export interface ProductSortItem {
  name: string;
  description?: string | null;
  parts?: Array<{
    quantity: number;
    part: PricedItem;
  }>;
}

const FALLBACK_RATE_TO_JPY: Record<string, number> = {
  JPY: 1,
  USD: 155,
  EUR: 165
};

export function getPriceInJpy(item: PricedItem) {
  return item.purchase_price * (FALLBACK_RATE_TO_JPY[item.currency] ?? 1);
}

export function formatUnit(unit: string | undefined, language: string) {
  const unitValue = unit || 'pcs';
  if (language === 'ja' && unitValue === 'pcs') return '個';
  return unitValue;
}

export function compareValues(a: string | number, b: string | number, order: 'asc' | 'desc') {
  if (a < b) return order === 'asc' ? -1 : 1;
  if (a > b) return order === 'asc' ? 1 : -1;
  return 0;
}

function getPartSortValue(part: PartSortItem, sortBy: string): string | number {
  switch (sortBy) {
    case 'name':
      return part.name;
    case 'category':
      return `${part.category1 || ''} ＞ ${part.category2 || ''} ＞ ${part.category3 || ''}`;
    case 'category1':
      return part.category1 || '';
    case 'category2':
      return part.category2 || '';
    case 'category3':
      return part.category3 || '';
    case 'quantity':
      return part.quantity ?? 0;
    case 'price':
      return getPriceInJpy(part);
    case 'date':
      return part.purchase_date || '';
    case 'threshold':
      return part.alert_threshold ?? 0;
    case 'asset':
      return getPriceInJpy(part) * (part.quantity ?? 0);
    default:
      return '';
  }
}

export function sortPartsByInventorySort<T extends PartSortItem>(
  parts: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc'
) {
  if (!sortBy) return [...parts];

  return [...parts].sort((a, b) => {
    const valA = getPartSortValue(a, sortBy);
    const valB = getPartSortValue(b, sortBy);
    return compareValues(valA, valB, sortOrder);
  });
}

export function calculateProductCost(product: ProductSortItem) {
  return (product.parts || []).reduce((total, item) => {
    return total + (getPriceInJpy(item.part) * item.quantity);
  }, 0);
}

function getProductSortValue(product: ProductSortItem, sortBy: string): string | number {
  switch (sortBy) {
    case 'name':
      return product.name;
    case 'description':
      return product.description || '';
    case 'cost':
      return calculateProductCost(product);
    default:
      return '';
  }
}

export function sortProductsByProductSort<T extends ProductSortItem>(
  products: T[],
  sortBy: string,
  sortOrder: 'asc' | 'desc'
) {
  if (!sortBy) return [...products];

  return [...products].sort((a, b) => {
    const valA = getProductSortValue(a, sortBy);
    const valB = getProductSortValue(b, sortBy);
    return compareValues(valA, valB, sortOrder);
  });
}

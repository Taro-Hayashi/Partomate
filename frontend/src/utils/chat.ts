import { type Product } from '../types/inventory';

export const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    let year = match[1];
    let month = match[2];
    let day = match[3];
    if (year.length === 2) {
      year = '20' + year; // Treat 2-digit year as 20YY
    }
    month = month.padStart(2, '0');
    day = day.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return trimmed;
};

export const getDateParts = (dateStr?: string | null) => {
  const normalized = normalizeDate(dateStr || '');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return {
    year: match?.[1] || '',
    month: match?.[2] || '',
    day: match?.[3] || '',
  };
};

export const formatConsumedQuantity = (quantity: number) => {
  return Number.isInteger(quantity)
    ? quantity.toLocaleString()
    : quantity.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

export const getProductPreviewParts = (product: Product) => (
  (product.parts || []).map((productPart) => ({
    part_id: productPart.part_id,
    part_name: productPart.part?.name || '',
    quantity: productPart.quantity || 0,
    unit: productPart.part?.unit || 'pcs',
  }))
);

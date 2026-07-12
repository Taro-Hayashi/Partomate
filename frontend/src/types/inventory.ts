// Shared API response types for parts/products, mirrored from backend/app/schemas.py
// (PartResponse, ProductPartResponse, ProductResponse).

export interface Part {
  id: number;
  name: string;
  category1: string | null;
  category2: string | null;
  category3: string | null;
  quantity: number;
  unit: string;
  purchase_price: number;
  currency: string;
  purchase_date: string | null;
  price_input_type?: string;
  purchase_quantity?: number | null;
  original_unit_price?: number | null;
  original_total_price?: number | null;
  original_currency?: string | null;
  exchange_rate?: number | null;
  alert_threshold: number;
}

export interface ProductPart {
  part_id: number;
  quantity: number;
  part: Part;
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  parts: ProductPart[];
}

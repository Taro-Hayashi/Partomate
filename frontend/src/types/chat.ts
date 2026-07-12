// Preview items carry both LLM-analyzed fields (category1, quantity, purchase_price, ...)
// and transient UI-only fields (isCat1Manual, tempTotalCost, ...) added while the user edits
// the confirmation card. The exact shape varies by flow, so this stays intentionally loose.
export interface PartPreviewItem {
  part_id?: number | null;
  category1?: string | null;
  category2?: string | null;
  category3?: string | null;
  quantity?: number;
  unit?: string;
  purchase_price?: number;
  currency?: string | null;
  purchase_date?: string | null;
  alert_threshold?: number;
  [key: string]: unknown;
}

export interface ProductConsumeItem {
  product_id?: number;
  product_name?: string;
  product_count?: number;
  parts?: unknown[];
  [key: string]: unknown;
}

export interface RecipePartItem {
  part_id?: number | null;
  part_name?: string;
  quantity?: number;
  unit?: string;
  [key: string]: unknown;
}

// `previewData` covers several flows (parts add/consume/edit, product assembly,
// product recipe create/update, settings changes). Its exact shape is driven by the
// backend LLM analysis result (see backend/app/routers/chat.py) and progressively
// mutated by the UI while the user edits the confirmation card, so this type stays a
// loose "known fields + index signature" shape rather than a strict discriminated
// union — tightening it further would require rewriting the render logic in
// PageChatDrawer.tsx / ChatPage.tsx.
export interface PreviewData {
  type?: string;
  action?: string;
  product_id?: number;
  product_name?: string;
  description?: string | null;
  items?: PartPreviewItem[] | ProductConsumeItem[];
  parts?: RecipePartItem[];
  updates?: Record<string, unknown>;
  message?: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  previewData?: PreviewData | null;
  isExecuted?: boolean;
  hideInInputHistory?: boolean;
}

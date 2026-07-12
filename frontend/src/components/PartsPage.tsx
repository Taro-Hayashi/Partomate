import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Filter, Coins, X } from 'lucide-react';
import { getTranslation } from '../utils/i18n';
import { formatUnit, getPriceInJpy, sortPartsByInventorySort } from '../utils/inventory';
import { usePersistentState } from '../hooks/usePersistentState';
import { useSortableState } from '../hooks/useSortableState';
import { PageChatDrawer, type PageChatDrawerRef } from './PageChatDrawer';
import { type Message } from '../types/chat';
import { type Part } from '../types/inventory';
import { SortIcon } from './SortIcon';
import { ViewModeToggle, type ViewMode } from './ViewModeToggle';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { isDeleteConfirmSkipped, setDeleteConfirmSkipped } from '../utils/deleteConfirm';

type BulkRegisterStatus = 'idle' | 'ready' | 'saved';
type BulkRegisterLevel = 1 | 2 | 3;
type PartsViewMode = ViewMode;

interface BulkRegisterRow {
  id: string;
  level: BulkRegisterLevel;
  tree1Id: string;
  tree2Id: string;
  category1: string;
  category2: string;
  category3: string;
  isCat1Manual: boolean;
  isCat2Manual: boolean;
  isCat3Manual: boolean;
  quantity: number;
  unit: string;
  status: BulkRegisterStatus;
}

interface PartsPageProps {
  token: string;
  apiBase: string;
  onLogout: () => void;
  language: string;
  sendKey: string;
  drawerMessages: Message[];
  setDrawerMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const getDefaultPartsViewMode = (): PartsViewMode => {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches) {
    return 'card';
  }
  return 'list';
};

const formatApiErrorDetail = (detail: unknown, language: string): string => {
  if (!detail) return '';
  if (typeof detail === 'string') {
    const deleteReferencePrefix = 'Cannot delete part because it is used in the following product recipe(s):';
    if (detail.startsWith(deleteReferencePrefix)) {
      const productNames = detail.slice(deleteReferencePrefix.length).trim();
      return language === 'en'
        ? detail
        : getTranslation(language, 'parts_delete_reference_error', { names: productNames });
    }
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => formatApiErrorDetail(item, language)).filter(Boolean).join('\n');
  }
  if (typeof detail === 'object') {
    const message = 'msg' in detail && typeof detail.msg === 'string' ? detail.msg : JSON.stringify(detail);
    const location = 'loc' in detail && Array.isArray(detail.loc) ? detail.loc.join('.') : '';
    return location ? `${location}: ${message}` : message;
  }
  return String(detail);
};

const buildApiErrorMessage = async (response: Response, fallbackMessage: string, language: string): Promise<string> => {
  let detailMessage: string;
  try {
    const body = await response.json();
    detailMessage = formatApiErrorDetail(body?.detail ?? body, language);
  } catch {
    detailMessage = response.statusText;
  }

  if (!detailMessage) {
    detailMessage = `HTTP ${response.status}`;
  }

  return `${fallbackMessage}\n\n${detailMessage}`;
};

export const PartsPage: React.FC<PartsPageProps> = ({
  token,
  apiBase,
  onLogout,
  language,
  sendKey,
  drawerMessages,
  setDrawerMessages
}) => {
  const t = (key: string, params?: Record<string, string | number>) => getTranslation(language, key, params);
  const [parts, setParts] = useState<Part[]>([]);
  const chatDrawerRef = useRef<PageChatDrawerRef>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = usePersistentState<PartsViewMode>(
    'partomate_parts_view_mode',
    getDefaultPartsViewMode(),
    (value): value is PartsViewMode => value === 'card' || value === 'list'
  );

  const {
    sortBy,
    sortOrder,
    handleSort,
    applySortValue,
  } = useSortableState(
    'partomate_parts_sort_by',
    'partomate_parts_sort_order',
  );

  // Filter states
  const [selectedCat1, setSelectedCat1] = useState('');
  const [selectedCat2, setSelectedCat2] = useState('');
  const [selectedCat3, setSelectedCat3] = useState('');

  const [showAsset, setShowAsset] = useState(false);
  const [showBulkRegister, setShowBulkRegister] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRegisterRow[]>([]);
  const [bulkNotice, setBulkNotice] = useState('');
  const [bulkNoticeKind, setBulkNoticeKind] = useState<'created' | 'added'>('created');

  const makeBulkId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const createBulkRow = (level: BulkRegisterLevel = 1, inherited?: Partial<BulkRegisterRow>): BulkRegisterRow => ({
    id: makeBulkId(),
    level,
    tree1Id: inherited?.tree1Id || makeBulkId(),
    tree2Id: inherited?.tree2Id || makeBulkId(),
    category1: inherited?.category1 || '',
    category2: inherited?.category2 || '',
    category3: inherited?.category3 || '',
    isCat1Manual: false,
    isCat2Manual: false,
    isCat3Manual: false,
    quantity: 1,
    unit: 'pcs',
    status: 'idle',
  });

  const getPartName = (category1: string, category2?: string, category3?: string) => (
    [category2, category3, category1].map((v) => v?.trim()).filter(Boolean).join(' ')
  );

  const canRegisterBulkRow = (row: BulkRegisterRow) => {
    if (!row.category1.trim()) return false;
    if (row.level === 1) return true;
    if (row.level === 2) return !!row.category2.trim();
    return !!row.category2.trim() && !!row.category3.trim();
  };

  const getBulkCat2Options = (category1: string) => (
    Array.from(new Set(
      parts
        .filter((p) => p.category1 === category1)
        .map((p) => p.category2)
        .filter(Boolean)
    )) as string[]
  );

  const getBulkCat3Options = (category1: string, category2: string) => (
    Array.from(new Set(
      parts
        .filter((p) => p.category1 === category1 && p.category2 === category2)
        .map((p) => p.category3)
        .filter(Boolean)
    )) as string[]
  );

  const fetchParts = async () => {
    try {
      const response = await fetch(`${apiBase}/api/parts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error(t('parts_fetch_error'));
      const data = await response.json();
      setParts(data);
    } catch (err) {
      setError((err instanceof Error && err.message) || t('parts_data_fetch_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParts();
  }, [token]);

  // Adjust quantity
  // partId ごとにリクエストの世代を管理し、古いレスポンスで新しい状態を上書きしないようにする(stale response guard)。
  const quantityRequestSeqRef = useRef<Record<number, number>>({});

  const putQuantity = async (partId: number, newQty: number) => {
    const seq = (quantityRequestSeqRef.current[partId] || 0) + 1;
    quantityRequestSeqRef.current[partId] = seq;
    try {
      const response = await fetch(`${apiBase}/api/parts/${partId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ quantity: newQty }),
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error(t('parts_update_qty_error'));
      const updatedPart = await response.json();
      // 自分より新しいリクエストが既に発行されている場合は、そちらの結果を優先して古い結果は反映しない。
      if (quantityRequestSeqRef.current[partId] !== seq) return;
      setParts((prev) => prev.map((p) => (p.id === partId ? updatedPart : p)));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // 数量欄への直接入力(絶対値指定)
  const handleUpdateQuantity = (partId: number, newQty: number) => {
    if (newQty < 0) return;
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, quantity: newQty } : p)));
    putQuantity(partId, newQty);
  };

  // +/- ボタン(差分指定)。連打時も最新のstateを基準に楽観更新してからAPIへ反映する。
  const handleAdjustQuantity = (partId: number, delta: number) => {
    setParts((prev) => {
      const target = prev.find((p) => p.id === partId);
      if (!target) return prev;
      const newQty = Math.max(0, target.quantity + delta);
      if (newQty === target.quantity) return prev;
      putQuantity(partId, newQty);
      return prev.map((p) => (p.id === partId ? { ...p, quantity: newQty } : p));
    });
  };

  // Delete part
  const handleDeletePart = async (partId: number) => {
    try {
      const response = await fetch(`${apiBase}/api/parts/${partId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) {
        throw new Error(await buildApiErrorMessage(
          response,
          t('parts_delete_error'),
          language,
        ));
      }
      setParts(parts.filter((p) => p.id !== partId));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const requestDeletePart = (partId: number) => {
    if (isDeleteConfirmSkipped('parts')) {
      handleDeletePart(partId);
      return;
    }
    setPendingDeleteId(partId);
  };

  const confirmDeletePart = (dontShowAgain: boolean) => {
    if (pendingDeleteId === null) return;
    if (dontShowAgain) {
      setDeleteConfirmSkipped('parts');
    }
    const partId = pendingDeleteId;
    setPendingDeleteId(null);
    handleDeletePart(partId);
  };

  const openAddModal = () => {
    chatDrawerRef.current?.openWithNewPart();
  };

  const openBulkRegisterModal = () => {
    setBulkRows((rows) => rows.length > 0 ? rows : [createBulkRow()]);
    setBulkNotice('');
    setShowBulkRegister(true);
  };

  const clearBulkRegisterRows = () => {
    setBulkRows([createBulkRow()]);
    setBulkNotice('');
  };

  const openEditModal = (part: Part) => {
    chatDrawerRef.current?.openWithEditPart(part);
  };

  const applyBulkRowUpdates = (row: BulkRegisterRow, updates: Partial<BulkRegisterRow>) => {
    const next: BulkRegisterRow = { ...row, ...updates, status: row.status === 'saved' ? 'ready' : row.status };

    if ('isCat1Manual' in updates) {
      if (updates.isCat1Manual === true) {
        next.category1 = '';
        next.category2 = '';
        next.category3 = '';
        next.isCat2Manual = true;
        next.isCat3Manual = true;
      } else if (updates.isCat1Manual === false) {
        next.isCat1Manual = false;
        next.category2 = '';
        next.category3 = '';
        next.isCat2Manual = false;
        next.isCat3Manual = false;
      }
    }

    if ('category1' in updates && !next.isCat1Manual) {
      next.category2 = '';
      next.category3 = '';
      next.isCat2Manual = false;
      next.isCat3Manual = false;
    }

    if ('isCat2Manual' in updates) {
      if (updates.isCat2Manual === true) {
        next.category2 = '';
        next.category3 = '';
        next.isCat3Manual = true;
      } else if (updates.isCat2Manual === false) {
        next.isCat2Manual = false;
        next.category3 = '';
        next.isCat3Manual = false;
      }
    }

    if ('category2' in updates && !next.isCat2Manual) {
      next.category3 = '';
      next.isCat3Manual = false;
    }

    if ('isCat3Manual' in updates) {
      if (updates.isCat3Manual === true) {
        next.category3 = '';
      } else if (updates.isCat3Manual === false) {
        next.isCat3Manual = false;
      }
    }

    next.status = canRegisterBulkRow(next) ? 'ready' : 'idle';
    return next;
  };

  const updateBulkRow = (rowId: string, updates: Partial<BulkRegisterRow>) => {
    setBulkRows((rows) => {
      const target = rows.find((row) => row.id === rowId);
      if (!target) return rows;
      const updatedTarget = applyBulkRowUpdates(target, updates);
      const changedCat1 = 'category1' in updates || 'isCat1Manual' in updates;
      const changedCat2 = 'category2' in updates || 'isCat2Manual' in updates;

      return rows.map((row) => {
        if (row.id === rowId) return updatedTarget;

        if (changedCat1 && row.tree1Id === target.tree1Id) {
          const next: BulkRegisterRow = {
            ...row,
            category1: updatedTarget.category1,
            category2: '',
            category3: '',
            isCat2Manual: updatedTarget.isCat1Manual,
            isCat3Manual: updatedTarget.isCat1Manual,
            status: 'idle',
          };
          return next;
        }

        if (changedCat2 && row.tree2Id === target.tree2Id) {
          const next: BulkRegisterRow = {
            ...row,
            category2: updatedTarget.category2,
            category3: '',
            isCat3Manual: updatedTarget.isCat2Manual,
            status: 'idle',
          };
          return next;
        }

        return row;
      });
    });
  };

  const insertBulkRowAfter = (sourceId: string, level: BulkRegisterLevel) => {
    setBulkRows((rows) => {
      const sourceIndex = rows.findIndex((row) => row.id === sourceId);
      if (sourceIndex < 0) return rows;
      const source = rows[sourceIndex];
      const inherited = {
        tree1Id: level >= 2 ? source.tree1Id : undefined,
        tree2Id: level >= 3 ? source.tree2Id : undefined,
        category1: level >= 2 ? source.category1 : '',
        category2: level >= 3 ? source.category2 : '',
      };
      const newRow = createBulkRow(level, inherited);
      let insertIndex = sourceIndex;
      for (let index = sourceIndex + 1; index < rows.length; index += 1) {
        const candidate = rows[index];
        if (level === 1) {
          insertIndex = index;
        } else if (level === 2) {
          if (candidate.tree1Id !== source.tree1Id) break;
          insertIndex = index;
        } else {
          if (candidate.tree2Id !== source.tree2Id) break;
          insertIndex = index;
        }
      }
      return [...rows.slice(0, insertIndex + 1), newRow, ...rows.slice(insertIndex + 1)];
    });
  };

  const removeBulkRow = (rowId: string) => {
    setBulkRows((rows) => {
      const targetIndex = rows.findIndex((row) => row.id === rowId);
      if (targetIndex < 0) return rows;

      const target = rows[targetIndex];
      const nextRows = rows.filter((row) => row.id !== rowId);
      if (nextRows.length === 0) return [createBulkRow()];

      const promoteIndex = nextRows.findIndex((row) => {
        if (target.level === 1) return row.tree1Id === target.tree1Id;
        if (target.level === 2) return row.tree2Id === target.tree2Id;
        return false;
      });

      if (promoteIndex < 0) return nextRows;

      return nextRows.map((row, index) => {
        if (index !== promoteIndex) return row;

        if (target.level === 1) {
          return {
            ...row,
            level: 1,
            isCat1Manual: !!row.category1 && !cat1List.includes(row.category1),
          };
        }

        return {
          ...row,
          level: 2,
          isCat2Manual: !!row.category2 && !getBulkCat2Options(row.category1).includes(row.category2),
        };
      });
    });
  };

  const saveBulkRegisterRow = async (row: BulkRegisterRow, sourceParts: Part[]) => {
    const category1 = row.category1.trim();
    const category2 = row.category2.trim();
    const category3 = row.category3.trim();
    if (!canRegisterBulkRow(row)) return null;

    const existingPart = sourceParts.find((part) => (
      (part.category1 || '') === category1 &&
      (part.category2 || '') === category2 &&
      (part.category3 || '') === category3
    ));
    const partName = getPartName(category1, category2, category3);

    let savedPart: Part;
    let notice: string;
    let kind: 'created' | 'added';
    if (existingPart) {
      const response = await fetch(`${apiBase}/api/parts/${existingPart.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          quantity: existingPart.quantity + Number(row.quantity || 0),
          unit: row.unit,
          currency: existingPart.currency || 'JPY',
        }),
      });
      if (response.status === 401) {
        onLogout();
        return null;
      }
      if (!response.ok) throw new Error(t('parts_bulk_add_qty_error'));
      savedPart = await response.json();
      notice = t('parts_bulk_added_notice', { name: partName });
      kind = 'added';
    } else {
      const response = await fetch(`${apiBase}/api/parts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: partName,
          category1,
          category2: category2 || null,
          category3: category3 || null,
          quantity: Number(row.quantity || 0),
          unit: row.unit,
          purchase_price: 0,
          currency: 'JPY',
          purchase_date: null,
          alert_threshold: 0,
        }),
      });
      if (response.status === 401) {
        onLogout();
        return null;
      }
      if (!response.ok) throw new Error(t('parts_bulk_register_error'));
      savedPart = await response.json();
      notice = t('parts_bulk_registered_notice', { name: partName });
      kind = 'created';
    }

    const nextParts = existingPart
      ? sourceParts.map((part) => part.id === savedPart.id ? savedPart : part)
      : [...sourceParts, savedPart];

    return { savedPart, nextParts, notice, kind };
  };

  const handleBulkRegisterRow = async (row: BulkRegisterRow) => {
    try {
      const result = await saveBulkRegisterRow(row, parts);
      if (!result) return;

      setParts(result.nextParts);
      setBulkRows((rows) => rows.map((item) => item.id === row.id ? { ...item, status: 'saved' } : item));
      setBulkNotice(result.notice);
      setBulkNoticeKind(result.kind);
      setTimeout(() => setBulkNotice(''), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBulkRegisterAll = async () => {
    const targetRows = bulkRows.filter((row) => row.status !== 'saved' && canRegisterBulkRow(row));
    if (!targetRows.length) return;

    try {
      let nextParts = parts;
      const savedRowIds = new Set<string>();
      let addedCount = 0;
      let createdCount = 0;

      for (const row of targetRows) {
        const result = await saveBulkRegisterRow(row, nextParts);
        if (!result) return;
        nextParts = result.nextParts;
        savedRowIds.add(row.id);
        if (result.kind === 'added') {
          addedCount += 1;
        } else {
          createdCount += 1;
        }
      }

      setParts(nextParts);
      setBulkRows((rows) => rows.map((row) => savedRowIds.has(row.id) ? { ...row, status: 'saved' } : row));
      setBulkNoticeKind(addedCount > 0 ? 'added' : 'created');
      setBulkNotice(t('parts_bulk_register_all_notice', { count: savedRowIds.size, added: addedCount, created: createdCount }));
      setTimeout(() => setBulkNotice(''), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Extract unique categories for filter select dropdowns
  const cat1List = Array.from(new Set(parts.map((p) => p.category1).filter(Boolean))) as string[];
  const cat2List = Array.from(
    new Set(parts.filter((p) => !selectedCat1 || p.category1 === selectedCat1).map((p) => p.category2).filter(Boolean))
  ) as string[];
  const cat3List = Array.from(
    new Set(
      parts
        .filter((p) => (!selectedCat1 || p.category1 === selectedCat1) && (!selectedCat2 || p.category2 === selectedCat2))
        .map((p) => p.category3)
        .filter(Boolean)
    )
  ) as string[];

  // Filtered Parts list
  const filteredParts = parts.filter((p) => {
    if (selectedCat1 && p.category1 !== selectedCat1) return false;
    if (selectedCat2 && p.category2 !== selectedCat2) return false;
    if (selectedCat3 && p.category3 !== selectedCat3) return false;
    return true;
  });

  // Sorted Parts list
  const sortedParts = sortPartsByInventorySort(filteredParts, sortBy, sortOrder);
  const sortedAvailableParts = sortPartsByInventorySort(parts, sortBy, sortOrder);

  // Calculate total asset value in JPY
  const calculateTotalAsset = () => {
    return filteredParts.reduce((total, part) => {
      return total + getPriceInJpy(part) * part.quantity;
    }, 0);
  };
  const bulkRegisterableRowCount = bulkRows.filter((row) => row.status !== 'saved' && canRegisterBulkRow(row)).length;

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>{getTranslation(language, 'loading')}</div>;
  if (error) return <div style={{ padding: '2rem', color: 'var(--danger)' }}>{error}</div>;

  return (
    <div className="main-content">
      <div className="parts-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2>{getTranslation(language, 'parts_title')}</h2>
          <select
            className="input-control"
            style={{ width: 'auto', minWidth: '150px', height: '36px', padding: '0 0.5rem', fontSize: '0.9rem' }}
            value={sortBy ? `${sortBy}_${sortOrder}` : ''}
            onChange={(e) => applySortValue(e.target.value)}
          >
            <option value="">{t('parts_sort_none')}</option>
            <option value="name_asc">{t('parts_sort_name_asc')}</option>
            <option value="name_desc">{t('parts_sort_name_desc')}</option>
            <option value="category1_asc">{t('parts_sort_category1_asc')}</option>
            <option value="category1_desc">{t('parts_sort_category1_desc')}</option>
            <option value="category2_asc">{t('parts_sort_category2_asc')}</option>
            <option value="category2_desc">{t('parts_sort_category2_desc')}</option>
            <option value="category3_asc">{t('parts_sort_category3_asc')}</option>
            <option value="category3_desc">{t('parts_sort_category3_desc')}</option>
            <option value="quantity_asc">{t('parts_sort_quantity_asc')}</option>
            <option value="quantity_desc">{t('parts_sort_quantity_desc')}</option>
            <option value="price_asc">{t('parts_sort_price_asc')}</option>
            <option value="price_desc">{t('parts_sort_price_desc')}</option>
            <option value="date_asc">{t('parts_sort_date_asc')}</option>
            <option value="date_desc">{t('parts_sort_date_desc')}</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`btn ${showAsset ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowAsset(!showAsset)}
            style={{
              height: '36px',
              width: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              padding: 0,
              background: showAsset ? 'var(--accent-primary)' : 'transparent',
              boxShadow: showAsset ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none',
              color: showAsset ? '#fff' : 'var(--text-secondary)'
            }}
            title={showAsset ? t('parts_asset_hide') : getTranslation(language, 'parts_asset_eval')}
            aria-label={showAsset ? t('parts_asset_hide') : getTranslation(language, 'parts_asset_eval')}
          >
            <Coins size={18} />
          </button>
          <ViewModeToggle
            viewMode={viewMode}
            onChange={setViewMode}
            cardLabel={getTranslation(language, 'parts_view_card')}
            listLabel={getTranslation(language, 'parts_view_list')}
          />
          <button className="btn btn-primary" onClick={openBulkRegisterModal} style={{ height: '36px', display: 'flex', alignItems: 'center', boxSizing: 'border-box', padding: '0 1rem' }}>
            <span>{t('parts_batch_register')}</span>
          </button>
          <button className="btn btn-primary" onClick={openAddModal} style={{ height: '36px', display: 'flex', alignItems: 'center', boxSizing: 'border-box', padding: '0 1rem' }}>
            <Plus size={16} />
            <span>{getTranslation(language, 'parts_add_part')}</span>
          </button>
        </div>
      </div>

      {bulkNotice && (
        <div className={`bulk-register-toast ${bulkNoticeKind === 'added' ? 'added' : 'created'}`}>
          {bulkNotice}
        </div>
      )}

      {showBulkRegister && (
        <div className="bulk-register-backdrop" onClick={() => setShowBulkRegister(false)}>
          <div className="bulk-register-modal glass-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="bulk-register-close-btn"
              onClick={() => setShowBulkRegister(false)}
              title={t('parts_close')}
              aria-label={t('parts_close')}
            >
              <X size={14} />
            </button>
            <div className="bulk-register-header">
              <div className="bulk-register-title-row">
                <h3>{t('parts_batch_register_title')}</h3>
                <span className="bulk-register-note">
                  {t('parts_batch_register_note')}
                </span>
              </div>
            </div>

            <div className="bulk-register-table">
              <div className="bulk-register-grid bulk-register-action-row">
                <button
                  className="bulk-row-add-btn bulk-register-clear-btn"
                  onClick={clearBulkRegisterRows}
                >
                  {t('parts_clear')}
                </button>
                <button
                  className={`bulk-row-add-btn bulk-register-all-btn ${bulkRegisterableRowCount > 0 ? 'ready' : ''}`}
                  disabled={bulkRegisterableRowCount === 0}
                  onClick={handleBulkRegisterAll}
                >
                  {t('parts_add_all')}
                </button>
              </div>
              {bulkRows.map((row, rowIndex) => {
                const cat1Options = cat1List;
                const cat2Options = row.category1 && !row.isCat1Manual ? getBulkCat2Options(row.category1) : [];
                const cat3Options = row.category1 && row.category2 && !row.isCat2Manual ? getBulkCat3Options(row.category1, row.category2) : [];
                const followingRows = bulkRows.slice(rowIndex + 1);
                const hasFollowingCat1 = followingRows.some((item) => item.level === 1);
                const hasFollowingCat2InCat1 = followingRows.some((item) => item.tree1Id === row.tree1Id && item.level <= 2);
                const hasFollowingRowInCat1 = followingRows.some((item) => item.tree1Id === row.tree1Id);
                const hasFollowingRowInCat2 = followingRows.some((item) => item.tree2Id === row.tree2Id);
                const showCat1Add = !!row.category1 && !hasFollowingCat1 && !hasFollowingRowInCat1;
                const showCat2Add = !!row.category2
                  && !hasFollowingCat2InCat1
                  && !hasFollowingRowInCat2;
                const showCat3Add = !!row.category3 && !hasFollowingRowInCat2;
                const canAdd = canRegisterBulkRow(row);
                const addButtonClass = row.status === 'saved'
                  ? 'bulk-row-add-btn saved'
                  : canAdd
                    ? 'bulk-row-add-btn ready'
                    : 'bulk-row-add-btn';

                return (
                  <div key={row.id} className="bulk-register-row-wrap">
                    <div className={`bulk-register-grid bulk-register-row level-${row.level}`}>
                      <div className="bulk-register-cell">
                        {row.level === 1 ? (
                          row.isCat1Manual ? (
                            <div className="bulk-category-field">
                              <input
                                className="input-control bulk-category-control"
                                value={row.category1}
                                placeholder={t('parts_manual_type')}
                                onChange={(e) => updateBulkRow(row.id, { category1: e.target.value })}
                              />
                              <select
                                className="input-control bulk-category-switch"
                                value=""
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (!value) return;
                                  updateBulkRow(row.id, { category1: value, isCat1Manual: false });
                                }}
                                title={t('parts_select_from_list')}
                              >
                                <option value="">▼</option>
                                {cat1Options.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                            </div>
                          ) : (
                            <select
                              className="input-control"
                              value={row.category1}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '__manual__') {
                                  updateBulkRow(row.id, { isCat1Manual: true });
                                } else {
                                  updateBulkRow(row.id, { category1: value, isCat1Manual: false });
                                }
                              }}
                            >
                              <option value="">{t('parts_type_dash')}</option>
                              <option value="__manual__">{t('parts_manual_input_plus')}</option>
                              {cat1Options.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          )
                        ) : (
                          <div className="bulk-register-inherited" aria-label={row.category1} />
                        )}
                        {showCat1Add && (
                          <button
                            className="bulk-tree-add"
                            onClick={() => insertBulkRowAfter(row.id, 1)}
                            title={t('parts_add_type_row')}
                          >
                            +
                          </button>
                        )}
                      </div>

                      <div className="bulk-register-cell">
                        {row.level <= 2 ? (
                          row.isCat2Manual ? (
                            <div className="bulk-category-field">
                              <input
                                className="input-control bulk-category-control"
                                value={row.category2}
                                placeholder={t('parts_manual_spec')}
                                onChange={(e) => updateBulkRow(row.id, { category2: e.target.value })}
                              />
                              {row.category1 && !row.isCat1Manual && (
                                <select
                                  className="input-control bulk-category-switch"
                                  value=""
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (!value) return;
                                    updateBulkRow(row.id, { category2: value, isCat2Manual: false });
                                  }}
                                  title={t('parts_select_from_list')}
                                >
                                  <option value="">▼</option>
                                  {cat2Options.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                              )}
                            </div>
                          ) : (
                            <select
                              className="input-control"
                              value={row.category2}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '__manual__') {
                                  updateBulkRow(row.id, { isCat2Manual: true });
                                } else {
                                  updateBulkRow(row.id, { category2: value, isCat2Manual: false });
                                }
                              }}
                              disabled={!row.category1}
                            >
                              <option value="">{t('parts_spec_dash')}</option>
                              {row.category1 && <option value="__manual__">{t('parts_manual_input_plus')}</option>}
                              {cat2Options.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          )
                        ) : (
                          <div className="bulk-register-inherited" aria-label={row.category2} />
                        )}
                        {showCat2Add && (
                          <button
                            className="bulk-tree-add"
                            onClick={() => insertBulkRowAfter(row.id, 2)}
                            title={t('parts_add_spec_row')}
                          >
                            +
                          </button>
                        )}
                      </div>

                      <div className="bulk-register-cell">
                        {row.isCat3Manual ? (
                          <div className="bulk-category-field">
                            <input
                              className="input-control bulk-category-control"
                              value={row.category3}
                              placeholder={t('parts_manual_size')}
                              onChange={(e) => updateBulkRow(row.id, { category3: e.target.value })}
                            />
                            {row.category2 && !row.isCat2Manual && (
                              <select
                                className="input-control bulk-category-switch"
                                value=""
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (!value) return;
                                  updateBulkRow(row.id, { category3: value, isCat3Manual: false });
                                }}
                                title={t('parts_select_from_list')}
                              >
                                <option value="">▼</option>
                                {cat3Options.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                              </select>
                            )}
                          </div>
                        ) : (
                          <select
                            className="input-control"
                            value={row.category3}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '__manual__') {
                                updateBulkRow(row.id, { isCat3Manual: true });
                              } else {
                                updateBulkRow(row.id, { category3: value, isCat3Manual: false });
                              }
                            }}
                            disabled={!row.category2}
                          >
                            <option value="">{t('parts_size_dash')}</option>
                            {row.category2 && <option value="__manual__">{t('parts_manual_input_plus')}</option>}
                            {cat3Options.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        )}
                        {showCat3Add && (
                          <button
                            className="bulk-tree-add"
                            onClick={() => insertBulkRowAfter(row.id, 3)}
                            title={t('parts_add_size_row')}
                          >
                            +
                          </button>
                        )}
                      </div>

                      <div className="bulk-quantity-control">
                        <button
                          type="button"
                          className="quantity-control-btn"
                          onClick={() => updateBulkRow(row.id, { quantity: Math.max(0, Number(row.quantity || 0) - 1) })}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step="any"
                          className="input-control bulk-quantity-input quantity-input"
                          value={row.quantity}
                          onChange={(e) => updateBulkRow(row.id, { quantity: Number(e.target.value) })}
                        />
                        <button
                          type="button"
                          className="quantity-control-btn"
                          onClick={() => updateBulkRow(row.id, { quantity: Number(row.quantity || 0) + 1 })}
                        >
                          +
                        </button>
                      </div>
                      <select
                        className="input-control bulk-unit-select"
                        value={row.unit}
                        onChange={(e) => updateBulkRow(row.id, { unit: e.target.value })}
                      >
                        {['pcs', 'mm', 'm', 'mg', 'g', 'kg', 'ml', 'l'].map((unit) => (
                          <option key={unit} value={unit}>{formatUnit(unit, language)}</option>
                        ))}
                      </select>
                      <button
                        className={addButtonClass}
                        disabled={!canAdd || row.status === 'saved'}
                        onClick={() => handleBulkRegisterRow(row)}
                      >
                        {row.status === 'saved' ? t('parts_added') : t('parts_add')}
                      </button>
                      <button
                        type="button"
                        className="bulk-row-delete-btn"
                        onClick={() => removeBulkRow(row.id)}
                        title={t('parts_delete_row')}
                        aria-label={t('parts_delete_row')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="bulk-mobile-card-add"
                onClick={() => setBulkRows((rows) => [...rows, createBulkRow()])}
                title={t('parts_add_another_card')}
                aria-label={t('parts_add_another_card')}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {showAsset && (
        <div className="summary-banner">
          <div>
            <span className="summary-title">{getTranslation(language, 'parts_asset_total')}</span>
          </div>
          <div className="summary-value">
            ¥ {calculateTotalAsset().toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </div>
        </div>
      )}

      {/* Filter Options */}
      <div className="filter-bar glass-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <Filter size={18} />
            <span style={{ fontWeight: 500 }}>{t('parts_filter_label')}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <select
              className="input-control"
              style={{ width: 'auto', minWidth: '150px' }}
              value={selectedCat1}
              onChange={(e) => {
                setSelectedCat1(e.target.value);
                setSelectedCat2('');
                setSelectedCat3('');
              }}
            >
              <option value="">{t('parts_filter_type_all')}</option>
              {cat1List.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              className="input-control"
              style={{ width: 'auto', minWidth: '150px' }}
              value={selectedCat2}
              onChange={(e) => {
                setSelectedCat2(e.target.value);
                setSelectedCat3('');
              }}
              disabled={!selectedCat1}
            >
              <option value="">{t('parts_filter_spec_all')}</option>
              {cat2List.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              className="input-control"
              style={{ width: 'auto', minWidth: '150px' }}
              value={selectedCat3}
              onChange={(e) => setSelectedCat3(e.target.value)}
              disabled={!selectedCat2}
            >
              <option value="">{t('parts_filter_size_all')}</option>
              {cat3List.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {(selectedCat1 || selectedCat2 || selectedCat3) && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedCat1('');
                  setSelectedCat2('');
                  setSelectedCat3('');
                }}
              >
                {t('parts_clear')}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Parts Grid or List */}
      {viewMode === 'list' ? (
        <div className="glass-card" style={{ padding: '1rem', overflowX: 'auto', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                  {getTranslation(language, 'name')}
                  <SortIcon field="name" sortBy={sortBy} sortOrder={sortOrder} />
                  <span className="parts-name-note">
                    {t('parts_name_note')}
                  </span>
                </th>
                <th style={{ padding: '0.75rem 0.5rem', width: '180px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('quantity')}>
                  {getTranslation(language, 'quantity')}
                  <SortIcon field="quantity" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('price')}>
                  {getTranslation(language, 'price')}
                  <SortIcon field="price" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>
                  {t('parts_purchase_date_col')}
                  <SortIcon field="date" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right', width: '100px' }}>{getTranslation(language, 'actions')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedParts.map((part) => {
                const isLowStock = part.alert_threshold > 0 && part.quantity <= part.alert_threshold;
                return (
                  <tr key={part.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.95rem' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{part.name}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <div className="part-quantity-container" style={{ margin: 0, justifyContent: 'flex-start', gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="quantity-control-btn"
                          style={{ width: '24px', height: '24px', fontSize: '0.8rem', flexShrink: 0 }}
                          onClick={() => handleAdjustQuantity(part.id, -1)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step="any"
                          className="quantity-input"
                          style={{ 
                            padding: '2px', 
                            textAlign: 'center', 
                            height: '24px', 
                            fontSize: '0.85rem',
                            color: isLowStock ? 'var(--danger)' : 'inherit',
                            borderColor: isLowStock ? 'var(--danger)' : 'var(--border-color)'
                          }}
                          value={part.quantity}
                          onChange={(e) => handleUpdateQuantity(part.id, Number(e.target.value))}
                        />
                        <button
                          type="button"
                          className="quantity-control-btn"
                          style={{ width: '24px', height: '24px', fontSize: '0.8rem', flexShrink: 0 }}
                          onClick={() => handleAdjustQuantity(part.id, 1)}
                        >
                          +
                        </button>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{formatUnit(part.unit, language)}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {part.purchase_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {part.currency}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {part.purchase_date || '-'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px' }}
                          onClick={() => openEditModal(part)}
                          aria-label={getTranslation(language, 'edit')}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', color: 'var(--danger)' }}
                          onClick={() => requestDeletePart(part.id)}
                          aria-label={getTranslation(language, 'delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedParts.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
                    {getTranslation(language, 'parts_no_items')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="parts-grid">
          {sortedParts.map((part) => {
            const isLowStock = part.alert_threshold > 0 && part.quantity <= part.alert_threshold;
            return (
              <div 
                key={part.id} 
                className="part-card glass-card"
                style={isLowStock ? { border: '1px solid var(--danger)', boxShadow: '0 0 8px rgba(var(--danger-rgb), 0.2)' } : {}}
              >
                <div className="part-card-header">
                  <h3 className="part-title">{part.name}</h3>
                  <div className="part-card-quantity">
                    <button
                      type="button"
                      className="quantity-control-btn"
                      style={{ width: '28px', height: '28px', fontSize: '0.85rem', flexShrink: 0 }}
                      onClick={() => handleAdjustQuantity(part.id, -1)}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="any"
                      className="quantity-input part-card-quantity-input"
                      style={isLowStock ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : {}}
                      value={part.quantity}
                      onChange={(e) => handleUpdateQuantity(part.id, Number(e.target.value))}
                    />
                    <button
                      type="button"
                      className="quantity-control-btn"
                      style={{ width: '28px', height: '28px', fontSize: '0.85rem', flexShrink: 0 }}
                      onClick={() => handleAdjustQuantity(part.id, 1)}
                    >
                      +
                    </button>
                    <span className="part-card-unit">{formatUnit(part.unit, language)}</span>
                  </div>
                </div>

                <div className="part-meta">
                  <div>
                    <div className="part-meta-label">{getTranslation(language, 'price')}</div>
                    <div style={{ fontWeight: 500 }}>
                      {part.purchase_price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {part.currency}
                    </div>
                  </div>

                  
                  {/* Latest Purchase Date */}
                  <div>
                    <div className="part-meta-label">{getTranslation(language, 'purchase_date')}</div>
                    <div>{part.purchase_date || '-'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px' }}
                    onClick={() => openEditModal(part)}
                    aria-label={getTranslation(language, 'edit')}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', color: 'var(--danger)' }}
                    onClick={() => requestDeletePart(part.id)}
                    aria-label={getTranslation(language, 'delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}

          {sortedParts.length === 0 && (
            <div style={{ gridColumn: 'span 3', textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
              {getTranslation(language, 'parts_no_items')}
            </div>
          )}
        </div>
      )}



      <PageChatDrawer
        ref={chatDrawerRef}
        token={token}
        apiBase={apiBase}
        onLogout={onLogout}
        mode="parts"
        language={language}
        sendKey={sendKey}
        onExecuteSuccess={fetchParts}
        availableParts={sortedAvailableParts}
        messages={drawerMessages}
        setMessages={setDrawerMessages}
      />

      {pendingDeleteId !== null && (
        <DeleteConfirmDialog
          message={t('parts_delete_confirm')}
          dontShowLabel={t('delete_confirm_dont_show_again')}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          onConfirm={confirmDeletePart}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, Coins, PackageMinus } from 'lucide-react';
import { getTranslation } from '../utils/i18n';
import { calculateProductCost, formatUnit, sortPartsByInventorySort, sortProductsByProductSort } from '../utils/inventory';
import { usePersistentState } from '../hooks/usePersistentState';
import { useSortableState } from '../hooks/useSortableState';
import { PageChatDrawer, type PageChatDrawerRef } from './PageChatDrawer';
import { type Message } from '../types/chat';
import { type Part, type Product } from '../types/inventory';
import { SortIcon } from './SortIcon';
import { ViewModeToggle } from './ViewModeToggle';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import { isDeleteConfirmSkipped, setDeleteConfirmSkipped } from '../utils/deleteConfirm';

interface ProductsPageProps {
  token: string;
  apiBase: string;
  onLogout: () => void;
  language: string;
  sendKey: string;
  drawerMessages: Message[];
  setDrawerMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const renderLinkedText = (text: string): React.ReactNode => {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const exactUrlPattern = /^https?:\/\/[^\s]+$/;
  const parts = text.split(urlPattern);

  return parts.map((part, index) => {
    if (!exactUrlPattern.test(part)) return part;
    const trailingPunctuation = part.match(/[.,;:!?、。）」』】]+$/)?.[0] || '';
    const url = trailingPunctuation ? part.slice(0, -trailingPunctuation.length) : part;

    return (
      <React.Fragment key={`${url}-${index}`}>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
        {trailingPunctuation}
      </React.Fragment>
    );
  });
};

export const ProductsPage: React.FC<ProductsPageProps> = ({
  token,
  apiBase,
  onLogout,
  language,
  sendKey,
  drawerMessages,
  setDrawerMessages
}) => {
  const t = (key: string, params?: Record<string, string | number>) => getTranslation(language, key, params);
  const [products, setProducts] = useState<Product[]>([]);
  const chatDrawerRef = useRef<PageChatDrawerRef>(null);
  const [availableParts, setAvailableParts] = useState<Part[]>([]);
  const [consumeCounts, setConsumeCounts] = useState<Record<number, number>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = usePersistentState<'card' | 'list'>(
    'partomate_products_view_mode',
    'card',
    (value): value is 'card' | 'list' => value === 'card' || value === 'list'
  );
  const [showCost, setShowCost] = useState(false);
  const [partsSortBy] = usePersistentState('partomate_parts_sort_by', '');
  const [partsSortOrder] = usePersistentState<'asc' | 'desc'>(
    'partomate_parts_sort_order',
    'asc',
    (value): value is 'asc' | 'desc' => value === 'asc' || value === 'desc'
  );

  const {
    sortBy,
    sortOrder,
    handleSort,
    applySortValue,
  } = useSortableState(
    'partomate_products_sort_by',
    'partomate_products_sort_order',
  );

  // Columns count for Masonry flex layout
  const [columnsCount, setColumnsCount] = useState(3);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 720) setColumnsCount(1);
      else if (width < 1080) setColumnsCount(2);
      else if (width < 1440) setColumnsCount(3);
      else if (width < 1800) setColumnsCount(4);
      else setColumnsCount(5);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, partsRes] = await Promise.all([
        fetch(`${apiBase}/api/products`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiBase}/api/parts`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (productsRes.status === 401 || partsRes.status === 401) {
        onLogout();
        return;
      }

      if (!productsRes.ok || !partsRes.ok) throw new Error(t('products_fetch_error'));

      const productsData = await productsRes.json();
      const partsData = await partsRes.json();

      setProducts(productsData);
      setAvailableParts(partsData);
    } catch (err) {
      setError((err instanceof Error && err.message) || t('products_data_fetch_error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const openAddModal = () => {
    chatDrawerRef.current?.openWithNewProduct();
  };

  const openEditModal = (product: Product) => {
    chatDrawerRef.current?.openWithEditProduct(product);
  };

  const getConsumeCount = (productId: number) => consumeCounts[productId] ?? 1;

  const updateConsumeCount = (productId: number, count: number) => {
    if (count < 0) return;
    setConsumeCounts((prev) => ({ ...prev, [productId]: count }));
  };

  const openConsumeConfirmation = (product: Product) => {
    chatDrawerRef.current?.openWithConsumeProduct(product, getConsumeCount(product.id));
  };

  const handleDeleteProduct = async (productId: number) => {
    try {
      const response = await fetch(`${apiBase}/api/products/${productId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error(t('products_delete_error'));
      setProducts(products.filter((p) => p.id !== productId));
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const requestDeleteProduct = (productId: number) => {
    if (isDeleteConfirmSkipped('products')) {
      handleDeleteProduct(productId);
      return;
    }
    setPendingDeleteId(productId);
  };

  const confirmDeleteProduct = (dontShowAgain: boolean) => {
    if (pendingDeleteId === null) return;
    if (dontShowAgain) {
      setDeleteConfirmSkipped('products');
    }
    const productId = pendingDeleteId;
    setPendingDeleteId(null);
    handleDeleteProduct(productId);
  };

  // Sorted Products list
  const sortedProducts = sortProductsByProductSort(products, sortBy, sortOrder);
  const sortedAvailableParts = sortPartsByInventorySort(availableParts, partsSortBy, partsSortOrder);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>{getTranslation(language, 'loading')}</div>;
  if (error) return <div style={{ padding: '2rem', color: 'var(--danger)' }}>{error}</div>;

  return (
    <div className="main-content">
      <div className="parts-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2>{getTranslation(language, 'products_title')}</h2>
          <select
            className="input-control"
            style={{ width: 'auto', minWidth: '150px', height: '36px', padding: '0 0.5rem', fontSize: '0.9rem' }}
            value={sortBy ? `${sortBy}_${sortOrder}` : ''}
            onChange={(e) => applySortValue(e.target.value)}
          >
            <option value="">{t('products_sort_none')}</option>
            <option value="name_asc">{t('products_sort_name_asc')}</option>
            <option value="name_desc">{t('products_sort_name_desc')}</option>
            <option value="description_asc">{t('products_sort_description_asc')}</option>
            <option value="description_desc">{t('products_sort_description_desc')}</option>
            {showCost && <option value="cost_asc">{t('products_sort_cost_asc')}</option>}
            {showCost && <option value="cost_desc">{t('products_sort_cost_desc')}</option>}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            className={`btn ${showCost ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowCost(!showCost)}
            style={{
              height: '36px',
              width: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
              padding: 0,
              background: showCost ? 'var(--accent-primary)' : 'transparent',
              boxShadow: showCost ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none',
              color: showCost ? '#fff' : 'var(--text-secondary)'
            }}
            title={showCost ? t('products_cost_hide') : getTranslation(language, 'products_cost_eval')}
            aria-label={showCost ? t('products_cost_hide') : getTranslation(language, 'products_cost_eval')}
          >
            <Coins size={18} />
          </button>
          <ViewModeToggle
            viewMode={viewMode}
            onChange={setViewMode}
            cardLabel={getTranslation(language, 'parts_view_card')}
            listLabel={getTranslation(language, 'parts_view_list')}
          />
          <button className="btn btn-primary" onClick={openAddModal} style={{ height: '36px', display: 'flex', alignItems: 'center', boxSizing: 'border-box', padding: '0 1rem' }}>
            <Plus size={16} />
            <span>{getTranslation(language, 'products_add_product')}</span>
          </button>
        </div>
      </div>

      {/* Products Grid or List */}
      {viewMode === 'list' ? (
        <div className="glass-card" style={{ padding: '1rem', overflowX: 'auto', marginBottom: '2rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '640px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                  {t('products_name_col')}
                  <SortIcon field="name" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('description')}>
                  {getTranslation(language, 'description')}
                  <SortIcon field="description" sortBy={sortBy} sortOrder={sortOrder} />
                </th>
                <th style={{ padding: '0.75rem 0.5rem' }}>{getTranslation(language, 'products_recipe')}</th>
                {showCost && (
                  <th style={{ padding: '0.75rem 0.5rem', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('cost')}>
                    {t('products_cost_col')}
                    <SortIcon field="cost" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product) => {
                const totalCost = calculateProductCost(product);
                return (
                  <tr key={product.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.95rem' }}>
                    <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{product.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
                            <button
                              type="button"
                              className="quantity-control-btn"
                              style={{ width: '24px', height: '24px', fontSize: '0.8rem', flexShrink: 0 }}
                              onClick={() => updateConsumeCount(product.id, getConsumeCount(product.id) - 1)}
                            >
                              -
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                              <input
                                type="number"
                                step="any"
                                className="quantity-input product-consume-count-input"
                                style={{ height: '24px', padding: '2px', fontSize: '0.8rem', lineHeight: '20px', textAlign: 'center' }}
                                value={getConsumeCount(product.id)}
                                onChange={(e) => updateConsumeCount(product.id, Number(e.target.value))}
                              />
                            </div>
                            <button
                              type="button"
                              className="quantity-control-btn"
                              style={{ width: '24px', height: '24px', fontSize: '0.8rem', flexShrink: 0 }}
                              onClick={() => updateConsumeCount(product.id, getConsumeCount(product.id) + 1)}
                            >
                              +
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', color: 'var(--accent-secondary)', flexShrink: 0 }}
                              onClick={() => openConsumeConfirmation(product)}
                              title={t('products_assemble_consume')}
                              aria-label={t('products_assemble_consume')}
                            >
                              <PackageMinus size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px' }}
                              onClick={() => openEditModal(product)}
                              aria-label={getTranslation(language, 'edit')}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', color: 'var(--danger)' }}
                              onClick={() => requestDeleteProduct(product.id)}
                              aria-label={getTranslation(language, 'delete')}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem', verticalAlign: 'top' }}>
                      {product.description ? renderLinkedText(product.description) : '-'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                        {product.parts.map((item) => (
                          <div key={item.part_id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>• {item.part.name}</span>
                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              ({item.quantity} {formatUnit(item.part.unit, language)})
                            </span>
                          </div>
                        ))}
                        {product.parts.length === 0 && (
                          <span style={{ color: 'var(--text-muted)' }}>{t('products_no_recipe_parts')}</span>
                        )}
                      </div>
                    </td>
                    {showCost && (
                      <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: 'var(--accent-secondary)', verticalAlign: 'top' }}>
                        ¥ {totalCost.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      </td>
                    )}
                  </tr>
                );
              })}
              {sortedProducts.length === 0 && (
                <tr>
                  <td colSpan={showCost ? 4 : 3} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem' }}>
                    {getTranslation(language, 'products_no_items')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        (() => {
          if (sortedProducts.length === 0) {
            return (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '3rem', width: '100%' }}>
                {getTranslation(language, 'products_no_items')}
              </div>
            );
          }

          const columns: Product[][] = Array.from({ length: columnsCount }, () => []);
          sortedProducts.forEach((product, idx) => {
            columns[idx % columnsCount].push(product);
          });

          return (
            <div className="masonry-grid-flex">
              {columns.map((columnProducts, colIdx) => (
                <div key={colIdx} className="masonry-column">
                  {columnProducts.map((product) => {
                    const totalCost = calculateProductCost(product);
                    return (
                      <div key={product.id} className="part-card glass-card">
                        <div>
                          <h3 className="part-title">{product.name}</h3>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', marginBottom: product.description ? '1rem' : 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
                              <button
                                type="button"
                                className="quantity-control-btn"
                                style={{ width: '28px', height: '28px', fontSize: '0.85rem', flexShrink: 0 }}
                                onClick={() => updateConsumeCount(product.id, getConsumeCount(product.id) - 1)}
                              >
                                -
                              </button>
                              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                <input
                                  type="number"
                                  step="any"
                                  className="quantity-input product-consume-count-input"
                                  style={{ height: '28px', padding: '2px', fontSize: '0.85rem', lineHeight: '24px', textAlign: 'center' }}
                                  value={getConsumeCount(product.id)}
                                  onChange={(e) => updateConsumeCount(product.id, Number(e.target.value))}
                                />
                              </div>
                              <button
                                type="button"
                                className="quantity-control-btn"
                                style={{ width: '28px', height: '28px', fontSize: '0.85rem', flexShrink: 0 }}
                                onClick={() => updateConsumeCount(product.id, getConsumeCount(product.id) + 1)}
                              >
                                +
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px', color: 'var(--accent-secondary)', flexShrink: 0 }}
                                onClick={() => openConsumeConfirmation(product)}
                                title={t('products_assemble_consume')}
                                aria-label={t('products_assemble_consume')}
                              >
                                <PackageMinus size={16} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px' }}
                                onClick={() => openEditModal(product)}
                                aria-label={getTranslation(language, 'edit')}
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', color: 'var(--danger)' }}
                                onClick={() => requestDeleteProduct(product.id)}
                                aria-label={getTranslation(language, 'delete')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          {product.description && (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                              {renderLinkedText(product.description)}
                            </p>
                          )}
                        </div>

                        {/* Recipe parts view */}
                        <div style={{ margin: '1rem 0' }}>
                          <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{getTranslation(language, 'products_recipe')}</h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            {product.parts.map((item) => (
                              <div
                                key={item.part_id}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  gap: '0.5rem',
                                  fontSize: '0.9rem',
                                  padding: '4px 0',
                                  borderBottom: '1px solid rgba(255,255,255,0.03)'
                                }}
                              >
                                <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>{item.part.name}</span>
                                <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {item.quantity} {formatUnit(item.part.unit, language)}
                                </span>
                              </div>
                            ))}
                            {product.parts.length === 0 && (
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <AlertTriangle size={14} /> {t('products_no_recipe_registered')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* JPY Cost Summary */}
                        {showCost && (
                          <div
                            style={{
                              borderTop: '1px solid var(--border-color)',
                              paddingTop: '1rem',
                              marginTop: '1rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <div className="part-meta-label">{t('products_cost_col')}</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-secondary)' }}>
                                ¥ {totalCost.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()
      )}



      <PageChatDrawer
        ref={chatDrawerRef}
        token={token}
        apiBase={apiBase}
        onLogout={onLogout}
        mode="products"
        language={language}
        sendKey={sendKey}
        onExecuteSuccess={fetchData}
        availableParts={sortedAvailableParts}
        availableProducts={sortedProducts}
        messages={drawerMessages}
        setMessages={setDrawerMessages}
      />

      {pendingDeleteId !== null && (
        <DeleteConfirmDialog
          message={t('products_delete_confirm')}
          dontShowLabel={t('delete_confirm_dont_show_again')}
          confirmLabel={t('delete')}
          cancelLabel={t('cancel')}
          onConfirm={confirmDeleteProduct}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
};

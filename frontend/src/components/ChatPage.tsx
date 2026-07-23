import React, { useState, useRef, useEffect } from 'react';
import { Send, Check } from 'lucide-react';
import { getTranslation, translateApiMessage } from '../utils/i18n';
import { formatUnit, sortProductsByProductSort } from '../utils/inventory';
import { normalizeDate, formatConsumedQuantity, getProductPreviewParts } from '../utils/chat';
import { usePersistentState } from '../hooks/usePersistentState';
import { useQuickActionsScroll } from '../hooks/useQuickActionsScroll';
import { type Message, type PreviewData } from '../types/chat';
import { type Part, type Product } from '../types/inventory';

export type { Message };

interface ChatPageProps {
  token: string;
  apiBase: string;
  onLogout: () => void;
  language: string;
  sendKey: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

const getAggregatedConsumedParts = (items: any[]) => {
  const agg: { [key: string]: { part_name: string; quantity: number; unit: string } } = {};
  (items || []).forEach((item) => {
    const count = item.product_count || 0;
    if (item.parts) {
      item.parts.forEach((p: any) => {
        const key = p.part_id || p.part_name;
        if (!agg[key]) {
          agg[key] = { part_name: p.part_name, quantity: 0, unit: p.unit };
        }
        agg[key].quantity += p.quantity * count;
      });
    }
  });
  return Object.values(agg);
};

export const ChatPage: React.FC<ChatPageProps> = ({
  token,
  apiBase,
  onLogout,
  language,
  sendKey,
  messages,
  setMessages,
}) => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [tempInput, setTempInput] = useState<string>('');
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    handleQuickActionsWheel,
    handleQuickActionsPointerDown,
    handleQuickActionsPointerMove,
    handleQuickActionsPointerEnd,
    handleQuickActionsClickCapture,
    handleQuickActionButtonPointerDown,
    handleChipClick,
  } = useQuickActionsScroll(textareaRef, setInput);

  const t = (key: string, params?: Record<string, string | number>) => getTranslation(language, key, params);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${nextHeight}px`;
      textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > 180 ? 'auto' : 'hidden';
    }
  }, [input]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [availableParts, setAvailableParts] = useState<Part[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [systemCurrency, setSystemCurrency] = useState('JPY');
  const [productsSortBy] = usePersistentState('partomate_products_sort_by', '');
  const [productsSortOrder] = usePersistentState<'asc' | 'desc'>(
    'partomate_products_sort_order',
    'asc',
    (value): value is 'asc' | 'desc' => value === 'asc' || value === 'desc'
  );

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch(`${apiBase}/api/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.currency) {
            setSystemCurrency(data.currency);
          }
        }
      } catch (err) {
        console.error('Failed to fetch settings', err);
      }
    };
    fetchSettings();
  }, [token, apiBase]);

  const uniqueCategory1 = Array.from(new Set(availableParts.map((p) => p.category1).filter((c): c is string => Boolean(c))));
  const uniqueCategory2 = Array.from(new Set(availableParts.map((p) => p.category2).filter((c): c is string => Boolean(c))));
  const uniqueCategory3 = Array.from(new Set(availableParts.map((p) => p.category3).filter((c): c is string => Boolean(c))));
  const sortedProducts = sortProductsByProductSort(products, productsSortBy, productsSortOrder);

  useEffect(() => {
    const fetchAvailableParts = async () => {
      try {
        const response = await fetch(`${apiBase}/api/parts`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401) {
          onLogout();
          return;
        }
        if (response.ok) {
          const data = await response.json();
          setAvailableParts(data);
        }
      } catch (err) {
        console.error('Failed to fetch parts', err);
      }
    };
    fetchAvailableParts();
  }, [token, apiBase]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch(`${apiBase}/api/products`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401) {
          onLogout();
          return;
        }
        if (response.ok) {
          const data = await response.json();
          setProducts(data);
        }
      } catch (err) {
        console.error('Failed to fetch products', err);
      }
    };
    fetchProducts();
  }, [token, apiBase]);

  // Quick Action Shortcut chips: dynamically constructed from categories, part names, and product names
  const baseQuickActions = [
    t('qa_check_stock'), t('qa_add'), t('qa_consume'), t('qa_sell'),
    t('qa_build_product'), t('qa_low_stock'), t('qa_inventory_value'),
  ];
  const activeCategories = [...uniqueCategory1, ...uniqueCategory2, ...uniqueCategory3].slice(0, 12);
  const activePartNames = Array.from(new Set(availableParts.map((p) => p.name).filter(Boolean))).slice(0, 10);
  const activeProductNames = Array.from(new Set(sortedProducts.map((p) => p.name).filter(Boolean))).slice(0, 8);
  const fallbackQuickActions = [
    t('qa_fallback_screw'), t('qa_fallback_resistor'), t('qa_fallback_capacitor'),
    t('qa_fallback_product_a'), t('qa_add_10'), t('qa_fallback_use_1'),
  ];
  const quickActions = Array.from(new Set([
    ...baseQuickActions,
    ...activeCategories,
    ...activePartNames,
    ...activeProductNames,
    ...(availableParts.length || products.length ? [] : fallbackQuickActions),
  ]));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    setHistoryIndex(-1);
    setTempInput('');

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/chat/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: textToSend, mode: 'chat' }),
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(t('chat_analysis_failed'));
      }

      const analysisResult = await response.json();

      if (analysisResult.type === 'parts' && analysisResult.items) {
        analysisResult.items = analysisResult.items.map((item: any) => {
          const hasC1 = item.category1 ? uniqueCategory1.includes(item.category1) : true;
          const hasC2 = item.category2
            ? availableParts.some((part) => part.category1 === item.category1 && part.category2 === item.category2)
            : true;
          const hasC3 = item.category3
            ? availableParts.some((part) =>
                part.category1 === item.category1 &&
                part.category2 === item.category2 &&
                part.category3 === item.category3
              )
            : true;

          const isTotalInput = item.total_price !== null && item.total_price !== undefined && item.total_price > 0;
          const inputCurrency = item.currency || systemCurrency;
          const pDate = item.purchase_date ? normalizeDate(item.purchase_date) : null;
          const isForeign = inputCurrency !== systemCurrency;

          let defaultRate = 1.0;
          if (inputCurrency === 'USD' && systemCurrency === 'JPY') defaultRate = 155;
          else if (inputCurrency === 'EUR' && systemCurrency === 'JPY') defaultRate = 165;
          else if (inputCurrency === 'JPY' && systemCurrency === 'USD') defaultRate = 1 / 155;
          else if (inputCurrency === 'JPY' && systemCurrency === 'EUR') defaultRate = 1 / 165;

          const tempTotalCost = isTotalInput ? item.total_price : undefined;
          const tempUnitPrice = isTotalInput ? undefined : item.purchase_price;

          let initialPurchasePrice: number;
          if (isTotalInput) {
            const qty = item.quantity || 1;
            initialPurchasePrice = Number(((item.total_price * defaultRate) / qty).toFixed(4));
          } else {
            initialPurchasePrice = Number((item.purchase_price * defaultRate).toFixed(4));
          }

          return {
            ...item,
            isCat1Manual: item.category1 ? !hasC1 : false,
            isCat2Manual: item.category2 ? (!hasC1 || !hasC2) : false,
            isCat3Manual: item.category3 ? (!hasC1 || !hasC2 || !hasC3) : false,
            isTotalInput,
            tempTotalCost,
            tempUnitPrice,
            inputCurrency,
            exchangeRate: isForeign ? defaultRate : 1.0,
            purchase_price: initialPurchasePrice,
            purchase_date: pDate,
          };
        });
      }

      if (analysisResult.type === 'product') {
        if (!analysisResult.items && analysisResult.product_name) {
          analysisResult.items = [{
            product_name: analysisResult.product_name,
            product_count: analysisResult.product_count ?? 1,
            parts: analysisResult.parts || []
          }];
        }
      }

      let aiText = '';
      if (analysisResult.type === 'parts') {
        const actionStr = analysisResult.action === 'add'
          ? t('chat_action_add')
          : t('chat_action_consume');
        aiText = t('chat_stock_action_detected', { action: actionStr });
      } else if (analysisResult.type === 'product') {
        const productNames = (analysisResult.items || [])
          .map((item: any) => (language === 'en' ? `"${item.product_name}"` : `「${item.product_name}」`))
          .join(language === 'en' ? ', ' : '、');
        aiText = t('chat_product_assembly_detected', { names: productNames });
      } else if (analysisResult.type === 'message') {
        aiText = analysisResult.message || '';
      } else {
        aiText = t('chat_no_action_detected');
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: aiText,
        previewData: (analysisResult.type === 'parts' || analysisResult.type === 'product') ? analysisResult : null,
        isExecuted: false,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (analysisResult.type === 'parts' && analysisResult.items) {
        analysisResult.items.forEach((item: any, idx: number) => {
          const isForeign = item.inputCurrency && item.inputCurrency !== systemCurrency;
          if (isForeign) {
            fetchRateAndApply(
              aiMessage.id,
              idx,
              item.inputCurrency,
              systemCurrency,
              item.purchase_date || 'latest',
              item.quantity || 1,
              !!item.isTotalInput
            );
          }
        });
      }
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        text: (err instanceof Error && err.message) || t('chat_generic_error'),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (msgId: string, previewData: PreviewData | null | undefined) => {
    if (executingMessageId) return;
    setExecutingMessageId(msgId);
    try {
      const cleanedData = JSON.parse(JSON.stringify(previewData));

      const response = await fetch(`${apiBase}/api/chat/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(cleanedData),
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(translateApiMessage(language, errData.detail, 'chat_generic_error'));
      }

      const resData = await response.json();
      const responseLanguage =
        cleanedData?.type === 'settings' &&
        (cleanedData?.updates?.language === 'ja' || cleanedData?.updates?.language === 'en')
          ? cleanedData.updates.language
          : language;

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, isExecuted: true } : m))
      );

      const systemMessage: Message = {
        id: Date.now().toString(),
        sender: 'system',
        text: translateApiMessage(responseLanguage, resData.message, 'chat_apply_success'),
      };
      setMessages((prev) => [...prev, systemMessage]);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setExecutingMessageId(null);
    }
  };

  const handleUpdatePreviewItemQty = (msgId: string, itemIdx: number, newQty: number) => {
    if (newQty < 0) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.previewData || m.previewData.type !== 'parts') return m;
        const updatedItems = [...(m.previewData.items || [])] as any[];
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], quantity: newQty };
        return { ...m, previewData: { ...m.previewData, items: updatedItems } };
      })
    );
  };

  const fetchRateAndApply = async (msgId: string, itemIdx: number, fromCur: string, toCur: string, date: string, qty: number, isTotal: boolean) => {
    let dateStr = normalizeDate(date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateStr = 'latest';
    }
    try {
      const response = await fetch(`https://api.frankfurter.dev/v1/${dateStr}?from=${fromCur}&to=${toCur}`);
      if (response.ok) {
        const data = await response.json();
        const rate = data.rates[toCur];
        if (rate) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== msgId || !m.previewData || m.previewData.type !== 'parts') return m;
              const updatedItems = [...(m.previewData.items || [])] as any[];
              const item = { ...updatedItems[itemIdx] };
              item.exchangeRate = rate;
              
              // We always convert if foreign currency
              const multiplier = rate;
              if (isTotal) {
                const total = Number(item.tempTotalCost) || 0;
                const unitPrice = qty > 0 ? ((total * multiplier) / qty) : 0;
                item.purchase_price = Number(unitPrice.toFixed(4));
              } else {
                const basePrice = Number(item.tempUnitPrice) || Number(item.purchase_price) || 0;
                item.purchase_price = Number((basePrice * multiplier).toFixed(4));
              }
              updatedItems[itemIdx] = item;
              return { ...m, previewData: { ...m.previewData, items: updatedItems } };
            })
          );
        }
      }
    } catch (err) {
      console.error('Failed to fetch rate from API', err);
    }
  };

  const handleUpdatePreviewItemDetails = (msgId: string, itemIdx: number, details: any) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.previewData || m.previewData.type !== 'parts') return m;
        const updatedItems = [...(m.previewData.items || [])] as any[];
        const previousItem = updatedItems[itemIdx];
        const item = { ...previousItem, ...details };

        if ('purchase_date' in details && details.purchase_date) {
          item.purchase_date = normalizeDate(details.purchase_date);
        }

        if ('isCat1Manual' in details) {
          if (details.isCat1Manual === true && !previousItem.isCat1Manual) {
            item.category1 = '';
            item.category2 = '';
            item.category3 = '';
            item.isCat2Manual = true;
            item.isCat3Manual = true;
          } else if (details.isCat1Manual === false) {
            item.category2 = '';
            item.category3 = '';
            item.isCat2Manual = false;
            item.isCat3Manual = false;
          }
        }

        if ('category1' in details && !item.isCat1Manual) {
          item.category2 = '';
          item.category3 = '';
          item.isCat2Manual = false;
          item.isCat3Manual = false;
        }

        if ('isCat2Manual' in details) {
          if (details.isCat2Manual === true && !previousItem.isCat2Manual) {
            item.category2 = '';
            item.category3 = '';
            item.isCat3Manual = true;
          } else if (details.isCat2Manual === false) {
            item.category3 = '';
            item.isCat3Manual = false;
          }
        }

        if ('category2' in details && !item.isCat2Manual) {
          item.category3 = '';
          item.isCat3Manual = false;
        }

        if (details.isCat3Manual === true && !previousItem.isCat3Manual) {
          item.category3 = '';
        }

        // Recalculate part_id based on final categories
        const norm = (v: any) => (v || '').trim().toLowerCase();
        const matched = availableParts.find((p) =>
          norm(p.category1) === norm(item.category1) &&
          norm(p.category2) === norm(item.category2) &&
          norm(p.category3) === norm(item.category3)
        );
        item.part_id = matched ? matched.id : null;

        // Initialize inputCurrency if not present
        if (!item.inputCurrency) {
          item.inputCurrency = item.currency || systemCurrency;
        }

        // Keep values on mode toggle (just preserve the input numbers without unit/total calculation)
        if ('isTotalInput' in details) {
          const oldIsTotal = updatedItems[itemIdx].isTotalInput;
          const newIsTotal = details.isTotalInput;
          if (oldIsTotal !== newIsTotal) {
            if (newIsTotal) {
              // Switch to total cost input.
              const baseUnitPrice = item.tempUnitPrice ?? item.purchase_price;
              item.tempTotalCost = baseUnitPrice;
            } else {
              // Switch to unit price input.
              const totalCost = item.tempTotalCost ?? item.purchase_price;
              item.tempUnitPrice = totalCost;
            }
          }
        }

        // Recalculate quantity, price, exchange rates
        const isForeign = item.inputCurrency !== systemCurrency;
        item.exchangeRateApplied = isForeign;
        const qty = item.quantity ?? 1;
        const rate = isForeign && item.exchangeRate ? item.exchangeRate : 1.0;

        // Keep tempUnitPrice/tempTotalCost updated if manual changes occur
        if ('purchase_price' in details && !item.isTotalInput && !isForeign) {
          item.tempUnitPrice = details.purchase_price;
        }

        if (item.isTotalInput) {
          if ('tempTotalCost' in details || 'quantity' in details || 'isTotalInput' in details || 'exchangeRate' in details) {
            const total = item.tempTotalCost ?? 0;
            const unitPrice = qty > 0 ? ((total * rate) / qty) : 0;
            item.purchase_price = Number(unitPrice.toFixed(4));
          }
        } else {
          if ('tempUnitPrice' in details || 'purchase_price' in details || 'quantity' in details || 'isTotalInput' in details || 'exchangeRate' in details) {
            const basePrice = item.tempUnitPrice ?? item.purchase_price ?? 0;
            item.purchase_price = Number((basePrice * rate).toFixed(4));
          }
        }

        // The currency saved to DB is ALWAYS systemCurrency (always convert and save in system currency)
        item.currency = systemCurrency;

        updatedItems[itemIdx] = item;
        return { ...m, previewData: { ...m.previewData, items: updatedItems } };
      })
    );
  };

  const handleUpdateProductCount = (msgId: string, itemIdx: number, newCount: number) => {
    if (newCount < 0) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.previewData || m.previewData.type !== 'product') return m;
        
        if (m.previewData.items) {
          const updatedItems = [...m.previewData.items];
          updatedItems[itemIdx] = { ...updatedItems[itemIdx], product_count: newCount };
          return {
            ...m,
            previewData: {
              ...m.previewData,
              items: updatedItems
            }
          };
        }
        
        return { ...m, previewData: { ...m.previewData, product_count: newCount } };
      })
    );
  };

  const handleUpdateProductSelection = (msgId: string, itemIdx: number, productId: number) => {
    const selectedProduct = products.find((product) => product.id === productId);
    if (!selectedProduct) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.previewData || m.previewData.type !== 'product') return m;

        const updatedItem = {
          ...((m.previewData.items || [])[itemIdx] || {}),
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          parts: getProductPreviewParts(selectedProduct),
        };

        if (m.previewData.items) {
          const updatedItems = [...m.previewData.items];
          updatedItems[itemIdx] = updatedItem;
          return {
            ...m,
            previewData: {
              ...m.previewData,
              items: updatedItems,
              product_id: selectedProduct.id,
              product_name: itemIdx === 0 ? selectedProduct.name : m.previewData.product_name,
            }
          };
        }

        return {
          ...m,
          previewData: {
            ...m.previewData,
            ...updatedItem,
          }
        };
      })
    );
  };

  const isChatActive = messages.length > 0;

  return (
    <div className={`chat-page-container ${isChatActive ? 'active-chat' : 'centered-chat'}`}>
      
      {/* 2. Welcome Panel (Visible when empty history) */}
      {!isChatActive && (
        <div className="chat-welcome-section">
          <div className="chat-welcome-logo">Partomate</div>
          <p className="chat-welcome-subtitle" style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            {t('chat_welcome_example')}
          </p>
        </div>
      )}

      {/* 3. Message Bubble Stream */}
      {isChatActive && (
        <div className="chat-messages-area">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';
            return (
              <div key={msg.id} className={`chat-bubble-row ${isUser ? 'user-row' : isSystem ? 'system-row' : 'ai-row'}`}>
                <div className="chat-bubble">
                  <div className="bubble-text">{msg.text}</div>
                  
                  {/* Dynamic Confirmation Form Card */}
                  {msg.previewData && msg.previewData.type && (
                    <div className="chat-preview-card glass-card">
                      {msg.previewData.type === 'parts' && (
                        <div>
                          <div className="preview-card-header">
                            {t('chat_confirm_stock_adjustment')}
                          </div>

                          {(msg.previewData.items || []).map((item: any, idx: number) => {
                            // Calculate filtered option lists dynamically
                            const optsC1 = Array.from(new Set(availableParts.map((p) => p.category1).filter((c): c is string => Boolean(c))));

                            const filteredForC2 = item.category1
                              ? availableParts.filter((p) => p.category1 === item.category1)
                              : availableParts;
                            const optsC2 = Array.from(new Set(filteredForC2.map((p) => p.category2).filter((c): c is string => Boolean(c))));

                            const filteredForC3 = item.category2
                              ? filteredForC2.filter((p) => p.category2 === item.category2)
                              : filteredForC2;
                            const optsC3 = Array.from(new Set(filteredForC3.map((p) => p.category3).filter((c): c is string => Boolean(c))));

                            return (
                              <div key={idx} className="preview-item-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.75rem' }}>
                                <div className="preview-part-edit-row">
                                  
                                  {/* Left side: categories selectors or labels */}
                                  <div className="preview-category-panel">
                                    {msg.isExecuted ? (
                                      /* Executed State (Text display) */
                                      <div>
                                        <span style={{ fontWeight: 600 }}>
                                          {[item.category2, item.category3, item.category1].filter(Boolean).join(' ') || t('chat_undefined_part')}
                                        </span>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                          {t('chat_price_label')}{item.purchase_price} {item.currency} | {t('chat_unit_label')}{item.unit}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="preview-category-grid">
                                        <div>
                                          {item.isCat1Manual ? (
                                            <div className="preview-category-field">
                                              <input
                                                type="text"
                                                className="input-control preview-category-control"
                                                placeholder={t('chat_manual_type')}
                                                value={item.category1 || ''}
                                                onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { category1: e.target.value })}
                                              />
                                              <select
                                                className="input-control preview-category-switch"
                                                value=""
                                                onChange={(e) => {
                                                  if (!e.target.value) return;
                                                  handleUpdatePreviewItemDetails(msg.id, idx, {
                                                    category1: e.target.value,
                                                    isCat1Manual: false,
                                                  });
                                                }}
                                                title={t('chat_select_from_list')}
                                              >
                                                <option value="">▼</option>
                                                {optsC1.map((value) => <option key={value} value={value}>{value}</option>)}
                                              </select>
                                            </div>
                                          ) : (
                                            <select
                                              className="input-control preview-category-control"
                                              value={item.category1 || ''}
                                              onChange={(e) => {
                                                if (e.target.value === '__manual__') {
                                                  handleUpdatePreviewItemDetails(msg.id, idx, { isCat1Manual: true });
                                                } else {
                                                  handleUpdatePreviewItemDetails(msg.id, idx, {
                                                    category1: e.target.value,
                                                    isCat1Manual: false,
                                                  });
                                                }
                                              }}
                                            >
                                              <option value="">{t('chat_type_dash')}</option>
                                              <option value="__manual__">{t('chat_manual_input_plus')}</option>
                                              {optsC1.map((value) => <option key={value} value={value}>{value}</option>)}
                                            </select>
                                          )}
                                        </div>

                                        <div>
                                          {item.isCat2Manual ? (
                                            <div className="preview-category-field">
                                              <input
                                                type="text"
                                                className="input-control preview-category-control"
                                                placeholder={t('chat_manual_spec')}
                                                value={item.category2 || ''}
                                                onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { category2: e.target.value })}
                                              />
                                              {item.category1 && !item.isCat1Manual && (
                                                <select
                                                  className="input-control preview-category-switch"
                                                  value=""
                                                  onChange={(e) => {
                                                    if (!e.target.value) return;
                                                    handleUpdatePreviewItemDetails(msg.id, idx, {
                                                      category2: e.target.value,
                                                      isCat2Manual: false,
                                                    });
                                                  }}
                                                  title={t('chat_select_from_list')}
                                                >
                                                  <option value="">▼</option>
                                                  {optsC2.map((value) => <option key={value} value={value}>{value}</option>)}
                                                </select>
                                              )}
                                            </div>
                                          ) : (
                                            <select
                                              className="input-control preview-category-control"
                                              value={item.category2 || ''}
                                              onChange={(e) => {
                                                if (e.target.value === '__manual__') {
                                                  handleUpdatePreviewItemDetails(msg.id, idx, { isCat2Manual: true });
                                                } else {
                                                  handleUpdatePreviewItemDetails(msg.id, idx, {
                                                    category2: e.target.value,
                                                    isCat2Manual: false,
                                                  });
                                                }
                                              }}
                                              disabled={!item.category1}
                                            >
                                              <option value="">{t('chat_spec_dash')}</option>
                                              {item.category1 && <option value="__manual__">{t('chat_manual_input_plus')}</option>}
                                              {optsC2.map((value) => <option key={value} value={value}>{value}</option>)}
                                            </select>
                                          )}
                                        </div>

                                        <div>
                                          {item.isCat3Manual ? (
                                            <div className="preview-category-field">
                                              <input
                                                type="text"
                                                className="input-control preview-category-control"
                                                placeholder={t('chat_manual_size')}
                                                value={item.category3 || ''}
                                                onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { category3: e.target.value })}
                                              />
                                              {item.category2 && !item.isCat2Manual && (
                                                <select
                                                  className="input-control preview-category-switch"
                                                  value=""
                                                  onChange={(e) => {
                                                    if (!e.target.value) return;
                                                    handleUpdatePreviewItemDetails(msg.id, idx, {
                                                      category3: e.target.value,
                                                      isCat3Manual: false,
                                                    });
                                                  }}
                                                  title={t('chat_select_from_list')}
                                                >
                                                  <option value="">▼</option>
                                                  {optsC3.map((value) => <option key={value} value={value}>{value}</option>)}
                                                </select>
                                              )}
                                            </div>
                                          ) : (
                                            <select
                                              className="input-control preview-category-control"
                                              value={item.category3 || ''}
                                              onChange={(e) => {
                                                if (e.target.value === '__manual__') {
                                                  handleUpdatePreviewItemDetails(msg.id, idx, { isCat3Manual: true });
                                                } else {
                                                  handleUpdatePreviewItemDetails(msg.id, idx, {
                                                    category3: e.target.value,
                                                    isCat3Manual: false,
                                                  });
                                                }
                                              }}
                                              disabled={!item.category2}
                                            >
                                              <option value="">{t('chat_size_dash')}</option>
                                              {item.category2 && <option value="__manual__">{t('chat_manual_input_plus')}</option>}
                                              {optsC3.map((value) => <option key={value} value={value}>{value}</option>)}
                                            </select>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Quantity control */}
                                  <div className="preview-quantity-row">
                                    <button
                                      type="button"
                                      className="quantity-control-btn"
                                      style={{ width: '28px', height: '28px' }}
                                      disabled={msg.isExecuted}
                                      onClick={() => handleUpdatePreviewItemQty(msg.id, idx, item.quantity - 1)}
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      step="any"
                                      className="quantity-input"
                                      style={{ padding: '2px', textAlign: 'center' }}
                                      value={item.quantity ?? ''}
                                      onChange={(e) => handleUpdatePreviewItemQty(msg.id, idx, Number(e.target.value))}
                                      disabled={msg.isExecuted}
                                    />
                                    <button
                                      type="button"
                                      className="quantity-control-btn"
                                      style={{ width: '28px', height: '28px' }}
                                      disabled={msg.isExecuted}
                                      onClick={() => handleUpdatePreviewItemQty(msg.id, idx, item.quantity + 1)}
                                    >
                                      +
                                    </button>
                                    <span style={{ fontSize: '0.85rem', marginLeft: '0.25rem', color: 'var(--text-secondary)' }}>{item.unit || 'pcs'}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {msg.previewData.type === 'product' && (
                        <div>
                          <div className="preview-card-header">
                            {t('chat_confirm_product_assembly')}
                          </div>
                          {(msg.previewData.items || []).map((item: any, itemIdx: number) => (
                            <div key={itemIdx} className="preview-item-row" style={{ borderBottom: '1px dashed var(--border-color)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                              <div style={{ flex: '1 1 auto', minWidth: 0, paddingRight: '0.75rem' }}>
                                <select
                                  className="input-control"
                                  value={item.product_id || products.find((product) => product.name === item.product_name)?.id || ''}
                                  onChange={(e) => handleUpdateProductSelection(msg.id, itemIdx, Number(e.target.value))}
                                  disabled={msg.isExecuted || sortedProducts.length === 0}
                                  style={{
                                    width: '100%',
                                    maxWidth: '280px',
                                    minHeight: '30px',
                                    padding: '3px 8px',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.2,
                                    fontWeight: 600
                                  }}
                                >
                                  {!products.some((product) => product.id === item.product_id || product.name === item.product_name) && (
                                    <option value="">{item.product_name || t('chat_select_product')}</option>
                                  )}
                                  {sortedProducts.map((product) => (
                                    <option key={product.id} value={product.id}>{product.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <button
                                  type="button"
                                  className="quantity-control-btn"
                                  style={{ width: '28px', height: '28px' }}
                                  disabled={msg.isExecuted}
                                  onClick={() => handleUpdateProductCount(msg.id, itemIdx, item.product_count - 1)}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  className="quantity-input"
                                  style={{ padding: '2px', textAlign: 'center' }}
                                  value={item.product_count}
                                  onChange={(e) => handleUpdateProductCount(msg.id, itemIdx, Number(e.target.value))}
                                  disabled={msg.isExecuted}
                                />
                                <button
                                  type="button"
                                  className="quantity-control-btn"
                                  style={{ width: '28px', height: '28px' }}
                                  disabled={msg.isExecuted}
                                  onClick={() => handleUpdateProductCount(msg.id, itemIdx, item.product_count + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          ))}
                          {(() => {
                            const aggregated = getAggregatedConsumedParts(msg.previewData.items || []);
                            if (aggregated.length === 0) return null;
                            return (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                                <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                                  {t('chat_total_parts_list')}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                  {aggregated.map((p: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '0.5rem', borderLeft: '2px solid var(--primary)' }}>
                                      <span>{p.part_name}</span>
                                      <span style={{ color: 'var(--danger)', fontWeight: 400 }}>
                                        {formatConsumedQuantity(p.quantity)} {formatUnit(p.unit, language)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {!msg.isExecuted ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ width: '100%', marginTop: '1rem', padding: '0.5rem' }}
                          onClick={() => handleExecute(msg.id, msg.previewData)}
                          disabled={executingMessageId === msg.id}
                        >
                          <Check size={16} />
                          <span>{t('chat_drawer_exec')}</span>
                        </button>
                      ) : (
                        <div className="executed-badge">
                          <Check size={16} />
                          <span>{t('chat_drawer_executed')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="chat-bubble-row ai-row">
              <div className="chat-bubble loading-bubble">
                <div className="dot-pulse"></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 4. Bottom Input Form Section */}
      <div className="chat-input-container">
        {/* TextInput Box */}
        <form
          className="chat-input-form glass-card chat-input-form-with-chips"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
        >
          <div
            className="quick-actions-bar top-chat-quick-actions-bar"
            onWheel={handleQuickActionsWheel}
            onPointerDown={handleQuickActionsPointerDown}
            onPointerMove={handleQuickActionsPointerMove}
            onPointerUp={handleQuickActionsPointerEnd}
            onPointerCancel={handleQuickActionsPointerEnd}
            onPointerLeave={handleQuickActionsPointerEnd}
            onClickCapture={handleQuickActionsClickCapture}
          >
            {quickActions.map((act) => (
              <button
                key={act}
                type="button"
                className="quick-action-btn"
                onPointerDown={handleQuickActionButtonPointerDown}
                onClick={() => handleChipClick(act)}
              >
                {act}
              </button>
            ))}
          </div>

          <div className="top-chat-input-row">
            <textarea
              ref={textareaRef}
              className="chat-input-field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                const isEnterSubmit = sendKey === 'enter';
                if (e.key === 'Enter') {
                  if (isEnterSubmit && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(input);
                  } else if (!isEnterSubmit && e.shiftKey) {
                    e.preventDefault();
                    handleSend(input);
                  }
                } else if (e.key === 'ArrowUp') {
                  const cursorAtStart = e.currentTarget.selectionStart === 0;
                  if (cursorAtStart) {
                    const userMessages = messages.filter((m) => m.sender === 'user');
                    if (userMessages.length > 0) {
                      e.preventDefault();
                      let newIndex = historyIndex;
                      if (historyIndex === -1) {
                        setTempInput(input);
                        newIndex = userMessages.length - 1;
                      } else if (historyIndex > 0) {
                        newIndex = historyIndex - 1;
                      }
                      setHistoryIndex(newIndex);
                      setInput(userMessages[newIndex].text);
                    }
                  }
                } else if (e.key === 'ArrowDown') {
                  const cursorAtEnd = e.currentTarget.selectionStart === e.currentTarget.value.length;
                  if (cursorAtEnd) {
                    const userMessages = messages.filter((m) => m.sender === 'user');
                    if (historyIndex !== -1 && userMessages.length > 0) {
                      e.preventDefault();
                      const newIndex = historyIndex + 1;
                      if (newIndex >= userMessages.length) {
                        setHistoryIndex(-1);
                        setInput(tempInput);
                      } else {
                        setHistoryIndex(newIndex);
                        setInput(userMessages[newIndex].text);
                      }
                    }
                  }
                }
              }}
              placeholder={sendKey === 'enter' ? t('chat_press_enter_to_send') : t('chat_drawer_placeholder')}
              disabled={loading}
              rows={1}
              style={{
                resize: 'none',
                minHeight: '32px',
                maxHeight: '180px',
                padding: '4px 0',
                fontFamily: 'inherit',
                lineHeight: '1.4',
                overflowY: 'hidden'
              }}
            />
            <button
              type="submit"
              className="chat-send-btn"
              disabled={!input.trim() || loading}
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>

    </div>
  );
};

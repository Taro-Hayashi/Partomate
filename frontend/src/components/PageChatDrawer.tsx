import React, { useState, useRef, useEffect } from 'react';
import { Send, Check, X } from 'lucide-react';
import { getTranslation } from '../utils/i18n';
import { formatUnit } from '../utils/inventory';
import { normalizeDate, getDateParts, formatConsumedQuantity, getProductPreviewParts } from '../utils/chat';
import { useQuickActionsScroll } from '../hooks/useQuickActionsScroll';
import { type Message, type PartPreviewItem, type RecipePartItem, type ProductConsumeItem, type PreviewData } from '../types/chat';
import { type Part, type Product } from '../types/inventory';
import { clearDeleteConfirmSkips } from '../utils/deleteConfirm';

interface PageChatDrawerProps {
  token: string;
  apiBase: string;
  onLogout: () => void;
  mode: 'parts' | 'products' | 'settings';
  language: string;
  sendKey: string;
  onExecuteSuccess?: () => void;
  availableParts?: Part[];
  availableProducts?: Product[];
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export interface PageChatDrawerRef {
  openWithNewPart: () => void;
  openWithNewProduct: () => void;
  openWithEditPart: (part: Part) => void;
  openWithEditProduct: (product: Product) => void;
  openWithConsumeProduct: (product: Product, count: number) => void;
}

const getDaysInMonth = (year: string, month: string) => {
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!yearNumber || !monthNumber) return 31;
  return new Date(yearNumber, monthNumber, 0).getDate();
};

const getSettingKeyLabel = (key: string, lang: string): string => {
  const labels: Record<string, Record<string, string>> = {
    ja: {
      theme_color: 'テーマカラー',
      theme_wallpaper: '背景スタイル',
      background_image_mode: '背景画像',
      background_pattern_size: '柄のサイズ',
      background_dot_size: '水玉の大きさ',
      background_stripe_width: '斜線の太さ',
      background_check_size: 'チェック柄の間隔',
      background_image_data: '背景画像データ',
      background_image_url: '背景画像URL',
      background_image_filename: '背景画像ファイル名',
      background_image_layout: '背景画像の表示方式',
      currency: '通貨',
      llm_provider: 'LLMプロバイダ',
      llm_url: 'API URL',
      llm_model: 'モデル名',
      user_nickname: 'あなたのニックネーム',
      ai_pronoun: 'AIの一人称',
      language: '言語設定',
      send_key: '送信キー',
      allowed_hosts: 'アクセス許可設定',
      system_prompt: 'システムプロンプト',
      clear_delete_confirm_skips: '削除確認メッセージの表示状況',
    },
    en: {
      theme_color: 'Theme Color',
      theme_wallpaper: 'Background Style',
      background_image_mode: 'Background Image',
      background_pattern_size: 'Pattern Size',
      background_dot_size: 'Dot Size',
      background_stripe_width: 'Stripe Width',
      background_check_size: 'Check Spacing',
      background_image_data: 'Background Image Data',
      background_image_url: 'Background Image URL',
      background_image_filename: 'Background Image Filename',
      background_image_layout: 'Background Image Layout',
      currency: 'Currency',
      llm_provider: 'LLM Provider',
      llm_url: 'API URL',
      llm_model: 'Model Name',
      user_nickname: 'Your Nickname',
      ai_pronoun: 'AI Pronoun',
      language: 'Language',
      send_key: 'Submit Key',
      allowed_hosts: 'Access Control',
      system_prompt: 'System Prompt',
      clear_delete_confirm_skips: 'Delete Confirmation Status',
    }
  };
  return labels[lang]?.[key] || labels['ja']?.[key] || key;
};

const getSettingValueLabel = (key: string, val: unknown, lang: string): string => {
  const valStr = String(val);
  
  if (key === 'theme_color') {
    const colorMap: Record<string, string> = {
      tomato: 'Flesh Tomato',
      ocean: 'Ocean Blue',
      forest: 'Forest Green',
      lemon: 'Sunny Lemon',
    };
    return colorMap[valStr] || valStr;
  }
  
  if (key === 'theme_wallpaper') {
    const wpMap: Record<string, string> = {
      light: 'Light',
      sand: 'Sand',
      rose: 'Rose',
      slate: 'Slate',
      forest: 'Forest',
      dark: 'Dark',
    };
    return wpMap[valStr] || valStr;
  }

  if (key === 'background_image_mode') {
    const modeMap: Record<string, Record<string, string>> = {
      none: { ja: '無し', en: 'None' },
      dots: { ja: '水玉', en: 'Dots' },
      stripes: { ja: '斜線', en: 'Diagonal Stripes' },
      checks: { ja: 'チェック柄', en: 'Checkered' },
      image: { ja: '画像指定', en: 'Custom Image' },
    };
    return modeMap[valStr]?.[lang] || valStr;
  }

  if (key === 'background_image_data' || key === 'background_image_url' || key === 'background_image_filename') {
    return valStr ? (lang === 'en' ? 'Uploaded image' : 'アップロード画像') : (lang === 'en' ? 'None' : '無し');
  }

  if (key === 'background_image_layout') {
    const layoutMap: Record<string, Record<string, string>> = {
      tile: { ja: 'タイル', en: 'Tile' },
      original: { ja: '等倍', en: 'Original' },
      fit: { ja: 'フィッティング', en: 'Fit' },
    };
    return layoutMap[valStr]?.[lang] || valStr;
  }
  
  if (key === 'currency') {
    const curMap: Record<string, string> = {
      JPY: 'JPY (¥)',
      USD: 'USD ($)',
      EUR: 'EUR (€)',
    };
    return curMap[valStr] || valStr;
  }
  
  if (key === 'language') {
    const langMap: Record<string, Record<string, string>> = {
      ja: { ja: '日本語 (Japanese)', en: 'Japanese (日本語)' },
      en: { ja: '英語 (English)', en: 'English' }
    };
    return langMap[valStr]?.[lang] || valStr;
  }

  if (key === 'clear_delete_confirm_skips') {
    return lang === 'en' ? 'Clear' : 'クリアする';
  }

  if (key === 'send_key') {
    return valStr === 'enter' ? 'Enter' : valStr === 'shift_enter' ? 'Shift + Enter' : valStr;
  }

  if (key === 'llm_provider') {
    if (valStr === 'openai') {
      return lang === 'en' 
        ? 'OpenAI Compatible (LM Studio / OpenAI)' 
        : 'OpenAI 互換 (LM Studio / OpenAI)';
    }
    if (valStr === 'ollama') {
      return 'Ollama (Local LLM)';
    }
    if (valStr === 'openai_api') {
      return 'OpenAI API';
    }
  }

  return valStr;
};

export const PageChatDrawer = React.forwardRef<PageChatDrawerRef, PageChatDrawerProps>(({
  token,
  apiBase,
  onLogout,
  mode,
  language,
  sendKey,
  onExecuteSuccess,
  availableParts,
  availableProducts,
  messages,
  setMessages
}, ref) => {
  const [input, setInput] = useState('');
  const [systemCurrency, setSystemCurrency] = useState('JPY');
  const [isOpen, setIsOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executingMessageId, setExecutingMessageId] = useState<string | null>(null);
  const isOpenRef = useRef(isOpen);
  const isInputFocusedRef = useRef(isInputFocused);
  const purchaseYearOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => String(currentYear - index));
  }, []);

  const cat1List = React.useMemo(() => 
    Array.from(new Set(availableParts?.map((p) => p.category1).filter(Boolean))) as string[]
  , [availableParts]);

  const withCurrentOption = (options: string[], current?: string | null) => {
    const trimmed = current?.trim();
    if (!trimmed || options.includes(trimmed)) return options;
    return [...options, trimmed];
  };

  const getCat2Options = (category1?: string | null) =>
    Array.from(new Set(
      (availableParts || [])
        .filter((p) => !category1 || p.category1 === category1)
        .map((p) => p.category2)
        .filter(Boolean)
    )) as string[];

  const getCat3Options = (category1?: string | null, category2?: string | null) =>
    Array.from(new Set(
      (availableParts || [])
        .filter((p) => 
          (!category1 || p.category1 === category1) && 
          (!category2 || p.category2 === category2)
        )
        .map((p) => p.category3)
        .filter(Boolean)
    )) as string[];

  const findExactPart = (category1?: string | null, category2?: string | null, category3?: string | null) => {
    const normalize = (value?: string | null) => (value || '').trim().toLowerCase();
    const matches = (availableParts || []).filter((part) =>
      normalize(part.category1) === normalize(category1) &&
      normalize(part.category2) === normalize(category2) &&
      normalize(part.category3) === normalize(category3)
    );
    return matches.length === 1 ? matches[0] : null;
  };

  const buildPartEditItem = (
    part: Part | PartPreviewItem | null,
    categories: { category1?: string | null; category2?: string | null; category3?: string | null } = {},
  ): PartPreviewItem => {
    if (!part) {
      return {
        part_id: null,
        category1: categories.category1 || '',
        category2: categories.category2 || '',
        category3: categories.category3 || '',
        quantity: 0,
        unit: 'pcs',
        purchase_price: 0,
        currency: systemCurrency,
        purchase_date: '',
        alert_threshold: 0,
        isTotalInput: false,
        purchaseQuantity: '',
        tempTotalCost: undefined,
        tempUnitPrice: 0,
        inputCurrency: systemCurrency,
        exchangeRate: 1.0,
      };
    }

    // `part` may be a full Part (from the parts list) or a partially-filled
    // PartPreviewItem (from an in-progress LLM analysis result); read fields loosely.
    const p = part as Part & PartPreviewItem & { id?: number };
    const rateToJpy: Record<string, number> = { JPY: 1, USD: 155, EUR: 165 };
    const originalCurrency = p.original_currency || p.currency || systemCurrency;
    const exchangeRateForDisplay = originalCurrency === systemCurrency
      ? 1.0
      : p.exchange_rate
        ? Number(p.exchange_rate) / (rateToJpy[systemCurrency] ?? 1)
        : 1.0;

    return {
      part_id: p.id ?? p.part_id,
      category1: p.category1 || '',
      category2: p.category2 || '',
      category3: p.category3 || '',
      quantity: p.quantity ?? 0,
      unit: p.unit || 'pcs',
      purchase_price: p.purchase_price ?? 0,
      currency: p.currency || systemCurrency,
      purchase_date: p.purchase_date || '',
      alert_threshold: p.alert_threshold ?? 0,
      isTotalInput: p.price_input_type === 'total',
      purchaseQuantity: p.purchase_quantity ?? p.quantity ?? '',
      tempTotalCost: p.original_total_price ?? undefined,
      tempUnitPrice: p.original_unit_price ?? p.purchase_price ?? 0,
      inputCurrency: originalCurrency,
      exchangeRate: exchangeRateForDisplay,
    };
  };

  const getRecipePartId = (part: RecipePartItem) => {
    const currentId = Number(part?.part_id ?? (part as { id?: number })?.id);
    if (Number.isFinite(currentId) && currentId > 0) return currentId;

    const partName = (part?.part_name || (part as { name?: string })?.name || '').trim();
    if (!partName) return null;

    const matchedPart = (availableParts || []).find((availablePart) => availablePart.name === partName);
    return matchedPart?.id ?? null;
  };

  const mergeRecipeParts = (parts: RecipePartItem[] = []) => {
    const mergedParts = new Map<number, RecipePartItem>();

    parts.forEach((part) => {
      const partId = getRecipePartId(part);
      if (!partId) return;
      const matchedPart = (availableParts || []).find((availablePart) => availablePart.id === partId);
      const quantity = Number(part.quantity) || 1;
      const currentPart = mergedParts.get(partId);
      if (currentPart) {
        mergedParts.set(partId, {
          ...currentPart,
          quantity: (currentPart.quantity || 0) + quantity,
        });
        return;
      }

      mergedParts.set(partId, {
        ...part,
        part_id: partId,
        part_name: matchedPart?.name || part.part_name || (part as { name?: string }).name || '',
        quantity,
      });
    });

    return Array.from(mergedParts.values());
  };

  const keepResolvedRecipeParts = (parts: RecipePartItem[] = []) => mergeRecipeParts(parts);

  const formatApiError = (detail: unknown): string => {
    if (!detail) return 'Execution failed.';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((entry) => {
        if (entry && typeof entry === 'object') {
          const entryObj = entry as { loc?: unknown; msg?: unknown };
          const location = Array.isArray(entryObj.loc) ? entryObj.loc.join('.') : '';
          const message = entryObj.msg || JSON.stringify(entry);
          return location ? `${location}: ${message}` : message;
        }
        return String(entry);
      }).join('\n');
    }
    if (typeof detail === 'object') return JSON.stringify(detail);
    return String(detail);
  };

  const normalizeCategoryState = (item: any, details: any) => {
    const next = { ...item, ...details };

    if (details.isCat1Manual === true && !item.isCat1Manual) {
      return {
        ...next,
        category1: '',
        category2: '',
        category3: '',
        isCat1Manual: true,
        isCat2Manual: true,
        isCat3Manual: true,
      };
    }

    if (details.isCat2Manual === true && !item.isCat2Manual) {
      return {
        ...next,
        category2: '',
        category3: '',
        isCat2Manual: true,
        isCat3Manual: true,
      };
    }

    if (details.isCat3Manual === true && !item.isCat3Manual) {
      return {
        ...next,
        category3: '',
        isCat3Manual: true,
      };
    }

    if (next.isCat1Manual && 'category1' in details) {
      return {
        ...next,
        isCat2Manual: true,
        isCat3Manual: true,
      };
    }

    if (next.isCat2Manual && 'category2' in details) {
      return {
        ...next,
        isCat3Manual: true,
      };
    }

    if (next.isCat3Manual && 'category3' in details) {
      return next;
    }

    if ('category1' in details && !next.category1) {
      return {
        ...next,
        category2: '',
        category3: '',
        isCat1Manual: false,
        isCat2Manual: false,
        isCat3Manual: false,
      };
    }

    if ('category2' in details && !next.category2) {
      return {
        ...next,
        category3: '',
        isCat2Manual: false,
        isCat3Manual: false,
      };
    }

    if ('category1' in details) {
      next.isCat1Manual = false;
      const cat2Options = getCat2Options(next.category1);
      if (!next.category2 || !cat2Options.includes(next.category2)) {
        next.category2 = '';
        next.category3 = '';
        next.isCat2Manual = false;
        next.isCat3Manual = false;
        return next;
      }

      const cat3Options = getCat3Options(next.category1, next.category2);
      if (!next.category3 || !cat3Options.includes(next.category3)) {
        next.category3 = '';
        next.isCat3Manual = false;
      }
      return next;
    }

    if ('category2' in details) {
      next.isCat2Manual = false;
      const cat3Options = getCat3Options(next.category1, next.category2);
      if (!next.category3 || !cat3Options.includes(next.category3)) {
        next.category3 = '';
        next.isCat3Manual = false;
      }
      return next;
    }

    if ('category3' in details) {
      next.isCat3Manual = false;
    }

    return next;
  };

  const getProductConsumedParts = (items: ProductConsumeItem[] = []) => {
    const totals = new Map<string, { part_name: string; quantity: number; unit: string }>();

    items.forEach((item) => {
      const productCount = Number(item.product_count) || 0;
      ((item.parts || []) as RecipePartItem[]).forEach((part) => {
        const partObj = part as RecipePartItem & { part?: { name?: string; unit?: string } };
        const partName = partObj.part_name || partObj.part?.name || '';
        if (!partName) return;
        const unit = partObj.unit || partObj.part?.unit || 'pcs';
        const key = `${partObj.part_id || partName}-${unit}`;
        const current = totals.get(key) || { part_name: partName, quantity: 0, unit };
        current.quantity += (Number(partObj.quantity) || 0) * productCount;
        totals.set(key, current);
      });
    });

    return Array.from(totals.values());
  };

  React.useImperativeHandle(ref, () => ({
    openWithNewPart() {
      setIsOpen(true);
      const userMsgId = Date.now().toString();
      const aiMsgId = (Date.now() + 1).toString();
      
      const userMessage: Message = {
        id: userMsgId,
        sender: 'user',
        text: t('chat_new_part_registration'),
        hideInInputHistory: true,
      };

      const aiMessage: Message = {
        id: aiMsgId,
        sender: 'ai',
        text: t('chat_new_part_prompt'),
        previewData: {
          type: 'parts',
          action: 'add',
          items: [
            {
              category1: '',
              category2: '',
              category3: '',
              quantity: 1,
              unit: 'pcs',
              purchase_price: 0,
              currency: systemCurrency,
              purchase_date: '',
              isTotalInput: false,
              tempUnitPrice: 0,
              inputCurrency: systemCurrency,
              exchangeRate: 1.0
            }
          ]
        },
        isExecuted: false,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
    },
    openWithNewProduct() {
      setIsOpen(true);
      const userMsgId = Date.now().toString();
      const aiMsgId = (Date.now() + 1).toString();
      
      const userMessage: Message = {
        id: userMsgId,
        sender: 'user',
        text: t('chat_new_product_registration'),
        hideInInputHistory: true,
      };

      const aiMessage: Message = {
        id: aiMsgId,
        sender: 'ai',
        text: t('chat_new_product_prompt'),
        previewData: {
          type: 'product_recipe',
          action: 'create',
          product_name: '',
          description: '',
          parts: []
        },
        isExecuted: false,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
    },
    openWithEditPart(part: Part) {
      setIsOpen(true);
      const userMsgId = Date.now().toString();
      const aiMsgId = (Date.now() + 1).toString();
      
      const userMessage: Message = {
        id: userMsgId,
        sender: 'user',
        text: t('chat_edit_part_title', { name: part.name }),
        hideInInputHistory: true,
      };

      const aiMessage: Message = {
        id: aiMsgId,
        sender: 'ai',
        text: t('chat_edit_part_prompt'),
        previewData: {
          type: 'parts_edit',
          action: 'edit',
          items: [buildPartEditItem(part)]
        },
        isExecuted: false,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
    },
    openWithEditProduct(product: Product) {
      setIsOpen(true);
      const userMsgId = Date.now().toString();
      const aiMsgId = (Date.now() + 1).toString();
      
      const userMessage: Message = {
        id: userMsgId,
        sender: 'user',
        text: t('chat_edit_product_title', { name: product.name }),
        hideInInputHistory: true,
      };

      const aiMessage: Message = {
        id: aiMsgId,
        sender: 'ai',
        text: t('chat_edit_product_prompt'),
        previewData: {
          type: 'product_recipe_edit',
          product_id: product.id,
          product_name: product.name,
          description: product.description || '',
          parts: product.parts.map((pp) => ({
            part_id: pp.part_id,
            part_name: pp.part?.name || '',
            quantity: pp.quantity
          }))
        },
        isExecuted: false,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
    },
    openWithConsumeProduct(product: Product, count: number) {
      setIsOpen(true);
      const productCount = count > 0 ? count : 1;
      const userMsgId = Date.now().toString();
      const aiMsgId = (Date.now() + 1).toString();
      
      const userMessage: Message = {
        id: userMsgId,
        sender: 'user',
        text: t('chat_assemble_count_title', { name: product.name, count: productCount }),
        hideInInputHistory: true,
      };

      const aiMessage: Message = {
        id: aiMsgId,
        sender: 'ai',
        text: t('chat_assemble_detected_prompt', { name: product.name }),
        previewData: {
          type: 'product',
          action: 'consume',
          product_id: product.id,
          product_name: product.name,
          items: [
            {
              product_id: product.id,
              product_name: product.name,
              product_count: productCount,
              parts: getProductPreviewParts(product),
            }
          ]
        },
        isExecuted: false,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
    }
  }));

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
    if (isOpen) {
      fetchSettings();
    }
  }, [token, apiBase, isOpen]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [tempInput, setTempInput] = useState<string>('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    suppressQuickActionClickTimerRef,
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
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    isInputFocusedRef.current = isInputFocused;
  }, [isInputFocused]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const messagesArea = messagesAreaRef.current;
    if (messagesArea) {
      messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const scrollToBottomAfterLayout = () => {
    window.requestAnimationFrame(() => scrollToBottom('auto'));
    window.setTimeout(() => scrollToBottom('auto'), 120);
    window.setTimeout(() => scrollToBottom('auto'), 320);
  };

  useEffect(() => {
    return () => {
      if (suppressQuickActionClickTimerRef.current) {
        window.clearTimeout(suppressQuickActionClickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateKeyboardOffset = () => {
      const viewport = window.visualViewport;
      const keyboardOffset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      document.documentElement.style.setProperty('--mobile-keyboard-offset', `${keyboardOffset}px`);
      if (isOpenRef.current && isInputFocusedRef.current) {
        scrollToBottomAfterLayout();
      }
    };

    updateKeyboardOffset();
    window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);
    window.addEventListener('resize', updateKeyboardOffset);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardOffset);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardOffset);
      window.removeEventListener('resize', updateKeyboardOffset);
      document.documentElement.style.setProperty('--mobile-keyboard-offset', '0px');
    };
  }, []);

  const quickActionBaseByMode = {
    parts: [
      t('qa_adjust_stock'), t('qa_change_unit_price'), t('qa_add_10'),
      t('qa_consume_1'), t('qa_set_purchase_date'), t('qa_change_category'),
    ],
    products: [
      t('qa_register_product'), t('qa_update_recipe'), t('qa_assemble_product'),
      t('qa_assemble_1'), t('qa_check_cost'),
    ],
    settings: [
      t('qa_change_theme'), t('qa_change_wallpaper'), t('qa_change_currency'),
      t('qa_change_model'), t('qa_change_send_key'), t('qa_switch_to_japanese'),
    ],
  };
  const activeCategories = Array.from(new Set(
    (availableParts || [])
      .flatMap((part) => [part.category1, part.category2, part.category3])
      .filter((category): category is string => Boolean(category))
  )).slice(0, 10);
  const activePartNames = Array.from(new Set((availableParts || []).map((part) => part.name).filter(Boolean))).slice(0, 8);
  const activeProductNames = Array.from(new Set((availableProducts || []).map((product) => product.name).filter(Boolean))).slice(0, 8);
  const quickActions = Array.from(new Set([
    ...quickActionBaseByMode[mode],
    ...(mode === 'parts' ? [...activeCategories, ...activePartNames] : []),
    ...(mode === 'products' ? [...activeProductNames, ...activePartNames] : []),
  ]));
  const shouldShowQuickActions = isOpen && isInputFocused && quickActions.length > 0;

  // Auto-resize textarea heights
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    setHistoryIndex(-1);
    setTempInput('');

    const userText = input;
    setInput('');
    setIsOpen(true);

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: userText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/chat/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: userText, mode }),
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(t('error') + ': AI analysis failed');
      }

      const res = await response.json();
      const isPartEdit = res.type === 'parts' && res.action === 'edit';

      if (res.type === 'parts' && res.items) {
        res.items = res.items.map((item: any) => {
          if (isPartEdit) {
            return buildPartEditItem(
              item.part_id ? item : null,
              {
                category1: item.category1,
                category2: item.category2,
                category3: item.category3,
              },
            );
          }

          const matchedPart = availableParts?.find((part) => part.id === item.part_id);
          const isTotalInput = item.total_price !== null && item.total_price !== undefined && item.total_price > 0;
          const inputCurrency = item.currency || systemCurrency;
          const pDate = item.purchase_date ? normalizeDate(item.purchase_date) : null;
          const isForeign = inputCurrency !== systemCurrency;
          const purchaseQuantity = res.action === 'price'
            ? matchedPart?.purchase_quantity ?? ''
            : item.quantity;

          let defaultRate = 1.0;
          if (inputCurrency === 'USD' && systemCurrency === 'JPY') defaultRate = 155;
          else if (inputCurrency === 'EUR' && systemCurrency === 'JPY') defaultRate = 165;
          else if (inputCurrency === 'JPY' && systemCurrency === 'USD') defaultRate = 1 / 155;
          else if (inputCurrency === 'JPY' && systemCurrency === 'EUR') defaultRate = 1 / 165;

          const tempTotalCost = isTotalInput ? item.total_price : undefined;
          const tempUnitPrice = isTotalInput ? undefined : item.purchase_price;

          let initialPurchasePrice: number;
          if (isTotalInput) {
            const qty = purchaseQuantity || 1;
            initialPurchasePrice = Number(((item.total_price * defaultRate) / qty).toFixed(4));
          } else {
            initialPurchasePrice = Number((item.purchase_price * defaultRate).toFixed(4));
          }

          return {
            ...item,
            isTotalInput,
            tempTotalCost,
            tempUnitPrice,
            purchaseQuantity,
            inputCurrency,
            exchangeRate: isForeign ? defaultRate : 1.0,
            purchase_price: initialPurchasePrice,
            purchase_date: pDate,
          };
        });
      }

      let aiText = '';
      if (res.type === 'parts') {
        if (res.action === 'edit') {
          const found = res.items?.some((item: any) => item.part_id);
          aiText = found
            ? t('chat_parts_edit_detected')
            : t('chat_parts_edit_not_found');
        } else {
          const actStr = res.action === 'add' ? t('chat_action_short_add') : res.action === 'consume' ? t('chat_action_short_consume') : t('chat_action_short_price');
          aiText = t('chat_stock_adjust_detected', { action: actStr });
        }
      } else if (res.type === 'product_recipe') {
        res.parts = keepResolvedRecipeParts(res.parts);
        const actStr = res.action === 'create' ? t('chat_action_create') : t('chat_action_update_recipe');
        aiText = t('chat_product_recipe_detected', { name: res.product_name, action: actStr });
      } else if (res.type === 'product') {
        const productNames = (res.items || [])
          .map((item: any) => `「${item.product_name}」`)
          .join('、');
        aiText = productNames
          ? t('chat_product_assembly_detected', { names: productNames })
          : t('chat_product_assembly_generic_detected');
      } else if (res.type === 'settings') {
        const blockedSettingKeys = ['background_image_data', 'background_image_url', 'background_image_filename', 'openai_api_key'];
        blockedSettingKeys.forEach((key) => {
          delete res.updates?.[key];
        });
        if (Object.keys(res.updates || {}).length === 0) {
          res.type = 'message';
          aiText = t('chat_background_image_settings_only');
        } else {
          aiText = t('chat_settings_change_detected');
        }
      } else if (res.type === 'message') {
        aiText = res.message || '';
      } else {
        aiText = t('chat_could_not_interpret');
      }

      if (isPartEdit) {
        res.type = 'parts_edit';
      }

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: aiText,
        previewData: res.type && res.type !== 'message' ? res : null,
        isExecuted: false,
      };

      setMessages((prev) => [...prev, aiMessage]);

      if (res.type === 'parts' && res.items) {
        res.items.forEach((item: any, idx: number) => {
          const isForeign = item.inputCurrency && item.inputCurrency !== systemCurrency;
          if (isForeign) {
            fetchRateAndApply(
              aiMessage.id,
              idx,
              item.inputCurrency,
              systemCurrency,
              item.purchase_date || 'latest',
              item.purchaseQuantity || item.quantity || 1,
              !!item.isTotalInput
            );
          }
        });
      }
    } catch (err) {
      const systemMessage: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'system',
        text: (err instanceof Error && err.message) || 'Error occurred connecting to the backend.',
      };
      setMessages((prev) => [...prev, systemMessage]);
    } finally {
      setLoading(false);
    }
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
              if (m.id !== msgId || !m.previewData || (m.previewData.type !== 'parts' && m.previewData.type !== 'parts_edit')) return m;
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
        if (m.id !== msgId || !m.previewData || (m.previewData.type !== 'parts' && m.previewData.type !== 'parts_edit')) return m;
        const updatedItems = [...(m.previewData.items || [])] as any[];
        let item = normalizeCategoryState(updatedItems[itemIdx], details);
        const isEdit = m.previewData.type === 'parts_edit';
        const isPriceUpdate = m.previewData.action === 'price';
        const categoryChanged = ['category1', 'category2', 'category3'].some((key) => key in details);

        if (isEdit && categoryChanged) {
          const matchedPart = findExactPart(item.category1, item.category2, item.category3);
          const categoryState = {
            category1: item.category1,
            category2: item.category2,
            category3: item.category3,
            isCat1Manual: item.isCat1Manual,
            isCat2Manual: item.isCat2Manual,
            isCat3Manual: item.isCat3Manual,
          };
          item = {
            ...buildPartEditItem(matchedPart, categoryState),
            ...categoryState,
          };
        }

        if ('purchase_date' in details && details.purchase_date) {
          item.purchase_date = normalizeDate(details.purchase_date);
        }

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
              if ((isEdit || isPriceUpdate) && !item.purchaseQuantity) {
                item.purchaseQuantity = isEdit ? item.quantity : '';
              }
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
        const qty = isEdit || isPriceUpdate
          ? (item.purchaseQuantity ?? item.quantity ?? 1)
          : (item.quantity ?? 1);
        const rate = isForeign && item.exchangeRate ? item.exchangeRate : 1.0;

        // Keep tempUnitPrice/tempTotalCost updated if manual changes occur
        if ('purchase_price' in details && !item.isTotalInput && !isForeign) {
          item.tempUnitPrice = details.purchase_price;
        }

        if (item.isTotalInput) {
          if ('tempTotalCost' in details || 'quantity' in details || 'purchaseQuantity' in details || 'isTotalInput' in details || 'exchangeRate' in details) {
            const total = Number(item.tempTotalCost ?? 0) || 0;
            const unitPrice = qty > 0 ? ((total * rate) / qty) : 0;
            item.purchase_price = Number(unitPrice.toFixed(4));
          }
        } else {
          if ('tempUnitPrice' in details || 'purchase_price' in details || 'quantity' in details || 'isTotalInput' in details || 'exchangeRate' in details) {
            const basePrice = Number(item.tempUnitPrice ?? item.purchase_price ?? 0) || 0;
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

  const handleUpdatePreviewItemQty = (msgId: string, itemIdx: number, newQty: number) => {
    if (newQty < 0) return;
    handleUpdatePreviewItemDetails(msgId, itemIdx, { quantity: newQty });
  };

  const handleUpdateProductConsumeCount = (msgId: string, itemIdx: number, newCount: number) => {
    if (newCount < 0) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.previewData || m.previewData.type !== 'product') return m;
        const updatedItems = [...(m.previewData.items || [])];
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], product_count: newCount };
        return { ...m, previewData: { ...m.previewData, items: updatedItems } };
      })
    );
  };

  const handleUpdateProductConsumeSelection = (msgId: string, itemIdx: number, productId: number) => {
    const selectedProduct = (availableProducts || []).find((product) => product.id === productId);
    if (!selectedProduct) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.previewData || m.previewData.type !== 'product') return m;
        const updatedItems = [...(m.previewData.items || [])];
        const currentItem = updatedItems[itemIdx] || {};
        updatedItems[itemIdx] = {
          ...currentItem,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          parts: getProductPreviewParts(selectedProduct),
        };
        return {
          ...m,
          previewData: {
            ...m.previewData,
            items: updatedItems,
            product_id: itemIdx === 0 ? selectedProduct.id : m.previewData.product_id,
            product_name: itemIdx === 0 ? selectedProduct.name : m.previewData.product_name,
          },
        };
      })
    );
  };

  const handleUpdatePurchaseDatePart = (
    msgId: string,
    itemIdx: number,
    item: any,
    field: 'purchaseYear' | 'purchaseMonth' | 'purchaseDay',
    value: string,
  ) => {
    const current = getDateParts(item.purchase_date);
    const year = field === 'purchaseYear' ? value : (item.purchaseYear ?? current.year);
    const month = field === 'purchaseMonth' ? value : (item.purchaseMonth ?? current.month);
    let day = field === 'purchaseDay' ? value : (item.purchaseDay ?? current.day);
    const maxDay = getDaysInMonth(year, month);
    if (day && Number(day) > maxDay) {
      day = String(maxDay).padStart(2, '0');
    }
    const purchaseDate = year && month && day ? `${year}-${month}-${day}` : '';
    handleUpdatePreviewItemDetails(msgId, itemIdx, {
      purchaseYear: year,
      purchaseMonth: month,
      purchaseDay: day,
      purchase_date: purchaseDate,
    });

    const currentCurrency = item.inputCurrency || item.currency || systemCurrency;
    if (purchaseDate && currentCurrency !== systemCurrency) {
      fetchRateAndApply(
        msgId,
        itemIdx,
        currentCurrency,
        systemCurrency,
        purchaseDate,
        item.purchaseQuantity || item.quantity || 1,
        !!item.isTotalInput,
      );
    }
  };

  const handleExecute = async (msgId: string, previewData: PreviewData) => {
    if (executingMessageId) return;
    // Validation check for empty inputs before submitting to backend
    if (previewData.type === 'parts') {
      const hasEmptyParts = previewData.items?.some((item: any) => !item.category1?.trim());
      if (hasEmptyParts) {
        const systemMessage: Message = {
          id: Date.now().toString(),
          sender: 'system',
          text: t('chat_part_required_add_cancelled'),
        };
        setMessages((prev) => [...prev, systemMessage]);
        return;
      }
    } else if (previewData.type === 'parts_edit') {
      const item = previewData.items?.[0] as PartPreviewItem | undefined;
      if (!item || !item.category1?.trim()) {
        const systemMessage: Message = {
          id: Date.now().toString(),
          sender: 'system',
          text: t('chat_part_required_edit_cancelled'),
        };
        setMessages((prev) => [...prev, systemMessage]);
        return;
      }
    } else if (previewData.type === 'product_recipe') {
      if (!previewData.product_name?.trim()) {
        const systemMessage: Message = {
          id: Date.now().toString(),
          sender: 'system',
          text: t('chat_product_name_required_add_cancelled'),
        };
        setMessages((prev) => [...prev, systemMessage]);
        return;
      }
    } else if (previewData.type === 'product_recipe_edit') {
      if (!previewData.product_name?.trim()) {
        const systemMessage: Message = {
          id: Date.now().toString(),
          sender: 'system',
          text: t('chat_product_name_required_edit_cancelled'),
        };
        setMessages((prev) => [...prev, systemMessage]);
        return;
      }
    } else if (previewData.type === 'product') {
      const invalidItem = previewData.items?.some((item: any) =>
        !item.product_name?.trim() || !Number.isFinite(Number(item.product_count)) || Number(item.product_count) < 0
      );
      if (!previewData.items?.length || invalidItem) {
        const systemMessage: Message = {
          id: Date.now().toString(),
          sender: 'system',
          text: t('chat_product_consume_invalid'),
        };
        setMessages((prev) => [...prev, systemMessage]);
        return;
      }
    }

    setExecutingMessageId(msgId);
    try {
      let response;
      if (previewData.type === 'parts_edit') {
        const item = (previewData.items || [])[0] as any;
        const generatedName = [item.category2, item.category3, item.category1]
          .map(c => c ? c.trim() : '')
          .filter(Boolean)
          .join(' ');
        const rateToJpy: Record<string, number> = { JPY: 1, USD: 155, EUR: 165 };
        const originalCurrency = item.inputCurrency || item.currency || systemCurrency;
        const exchangeRateToJpy = originalCurrency === 'JPY'
          ? 1.0
          : systemCurrency === 'JPY'
            ? Number(item.exchangeRate ?? 1.0)
            : Number(item.exchangeRate ?? 1.0) * (rateToJpy[systemCurrency] ?? 1);

        const payload = {
          name: generatedName,
          category1: item.category1?.trim() || null,
          category2: item.category2?.trim() || null,
          category3: item.category3?.trim() || null,
          quantity: Number(item.quantity),
          unit: item.unit,
          purchase_price: Number(item.purchase_price),
          currency: item.currency,
          purchase_date: item.purchase_date || null,
          price_input_type: item.isTotalInput ? 'total' : 'unit',
          purchase_quantity: item.purchaseQuantity === '' || item.purchaseQuantity == null
            ? null
            : Number(item.purchaseQuantity),
          original_unit_price: item.isTotalInput ? null : Number(item.tempUnitPrice ?? item.purchase_price ?? 0),
          original_total_price: item.isTotalInput ? Number(item.tempTotalCost ?? 0) : null,
          original_currency: originalCurrency,
          exchange_rate: exchangeRateToJpy,
          alert_threshold: Number(item.alert_threshold),
        };

        response = await fetch(item.part_id ? `${apiBase}/api/parts/${item.part_id}` : `${apiBase}/api/parts`, {
          method: item.part_id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else if (previewData.type === 'product_recipe_edit') {
        const resolvedRecipeParts = (previewData.parts || []).map((p: any) => ({
          ...p,
          part_id: getRecipePartId(p),
        }));
        const unresolvedPart = resolvedRecipeParts.find((p: any) => !p.part_id);
        if (unresolvedPart) {
          throw new Error(
            t('chat_unresolved_part_error', { name: unresolvedPart.part_name || unresolvedPart.name || '' })
          );
        }
        const recipeParts = mergeRecipeParts(resolvedRecipeParts);

        const payload = {
          name: previewData.product_name,
          description: previewData.description ?? '',
          parts: recipeParts.map((p: any) => ({
            part_id: p.part_id,
            quantity: Number(p.quantity) || 1
          }))
        };

        response = await fetch(`${apiBase}/api/products/${previewData.product_id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } else if (previewData.type === 'settings') {
        // clear_delete_confirm_skips is a client-side only virtual key (localStorage)
        const updates = { ...(previewData.updates || {}) };
        if (String(updates.clear_delete_confirm_skips) === 'true') {
          clearDeleteConfirmSkips();
        }
        delete updates.clear_delete_confirm_skips;
        if (Object.keys(updates).length > 0) {
          response = await fetch(`${apiBase}/api/chat/execute`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ ...previewData, updates }),
          });
        }
      } else {
        response = await fetch(`${apiBase}/api/chat/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(previewData),
        });
      }

      if (response && response.status === 401) {
        onLogout();
        return;
      }

      if (response && !response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          errData = { detail: response.statusText };
        }
        throw new Error(formatApiError(errData.detail || errData));
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, isExecuted: true } : m))
      );

      const systemMessage: Message = {
        id: Date.now().toString(),
        sender: 'system',
        text: t('chat_applied_to_db'),
      };
      setMessages((prev) => [...prev, systemMessage]);

      // Trigger list update on the parent page
      if (onExecuteSuccess) {
        onExecuteSuccess();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setExecutingMessageId(null);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <div className={`page-chat-drawer-wrapper ${isOpen ? 'drawer-expanded' : 'drawer-collapsed'}`}>
      
      {/* 1. Backdrop overlay */}
      {isOpen && <div className="drawer-backdrop" onClick={handleClose} />}
      {isOpen && (
        <button
          type="button"
          className="drawer-mobile-close-btn"
          onClick={handleClose}
          title={t('chat_close')}
          aria-label={t('chat_close')}
        >
          <X size={14} />
        </button>
      )}

      {/* 2. Main Chat Panel */}
      <div className="drawer-panel glass-card">
        
        {/* Messages list area */}
        <div className="drawer-messages-area" ref={messagesAreaRef}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isSystem = msg.sender === 'system';

            return (
              <div key={msg.id} className={`chat-bubble-row ${isUser ? 'user-row' : isSystem ? 'system-row' : 'ai-row'}`}>
                <div className={`chat-bubble ${msg.previewData ? 'chat-bubble-with-preview' : ''}`} style={{ position: 'relative' }}>
                  {msg.previewData && !msg.isExecuted && (
                    <button
                      type="button"
                      onClick={() => {
                        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                      }}
                      style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '-10px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                        transition: 'color 0.2s, background-color 0.2s, transform 0.2s',
                        zIndex: 10
                      }}
                      className="preview-close-btn"
                      title={t('chat_remove_message')}
                      aria-label={t('chat_remove_message')}
                    >
                      <X size={12} />
                    </button>
                  )}
                  <div className="bubble-text">{msg.text}</div>
                  
                  {/* Dynamic Confirmation Form Card */}
                  {msg.previewData && (
                    <div className="chat-preview-card glass-card" style={{ marginTop: '0.75rem', padding: '0.75rem' }}>
                      
                      {/* Parts Preview */}
                      {(msg.previewData.type === 'parts' || msg.previewData.type === 'parts_edit') && (
                        <div>
                           {msg.previewData.items?.map((item: any, idx: number) => {
                             const cat1Options = withCurrentOption(cat1List, item.category1);
                             const filteredCat2List = withCurrentOption(getCat2Options(item.category1), item.category2);
                             const filteredCat3List = withCurrentOption(getCat3Options(item.category1, item.category2), item.category3);
                             const purchaseDateParts = getDateParts(item.purchase_date);
                             const purchaseYear = item.purchaseYear ?? purchaseDateParts.year;
                             const purchaseMonth = item.purchaseMonth ?? purchaseDateParts.month;
                             const purchaseDay = item.purchaseDay ?? purchaseDateParts.day;
                             const isPurchaseYearManual = item.isPurchaseYearManual
                               ?? (!!purchaseYear && !purchaseYearOptions.includes(purchaseYear));
                             const purchaseDayCount = getDaysInMonth(purchaseYear, purchaseMonth);

                             return (
                               <div key={idx} style={{ fontSize: '0.85rem', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                              {!msg.isExecuted ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                                  <div className="preview-category-grid">
                                    {/* 種類 (カテゴリ1) */}
                                    {(() => {
                                      const isCat1Manual = item.isCat1Manual !== undefined 
                                        ? item.isCat1Manual 
                                        : false;
                                      return isCat1Manual ? (
                                        <div className="preview-category-field">
                                          <input
                                            type="text"
                                            placeholder={t('chat_type')}
                                            className="input-control preview-category-control"
                                            style={{ flex: 1 }}
                                            value={item.category1 || ''}
                                            onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { category1: e.target.value, isCat1Manual: true })}
                                          />
                                          <select
                                            className="input-control preview-category-switch"
                                            value=""
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (!val) return;
                                              handleUpdatePreviewItemDetails(msg.id, idx, { category1: val, isCat1Manual: false });
                                            }}
                                            title={t('chat_select_from_list')}
                                          >
                                            <option value="">▼</option>
                                            {cat1Options.map((c) => (
                                              <option key={c} value={c}>{c}</option>
                                            ))}
                                          </select>
                                        </div>
                                      ) : (
                                        <div className="preview-category-field">
                                          <select
                                            id={`select-cat1-${msg.id}-${idx}`}
                                            className="input-control preview-category-control"
                                            style={{ flex: 1 }}
                                            value={item.category1 || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (val === '__manual__') {
                                                handleUpdatePreviewItemDetails(msg.id, idx, { isCat1Manual: true, category1: '' });
                                              } else {
                                                handleUpdatePreviewItemDetails(msg.id, idx, { category1: val, isCat1Manual: false });
                                              }
                                            }}
                                          >
                                            <option value="">{t('chat_type_dash')}</option>
                                            <option value="__manual__" style={{ fontStyle: 'italic', color: 'var(--accent-primary)' }}>
                                              {t('chat_input_manually')}
                                            </option>
                                            {cat1Options.map((c) => (
                                              <option key={c} value={c}>{c}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })()}

                                    {/* 規格 (カテゴリ2) */}
                                    {(() => {
                                      const isCat1Manual = item.isCat1Manual !== undefined 
                                        ? item.isCat1Manual 
                                        : false;
                                      const isCat2Manual = item.isCat2Manual !== undefined
                                        ? item.isCat2Manual
                                        : false;
                                      return isCat2Manual ? (
                                        <div className="preview-category-field">
                                          <input
                                            type="text"
                                            placeholder={t('chat_spec')}
                                            className="input-control preview-category-control"
                                            style={{ flex: 1 }}
                                            value={item.category2 || ''}
                                            onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { category2: e.target.value, isCat2Manual: true })}
                                          />
                                            {!( !item.category1 || isCat1Manual ) && (
                                              <select
                                                className="input-control preview-category-switch"
                                                value=""
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  if (!val) return;
                                                  handleUpdatePreviewItemDetails(msg.id, idx, { category2: val, isCat2Manual: false });
                                                }}
                                                title={t('chat_select_from_list')}
                                              >
                                                <option value="">▼</option>
                                                {filteredCat2List.map((c) => (
                                                  <option key={c} value={c}>{c}</option>
                                                ))}
                                              </select>
                                            )}
                                        </div>
                                      ) : (
                                        <div className="preview-category-field">
                                          <select
                                            id={`select-cat2-${msg.id}-${idx}`}
                                            className="input-control preview-category-control"
                                            style={{ flex: 1 }}
                                            value={item.category2 || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (val === '__manual__') {
                                                handleUpdatePreviewItemDetails(msg.id, idx, {
                                                  isCat2Manual: true,
                                                  category2: '',
                                                  isCat3Manual: true,
                                                  category3: '',
                                                });
                                              } else {
                                                handleUpdatePreviewItemDetails(msg.id, idx, { category2: val, isCat2Manual: false });
                                              }
                                            }}
                                          >
                                            <option value="">{t('chat_spec_dash')}</option>
                                            <option value="__manual__" style={{ fontStyle: 'italic', color: 'var(--accent-primary)' }}>
                                              {t('chat_input_manually')}
                                            </option>
                                            {filteredCat2List.map((c) => (
                                              <option key={c} value={c}>{c}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })()}

                                    {/* サイズ (カテゴリ3) */}
                                    {(() => {
                                       const isCat2Manual = item.isCat2Manual !== undefined 
                                         ? item.isCat2Manual 
                                         : false;
                                       const isCat3Manual = item.isCat3Manual !== undefined
                                         ? item.isCat3Manual
                                         : false;
                                      return isCat3Manual ? (
                                        <div className="preview-category-field">
                                          <input
                                            type="text"
                                            placeholder={t('chat_size')}
                                            className="input-control preview-category-control"
                                            style={{ flex: 1 }}
                                            value={item.category3 || ''}
                                            onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { category3: e.target.value, isCat3Manual: true })}
                                          />
                                            {!( !item.category2 || isCat2Manual ) && (
                                              <select
                                                className="input-control preview-category-switch"
                                                value=""
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  if (!val) return;
                                                  handleUpdatePreviewItemDetails(msg.id, idx, { category3: val, isCat3Manual: false });
                                                }}
                                                title={t('chat_select_from_list')}
                                              >
                                                <option value="">▼</option>
                                                {filteredCat3List.map((c) => (
                                                  <option key={c} value={c}>{c}</option>
                                                ))}
                                              </select>
                                            )}
                                        </div>
                                      ) : (
                                        <div className="preview-category-field">
                                          <select
                                            id={`select-cat3-${msg.id}-${idx}`}
                                            className="input-control preview-category-control"
                                            style={{ flex: 1 }}
                                            value={item.category3 || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (val === '__manual__') {
                                                handleUpdatePreviewItemDetails(msg.id, idx, { isCat3Manual: true, category3: '' });
                                              } else {
                                                handleUpdatePreviewItemDetails(msg.id, idx, { category3: val, isCat3Manual: false });
                                              }
                                            }}
                                          >
                                            <option value="">{t('chat_size_dash')}</option>
                                            <option value="__manual__" style={{ fontStyle: 'italic', color: 'var(--accent-primary)' }}>
                                              {t('chat_input_manually')}
                                            </option>
                                            {filteredCat3List.map((c) => (
                                              <option key={c} value={c}>{c}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                  {[item.category2, item.category3, item.category1].filter(Boolean).join(' ') || t('chat_undefined_part')}
                                </span>
                              )}
                              
                              {msg.isExecuted ? (
                                <div>
                                  {t('chat_qty_label')}{item.quantity} {formatUnit(item.unit, language)}
                                  {msg.previewData?.action !== 'consume' && item.purchase_price > 0 && ` | ${t('chat_price_label')}${item.purchase_price} ${item.currency || 'JPY'}`}
                                  {msg.previewData?.action !== 'consume' && item.purchase_date && ` | ${t('chat_date_label_inline')}${item.purchase_date}`}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.35rem' }}>
                                  
                                  {msg.previewData?.action !== 'price' && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <button
                                        type="button"
                                        className="quantity-control-btn"
                                        style={{ width: '24px', height: '24px', fontSize: '0.8rem' }}
                                        onClick={() => handleUpdatePreviewItemQty(msg.id, idx, item.quantity - 1)}
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        step="any"
                                        className="quantity-input"
                                        style={{ padding: '2px', textAlign: 'center', height: '24px', fontSize: '0.8rem' }}
                                        value={item.quantity ?? ''}
                                        onChange={(e) => handleUpdatePreviewItemQty(msg.id, idx, Number(e.target.value))}
                                      />
                                      <button
                                        type="button"
                                        className="quantity-control-btn"
                                        style={{ width: '24px', height: '24px', fontSize: '0.8rem' }}
                                        onClick={() => handleUpdatePreviewItemQty(msg.id, idx, item.quantity + 1)}
                                      >
                                        +
                                      </button>
                                      {msg.previewData?.action !== 'consume' && (() => {
                                        const defaultUnits = ['pcs', 'mm', 'm', 'mg', 'g', 'kg', 'ml', 'l'];
                                        const currentUnit = item.unit || 'pcs';
                                        const selectOptions = defaultUnits.includes(currentUnit)
                                          ? defaultUnits
                                          : [...defaultUnits, currentUnit];
                                        return (
                                          <select
                                            className="input-control preview-unit-control"
                                            style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: 'auto', minWidth: '55px' }}
                                            value={currentUnit}
                                            onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { unit: e.target.value })}
                                          >
                                            {selectOptions.map((u) => (
                                              <option key={u} value={u}>{formatUnit(u, language)}</option>
                                            ))}
                                          </select>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  )}

                                  {msg.previewData?.action !== 'consume' && (
                                  <>
                                  {msg.previewData?.type === 'parts_edit' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('chat_alert_threshold_label')}</span>
                                      <input
                                        type="number"
                                        step="any"
                                        className="input-control"
                                        style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '65px' }}
                                        value={item.alert_threshold ?? ''}
                                        onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { alert_threshold: e.target.value === '' ? '' : Number(e.target.value) })}
                                        placeholder="0"
                                      />
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatUnit(item.unit, language)}</span>
                                    </div>
                                  )}

                                  {/* Date, Total Cost Mode */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div className="preview-date-row" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('chat_date_label')}</span>
                                      {isPurchaseYearManual ? (
                                        <div className="preview-category-field preview-date-year-field" style={{ width: '92px' }}>
                                          <input
                                            type="number"
                                            min="1"
                                            max="9999"
                                            className="input-control preview-category-control"
                                            placeholder={t('chat_year')}
                                            value={purchaseYear}
                                            onChange={(e) => handleUpdatePurchaseDatePart(msg.id, idx, item, 'purchaseYear', e.target.value)}
                                          />
                                          <select
                                            className="input-control preview-category-switch"
                                            value=""
                                            onChange={(e) => {
                                              if (!e.target.value) return;
                                              handleUpdatePreviewItemDetails(msg.id, idx, { isPurchaseYearManual: false });
                                              handleUpdatePurchaseDatePart(msg.id, idx, item, 'purchaseYear', e.target.value);
                                            }}
                                            title={t('chat_select_year')}
                                          >
                                            <option value="">▼</option>
                                            {purchaseYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                                          </select>
                                        </div>
                                      ) : (
                                        <select
                                          className="input-control preview-date-year-control"
                                          style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '78px' }}
                                          value={purchaseYear}
                                          onChange={(e) => {
                                            if (e.target.value === '__manual__') {
                                              handleUpdatePreviewItemDetails(msg.id, idx, {
                                                isPurchaseYearManual: true,
                                                purchaseYear: '',
                                                purchase_date: '',
                                              });
                                              return;
                                            }
                                            handleUpdatePurchaseDatePart(msg.id, idx, item, 'purchaseYear', e.target.value);
                                          }}
                                        >
                                          <option value="">{t('chat_year')}</option>
                                          {purchaseYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                                          <option value="__manual__">{t('chat_manual')}</option>
                                        </select>
                                      )}
                                      <select
                                        className="input-control preview-date-month-control"
                                        style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '58px' }}
                                        value={purchaseMonth}
                                        onChange={(e) => handleUpdatePurchaseDatePart(msg.id, idx, item, 'purchaseMonth', e.target.value)}
                                      >
                                        <option value="">{t('chat_month')}</option>
                                        {Array.from({ length: 12 }, (_, index) => {
                                          const month = String(index + 1).padStart(2, '0');
                                          return <option key={month} value={month}>{index + 1}</option>;
                                        })}
                                      </select>
                                      <select
                                        className="input-control preview-date-day-control"
                                        style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '58px' }}
                                        value={purchaseDay}
                                        onChange={(e) => handleUpdatePurchaseDatePart(msg.id, idx, item, 'purchaseDay', e.target.value)}
                                      >
                                        <option value="">{t('chat_day')}</option>
                                        {Array.from({ length: purchaseDayCount }, (_, index) => {
                                          const day = String(index + 1).padStart(2, '0');
                                          return <option key={day} value={day}>{index + 1}</option>;
                                        })}
                                      </select>
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={!!item.isTotalInput}
                                        onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { isTotalInput: e.target.checked })}
                                      />
                                      <span>{t('chat_total_input_checkbox')}</span>
                                    </label>
                                  </div>

                                  {/* Price, Currency Select */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        {item.isTotalInput ? t('chat_total_label') : t('chat_unit_price_label')}
                                      </span>
                                      <input
                                        type="number"
                                        step="any"
                                        className="input-control"
                                        style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '65px' }}
                                        value={item.isTotalInput ? (item.tempTotalCost || '') : (item.tempUnitPrice || item.purchase_price || '')}
                                        placeholder="0"
                                        onChange={(e) => {
                                          // Keep the raw string so partial input like "0." or "0.13" is not wiped by re-render
                                          const val = e.target.value;
                                          if (item.isTotalInput) {
                                            handleUpdatePreviewItemDetails(msg.id, idx, { tempTotalCost: val });
                                          } else {
                                            handleUpdatePreviewItemDetails(msg.id, idx, { tempUnitPrice: val });
                                          }
                                        }}
                                      />
                                      <select
                                        className="input-control"
                                        style={{ fontSize: '0.75rem', padding: '2px', height: '24px', width: '55px' }}
                                        value={item.inputCurrency || systemCurrency}
                                        onChange={(e) => {
                                          const newCur = e.target.value;
                                          let defaultRate = 1.0;
                                          if (newCur === 'USD' && systemCurrency === 'JPY') defaultRate = 155;
                                          else if (newCur === 'EUR' && systemCurrency === 'JPY') defaultRate = 165;
                                          else if (newCur === 'JPY' && systemCurrency === 'USD') defaultRate = 1 / 155;
                                          else if (newCur === 'JPY' && systemCurrency === 'EUR') defaultRate = 1 / 165;

                                          handleUpdatePreviewItemDetails(msg.id, idx, { 
                                            inputCurrency: newCur,
                                            exchangeRate: defaultRate,
                                          });
                                          fetchRateAndApply(msg.id, idx, newCur, systemCurrency, item.purchase_date || 'latest', item.purchaseQuantity || item.quantity || 1, !!item.isTotalInput);
                                        }}
                                      >
                                        <option value="JPY">JPY</option>
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                      </select>
                                    </div>
                                    {(msg.previewData?.type === 'parts_edit' || msg.previewData?.action === 'price') && item.isTotalInput && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                          {msg.previewData?.action === 'price' ? t('chat_purchase_qty_no_add_label') : t('chat_purchase_qty_label')}
                                        </span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          className="input-control"
                                          style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '65px' }}
                                          value={item.purchaseQuantity ?? ''}
                                          onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, {
                                            purchaseQuantity: e.target.value === '' ? '' : Number(e.target.value),
                                          })}
                                        />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatUnit(item.unit, language)}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Exchange rate convert */}
                                  {(item.inputCurrency && item.inputCurrency !== systemCurrency) && (
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '0.35rem' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{t('chat_exchange_convert_to', { currency: systemCurrency })}</span>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', marginLeft: 'auto' }}>
                                        <span>{t('chat_rate_label')}</span>
                                        <input
                                          type="number"
                                          step="any"
                                          className="input-control"
                                          style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', width: '50px' }}
                                          value={item.exchangeRate ?? 1.0}
                                          onChange={(e) => handleUpdatePreviewItemDetails(msg.id, idx, { exchangeRate: Number(e.target.value) })}
                                        />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{systemCurrency}/{item.inputCurrency}</span>
                                        <button
                                          type="button"
                                          className="quantity-control-btn"
                                          style={{ fontSize: '0.7rem', padding: '2px 6px', height: '22px', marginLeft: '0.25rem', width: 'auto' }}
                                          onClick={() => fetchRateAndApply(msg.id, idx, item.inputCurrency, systemCurrency, item.purchase_date || 'latest', item.purchaseQuantity || item.quantity || 1, !!item.isTotalInput)}
                                          title={t('chat_refetch_rate_title')}
                                        >
                                          {t('chat_refresh')}
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Calculated cost feedback */}
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'flex-end', borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: '0.25rem' }}>
                                    {item.isTotalInput ? (
                                      <span>
                                        {t('chat_calculated_unit_price')} <strong>{item.purchase_price ?? 0} {systemCurrency}</strong>
                                      </span>
                                    ) : (
                                      <span>
                                        {t('chat_calculated_total')} <strong>{Number(((item.purchase_price ?? 0) * (item.quantity ?? 1)).toFixed(2))} {systemCurrency}</strong>
                                      </span>
                                    )}
                                  </div>
                                  </>
                                  )}

                                </div>
                              )}

                            </div>
                          )
                        })}
                      </div>
                    )}

                      {/* Product Recipe Preview */}
                      {msg.previewData.type === 'product' && (
                        <div style={{ fontSize: '0.85rem' }}>
                          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>
                            {t('chat_products_to_assemble')}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            {(msg.previewData.items || []).map((item: any, idx: number) => (
                              <div
                                key={`${item.product_id || item.product_name}-${idx}`}
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  background: 'rgba(255,255,255,0.02)',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(255,255,255,0.03)'
                                }}
                              >
                                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                                  {!msg.isExecuted ? (
                                    <select
                                      className="input-control"
                                      value={item.product_id || (availableProducts || []).find((product) => product.name === item.product_name)?.id || ''}
                                      onChange={(e) => handleUpdateProductConsumeSelection(msg.id, idx, Number(e.target.value))}
                                      disabled={!availableProducts?.length}
                                      style={{
                                        width: '100%',
                                        minHeight: '28px',
                                        padding: '3px 8px',
                                        fontSize: '0.85rem',
                                        lineHeight: 1.2,
                                        fontWeight: 600
                                      }}
                                    >
                                      {!(availableProducts || []).some((product) => product.id === item.product_id || product.name === item.product_name) && (
                                        <option value="">{item.product_name || t('chat_select_product')}</option>
                                      )}
                                      {(availableProducts || []).map((product) => (
                                        <option key={product.id} value={product.id}>{product.name}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{item.product_name}</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                                  {!msg.isExecuted && (
                                    <button
                                      type="button"
                                      className="quantity-control-btn"
                                      style={{ width: '24px', height: '24px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      onClick={() => handleUpdateProductConsumeCount(msg.id, idx, Number(item.product_count || 0) - 1)}
                                    >
                                      -
                                    </button>
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                                    <input
                                      type="number"
                                      step="any"
                                      className="quantity-input product-consume-count-input"
                                      style={{ padding: '2px', textAlign: 'center', fontSize: '0.8rem', height: '24px' }}
                                      value={item.product_count}
                                      disabled={msg.isExecuted}
                                      onChange={(e) => handleUpdateProductConsumeCount(msg.id, idx, Number(e.target.value))}
                                    />
                                  </div>
                                  {!msg.isExecuted && (
                                    <button
                                      type="button"
                                      className="quantity-control-btn"
                                      style={{ width: '24px', height: '24px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      onClick={() => handleUpdateProductConsumeCount(msg.id, idx, Number(item.product_count || 0) + 1)}
                                    >
                                      +
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {(() => {
                            const consumedParts = getProductConsumedParts(msg.previewData.items || []);
                            if (consumedParts.length === 0) {
                              return (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
                                  {t('chat_no_recipe_components')}
                                </div>
                              );
                            }

                            return (
                              <>
                                <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>
                                  {t('chat_total_parts_list')}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '0.5rem', borderLeft: '2px solid var(--primary)' }}>
                                  {consumedParts.map((part) => (
                                    <div key={`${part.part_name}-${part.unit}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                                      <span style={{ overflowWrap: 'anywhere' }}>{part.part_name}</span>
                                      <span style={{ color: 'var(--accent-secondary)', fontWeight: 400, whiteSpace: 'nowrap' }}>
                                        {formatConsumedQuantity(part.quantity)} {formatUnit(part.unit, language)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {(msg.previewData.type === 'product_recipe' || msg.previewData.type === 'product_recipe_edit') && (
                        <div style={{ fontSize: '0.85rem' }}>
                          {!msg.isExecuted ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                  {t('chat_product_name_label')}
                                </label>
                                <input
                                  type="text"
                                  placeholder={t('chat_product_name_placeholder')}
                                  className="input-control"
                                  style={{ fontSize: '0.85rem', fontWeight: 600, width: '100%', height: '28px', padding: '2px 6px' }}
                                  value={msg.previewData.product_name || ''}
                                  onChange={(e) => {
                                    const newName = e.target.value;
                                    setMessages((prev) =>
                                      prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, product_name: newName } } : m)
                                    );
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                  {t('chat_description_label')}
                                </label>
                                <textarea
                                  placeholder={t('chat_description_placeholder')}
                                  className="input-control"
                                  rows={2}
                                  style={{ fontSize: '0.8rem', width: '100%', padding: '4px 6px', resize: 'none' }}
                                  value={msg.previewData.description || ''}
                                  onChange={(e) => {
                                    const newDesc = e.target.value;
                                    setMessages((prev) =>
                                      prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, description: newDesc } } : m)
                                    );
                                  }}
                                />
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>{t('chat_product_name_inline', { name: msg.previewData?.product_name || '' })}</div>
                              {msg.previewData.description && <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('chat_description_inline', { description: msg.previewData.description })}</div>}
                            </>
                          )}

                          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>
                            {t('chat_recipe_components')}
                          </div>
                          
                          {!msg.isExecuted ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                              {msg.previewData.parts?.map((p: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                  <span>{p.part_name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <button
                                      type="button"
                                      className="quantity-control-btn"
                                      style={{ width: '20px', height: '20px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      onClick={() => {
                                        const updatedParts = [...(msg.previewData?.parts || [])];
                                        updatedParts[idx] = { ...p, quantity: Math.max(0.1, p.quantity - 1) };
                                        setMessages((prev) =>
                                          prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, parts: updatedParts } } : m)
                                        );
                                      }}
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      step="any"
                                      className="quantity-input recipe-quantity-input"
                                      style={{ padding: '2px', textAlign: 'center', fontSize: '0.75rem', height: '20px' }}
                                      value={p.quantity}
                                      onChange={(e) => {
                                        const updatedParts = [...(msg.previewData?.parts || [])];
                                        updatedParts[idx] = { ...p, quantity: Number(e.target.value) || 1 };
                                        setMessages((prev) =>
                                          prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, parts: updatedParts } } : m)
                                        );
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="quantity-control-btn"
                                      style={{ width: '20px', height: '20px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                      onClick={() => {
                                        const updatedParts = [...(msg.previewData?.parts || [])];
                                        updatedParts[idx] = { ...p, quantity: p.quantity + 1 };
                                        setMessages((prev) =>
                                          prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, parts: updatedParts } } : m)
                                        );
                                      }}
                                    >
                                      +
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-secondary"
                                      style={{ padding: '2px 4px', border: 'none', background: 'transparent', color: 'var(--danger)', marginLeft: '0.25rem', width: 'auto', height: 'auto', display: 'flex', alignItems: 'center' }}
                                      onClick={() => {
                                        const updatedParts = (msg.previewData?.parts || []).filter((_: any, i: number) => i !== idx);
                                        setMessages((prev) =>
                                          prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, parts: updatedParts } } : m)
                                        );
                                      }}
                                    >
                                      x
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {(!msg.previewData.parts || msg.previewData.parts.length === 0) && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem' }}>
                                  {t('chat_no_components')}
                                </div>
                              )}
                              
                              {/* Add Component to Recipe inline */}
                              {availableParts && availableParts.length > 0 && (
                                <div className="recipe-add-row">
                                  <div className="recipe-add-fields">
                                    <select
                                      id={`add-part-select-${msg.id}`}
                                      className="input-control recipe-add-select"
                                      defaultValue=""
                                    >
                                      <option value="">{t('chat_select_part_dash')}</option>
                                      {availableParts.map((part) => (
                                        <option key={part.id} value={part.id}>{part.name}</option>
                                      ))}
                                    </select>
                                    <div className="recipe-add-qty-control">
                                      <button
                                        type="button"
                                        className="quantity-control-btn"
                                        onClick={() => {
                                          const qtyEl = document.getElementById(`add-part-qty-${msg.id}`) as HTMLInputElement;
                                          if (qtyEl) qtyEl.value = String(Math.max(0.1, Number(qtyEl.value || 1) - 1));
                                        }}
                                      >
                                        -
                                      </button>
                                      <input
                                        id={`add-part-qty-${msg.id}`}
                                        type="number"
                                        step="any"
                                        className="input-control recipe-add-qty quantity-input recipe-quantity-input"
                                        placeholder={t('chat_qty_placeholder')}
                                        defaultValue={1}
                                      />
                                      <button
                                        type="button"
                                        className="quantity-control-btn"
                                        onClick={() => {
                                          const qtyEl = document.getElementById(`add-part-qty-${msg.id}`) as HTMLInputElement;
                                          if (qtyEl) qtyEl.value = String(Number(qtyEl.value || 1) + 1);
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-secondary recipe-add-button"
                                    onClick={() => {
                                      const selectEl = document.getElementById(`add-part-select-${msg.id}`) as HTMLSelectElement;
                                      const qtyEl = document.getElementById(`add-part-qty-${msg.id}`) as HTMLInputElement;
                                      if (!selectEl || !qtyEl || !selectEl.value) return;

                                      const partId = Number(selectEl.value);
                                      const selectedPart = availableParts.find((part) => part.id === partId);
                                      if (!selectedPart) return;

                                      const qty = Number(qtyEl.value) || 1;

                                      const updatedParts = [
                                        ...(msg.previewData?.parts || []),
                                        {
                                          part_id: selectedPart.id,
                                          part_name: selectedPart.name,
                                          quantity: qty,
                                          unit: selectedPart.unit || 'pcs',
                                        }
                                      ];
                                      setMessages((prev) =>
                                        prev.map((m) => m.id === msg.id ? { ...m, previewData: { ...m.previewData, parts: updatedParts } } : m)
                                      );

                                      selectEl.value = '';
                                      qtyEl.value = '1';
                                    }}
                                  >
                                    {t('add')}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '0.5rem', borderLeft: '2px solid var(--primary)' }}>
                              {msg.previewData.parts?.map((p: any, idx: number) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{p.part_name}</span>
                                  <span style={{ fontWeight: 600 }}>x{p.quantity}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Settings Preview */}
                      {msg.previewData.type === 'settings' && (
                        <div style={{ fontSize: '0.85rem' }}>
                          <div style={{ color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '6px' }}>{t('chat_settings_changed_items')}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {Object.entries(msg.previewData.updates || {}).map(([key, val]) => (
                              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                                <span style={{ color: 'var(--accent-primary)' }}>{getSettingKeyLabel(key, language)}</span>
                                <span style={{ fontWeight: 600 }}>{getSettingValueLabel(key, val, language)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Approve Button */}
                      {!msg.isExecuted ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ width: '100%', marginTop: '0.75rem', padding: '0.4rem', fontSize: '0.8rem' }}
                          onClick={() => msg.previewData && handleExecute(msg.id, msg.previewData)}
                          disabled={executingMessageId === msg.id}
                        >
                          <Check size={14} />
                          <span>{t('chat_drawer_exec')}</span>
                        </button>
                      ) : (
                        <div className="executed-badge" style={{ marginTop: '0.75rem', fontSize: '0.75rem', padding: '0.25rem' }}>
                          <Check size={14} />
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

      </div>

      {/* 3. Constant bottom input bar */}
      <div className="drawer-input-container glass-card">
        {shouldShowQuickActions && (
          <div
            className="quick-actions-bar drawer-quick-actions-bar"
            onWheel={handleQuickActionsWheel}
            onPointerDown={handleQuickActionsPointerDown}
            onPointerMove={handleQuickActionsPointerMove}
            onPointerUp={handleQuickActionsPointerEnd}
            onPointerCancel={handleQuickActionsPointerEnd}
            onPointerLeave={handleQuickActionsPointerEnd}
            onClickCapture={handleQuickActionsClickCapture}
          >
            {quickActions.map((action) => (
              <button
                key={action}
                type="button"
                className="quick-action-btn"
                onPointerDown={handleQuickActionButtonPointerDown}
                onClick={() => handleChipClick(action)}
              >
                {action}
              </button>
            ))}
          </div>
        )}
        <div className="drawer-input-form">
          <textarea
            ref={textareaRef}
            rows={1}
            className="chat-input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              const wasOpen = isOpenRef.current;
              setIsOpen(true);
              setIsInputFocused(true);
              if (!wasOpen) {
                scrollToBottomAfterLayout();
              }
            }}
            onBlur={() => setIsInputFocused(false)}
            placeholder={`${sendKey === 'enter' ? t('chat_press_enter_to_send') : t('chat_drawer_placeholder')} (${mode === 'parts' ? t('chat_price_stock_adjust') : mode === 'products' ? t('chat_product_config') : t('chat_change_config')})`}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              const isEnterSubmit = sendKey === 'enter';
              if (e.key === 'Enter') {
                if (isEnterSubmit && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                } else if (!isEnterSubmit && e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              } else if (e.key === 'ArrowUp') {
                const cursorAtStart = e.currentTarget.selectionStart === 0;
                if (cursorAtStart) {
                  const userMessages = messages.filter((m) => m.sender === 'user' && !m.hideInInputHistory);
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
                  const userMessages = messages.filter((m) => m.sender === 'user' && !m.hideInInputHistory);
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
            style={{
              resize: 'none',
              height: '24px',
              padding: '6px 0',
              fontFamily: 'inherit',
              lineHeight: '1.4',
              overflowY: 'auto'
            }}
          />
          <button
            type="button"
            className="chat-send-btn"
            disabled={!input.trim() || loading}
            onClick={handleSend}
          >
            <Send size={16} />
          </button>
        </div>
      </div>

    </div>
  );
});

import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { getTranslation } from '../utils/i18n';
import { PageChatDrawer } from './PageChatDrawer';
import { type Message } from '../types/chat';
import { clearDeleteConfirmSkips } from '../utils/deleteConfirm';

interface SettingsPageProps {
  token: string;
  apiBase: string;
  currentUserRole: string;
  themeColor: string;
  setThemeColor: (color: string) => void;
  themeWallpaper: string;
  setThemeWallpaper: (wallpaper: string) => void;
  backgroundImageMode: string;
  setBackgroundImageMode: (mode: string) => void;
  backgroundDotSize: string;
  setBackgroundDotSize: (size: string) => void;
  backgroundStripeWidth: string;
  setBackgroundStripeWidth: (width: string) => void;
  backgroundCheckSize: string;
  setBackgroundCheckSize: (size: string) => void;
  backgroundImageData: string;
  setBackgroundImageData: (data: string) => void;
  backgroundImageFilename: string;
  setBackgroundImageFilename: (filename: string) => void;
  backgroundImageLayout: string;
  setBackgroundImageLayout: (layout: string) => void;
  currency: string;
  setCurrency: (currency: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  sendKey: string;
  setSendKey: (key: string) => void;
  onLogout: () => void;
  onSaveSuccess: (saved: {
    themeColor: string;
    themeWallpaper: string;
    backgroundImageMode: string;
    backgroundDotSize: string;
    backgroundStripeWidth: string;
    backgroundCheckSize: string;
    backgroundImageData: string;
    backgroundImageFilename: string;
    backgroundImageLayout: string;
    currency: string;
    language: string;
    sendKey: string;
  }) => void;
  drawerMessages: Message[];
  setDrawerMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

type PromptPage = 'chat' | 'parts' | 'products' | 'settings';
type PromptLang = 'ja' | 'en';
type PromptMap = Record<PromptPage, Record<PromptLang, string>>;
type PromptMode = 'default' | 'custom';
type PromptModeMap = Record<PromptPage, Record<PromptLang, PromptMode>>;
type NonPromptSettings = {
  llmEnabled: boolean;
  provider: string;
  url: string;
  model: string;
  openAiApiKey: string;
  language: string;
  themeColor: string;
  themeWallpaper: string;
  backgroundImageMode: string;
  backgroundDotSize: string;
  backgroundStripeWidth: string;
  backgroundCheckSize: string;
  backgroundImageData: string;
  backgroundImageFilename: string;
  backgroundImageLayout: string;
  currency: string;
  userNickname: string;
  aiPronoun: string;
  sendKey: string;
  allowedHosts: string;
};
type BackgroundSettingsSnapshot = Pick<
  NonPromptSettings,
  | 'backgroundImageMode'
  | 'backgroundDotSize'
  | 'backgroundStripeWidth'
  | 'backgroundCheckSize'
  | 'backgroundImageData'
  | 'backgroundImageFilename'
  | 'backgroundImageLayout'
>;
type SettingsSection = 'ai' | 'theme' | 'access';

const OLLAMA_PROVIDER = 'ollama';
const OPENAI_API_PROVIDER = 'openai_api';
const OPENAI_API_URL = 'https://api.openai.com';
const OPENAI_API_RECOMMENDED_MODELS = ['gpt-5.4-mini', 'gpt-5.4-nano'];
const CUSTOM_MODEL_VALUE = '__custom_model__';

const promptPages: PromptPage[] = ['chat', 'parts', 'products', 'settings'];
const promptLangs: PromptLang[] = ['ja', 'en'];
const promptStorageKeys: Record<PromptPage, Record<PromptLang, string>> = {
  chat: { ja: 'system_prompt', en: 'system_prompt_chat_en' },
  parts: { ja: 'system_prompt_parts_ja', en: 'system_prompt_parts_en' },
  products: { ja: 'system_prompt_products_ja', en: 'system_prompt_products_en' },
  settings: { ja: 'system_prompt_settings_ja', en: 'system_prompt_settings_en' },
};
const promptModeStorageKeys: Record<PromptPage, Record<PromptLang, string>> = {
  chat: { ja: 'system_prompt_mode', en: 'system_prompt_chat_en_mode' },
  parts: { ja: 'system_prompt_parts_ja_mode', en: 'system_prompt_parts_en_mode' },
  products: { ja: 'system_prompt_products_ja_mode', en: 'system_prompt_products_en_mode' },
  settings: { ja: 'system_prompt_settings_ja_mode', en: 'system_prompt_settings_en_mode' },
};

const createPromptMap = (): PromptMap => ({
  chat: { ja: '', en: '' },
  parts: { ja: '', en: '' },
  products: { ja: '', en: '' },
  settings: { ja: '', en: '' },
});
const createPromptModeMap = (): PromptModeMap => ({
  chat: { ja: 'default', en: 'default' },
  parts: { ja: 'default', en: 'default' },
  products: { ja: 'default', en: 'default' },
  settings: { ja: 'default', en: 'default' },
});
const settingStorageKeys: Record<keyof NonPromptSettings, string> = {
  llmEnabled: 'llm_enabled',
  provider: 'llm_provider',
  url: 'llm_url',
  model: 'llm_model',
  openAiApiKey: 'openai_api_key',
  language: 'language',
  themeColor: 'theme_color',
  themeWallpaper: 'theme_wallpaper',
  backgroundImageMode: 'background_image_mode',
  backgroundDotSize: 'background_dot_size',
  backgroundStripeWidth: 'background_stripe_width',
  backgroundCheckSize: 'background_check_size',
  backgroundImageData: 'background_image_url',
  backgroundImageFilename: 'background_image_filename',
  backgroundImageLayout: 'background_image_layout',
  currency: 'currency',
  userNickname: 'user_nickname',
  aiPronoun: 'ai_pronoun',
  sendKey: 'send_key',
  allowedHosts: 'allowed_hosts',
};
const aiSettingKeys: (keyof NonPromptSettings)[] = ['provider', 'url', 'model', 'openAiApiKey', 'userNickname', 'aiPronoun', 'sendKey'];
const themeSettingKeys: (keyof NonPromptSettings)[] = ['language', 'themeColor', 'themeWallpaper', 'backgroundImageMode', 'backgroundDotSize', 'backgroundStripeWidth', 'backgroundCheckSize', 'backgroundImageData', 'backgroundImageFilename', 'backgroundImageLayout', 'currency'];
const accessSettingKeys: (keyof NonPromptSettings)[] = ['allowedHosts'];
const backgroundSettingKeys: (keyof BackgroundSettingsSnapshot)[] = [
  'backgroundImageMode',
  'backgroundDotSize',
  'backgroundStripeWidth',
  'backgroundCheckSize',
  'backgroundImageData',
  'backgroundImageFilename',
  'backgroundImageLayout',
];

const clampBackgroundDotSize = (sizeValue: string) => {
  const fallback = 10;
  const numericSize = Number(sizeValue);
  const size = Number.isFinite(numericSize) ? numericSize : fallback;
  return String(Math.min(Math.max(size, 4), 192));
};

const clampBackgroundStripeWidth = (widthValue: string) => {
  const fallback = 16;
  const numericWidth = Number(widthValue);
  const width = Number.isFinite(numericWidth) ? numericWidth : fallback;
  return String(Math.min(Math.max(width, 8), 96));
};

const clampBackgroundCheckSize = (sizeValue: string) => {
  const fallback = 32;
  const numericSize = Number(sizeValue);
  const size = Number.isFinite(numericSize) ? numericSize : fallback;
  return String(Math.min(Math.max(size, 8), 192));
};

const normalizeBackgroundImageLayout = (layout: string) => {
  if (layout === 'tile' || layout === 'original' || layout === 'fit') return layout;
  return 'fit';
};

export const SettingsPage: React.FC<SettingsPageProps> = ({
  token,
  apiBase,
  currentUserRole,
  themeColor,
  setThemeColor,
  themeWallpaper,
  setThemeWallpaper,
  backgroundImageMode,
  setBackgroundImageMode,
  backgroundDotSize,
  setBackgroundDotSize,
  backgroundStripeWidth,
  setBackgroundStripeWidth,
  backgroundCheckSize,
  setBackgroundCheckSize,
  backgroundImageData,
  setBackgroundImageData,
  backgroundImageFilename,
  setBackgroundImageFilename,
  backgroundImageLayout,
  setBackgroundImageLayout,
  currency,
  setCurrency,
  language,
  setLanguage,
  sendKey,
  setSendKey,
  onLogout,
  onSaveSuccess,
  drawerMessages,
  setDrawerMessages
}) => {
  const t = (key: string, params?: Record<string, string | number>) => getTranslation(language, key, params);
  const [deleteConfirmSkipsCleared, setDeleteConfirmSkipsCleared] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [provider, setProvider] = useState('openai');
  const [url, setUrl] = useState('http://localhost:1234');
  const [model, setModel] = useState('');
  const [manualModelEnabled, setManualModelEnabled] = useState(false);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiApiKeyConfigured, setOpenAiApiKeyConfigured] = useState(false);
  const [openAiApiKeySource, setOpenAiApiKeySource] = useState<'env' | 'stored' | 'none'>('none');
  const [modelsList, setModelsList] = useState<string[]>([]);
  const [systemPrompts, setSystemPrompts] = useState<PromptMap>(createPromptMap);
  const [defaultPrompts, setDefaultPrompts] = useState<PromptMap>(createPromptMap);
  const [promptModes, setPromptModes] = useState<PromptModeMap>(createPromptModeMap);
  const [editingPrompts, setEditingPrompts] = useState<Record<string, boolean>>({});
  const [userNickname, setUserNickname] = useState('');
  const [aiPronoun, setAiPronoun] = useState('私');
  const [allowedHosts, setAllowedHosts] = useState('');
  const [externalAccess, setExternalAccess] = useState(false);
  const [showExternalAccessToggle, setShowExternalAccessToggle] = useState(false);

  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingSection, setSavingSection] = useState<SettingsSection | 'prompt' | 'llm-toggle' | 'external-access' | null>(null);
  const [message, setMessage] = useState('');
  const [savedNonPromptSettings, setSavedNonPromptSettings] = useState<NonPromptSettings | null>(null);
  const canManageSystemSettings = currentUserRole === 'admin';
  const backgroundSettingsRef = useRef<BackgroundSettingsSnapshot>({
    backgroundImageMode,
    backgroundDotSize,
    backgroundStripeWidth,
    backgroundCheckSize,
    backgroundImageData,
    backgroundImageFilename,
    backgroundImageLayout,
  });

  useEffect(() => {
    backgroundSettingsRef.current = {
      backgroundImageMode,
      backgroundDotSize,
      backgroundStripeWidth,
      backgroundCheckSize,
      backgroundImageData,
      backgroundImageFilename,
      backgroundImageLayout,
    };
  }, [backgroundImageMode, backgroundDotSize, backgroundStripeWidth, backgroundCheckSize, backgroundImageData, backgroundImageFilename, backgroundImageLayout]);

  const updateBackgroundSettingsSnapshot = (updates: Partial<BackgroundSettingsSnapshot>) => {
    backgroundSettingsRef.current = {
      ...backgroundSettingsRef.current,
      ...updates,
    };
  };

  const writeBackgroundSettingsPayload = (
    payload: Record<string, string>,
    snapshot: BackgroundSettingsSnapshot = backgroundSettingsRef.current
  ) => {
    backgroundSettingKeys.forEach((key) => {
      payload[settingStorageKeys[key]] = String(snapshot[key] ?? '');
    });
  };

  const getPromptPageLabel = (page: PromptPage) => {
    const labels: Record<PromptPage, string> = {
      chat: t('settings_prompt_page_chat'),
      parts: getTranslation(language, 'nav_parts'),
      products: getTranslation(language, 'nav_products'),
      settings: getTranslation(language, 'nav_settings'),
    };
    return labels[page];
  };

  const getPromptEditKey = (page: PromptPage, lang: PromptLang) => `${page}_${lang}`;

  const getDefaultUrlForProvider = (nextProvider: string) => {
    if (nextProvider === OPENAI_API_PROVIDER) return OPENAI_API_URL;
    if (nextProvider === OLLAMA_PROVIDER) return 'http://localhost:11434';
    return 'http://localhost:1234';
  };

  const getBaseModelsForProvider = (nextProvider: string) => (
    nextProvider === OPENAI_API_PROVIDER ? OPENAI_API_RECOMMENDED_MODELS : []
  );

  const mergeModels = (baseModels: string[], fetchedModels: string[] = [], selectedModel?: string) => (
    Array.from(new Set([
      ...baseModels,
      ...fetchedModels,
      ...(selectedModel ? [selectedModel] : []),
    ].filter(Boolean)))
  );

  const updatePrompt = (page: PromptPage, lang: PromptLang, value: string) => {
    setSystemPrompts((prev) => ({
      ...prev,
      [page]: {
        ...prev[page],
        [lang]: value,
      },
    }));
  };

  const getCurrentNonPromptSettings = (): NonPromptSettings => ({
    llmEnabled,
    provider,
    url,
    model,
    openAiApiKey,
    language,
    themeColor,
    themeWallpaper,
    ...backgroundSettingsRef.current,
    currency,
    userNickname,
    aiPronoun,
    sendKey,
    allowedHosts,
  });

  const isSettingsGroupDirty = (keys: (keyof NonPromptSettings)[]) => {
    if (!savedNonPromptSettings) return false;
    const current = getCurrentNonPromptSettings();
    return keys.some((key) => (
      current[key] !== savedNonPromptSettings[key]
    ));
  };
  const isAiSettingsDirty = isSettingsGroupDirty(aiSettingKeys);
  const isThemeSettingsDirty = isSettingsGroupDirty(themeSettingKeys);
  const isAccessSettingsDirty = isSettingsGroupDirty(accessSettingKeys);
  const llmDisabledLabelStyle = !llmEnabled ? { color: 'var(--text-muted)', opacity: 0.65 } : undefined;
  const allowedHostsDisabled = showExternalAccessToggle && !externalAccess;
  const allowedHostsDisabledStyle: React.CSSProperties | undefined = allowedHostsDisabled
    ? { color: 'var(--text-muted)', WebkitTextFillColor: 'var(--text-muted)', opacity: 0.65 }
    : undefined;
  const llmDisabledControlStyle: React.CSSProperties | undefined = !llmEnabled
    ? { color: 'var(--text-muted)', WebkitTextFillColor: 'var(--text-muted)', opacity: 0.65 }
    : undefined;

  const getSettingPayloadValue = (key: keyof NonPromptSettings, value: NonPromptSettings[keyof NonPromptSettings]) => {
    if (key === 'llmEnabled') return value ? 'true' : 'false';
    return String(value ?? '');
  };

  const getChangedSettingsPayload = (keys: (keyof NonPromptSettings)[]) => {
    const payload: Record<string, string> = {};
    if (!savedNonPromptSettings) return payload;

    const current = getCurrentNonPromptSettings();
    keys.forEach((key) => {
      if (current[key] !== savedNonPromptSettings[key]) {
        if (key === 'openAiApiKey' && !String(current[key] || '').trim()) {
          return;
        }
        payload[settingStorageKeys[key]] = getSettingPayloadValue(key, current[key]);
      }
    });
    return payload;
  };

  const markSettingsSaved = (keys: (keyof NonPromptSettings)[]) => {
    const current = getCurrentNonPromptSettings();
    setSavedNonPromptSettings((prev) => {
      const next: NonPromptSettings = { ...(prev || current) };
      return {
        ...next,
        ...Object.fromEntries(keys.map((key) => [key, key === 'openAiApiKey' ? '' : current[key]])),
      } as NonPromptSettings;
    });
  };

  const syncAppSavedSettings = (savedKeys: (keyof NonPromptSettings)[]) => {
    const current = getCurrentNonPromptSettings();
    const saved = savedNonPromptSettings || current;
    const pickSaved = (key: keyof NonPromptSettings) => (
      savedKeys.includes(key) ? current[key] : saved[key]
    );

    onSaveSuccess({
      themeColor: String(pickSaved('themeColor')),
      themeWallpaper: String(pickSaved('themeWallpaper')),
      backgroundImageMode: String(pickSaved('backgroundImageMode')),
      backgroundDotSize: String(pickSaved('backgroundDotSize')),
      backgroundStripeWidth: String(pickSaved('backgroundStripeWidth')),
      backgroundCheckSize: String(pickSaved('backgroundCheckSize')),
      backgroundImageData: String(pickSaved('backgroundImageData')),
      backgroundImageFilename: String(pickSaved('backgroundImageFilename')),
      backgroundImageLayout: String(pickSaved('backgroundImageLayout')),
      currency: String(pickSaved('currency')),
      language: String(pickSaved('language')),
      sendKey: String(pickSaved('sendKey'))
    });
  };

  const syncThemeSettingsFromResponse = (data: Record<string, any>, sentPayload: Record<string, string>) => {
    const current = getCurrentNonPromptSettings();
    const savedValue = (key: string) => sentPayload[key] ?? data[key];
    const nextThemeColor = savedValue('theme_color') || current.themeColor;
    const nextThemeWallpaper = savedValue('theme_wallpaper') || current.themeWallpaper;
    const savedBackgroundImageMode = savedValue('background_image_mode');
    const nextBackgroundImageMode = ['none', 'dots', 'stripes', 'checks', 'image'].includes(savedBackgroundImageMode)
      ? savedBackgroundImageMode
      : current.backgroundImageMode;
    const nextBackgroundDotSize = clampBackgroundDotSize(savedValue('background_dot_size') || savedValue('background_pattern_size') || current.backgroundDotSize);
    const nextBackgroundStripeWidth = clampBackgroundStripeWidth(savedValue('background_stripe_width') || savedValue('background_pattern_size') || current.backgroundStripeWidth);
    const nextBackgroundCheckSize = clampBackgroundCheckSize(savedValue('background_check_size') || savedValue('background_pattern_size') || current.backgroundCheckSize);
    const nextBackgroundImageData = savedValue('background_image_url') ?? data.background_image_data ?? current.backgroundImageData;
    const nextBackgroundImageFilename = savedValue('background_image_filename') ?? current.backgroundImageFilename;
    const nextBackgroundImageLayout = normalizeBackgroundImageLayout(savedValue('background_image_layout') || current.backgroundImageLayout);
    const nextCurrency = savedValue('currency') || current.currency;
    const nextLanguage = savedValue('language') || current.language;

    setThemeColor(nextThemeColor);
    setThemeWallpaper(nextThemeWallpaper);
    setBackgroundImageMode(nextBackgroundImageMode);
    setBackgroundDotSize(nextBackgroundDotSize);
    setBackgroundStripeWidth(nextBackgroundStripeWidth);
    setBackgroundCheckSize(nextBackgroundCheckSize);
    setBackgroundImageData(nextBackgroundImageData);
    setBackgroundImageFilename(nextBackgroundImageFilename);
    setBackgroundImageLayout(nextBackgroundImageLayout);
    updateBackgroundSettingsSnapshot({
      backgroundImageMode: nextBackgroundImageMode,
      backgroundDotSize: nextBackgroundDotSize,
      backgroundStripeWidth: nextBackgroundStripeWidth,
      backgroundCheckSize: nextBackgroundCheckSize,
      backgroundImageData: nextBackgroundImageData,
      backgroundImageFilename: nextBackgroundImageFilename,
      backgroundImageLayout: nextBackgroundImageLayout,
    });
    setCurrency(nextCurrency);
    setLanguage(nextLanguage);

    setSavedNonPromptSettings((prev) => ({
      ...(prev || current),
      themeColor: nextThemeColor,
      themeWallpaper: nextThemeWallpaper,
      backgroundImageMode: nextBackgroundImageMode,
      backgroundDotSize: nextBackgroundDotSize,
      backgroundStripeWidth: nextBackgroundStripeWidth,
      backgroundCheckSize: nextBackgroundCheckSize,
      backgroundImageData: nextBackgroundImageData,
      backgroundImageFilename: nextBackgroundImageFilename,
      backgroundImageLayout: nextBackgroundImageLayout,
      currency: nextCurrency,
      language: nextLanguage,
    }));

    onSaveSuccess({
      themeColor: nextThemeColor,
      themeWallpaper: nextThemeWallpaper,
      backgroundImageMode: nextBackgroundImageMode,
      backgroundDotSize: nextBackgroundDotSize,
      backgroundStripeWidth: nextBackgroundStripeWidth,
      backgroundCheckSize: nextBackgroundCheckSize,
      backgroundImageData: nextBackgroundImageData,
      backgroundImageFilename: nextBackgroundImageFilename,
      backgroundImageLayout: nextBackgroundImageLayout,
      currency: nextCurrency,
      language: nextLanguage,
      sendKey: current.sendKey,
    });
  };

  const showSavedMessage = (text?: string) => {
    setMessage(text || t('settings_saved_successfully'));
    setTimeout(() => setMessage(''), 3000);
  };

  const getErrorMessage = (err: unknown) => (
    err instanceof Error ? err.message : String(err)
  );

  const handleBackgroundImageModeChange = (mode: string) => {
    const updates: Partial<BackgroundSettingsSnapshot> = { backgroundImageMode: mode };
    setBackgroundImageMode(mode);
    if (mode === 'dots') {
      const dotSize = clampBackgroundDotSize(backgroundSettingsRef.current.backgroundDotSize);
      updates.backgroundDotSize = dotSize;
      setBackgroundDotSize(dotSize);
    }
    if (mode === 'stripes') {
      const stripeWidth = clampBackgroundStripeWidth(backgroundSettingsRef.current.backgroundStripeWidth);
      updates.backgroundStripeWidth = stripeWidth;
      setBackgroundStripeWidth(stripeWidth);
    }
    if (mode === 'checks') {
      const checkSize = clampBackgroundCheckSize(backgroundSettingsRef.current.backgroundCheckSize);
      updates.backgroundCheckSize = checkSize;
      setBackgroundCheckSize(checkSize);
    }
    updateBackgroundSettingsSnapshot(updates);
  };

  const handleBackgroundImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage(t('settings_select_image_file'));
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    setSaving(true);
    setSavingSection('theme');
    setMessage('');
    try {
      const response = await fetch(`${apiBase}/api/settings/background-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error(t('settings_upload_image_error'));
      const data = await response.json();
      const imageData = data.background_image_url || '';
      const filename = data.background_image_filename || file.name;
      updateBackgroundSettingsSnapshot({
        backgroundImageData: imageData,
        backgroundImageFilename: filename,
        backgroundImageMode: 'image',
      });
      setBackgroundImageData(imageData);
      setBackgroundImageFilename(filename);
      setBackgroundImageMode('image');
      syncThemeSettingsFromResponse(data, {
        background_image_mode: 'image',
        background_image_url: imageData,
        background_image_filename: filename,
      });
      showSavedMessage(t('settings_image_uploaded'));
    } catch (err: unknown) {
      alert(getErrorMessage(err));
      event.target.value = '';
    } finally {
      setSaving(false);
      setSavingSection(null);
    }
  };

  const handleClearDeleteConfirmSkips = () => {
    clearDeleteConfirmSkips();
    setDeleteConfirmSkipsCleared(true);
    setTimeout(() => setDeleteConfirmSkipsCleared(false), 3000);
  };

  const saveSettingsPayload = async (payload: Record<string, string>) => {
    const response = await fetch(`${apiBase}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 401) {
      onLogout();
      return null;
    }
    if (!response.ok) throw new Error(t('settings_save_error'));
    return response.json();
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${apiBase}/api/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.status === 401) {
        onLogout();
        return;
      }
      if (!response.ok) throw new Error(t('settings_fetch_error'));
      const data = await response.json();
      
      const fetchedProvider = data.llm_provider || 'openai';
      const fetchedUrl = data.llm_url || '';
      const fetchedModel = data.llm_model || '';
      const fetchedLlmEnabled = data.llm_enabled !== 'false';
      const fetchedApiKeySource = data.openai_api_key_source === 'env' || data.openai_api_key_source === 'stored' ? data.openai_api_key_source : 'none';
      const baseModels = getBaseModelsForProvider(fetchedProvider);
      setLlmEnabled(fetchedLlmEnabled);
      setProvider(fetchedProvider);
      setUrl(fetchedProvider === OPENAI_API_PROVIDER && !fetchedUrl ? OPENAI_API_URL : fetchedUrl);
      setModel(fetchedModel);
      setManualModelEnabled(!!fetchedModel && !baseModels.includes(fetchedModel));
      setOpenAiApiKey('');
      setOpenAiApiKeySource(fetchedApiKeySource);
      setOpenAiApiKeyConfigured(data.openai_api_key_configured === true);
      setModelsList(mergeModels(baseModels, [], fetchedModel));
      const nextPrompts = createPromptMap();
      const nextDefaults = createPromptMap();
      const nextModes = createPromptModeMap();
      promptPages.forEach((page) => {
        promptLangs.forEach((lang) => {
          const storageKey = promptStorageKeys[page][lang];
          nextDefaults[page][lang] = data.default_system_prompts?.[page]?.[lang] || data.default_system_prompt || '';
          nextModes[page][lang] = data.system_prompt_modes?.[page]?.[lang] === 'custom' ? 'custom' : 'default';
          nextPrompts[page][lang] = data.system_prompts?.[page]?.[lang] || data[storageKey] || nextDefaults[page][lang];
        });
      });
      setSystemPrompts(nextPrompts);
      setDefaultPrompts(nextDefaults);
      setPromptModes(nextModes);
      const fetchedLanguage = data.language || 'ja';
      setLanguage(fetchedLanguage);
      let color = data.theme_color || 'tomato';
      if (color === 'default') color = 'tomato';
      if (color === 'sunset') color = 'lemon';
      setThemeColor(color);
      let wallpaper = data.theme_wallpaper || 'light';
      if (wallpaper === 'default') wallpaper = 'light';
      if (wallpaper === 'solid') wallpaper = 'dark';
      if (wallpaper === 'frost') wallpaper = 'slate';
      setThemeWallpaper(wallpaper);
      const fetchedBackgroundImageMode = ['none', 'dots', 'stripes', 'checks', 'image'].includes(data.background_image_mode) ? data.background_image_mode : 'none';
      const fetchedBackgroundDotSize = clampBackgroundDotSize(data.background_dot_size || data.background_pattern_size || '10');
      const fetchedBackgroundStripeWidth = clampBackgroundStripeWidth(data.background_stripe_width || data.background_pattern_size || '16');
      const fetchedBackgroundCheckSize = clampBackgroundCheckSize(data.background_check_size || data.background_pattern_size || '32');
      const fetchedBackgroundImageData = data.background_image_url || data.background_image_data || '';
      const fetchedBackgroundImageFilename = data.background_image_filename || '';
      const fetchedBackgroundImageLayout = normalizeBackgroundImageLayout(data.background_image_layout || 'fit');
      setBackgroundImageMode(fetchedBackgroundImageMode);
      setBackgroundDotSize(fetchedBackgroundDotSize);
      setBackgroundStripeWidth(fetchedBackgroundStripeWidth);
      setBackgroundCheckSize(fetchedBackgroundCheckSize);
      setBackgroundImageData(fetchedBackgroundImageData);
      setBackgroundImageFilename(fetchedBackgroundImageFilename);
      setBackgroundImageLayout(fetchedBackgroundImageLayout);
      updateBackgroundSettingsSnapshot({
        backgroundImageMode: fetchedBackgroundImageMode,
        backgroundDotSize: fetchedBackgroundDotSize,
        backgroundStripeWidth: fetchedBackgroundStripeWidth,
        backgroundCheckSize: fetchedBackgroundCheckSize,
        backgroundImageData: fetchedBackgroundImageData,
        backgroundImageFilename: fetchedBackgroundImageFilename,
        backgroundImageLayout: fetchedBackgroundImageLayout,
      });
      const fetchedCurrency = data.currency || 'JPY';
      const fetchedUserNickname = data.user_nickname || '';
      const fetchedAiPronoun = data.ai_pronoun || '私';
      const fetchedSendKey = data.send_key || 'shift_enter';
      const fetchedAllowedHosts = data.allowed_hosts || '';
      setCurrency(fetchedCurrency);
      setUserNickname(fetchedUserNickname);
      setAiPronoun(fetchedAiPronoun);
      setSendKey(fetchedSendKey);
      setAllowedHosts(fetchedAllowedHosts);
      setSavedNonPromptSettings({
        llmEnabled: fetchedLlmEnabled,
        provider: fetchedProvider,
        url: fetchedProvider === OPENAI_API_PROVIDER && !fetchedUrl ? OPENAI_API_URL : fetchedUrl,
        model: fetchedModel,
        openAiApiKey: '',
        language: fetchedLanguage,
        themeColor: color,
        themeWallpaper: wallpaper,
        backgroundImageMode: fetchedBackgroundImageMode,
        backgroundDotSize: fetchedBackgroundDotSize,
        backgroundStripeWidth: fetchedBackgroundStripeWidth,
        backgroundCheckSize: fetchedBackgroundCheckSize,
        backgroundImageData: fetchedBackgroundImageData,
        backgroundImageFilename: fetchedBackgroundImageFilename,
        backgroundImageLayout: fetchedBackgroundImageLayout,
        currency: fetchedCurrency,
        userNickname: fetchedUserNickname,
        aiPronoun: fetchedAiPronoun,
        sendKey: fetchedSendKey,
        allowedHosts: fetchedAllowedHosts,
      });
      onSaveSuccess({
        themeColor: color,
        themeWallpaper: wallpaper,
        backgroundImageMode: fetchedBackgroundImageMode,
        backgroundDotSize: fetchedBackgroundDotSize,
        backgroundStripeWidth: fetchedBackgroundStripeWidth,
        backgroundCheckSize: fetchedBackgroundCheckSize,
        backgroundImageData: fetchedBackgroundImageData,
        backgroundImageFilename: fetchedBackgroundImageFilename,
        backgroundImageLayout: fetchedBackgroundImageLayout,
        currency: fetchedCurrency,
        language: fetchedLanguage,
        sendKey: fetchedSendKey,
      });

      if (fetchedLlmEnabled && (data.llm_url || fetchedProvider === OPENAI_API_PROVIDER)) {
        fetchModels(fetchedProvider, data.llm_url || OPENAI_API_URL, data.llm_model);
      }
    } catch (err: unknown) {
      console.error(err);
    }
  };

  const fetchModels = async (currentProvider: string, currentUrl: string, selectedModel?: string) => {
    const resolvedUrl = currentProvider === OPENAI_API_PROVIDER && !currentUrl ? OPENAI_API_URL : currentUrl;
    const baseModels = getBaseModelsForProvider(currentProvider);
    if (!resolvedUrl) {
      setModelsList(mergeModels(baseModels, [], selectedModel));
      return;
    }
    setLoadingModels(true);
    try {
      const response = await fetch(`${apiBase}/api/settings/models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ provider: currentProvider, url: resolvedUrl })
      });
      if (response.ok) {
        const data = await response.json();
        const nextModels = mergeModels(baseModels, data.models || [], selectedModel);
        setModelsList(nextModels);
        if (selectedModel) {
          setModel(selectedModel);
          setManualModelEnabled(!nextModels.includes(selectedModel));
        } else if (nextModels.length > 0) {
          setModel(nextModels[0]);
          setManualModelEnabled(false);
        }
      } else {
        const fallbackModels = mergeModels(baseModels, [], selectedModel);
        setModelsList(fallbackModels);
        if (selectedModel) {
          setModel(selectedModel);
          setManualModelEnabled(!fallbackModels.includes(selectedModel));
        } else if (fallbackModels.length > 0) {
          setModel(fallbackModels[0]);
          setManualModelEnabled(false);
        }
      }
    } catch (err) {
      console.error('Failed to fetch models', err);
      const fallbackModels = mergeModels(baseModels, [], selectedModel);
      setModelsList(fallbackModels);
      if (selectedModel) {
        setModel(selectedModel);
        setManualModelEnabled(!fallbackModels.includes(selectedModel));
      }
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const fetchDesktopConfig = async () => {
      if (!canManageSystemSettings) {
        if (!cancelled) setShowExternalAccessToggle(false);
        return;
      }
      try {
        const response = await fetch(`${apiBase}/api/desktop/config`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
          if (!cancelled) setShowExternalAccessToggle(false);
          return;
        }
        const data = await response.json();
        if (cancelled) return;
        setExternalAccess(!!data.external_access);
        setShowExternalAccessToggle(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) setShowExternalAccessToggle(false);
      }
    };
    fetchDesktopConfig();
    return () => {
      cancelled = true;
    };
  }, [token, apiBase, canManageSystemSettings]);

  const handleExternalAccessChange = async (enabled: boolean) => {
    const previousValue = externalAccess;
    setExternalAccess(enabled);
    setSavingSection('external-access');

    try {
      const response = await fetch(`${apiBase}/api/desktop/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ external_access: enabled })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = await response.json();
      setExternalAccess(!!data.external_access);
    } catch (err: unknown) {
      setExternalAccess(previousValue);
      alert(getErrorMessage(err));
    } finally {
      setSavingSection(null);
    }
  };

  const handleLlmEnabledChange = async (enabled: boolean) => {
    const previousValue = llmEnabled;
    setLlmEnabled(enabled);
    setSaving(true);
    setSavingSection('llm-toggle');
    setMessage('');

    try {
      const data = await saveSettingsPayload({ llm_enabled: enabled ? 'true' : 'false' });
      if (!data) return;
      setSavedNonPromptSettings((prev) => {
        const base = prev || getCurrentNonPromptSettings();
        return { ...base, llmEnabled: enabled };
      });
      showSavedMessage(
        enabled
          ? t('settings_llm_turned_on')
          : t('settings_llm_turned_off')
      );
    } catch (err: unknown) {
      setLlmEnabled(previousValue);
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
      setSavingSection(null);
    }
  };

  const handleSaveSettingsSection = async (
    section: SettingsSection,
    keys: (keyof NonPromptSettings)[]
  ) => {
    const payload = getChangedSettingsPayload(keys);

    if (section === 'theme') {
      const current = getCurrentNonPromptSettings();
      keys.forEach((key) => {
        payload[settingStorageKeys[key]] = getSettingPayloadValue(key, current[key]);
      });
      writeBackgroundSettingsPayload(payload);
    }

    if (Object.keys(payload).length === 0) return;

    setSaving(true);
    setSavingSection(section);
    setMessage('');

    try {
      const data = await saveSettingsPayload(payload);
      if (!data) return;
      
      if (Object.prototype.hasOwnProperty.call(payload, 'openai_api_key')) {
        setOpenAiApiKey('');
        setOpenAiApiKeySource(data.openai_api_key_source === 'env' || data.openai_api_key_source === 'stored' ? data.openai_api_key_source : 'none');
        setOpenAiApiKeyConfigured(data.openai_api_key_configured === true);
        setSavedNonPromptSettings((prev) => ({ ...(prev || getCurrentNonPromptSettings()), openAiApiKey: '' }));
      }

      if (section === 'theme') {
        syncThemeSettingsFromResponse(data, payload);
      } else if (section === 'ai') {
        syncAppSavedSettings(keys);
      }
      if (section !== 'theme') {
        markSettingsSaved(keys);
      }
      showSavedMessage();
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
      setSavingSection(null);
    }
  };

  const savePrompt = async (page: PromptPage, lang: PromptLang, value: string, mode: PromptMode) => {
    setSaving(true);
    setSavingSection('prompt');
    setMessage('');
    try {
      const payload = mode === 'custom'
        ? {
            [promptStorageKeys[page][lang]]: value,
            [promptModeStorageKeys[page][lang]]: mode,
          }
        : {
            [promptModeStorageKeys[page][lang]]: mode,
          };
      const data = await saveSettingsPayload(payload);
      if (!data) return;
      const savedValue = mode === 'default' ? defaultPrompts[page][lang] : value;
      updatePrompt(page, lang, savedValue);
      setPromptModes((prev) => ({
        ...prev,
        [page]: {
          ...prev[page],
          [lang]: mode,
        },
      }));
      setEditingPrompts((prev) => ({ ...prev, [getPromptEditKey(page, lang)]: false }));
      setMessage(t('settings_prompt_saved'));
      setTimeout(() => setMessage(''), 3000);
    } catch (err: unknown) {
      alert(getErrorMessage(err));
    } finally {
      setSaving(false);
      setSavingSection(null);
    }
  };

  const handleSavePrompt = async (page: PromptPage, lang: PromptLang) => {
    await savePrompt(page, lang, systemPrompts[page][lang], 'custom');
  };

  const handleResetPrompt = async (page: PromptPage, lang: PromptLang) => {
    if (window.confirm(t('settings_reset_prompt_confirm'))) {
      await savePrompt(page, lang, defaultPrompts[page][lang], 'default');
    }
  };

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fetchModels(provider, url);
    }
  };

  const renderSectionSaveButton = (
    section: SettingsSection,
    isDirty: boolean,
    onClick: () => void
  ) => (
    <button
      type="button"
      className={`btn ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
      onClick={onClick}
      disabled={!isDirty || saving}
      style={{
        height: '34px',
        padding: '0 0.85rem',
        gap: '0.4rem',
        whiteSpace: 'nowrap',
        boxShadow: isDirty ? '0 4px 14px rgba(var(--accent-primary-rgb), 0.28)' : 'none',
        opacity: !isDirty || saving ? 0.72 : 1,
      }}
    >
      <Save size={15} />
      <span>{savingSection === section ? t('settings_saving') : getTranslation(language, 'save')}</span>
    </button>
  );

  const renderSectionSaveFooter = (
    section: SettingsSection,
    isDirty: boolean,
    onClick: () => void
  ) => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
      {renderSectionSaveButton(section, isDirty, onClick)}
    </div>
  );

  return (
    <div className="page-container" style={{ position: 'relative', minHeight: 'calc(100vh - 120px)', maxWidth: '800px', marginTop: 'calc(60px + 2rem)', marginLeft: 'auto', marginRight: 'auto', width: '100%' }}>
      <div className="settings-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
          <span>{getTranslation(language, 'settings_title')}</span>
        </h2>
        {message && (
          <div className="glass-card" style={{ padding: '0.5rem 1.25rem', color: 'var(--accent-primary)', fontSize: '0.9rem', fontWeight: 600, animation: 'fadeIn 0.2s forwards' }}>
            {message}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '3rem' }}>
        
        {/* LLM Settings Panel */}
        {canManageSystemSettings && (
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', margin: 0, lineHeight: 1.2 }}>
              <span>{getTranslation(language, 'settings_ai_llm')}</span>
              <label style={{ display: 'inline-flex', alignItems: 'center', height: '1.2em', color: 'var(--text-secondary)', cursor: savingSection === 'llm-toggle' ? 'wait' : 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={llmEnabled}
                  disabled={savingSection === 'llm-toggle'}
                  onChange={(e) => handleLlmEnabledChange(e.target.checked)}
                  style={{ display: 'none' }}
                  aria-label={getTranslation(language, 'settings_ai_llm')}
                />
                <span
                  aria-hidden="true"
                  style={{
                    position: 'relative',
                    width: '42px',
                    height: '24px',
                    borderRadius: '999px',
                    background: llmEnabled ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    transition: 'background 0.2s ease',
                    boxShadow: llmEnabled ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.25)' : 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: llmEnabled ? '21px' : '3px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s ease',
                    }}
                  />
                </span>
              </label>
            </h3>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="llm-provider" style={llmDisabledLabelStyle}>{getTranslation(language, 'settings_llm_provider')}</label>
            <select
              id="llm-provider"
              className="input-control"
              value={provider}
              disabled={!llmEnabled}
              style={llmDisabledControlStyle}
              onChange={(e) => {
                const nextProvider = e.target.value;
                const nextUrl = getDefaultUrlForProvider(nextProvider);
                const nextModels = getBaseModelsForProvider(nextProvider);
                setProvider(nextProvider);
                setUrl(nextUrl);
                setModelsList(nextModels);
                setManualModelEnabled(false);
                setModel(nextModels[0] || '');
                setOpenAiApiKey('');
              }}
            >
              <option value="openai">{t('settings_provider_openai')}</option>
              <option value="ollama">{t('settings_provider_ollama')}</option>
              <option value="openai_api">{t('settings_provider_openai_api')}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="llm-url" style={llmDisabledLabelStyle}>{getTranslation(language, 'settings_llm_url')}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="llm-url"
                type="text"
                className="input-control"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleUrlKeyDown}
                disabled={!llmEnabled || provider === OPENAI_API_PROVIDER}
                style={llmDisabledControlStyle}
                placeholder={provider === OPENAI_API_PROVIDER ? OPENAI_API_URL : 'http://localhost:1234'}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fetchModels(provider, url, model)}
                disabled={!llmEnabled || loadingModels}
                style={{ padding: '8px' }}
              >
                <RefreshCw size={18} className={loadingModels ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {provider === OPENAI_API_PROVIDER && (
            <div className="form-group">
              <label className="form-label" htmlFor="openai-api-key-input" style={llmDisabledLabelStyle}>OPENAI_API_KEY</label>
              {openAiApiKeySource === 'env' ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.45 }}>
                  {t('settings_api_key_env_notice')}
                </div>
              ) : (
                <>
                  <input
                    id="openai-api-key-input"
                    type="password"
                    className="input-control"
                    value={openAiApiKey}
                    onChange={(e) => setOpenAiApiKey(e.target.value)}
                    disabled={!llmEnabled}
                    style={llmDisabledControlStyle}
                    placeholder={
                      openAiApiKeyConfigured
                        ? t('settings_api_key_stored_placeholder')
                        : 'sk-...'
                    }
                    autoComplete="off"
                  />
                  <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.45 }}>
                    {t('settings_api_key_notice')}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="llm-model-select" style={llmDisabledLabelStyle}>{getTranslation(language, 'settings_llm_model')}</label>
            <select
              id="llm-model-select"
              className="input-control"
              value={manualModelEnabled ? CUSTOM_MODEL_VALUE : model}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL_VALUE) {
                  setManualModelEnabled(true);
                  if (modelsList.includes(model)) {
                    setModel('');
                  }
                } else {
                  setManualModelEnabled(false);
                  setModel(e.target.value);
                }
              }}
              disabled={!llmEnabled}
              style={llmDisabledControlStyle}
            >
              {modelsList.length === 0 && <option value="">{t('settings_model_select_placeholder')}</option>}
              {modelsList.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              <option value={CUSTOM_MODEL_VALUE}>{t('settings_model_manual_entry')}</option>
            </select>
            {manualModelEnabled && (
              <input
                type="text"
                className="input-control"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!llmEnabled}
                style={{ ...llmDisabledControlStyle, marginTop: '0.5rem' }}
                placeholder={t('settings_model_id_placeholder')}
              />
            )}
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="user-nickname-input" style={llmDisabledLabelStyle}>{getTranslation(language, 'settings_user_nickname')}</label>
              <input
                id="user-nickname-input"
                type="text"
                className="input-control"
                value={userNickname}
                onChange={(e) => setUserNickname(e.target.value)}
                disabled={!llmEnabled}
                style={llmDisabledControlStyle}
                placeholder={t('settings_nickname_placeholder')}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ai-pronoun-input" style={llmDisabledLabelStyle}>{getTranslation(language, 'settings_ai_pronoun')}</label>
              <input
                id="ai-pronoun-input"
                type="text"
                className="input-control"
                value={aiPronoun}
                onChange={(e) => setAiPronoun(e.target.value)}
                disabled={!llmEnabled}
                style={llmDisabledControlStyle}
                placeholder="私"
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={llmDisabledLabelStyle}>{t('settings_send_key_label')}</label>
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-color)', height: '36px', boxSizing: 'border-box', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`btn ${sendKey === 'enter' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0 12px', fontSize: '0.85rem', borderRadius: '6px', border: 'none', background: !llmEnabled ? 'transparent' : sendKey === 'enter' ? 'var(--accent-primary)' : 'transparent', color: !llmEnabled ? 'var(--text-muted)' : sendKey === 'enter' ? '#fff' : 'var(--text-secondary)', opacity: !llmEnabled ? 0.65 : 1, height: '100%', boxSizing: 'border-box', boxShadow: llmEnabled && sendKey === 'enter' ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none' }}
                  disabled={!llmEnabled}
                  onClick={() => setSendKey('enter')}
                >
                  Enter
                </button>
                <button
                  type="button"
                  className={`btn ${sendKey === 'shift_enter' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0 12px', fontSize: '0.85rem', borderRadius: '6px', border: 'none', background: !llmEnabled ? 'transparent' : sendKey === 'shift_enter' ? 'var(--accent-primary)' : 'transparent', color: !llmEnabled ? 'var(--text-muted)' : sendKey === 'shift_enter' ? '#fff' : 'var(--text-secondary)', opacity: !llmEnabled ? 0.65 : 1, height: '100%', boxSizing: 'border-box', boxShadow: llmEnabled && sendKey === 'shift_enter' ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none' }}
                  disabled={!llmEnabled}
                  onClick={() => setSendKey('shift_enter')}
                >
                  Shift + Enter
                </button>
                <button
                  type="button"
                  className={`btn ${sendKey === 'ctrl_cmd_enter' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, padding: '0 12px', fontSize: '0.85rem', borderRadius: '6px', border: 'none', background: !llmEnabled ? 'transparent' : sendKey === 'ctrl_cmd_enter' ? 'var(--accent-primary)' : 'transparent', color: !llmEnabled ? 'var(--text-muted)' : sendKey === 'ctrl_cmd_enter' ? '#fff' : 'var(--text-secondary)', opacity: !llmEnabled ? 0.65 : 1, height: '100%', boxSizing: 'border-box', boxShadow: llmEnabled && sendKey === 'ctrl_cmd_enter' ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none' }}
                  disabled={!llmEnabled}
                  onClick={() => setSendKey('ctrl_cmd_enter')}
                >
                  Ctrl / Cmd +Enter
                </button>
              </div>
            </div>
          </div>

          {renderSectionSaveFooter('ai', isAiSettingsDirty, () => handleSaveSettingsSection('ai', aiSettingKeys))}
        </div>
        )}

        {/* Customization (Theme / Language) Panel */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>{getTranslation(language, 'settings_theme')}</h3>
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="lang-select">{getTranslation(language, 'settings_locale')}</label>
              <select
                id="lang-select"
                className="input-control"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="ja">{t('settings_locale_japanese')}</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="currency-select">{t('settings_currency_label')}</label>
              <select
                id="currency-select"
                className="input-control"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="JPY">JPY (¥)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="theme-color-select">{getTranslation(language, 'settings_theme_color')}</label>
              <select
                id="theme-color-select"
                className="input-control"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
              >
                <option value="tomato">Flesh Tomato</option>
                <option value="ocean">Ocean Blue</option>
                <option value="forest">Forest Green</option>
                <option value="lemon">Sunny Lemon</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="wallpaper-select">{t('settings_wallpaper_label')}</label>
              <select
                id="wallpaper-select"
                className="input-control"
                value={themeWallpaper}
                onChange={(e) => setThemeWallpaper(e.target.value)}
              >
                <option value="light">Light</option>
                <option value="sand">Sand</option>
                <option value="rose">Rose</option>
                <option value="slate">Slate</option>
                <option value="forest">Forest</option>
                <option value="dark">Dark</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="background-image-mode-select">{t('settings_background_image_label')}</label>
              <select
                id="background-image-mode-select"
                className="input-control"
                value={backgroundImageMode}
                onChange={(e) => handleBackgroundImageModeChange(e.target.value)}
              >
                <option value="none">{t('settings_bg_mode_none')}</option>
                <option value="dots">{t('settings_bg_mode_dots')}</option>
                <option value="stripes">{t('settings_bg_mode_stripes')}</option>
                <option value="checks">{t('settings_bg_mode_checks')}</option>
                <option value="image">{t('settings_bg_mode_image')}</option>
              </select>
            </div>

            {(backgroundImageMode === 'dots' || backgroundImageMode === 'stripes' || backgroundImageMode === 'checks') && (
              <div className="form-group">
                <label className="form-label" htmlFor="background-pattern-size">
                  {backgroundImageMode === 'dots'
                    ? t('settings_bg_dot_size_label')
                    : backgroundImageMode === 'stripes'
                      ? t('settings_bg_stripe_width_label')
                      : t('settings_bg_check_spacing_label')}
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    {backgroundImageMode === 'dots'
                      ? backgroundDotSize
                      : backgroundImageMode === 'stripes'
                        ? backgroundStripeWidth
                        : backgroundCheckSize}px
                  </span>
                </label>
                <input
                  id="background-pattern-size"
                  className="input-control range-control"
                  type="range"
                  min={backgroundImageMode === 'dots' ? 4 : 8}
                  max={backgroundImageMode === 'stripes' ? 96 : 192}
                  step="1"
                  value={backgroundImageMode === 'dots'
                    ? backgroundDotSize
                    : backgroundImageMode === 'stripes'
                      ? backgroundStripeWidth
                      : backgroundCheckSize}
                  onChange={(e) => {
                    if (backgroundImageMode === 'dots') {
                      updateBackgroundSettingsSnapshot({ backgroundDotSize: e.target.value });
                      setBackgroundDotSize(e.target.value);
                    } else if (backgroundImageMode === 'stripes') {
                      updateBackgroundSettingsSnapshot({ backgroundStripeWidth: e.target.value });
                      setBackgroundStripeWidth(e.target.value);
                    } else {
                      updateBackgroundSettingsSnapshot({ backgroundCheckSize: e.target.value });
                      setBackgroundCheckSize(e.target.value);
                    }
                  }}
                />
              </div>
            )}

            {backgroundImageMode === 'image' && (
              <div className="form-group">
                <label className="form-label" htmlFor="background-image-file">
                  {t('settings_upload_image_label')}
                  {backgroundImageData && (
                    <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 400 }}>
                      {backgroundImageFilename ? (
                        <>
                          {t('settings_saved_image_label')}
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{backgroundImageFilename}</span>
                        </>
                      ) : (
                        t('settings_saved_image_applied')
                      )}
                    </span>
                  )}
                </label>
                <input
                  id="background-image-file"
                  className="input-control"
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundImageFileChange}
                />

                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-color)', height: '36px', boxSizing: 'border-box', alignItems: 'center' }}>
                  {[
                    { value: 'tile', label: t('settings_layout_tile') },
                    { value: 'original', label: t('settings_layout_original') },
                    { value: 'fit', label: t('settings_layout_fit') },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`btn ${backgroundImageLayout === option.value ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ flex: 1, padding: '0 10px', fontSize: '0.82rem', borderRadius: '6px', border: 'none', background: backgroundImageLayout === option.value ? 'var(--accent-primary)' : 'transparent', color: backgroundImageLayout === option.value ? '#fff' : 'var(--text-secondary)', height: '100%', boxSizing: 'border-box', boxShadow: backgroundImageLayout === option.value ? '0 2px 8px rgba(var(--accent-primary-rgb), 0.3)' : 'none' }}
                      onClick={() => {
                        updateBackgroundSettingsSnapshot({ backgroundImageLayout: option.value });
                        setBackgroundImageLayout(option.value);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{t('settings_clear_delete_confirm_label')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleClearDeleteConfirmSkips}
                  style={{
                    height: '34px',
                    padding: '0 0.85rem',
                    gap: '0.4rem',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 14px rgba(var(--accent-primary-rgb), 0.28)',
                  }}
                >
                  {t('settings_clear_delete_confirm_button')}
                </button>
                {deleteConfirmSkipsCleared && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {t('settings_clear_delete_confirm_done')}
                  </span>
                )}
              </div>
            </div>
          </div>
          {renderSectionSaveFooter('theme', isThemeSettingsDirty, () => handleSaveSettingsSection('theme', themeSettingKeys))}
        </div>

        {/* Allowed Hosts Panel (Admin Only) */}
        {canManageSystemSettings && (
          <div className="glass-card" style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{t('settings_access_control_title')}</h3>
            </div>
            {showExternalAccessToggle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('settings_external_access_label')}</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={externalAccess}
                    disabled={savingSection === 'external-access'}
                    onChange={(e) => handleExternalAccessChange(e.target.checked)}
                    aria-label={t('settings_external_access_label')}
                  />
                  <span className="toggle-switch-slider" />
                </label>
              </div>
            )}
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.4', ...(allowedHostsDisabled ? { color: 'var(--text-muted)', opacity: 0.65 } : {}) }}>
              {t('settings_access_control_desc')}
            </p>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input
                type="text"
                className="input-control"
                placeholder="mac-mini-1, 100.115.12.34"
                value={allowedHosts}
                onChange={(e) => setAllowedHosts(e.target.value)}
                disabled={allowedHostsDisabled}
                style={allowedHostsDisabledStyle}
              />
            </div>
            {renderSectionSaveFooter('access', isAccessSettingsDirty, () => handleSaveSettingsSection('access', accessSettingKeys))}
          </div>
        )}

        {/* System Prompt Panel */}
        {canManageSystemSettings && (
        <div className="glass-card" style={{ gridColumn: 'span 2' }}>
          <h3>{getTranslation(language, 'settings_prompt_manage')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
            {promptPages.map((page) => {
              const activeLang: PromptLang = language === 'en' ? 'en' : 'ja';
              const editKey = getPromptEditKey(page, activeLang);
              const isEditing = !!editingPrompts[editKey];
              const isDefault = promptModes[page][activeLang] === 'default';
              return (
                <div key={page} style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1rem' }}>{getPromptPageLabel(page)}</h4>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleResetPrompt(page, activeLang)}
                        disabled={isDefault}
                        style={{ height: '34px', padding: '0 0.9rem', boxSizing: 'border-box' }}
                      >
                        {getTranslation(language, 'settings_reset_prompt')}
                      </button>
                      <button
                        type="button"
                        className={`btn ${isEditing ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                          if (isEditing) {
                            handleSavePrompt(page, activeLang);
                          } else {
                            setEditingPrompts((prev) => ({ ...prev, [editKey]: true }));
                          }
                        }}
                        style={{ height: '34px', padding: '0 0.9rem', boxSizing: 'border-box' }}
                      >
                        {isEditing ? t('settings_prompt_apply') : getTranslation(language, 'settings_edit_prompt')}
                      </button>
                    </div>
                  </div>
                  <textarea
                    id={`sys-prompt-${page}-${activeLang}`}
                    className="input-control"
                    rows={8}
                    value={systemPrompts[page][activeLang]}
                    onChange={(e) => updatePrompt(page, activeLang, e.target.value)}
                    placeholder={t('settings_prompt_placeholder')}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      background: isEditing ? 'transparent' : 'rgba(255,255,255,0.02)',
                      color: isEditing ? 'var(--text-primary)' : 'var(--text-secondary)',
                      cursor: isEditing ? 'text' : 'default',
                      minHeight: '360px',
                    }}
                    readOnly={!isEditing}
                  />
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {canManageSystemSettings && (
        <PageChatDrawer
          token={token}
          apiBase={apiBase}
          onLogout={onLogout}
          mode="settings"
          language={language}
          sendKey={sendKey}
          onExecuteSuccess={fetchSettings}
          messages={drawerMessages}
          setMessages={setDrawerMessages}
        />
      )}
    </div>
  );
};

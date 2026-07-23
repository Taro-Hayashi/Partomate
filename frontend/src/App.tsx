import { useState, useEffect, useRef, lazy, Suspense, type FocusEvent, type PointerEvent } from 'react';
import { SetupAdmin } from './components/SetupAdmin';
import { Login } from './components/Login';
import { Navigation } from './components/Navigation';
import { type Message } from './types/chat';
import { getTranslation } from './utils/i18n';

const PartsPage = lazy(() => import('./components/PartsPage').then((m) => ({ default: m.PartsPage })));
const ProductsPage = lazy(() => import('./components/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const ChatPage = lazy(() => import('./components/ChatPage').then((m) => ({ default: m.ChatPage })));
const SettingsPage = lazy(() => import('./components/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const detectBrowserLanguage = () =>
  (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';

const API_PORT = import.meta.env.VITE_API_PORT || '18000';
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  `${window.location.protocol}//${window.location.hostname}:${API_PORT}`;

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

const resolveBackgroundImageUrl = (imageUrl: string) => {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('data:')) return imageUrl;
  if (imageUrl.startsWith('/')) return `${API_BASE}${imageUrl}`;
  return imageUrl;
};

function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('partomate_token'));
  const [username, setUsername] = useState<string>(localStorage.getItem('partomate_username') || '');
  const [role, setRole] = useState<string>(localStorage.getItem('partomate_role') || '');
  
  const [currentPage, setCurrentPage] = useState('chat'); // Default screen is AI chat assistant
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [drawerMessages, setDrawerMessages] = useState<Record<string, Message[]>>({
    parts: [],
    products: [],
    settings: []
  });

  const setPartsDrawerMessages = (val: Message[] | ((prev: Message[]) => Message[])) => {
    setDrawerMessages((prev) => ({
      ...prev,
      parts: typeof val === 'function' ? val(prev.parts) : val
    }));
  };

  const setProductsDrawerMessages = (val: Message[] | ((prev: Message[]) => Message[])) => {
    setDrawerMessages((prev) => ({
      ...prev,
      products: typeof val === 'function' ? val(prev.products) : val
    }));
  };

  const setSettingsDrawerMessages = (val: Message[] | ((prev: Message[]) => Message[])) => {
    setDrawerMessages((prev) => ({
      ...prev,
      settings: typeof val === 'function' ? val(prev.settings) : val
    }));
  };
  const [themeColor, setThemeColor] = useState<string>('tomato');
  const [themeWallpaper, setThemeWallpaper] = useState<string>('light');
  const [backgroundImageMode, setBackgroundImageMode] = useState<string>('none');
  const [backgroundDotSize, setBackgroundDotSize] = useState<string>('10');
  const [backgroundStripeWidth, setBackgroundStripeWidth] = useState<string>('16');
  const [backgroundCheckSize, setBackgroundCheckSize] = useState<string>('32');
  const [backgroundImageData, setBackgroundImageData] = useState<string>('');
  const [backgroundImageFilename, setBackgroundImageFilename] = useState<string>('');
  const [backgroundImageLayout, setBackgroundImageLayout] = useState<string>('fit');
  const [currency, setCurrency] = useState<string>('JPY');
  const [language, setLanguage] = useState<string>(detectBrowserLanguage);
  const [sendKey, setSendKey] = useState<string>('shift_enter');
  const previousPageRef = useRef(currentPage);

  const originalSettingsRef = useRef({
    themeColor: 'tomato',
    themeWallpaper: 'light',
    backgroundImageMode: 'none',
    backgroundDotSize: '10',
    backgroundStripeWidth: '16',
    backgroundCheckSize: '32',
    backgroundImageData: '',
    backgroundImageFilename: '',
    backgroundImageLayout: 'fit',
    currency: 'JPY',
    language: 'ja',
    sendKey: 'shift_enter'
  });

  const applyAppearanceSettings = (
    color: string,
    wallpaper: string,
    imageMode: string,
    dotSize: string,
    stripeWidth: string,
    checkSize: string,
    imageData: string,
    imageLayout: string
  ) => {
    const normalizedImageLayout = normalizeBackgroundImageLayout(imageLayout);
    const resolvedImageUrl = resolveBackgroundImageUrl(imageData);
    document.documentElement.className = `theme-${color} wallpaper-${wallpaper} background-image-${imageMode} background-image-layout-${normalizedImageLayout}`;
    document.documentElement.style.setProperty('--background-dot-size', `${Number(clampBackgroundDotSize(dotSize)) || 10}px`);
    document.documentElement.style.setProperty('--background-stripe-width', `${Number(clampBackgroundStripeWidth(stripeWidth)) || 10}px`);
    document.documentElement.style.setProperty('--background-check-size', `${Number(clampBackgroundCheckSize(checkSize)) || 32}px`);
    document.documentElement.style.setProperty('--background-image-url', resolvedImageUrl ? `url("${resolvedImageUrl}")` : 'none');
  };

  // Fetch theme settings on mount/login
  useEffect(() => {
    if (!token) return;
    const fetchThemeSettings = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          let color = data.theme_color || 'tomato';
          if (color === 'default') color = 'tomato';
          if (color === 'sunset') color = 'lemon';
          let wallpaper = data.theme_wallpaper || 'light';
          if (wallpaper === 'default') wallpaper = 'light';
          if (wallpaper === 'solid') wallpaper = 'dark';
          if (wallpaper === 'frost') wallpaper = 'slate';
          const curr = data.currency || 'JPY';
          const lang = data.language || 'ja';
          const key = data.send_key || 'shift_enter';
          const imageMode = ['none', 'dots', 'stripes', 'checks', 'image'].includes(data.background_image_mode) ? data.background_image_mode : 'none';
          const dotSize = clampBackgroundDotSize(data.background_dot_size || data.background_pattern_size || '10');
          const stripeWidth = clampBackgroundStripeWidth(data.background_stripe_width || data.background_pattern_size || '16');
          const checkSize = clampBackgroundCheckSize(data.background_check_size || data.background_pattern_size || '32');
          const imageData = data.background_image_url || data.background_image_data || '';
          const imageFilename = data.background_image_filename || '';
          const imageLayout = normalizeBackgroundImageLayout(data.background_image_layout || 'fit');
          setThemeColor(color);
          setThemeWallpaper(wallpaper);
          setBackgroundImageMode(imageMode);
          setBackgroundDotSize(dotSize);
          setBackgroundStripeWidth(stripeWidth);
          setBackgroundCheckSize(checkSize);
          setBackgroundImageData(imageData);
          setBackgroundImageFilename(imageFilename);
          setBackgroundImageLayout(imageLayout);
          setCurrency(curr);
          setLanguage(lang);
          setSendKey(key);
          applyAppearanceSettings(color, wallpaper, imageMode, dotSize, stripeWidth, checkSize, imageData, imageLayout);

          originalSettingsRef.current = {
            themeColor: color,
            themeWallpaper: wallpaper,
            backgroundImageMode: imageMode,
            backgroundDotSize: dotSize,
            backgroundStripeWidth: stripeWidth,
            backgroundCheckSize: checkSize,
            backgroundImageData: imageData,
            backgroundImageFilename: imageFilename,
            backgroundImageLayout: imageLayout,
            currency: curr,
            language: lang,
            sendKey: key
          };
        }
      } catch (err) {
        console.error('Failed to load theme settings', err);
      }
    };
    fetchThemeSettings();
  }, [token]);

  // Synchronize document.documentElement.className with state
  useEffect(() => {
    applyAppearanceSettings(themeColor, themeWallpaper, backgroundImageMode, backgroundDotSize, backgroundStripeWidth, backgroundCheckSize, backgroundImageData, backgroundImageLayout);
  }, [themeColor, themeWallpaper, backgroundImageMode, backgroundDotSize, backgroundStripeWidth, backgroundCheckSize, backgroundImageData, backgroundImageLayout]);

  // Check backend setup requirements on mount
  const checkSetup = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/status`);
      if (response.ok) {
        const data = await response.json();
        setSetupRequired(data.setup_required);
      } else {
        setSetupRequired(false);
      }
    } catch (err) {
      console.error('API connection failed', err);
      setSetupRequired(false); // Fallback to login screen
    }
  };

  useEffect(() => {
    checkSetup();
  }, [token]);

  const handleSetupComplete = () => {
    setSetupRequired(false);
  };

  const handleLoginSuccess = (userToken: string, userUsername: string, userRole: string) => {
    localStorage.setItem('partomate_token', userToken);
    localStorage.setItem('partomate_username', userUsername);
    localStorage.setItem('partomate_role', userRole);
    setToken(userToken);
    setUsername(userUsername);
    setRole(userRole);
  };

  // Update browser tab title based on current page and login status
  useEffect(() => {
    if (setupRequired) {
      document.title = language === 'ja' ? '初期設定 - Partomate' : 'Setup - Partomate';
      return;
    }
    if (!token) {
      document.title = language === 'ja' ? 'ログイン - Partomate' : 'Login - Partomate';
      return;
    }

    let pageTitle: string;
    switch (currentPage) {
      case 'chat':
        pageTitle = language === 'ja' ? 'チャット' : 'Chat';
        break;
      case 'parts':
        pageTitle = language === 'ja' ? '部品在庫' : 'Stock';
        break;
      case 'products':
        pageTitle = language === 'ja' ? '商品構成' : 'Products';
        break;
      case 'settings':
        pageTitle = language === 'ja' ? 'システム設定' : 'Settings';
        break;
      default:
        pageTitle = '';
    }
    document.title = pageTitle ? `${pageTitle} - Partomate` : 'Partomate';
  }, [currentPage, language, token, setupRequired]);

  // Restore original settings if navigating away from settings without saving
  useEffect(() => {
    const previousPage = previousPageRef.current;
    previousPageRef.current = currentPage;
    if (previousPage !== 'settings' || currentPage === 'settings') return;

    const orig = originalSettingsRef.current;
    if (
      themeColor !== orig.themeColor ||
      themeWallpaper !== orig.themeWallpaper ||
      backgroundImageMode !== orig.backgroundImageMode ||
      backgroundDotSize !== orig.backgroundDotSize ||
      backgroundStripeWidth !== orig.backgroundStripeWidth ||
      backgroundCheckSize !== orig.backgroundCheckSize ||
      backgroundImageData !== orig.backgroundImageData ||
      backgroundImageFilename !== orig.backgroundImageFilename ||
      backgroundImageLayout !== orig.backgroundImageLayout ||
      currency !== orig.currency ||
      language !== orig.language ||
      sendKey !== orig.sendKey
    ) {
      setThemeColor(orig.themeColor);
      setThemeWallpaper(orig.themeWallpaper);
      setBackgroundImageMode(orig.backgroundImageMode);
      setBackgroundDotSize(orig.backgroundDotSize);
      setBackgroundStripeWidth(orig.backgroundStripeWidth);
      setBackgroundCheckSize(orig.backgroundCheckSize);
      setBackgroundImageData(orig.backgroundImageData);
      setBackgroundImageFilename(orig.backgroundImageFilename);
      setBackgroundImageLayout(orig.backgroundImageLayout);
      setCurrency(orig.currency);
      setLanguage(orig.language);
      setSendKey(orig.sendKey);
      applyAppearanceSettings(orig.themeColor, orig.themeWallpaper, orig.backgroundImageMode, orig.backgroundDotSize, orig.backgroundStripeWidth, orig.backgroundCheckSize, orig.backgroundImageData, orig.backgroundImageLayout);
    }
  }, [currentPage, themeColor, themeWallpaper, backgroundImageMode, backgroundDotSize, backgroundStripeWidth, backgroundCheckSize, backgroundImageData, backgroundImageFilename, backgroundImageLayout, currency, language, sendKey]);

  const handleSettingsSaved = (saved: {
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
  }) => {
    originalSettingsRef.current = saved;
  };

  const handleLogout = () => {
    localStorage.removeItem('partomate_token');
    localStorage.removeItem('partomate_username');
    localStorage.removeItem('partomate_role');
    setToken(null);
    setUsername('');
    setRole('');
    setCurrentPage('chat');
    // Clear theme on logout
    document.documentElement.className = '';
  };

  if (setupRequired === null) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        {getTranslation(language, 'checking_connection')}
      </div>
    );
  }

  if (setupRequired) {
    return <SetupAdmin onSetupComplete={handleSetupComplete} apiBase={API_BASE} language={language} />;
  }

  if (!token) {
    return <Login onLoginSuccess={handleLoginSuccess} apiBase={API_BASE} language={language} />;
  }

  // Handle routing navigation between page panels
  const renderPage = () => {
    switch (currentPage) {
      case 'parts':
        return (
          <PartsPage
            token={token!}
            apiBase={API_BASE}
            onLogout={handleLogout}
            language={language}
            sendKey={sendKey}
            drawerMessages={drawerMessages.parts}
            setDrawerMessages={setPartsDrawerMessages}
          />
        );
      case 'chat':
        return (
          <ChatPage
            token={token!}
            apiBase={API_BASE}
            onLogout={handleLogout}
            language={language}
            sendKey={sendKey}
            messages={chatMessages}
            setMessages={setChatMessages}
          />
        );
      case 'products':
        return (
          <ProductsPage
            token={token!}
            apiBase={API_BASE}
            onLogout={handleLogout}
            language={language}
            sendKey={sendKey}
            drawerMessages={drawerMessages.products}
            setDrawerMessages={setProductsDrawerMessages}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            token={token!}
            apiBase={API_BASE}
            currentUserRole={role}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
            themeWallpaper={themeWallpaper}
            setThemeWallpaper={setThemeWallpaper}
            backgroundImageMode={backgroundImageMode}
            setBackgroundImageMode={setBackgroundImageMode}
            backgroundDotSize={backgroundDotSize}
            setBackgroundDotSize={setBackgroundDotSize}
            backgroundStripeWidth={backgroundStripeWidth}
            setBackgroundStripeWidth={setBackgroundStripeWidth}
            backgroundCheckSize={backgroundCheckSize}
            setBackgroundCheckSize={setBackgroundCheckSize}
            backgroundImageData={backgroundImageData}
            setBackgroundImageData={setBackgroundImageData}
            backgroundImageFilename={backgroundImageFilename}
            setBackgroundImageFilename={setBackgroundImageFilename}
            backgroundImageLayout={backgroundImageLayout}
            setBackgroundImageLayout={setBackgroundImageLayout}
            currency={currency}
            setCurrency={setCurrency}
            language={language}
            setLanguage={setLanguage}
            sendKey={sendKey}
            setSendKey={setSendKey}
            onLogout={handleLogout}
            onSaveSuccess={handleSettingsSaved}
            drawerMessages={drawerMessages.settings}
            setDrawerMessages={setSettingsDrawerMessages}
          />
        );
      default:
        return (
          <ChatPage
            token={token!}
            apiBase={API_BASE}
            onLogout={handleLogout}
            language={language}
            sendKey={sendKey}
            messages={chatMessages}
            setMessages={setChatMessages}
          />
        );
    }
  };

  const closeNavOnChatInput = (
    event: FocusEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>
  ) => {
    if (!isNavOpen || !(event.target instanceof Element)) return;
    if (event.target.closest('.chat-input-field')) {
      setIsNavOpen(false);
    }
  };

  return (
    <div
      className={`app-container ${isNavOpen ? 'nav-open' : ''}`}
      onFocusCapture={closeNavOnChatInput}
      onPointerDownCapture={closeNavOnChatInput}
    >
      <Navigation
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        isOpen={isNavOpen}
        setIsOpen={setIsNavOpen}
        username={username}
        role={role}
        onLogout={handleLogout}
        language={language}
      />
      <Suspense fallback={null}>
        {renderPage()}
      </Suspense>
    </div>
  );
}

export default App;

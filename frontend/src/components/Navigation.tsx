import React from 'react';
import { Menu, X, MessageSquare, Box, Package, Settings, LogOut } from 'lucide-react';
import { getTranslation } from '../utils/i18n';

interface NavigationProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  username: string;
  role: string;
  onLogout: () => void;
  language: string;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentPage,
  setCurrentPage,
  isOpen,
  setIsOpen,
  username,
  role,
  onLogout,
  language,
}) => {
  const t = (key: string) => getTranslation(language, key);
  const links = [
    { id: 'chat', label: t('nav_chat_short'), icon: MessageSquare },
    { id: 'parts', label: t('nav_parts'), icon: Box },
    { id: 'products', label: t('nav_products'), icon: Package },
    { id: 'settings', label: t('nav_settings'), icon: Settings },
  ];

  return (
    <>
      {/* Top Header Bar */}
      <header className="top-header">
        <button
          className="menu-button"
          onClick={() => setIsOpen(true)}
          aria-label={t('nav_menu_open')}
        >
          <Menu size={24} />
        </button>
        <div style={{ width: '40px' }}></div> {/* Spacer to balance menu button */}
      </header>

      {/* Backdrop */}
      <div className={`nav-backdrop ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(false)}></div>

      {/* Drawer */}
      <div className={`nav-drawer ${isOpen ? 'open' : ''}`}>
        <div className="nav-header">
          <div
            className="nav-logo"
            onClick={() => {
              setCurrentPage('chat');
              setIsOpen(false);
            }}
            style={{ cursor: 'pointer' }}
          >
            Partomate
          </div>
          <button
            className="menu-button"
            onClick={() => setIsOpen(false)}
            aria-label={t('nav_menu_close')}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="nav-links">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <div
                key={link.id}
                className={`nav-link ${currentPage === link.id ? 'active' : ''}`}
                onClick={() => {
                  setCurrentPage(link.id);
                  setIsOpen(false);
                }}
              >
                <Icon size={20} />
                <span>{link.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="nav-footer">
          <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{username}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {role === 'admin' ? t('admin') : t('user')}
            </div>
          </div>
          <div className="nav-link" onClick={onLogout} style={{ color: 'var(--danger)', paddingLeft: '0.5rem' }}>
            <LogOut size={20} />
            <span>{t('nav_logout')}</span>
          </div>
        </div>
      </div>
    </>
  );
};

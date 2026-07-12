import React, { useState } from 'react';
import { getTranslation } from '../utils/i18n';

interface SetupAdminProps {
  onSetupComplete: () => void;
  apiBase: string;
  language: string;
}

export const SetupAdmin: React.FC<SetupAdminProps> = ({ onSetupComplete, apiBase, language }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const t = (key: string) => getTranslation(language, key);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError(t('setup_password_required'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('setup_password_mismatch'));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/auth/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, role: 'admin', language }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || t('setup_failed'));
      }

      onSetupComplete();
    } catch (err) {
      setError((err instanceof Error && err.message) || t('setup_network_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-card">
        <div className="auth-header">
          <h1 className="auth-title">{t('setup_page_title')}</h1>
          <p className="auth-subtitle">{t('setup_page_subtitle')}</p>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="on" method="post" action="/api/auth/setup">
          <div className="form-group">
            <label className="form-label" htmlFor="username">{t('username')}</label>
            <input
              id="username"
              name="username"
              type="text"
              className="input-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">{t('password')}</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">{t('setup_confirm_password')}</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="input-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={loading}
          >
            {loading ? t('setup_registering') : t('setup_register_start')}
          </button>
        </form>
      </div>
    </div>
  );
};

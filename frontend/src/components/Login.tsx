import React, { useState } from 'react';
import { getTranslation } from '../utils/i18n';

interface LoginProps {
  onLoginSuccess: (token: string, username: string, role: string) => void;
  apiBase: string;
  language: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, apiBase, language }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const t = (key: string) => getTranslation(language, key);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append('username', username);
      params.append('password', password);

      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(t('login_access_denied'));
        }
        throw new Error(t('login_incorrect_credentials'));
      }

      const data = await response.json();
      onLoginSuccess(data.access_token, data.username, data.role);
    } catch (err) {
      setError((err instanceof Error && err.message) || t('login_generic_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-card">
        <div className="auth-header">
          <h1 className="auth-title">Partomate</h1>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <form
          onSubmit={handleSubmit}
          autoComplete="on"
          method="post"
          action="/api/auth/login"
        >
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
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '1rem' }}
            disabled={loading}
          >
            {loading
              ? t('login_processing')
              : t('login_submit')}
          </button>
        </form>
      </div>
    </div>
  );
};

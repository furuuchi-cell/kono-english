import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Firebase Auth のエラーコードをユーザー向けの日本語メッセージに変換。
 * 「メールアドレスまたはパスワードが正しくありません」一辺倒では原因が分からないため、
 * 入力ミス・ロックアウト・ネットワーク等を区別する。
 */
const translateError = (code: string | undefined): string => {
  switch (code) {
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    case 'auth/user-disabled':
      return 'このアカウントは無効化されています。教室にお問い合わせください。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'メールアドレスまたはパスワードが正しくありません。';
    case 'auth/too-many-requests':
      return '試行回数が多すぎます。しばらく時間をおいてから再度お試しください。';
    case 'auth/network-request-failed':
      return 'ネットワークエラーが発生しました。通信状態をご確認ください。';
    default:
      return 'ログインに失敗しました。時間をおいて再度お試しください。';
  }
};

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      navigate('/');
    } catch (err: any) {
      setError(translateError(err?.code));
      setLoading(false);
    }
    // 成功時はそのまま遷移するので setLoading(false) は不要
  };

  const handlePasswordReset = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('パスワードを再設定するメールアドレスを入力してください。');
      return;
    }
    setResetting(true);
    try {
      await resetPassword(email.trim());
      setInfo('パスワード再設定のメールを送信しました。受信ボックスをご確認ください。');
    } catch (err: any) {
      setError(translateError(err?.code));
    }
    setResetting(false);
  };

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <div style={styles.logoBar} />
            <div style={styles.logoBar} />
            <div style={styles.logoBar} />
          </div>
          <h1 style={styles.title}>KONO式英単語</h1>
          <p style={styles.subtitle}>河野塾 英単語学習アプリ</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error} role="alert">{error}</div>}
          {info && <div style={styles.info} role="status">{info}</div>}
          <div style={styles.field}>
            <label style={styles.label} htmlFor="login-email">メールアドレス</label>
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              style={styles.input}
              placeholder="example@email.com"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="login-password">パスワード</label>
            <div style={styles.passwordWrapper}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                style={{ ...styles.input, paddingRight: 56, width: '100%' }}
                placeholder="パスワードを入力"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? '隠す' : '表示'}
              </button>
            </div>
          </div>
          <button
            type="submit"
            style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={resetting}
          style={styles.resetLink}
        >
          {resetting ? '送信中...' : 'パスワードをお忘れですか？'}
        </button>

        <p style={styles.link}>
          アカウントをお持ちでない方は <Link to="/register">新規登録</Link>
        </p>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #1a3a6b 0%, #2c5aa0 100%)',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: 40,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  },
  logoSection: {
    textAlign: 'center' as const,
    marginBottom: 32,
  },
  logoIcon: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  logoBar: {
    width: 36,
    height: 6,
    background: '#1a3a6b',
    borderRadius: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a3a6b',
    margin: 0,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 16,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  passwordWrapper: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
  },
  eyeButton: {
    position: 'absolute' as const,
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  button: {
    background: '#1a3a6b',
    color: '#fff',
    padding: '14px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    marginTop: 8,
    transition: 'background 0.2s, opacity 0.2s',
    cursor: 'pointer',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
  },
  info: {
    background: '#ecfdf5',
    color: '#047857',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
  },
  resetLink: {
    background: 'transparent',
    border: 'none',
    color: '#2c5aa0',
    fontSize: 13,
    fontWeight: 500,
    marginTop: 16,
    cursor: 'pointer',
    textDecoration: 'underline',
    display: 'block',
    textAlign: 'center' as const,
    width: '100%',
  },
  link: {
    textAlign: 'center' as const,
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
};

export default LoginPage;

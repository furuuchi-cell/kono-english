import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [furigana, setFurigana] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('パスワードは6文字以上にしてください');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, displayName, 'student', furigana);
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('このメールアドレスは既に登録されています');
      } else {
        setError('登録に失敗しました。もう一度お試しください');
      }
    }
    setLoading(false);
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
          <h1 style={styles.title}>新規登録</h1>
          <p style={styles.subtitle}>KONO式英単語</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {error && <div style={styles.error}>{error}</div>}
          <div style={styles.field}>
            <label style={styles.label}>名前</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={styles.input}
              placeholder="例：山田 太郎"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>ふりがな</label>
            <input
              type="text"
              value={furigana}
              onChange={(e) => setFurigana(e.target.value)}
              style={styles.input}
              placeholder="例：やまだ たろう"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="example@email.com"
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="6文字以上"
              required
            />
          </div>
          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>

        <p style={styles.link}>
          既にアカウントをお持ちの方は <Link to="/login">ログイン</Link>
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
  },
  button: {
    background: '#1a3a6b',
    color: '#fff',
    padding: '14px',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
    marginTop: 8,
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
  },
  link: {
    textAlign: 'center' as const,
    marginTop: 20,
    fontSize: 14,
    color: '#6b7280',
  },
};

export default RegisterPage;

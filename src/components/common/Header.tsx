import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Header: React.FC = () => {
  const { userProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <header style={styles.header}>
      <div style={styles.inner}>
        <div style={styles.logo} onClick={() => navigate('/')}>
          <svg style={styles.logoIcon} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span style={styles.logoText}>
            <span>KONO式</span>
            <span>英単語 <span style={styles.betaBadge}>β版</span></span>
          </span>
        </div>
        {userProfile && (
          <div style={styles.right}>
            <span style={styles.userName}>{userProfile.displayName}</span>
            <span style={styles.role}>
              {userProfile.role === 'admin' ? '管理者' : '生徒'}
            </span>
            <button style={styles.signOutBtn} onClick={handleSignOut}>
              ログアウト
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    background: '#1a3a6b',
    color: '#fff',
    padding: '12px 0',
    position: 'fixed',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 100,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  inner: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
  },
  logoIcon: {
    width: 24,
    height: 24,
    flexShrink: 0,
  },
  logoText: {
    fontWeight: 700,
    letterSpacing: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    fontSize: 14,
    lineHeight: 1.3,
  },
  betaBadge: {
    fontSize: 9,
    background: 'rgba(255,255,255,0.25)',
    padding: '1px 5px',
    borderRadius: 4,
    fontWeight: 500,
    verticalAlign: 'middle',
    marginLeft: 4,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  userName: {
    fontSize: 14,
    fontWeight: 500,
  },
  role: {
    fontSize: 12,
    background: 'rgba(255,255,255,0.2)',
    padding: '2px 8px',
    borderRadius: 12,
  },
  signOutBtn: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    border: '1px solid rgba(255,255,255,0.3)',
    transition: 'background 0.2s',
  },
};

export default Header;

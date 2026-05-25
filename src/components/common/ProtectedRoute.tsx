import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'student';
}

const ProtectedRoute: React.FC<Props> = ({ children, requiredRole }) => {
  const { currentUser, userProfile, loading } = useAuth();
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceChecked, setMaintenanceChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'maintenance'),
      (snapshot) => {
        setMaintenance(snapshot.exists() && snapshot.data().enabled === true);
        setMaintenanceChecked(true);
      },
      () => { setMaintenanceChecked(true); }
    );
    return unsubscribe;
  }, []);

  // currentUser がいるのに userProfile がまだ null = Firestore 読込中
  const profileLoading = !!currentUser && !userProfile;

  if (loading || !maintenanceChecked || profileLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div style={{ fontSize: 18, color: '#6b7280' }}>読み込み中...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  // Show maintenance screen for non-admin users
  if (maintenance && userProfile?.role !== 'admin') {
    return (
      <div style={maintenanceStyles.wrapper}>
        <div style={maintenanceStyles.card}>
          <div style={maintenanceStyles.icon}>🔧</div>
          <h1 style={maintenanceStyles.title}>メンテナンス中</h1>
          <p style={maintenanceStyles.text}>
            現在システムのアップデートを行っています。
          </p>
          <p style={maintenanceStyles.text}>
            しばらくお待ちください。
          </p>
        </div>
      </div>
    );
  }

  if (requiredRole && userProfile?.role !== requiredRole) {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

const maintenanceStyles: { [key: string]: React.CSSProperties } = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a3a6b 0%, #2c5aa0 100%)',
    padding: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: 48,
    textAlign: 'center',
    maxWidth: 400,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  },
  icon: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 12,
  },
  text: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 1.6,
  },
};

export default ProtectedRoute;

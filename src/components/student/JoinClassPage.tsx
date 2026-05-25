import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../common/Header';

const JoinClassPage: React.FC = () => {
  const [classId, setClassId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { currentUser, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;

    setError('');
    setLoading(true);

    try {
      const classDoc = await getDoc(doc(db, 'classes', classId.trim()));
      if (!classDoc.exists()) {
        setError('このクラスIDは存在しません');
        setLoading(false);
        return;
      }

      // Add student to class
      await updateDoc(doc(db, 'classes', classId.trim()), {
        studentIds: arrayUnion(currentUser.uid),
      });

      // Add class to user profile
      await updateDoc(doc(db, 'users', currentUser.uid), {
        classIds: arrayUnion(classId.trim()),
      });

      await refreshProfile();
      navigate('/');
    } catch (err) {
      setError('参加に失敗しました');
    }
    setLoading(false);
  };

  return (
    <>
      <Header />
      <div style={styles.page}>
        <div style={styles.card}>
          <h2 style={styles.title}>クラスに参加</h2>
          <p style={styles.desc}>先生から受け取ったクラスIDを入力してください</p>
          <form onSubmit={handleJoin} style={styles.form}>
            {error && <div style={styles.error}>{error}</div>}
            <input
              type="text"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              style={styles.input}
              placeholder="クラスIDを入力"
              required
            />
            <button type="submit" style={styles.button} disabled={loading}>
              {loading ? '参加中...' : '参加する'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 500,
    margin: '0 auto',
    padding: '40px 16px',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  input: {
    padding: '12px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 16,
    outline: 'none',
  },
  button: {
    padding: '14px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 600,
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 14,
  },
};

export default JoinClassPage;

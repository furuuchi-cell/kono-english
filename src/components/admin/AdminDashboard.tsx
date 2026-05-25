import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, setDoc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ClassData } from '../../types';
import Header from '../common/Header';

const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [joinClassId, setJoinClassId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinedClassIds, setJoinedClassIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadClasses();
    loadJoinedClasses();
  }, [currentUser]);

  const loadJoinedClasses = async () => {
    if (!currentUser) return;
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    if (userDoc.exists()) {
      const classIds = userDoc.data().classIds || [];
      setJoinedClassIds(new Set(classIds));
    }
  };

  const handleJoinAsStudent = async (classId: string) => {
    if (!currentUser) return;
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, { classIds: arrayUnion(classId) });
    setJoinedClassIds(prev => { const next = new Set(Array.from(prev)); next.add(classId); return next; });
  };

  const loadClasses = async () => {
    if (!currentUser) return;
    const [ownerSnap, coAdminSnap] = await Promise.all([
      getDocs(query(collection(db, 'classes'), where('adminId', '==', currentUser.uid))),
      getDocs(query(collection(db, 'classes'), where('coAdminIds', 'array-contains', currentUser.uid))),
    ]);
    const map = new Map<string, ClassData>();
    [...ownerSnap.docs, ...coAdminSnap.docs].forEach((d) => {
      map.set(d.id, { id: d.id, ...d.data() } as ClassData);
    });
    setClasses(Array.from(map.values()));
    setLoading(false);
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !joinClassId.trim()) return;
    setJoinError('');
    const classRef = doc(db, 'classes', joinClassId.trim());
    const classDoc = await getDoc(classRef);
    if (!classDoc.exists()) {
      setJoinError('クラスが見つかりません。IDを確認してください。');
      return;
    }
    const data = classDoc.data() as ClassData;
    if (data.adminId === currentUser.uid || data.coAdminIds?.includes(currentUser.uid)) {
      setJoinError('すでにこのクラスに参加しています。');
      return;
    }
    await updateDoc(classRef, { coAdminIds: arrayUnion(currentUser.uid) });
    // 管理者のclassIdsにも追加（生徒画面プレビュー用）
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, { classIds: arrayUnion(joinClassId.trim()) });
    setJoinClassId('');
    setShowJoin(false);
    loadClasses();
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newClassName.trim()) return;

    const classRef = doc(collection(db, 'classes'));
    const newClass: Omit<ClassData, 'id'> = {
      name: newClassName.trim(),
      adminId: currentUser.uid,
      studentIds: [],
      createdAt: new Date(),
    };
    await setDoc(classRef, newClass);
    setNewClassName('');
    setShowCreate(false);
    loadClasses();
  };

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div style={styles.page}>
        <div style={styles.header}>
          <h1 style={styles.title}>管理者ダッシュボード</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <button
              style={{ padding: '10px 16px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              onClick={() => navigate('/grammar')}
            >
              🚧 文法（開発中）
            </button>
            <button style={styles.joinBtn} onClick={() => { setShowJoin(true); setShowCreate(false); }}>
              クラスに参加
            </button>
            <button style={styles.createBtn} onClick={() => { setShowCreate(true); setShowJoin(false); }}>
              + クラスを作成
            </button>
          </div>
        </div>

        {showJoin && (
          <div style={styles.createCard}>
            <h3 style={styles.createTitle}>クラスに参加</h3>
            <form onSubmit={handleJoinClass} style={styles.createForm}>
              <input
                type="text"
                value={joinClassId}
                onChange={(e) => { setJoinClassId(e.target.value); setJoinError(''); }}
                style={styles.input}
                placeholder="クラスID"
                required
              />
              {joinError && <p style={{ fontSize: 13, color: '#ef4444', margin: 0 }}>{joinError}</p>}
              <div style={styles.createActions}>
                <button type="submit" style={styles.submitBtn}>
                  参加
                </button>
                <button
                  type="button"
                  style={styles.cancelBtn}
                  onClick={() => { setShowJoin(false); setJoinError(''); setJoinClassId(''); }}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {showCreate && (
          <div style={styles.createCard}>
            <h3 style={styles.createTitle}>新しいクラスを作成</h3>
            <form onSubmit={handleCreateClass} style={styles.createForm}>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                style={styles.input}
                placeholder="クラス名"
                required
              />
              <div style={styles.createActions}>
                <button type="submit" style={styles.submitBtn}>
                  作成
                </button>
                <button
                  type="button"
                  style={styles.cancelBtn}
                  onClick={() => setShowCreate(false)}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}

        {classes.length === 0 ? (
          <div style={styles.emptyCard}>
            <p>まだクラスがありません。</p>
            <p style={styles.emptyHint}>「クラスを作成」からクラスを追加しましょう。</p>
          </div>
        ) : (
          <div style={styles.classList}>
            {classes.map((cls) => {
              const isJoined = joinedClassIds.has(cls.id);
              return (
                <div key={cls.id} style={styles.classCard}>
                  <div
                    style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 12, cursor: 'pointer' }}
                    onClick={() => navigate(`/admin/class/${cls.id}`)}
                  >
                    <div style={{ flex: 1 }}>
                      <h3 style={styles.className}>{cls.name}</h3>
                      <p style={styles.classInfo}>
                        生徒数: {cls.studentIds.length}名
                      </p>
                    </div>
                    <div style={styles.classId}>
                      <span style={styles.classIdLabel}>クラスID</span>
                      <span style={styles.classIdValue}>{cls.id}</span>
                    </div>
                    <div style={styles.arrow}>→</div>
                  </div>
                  <button
                    style={isJoined ? styles.joinedBadge : styles.joinClassBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isJoined) handleJoinAsStudent(cls.id);
                    }}
                    disabled={isJoined}
                  >
                    {isJoined ? '参加済み' : '生徒として参加'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 800,
    margin: '0 auto',
    padding: '20px 16px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '60vh',
    fontSize: 18,
    color: '#6b7280',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  joinBtn: {
    padding: '10px 20px',
    background: '#fff',
    color: '#7c3aed',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    border: '2px solid #7c3aed',
  },
  createBtn: {
    padding: '10px 20px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
  },
  createCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  createTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 12,
  },
  createForm: {
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
  createActions: {
    display: 'flex',
    gap: 8,
  },
  submitBtn: {
    padding: '10px 24px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  cancelBtn: {
    padding: '10px 24px',
    background: '#f3f4f6',
    color: '#6b7280',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
  },
  emptyCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 40,
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
  },
  classList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  classCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  className: {
    fontSize: 17,
    fontWeight: 600,
    color: '#1a3a6b',
  },
  classInfo: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  classId: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  classIdLabel: {
    fontSize: 10,
    color: '#9ca3af',
  },
  classIdValue: {
    fontSize: 11,
    color: '#6b7280',
    background: '#f3f4f6',
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  arrow: {
    fontSize: 20,
    color: '#9ca3af',
  },
  joinClassBtn: {
    padding: '6px 12px',
    background: '#7c3aed',
    color: '#fff',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    marginLeft: 8,
  },
  joinedBadge: {
    padding: '6px 12px',
    background: '#f3f4f6',
    color: '#9ca3af',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    marginLeft: 8,
    border: 'none',
  },
};

export default AdminDashboard;

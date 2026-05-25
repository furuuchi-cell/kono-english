import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ClassData } from '../../types';
import { isGrammarEnabled } from '../../constants/featureFlags';
import Header from '../common/Header';

const GrammarHomePage: React.FC = () => {
  const { userProfile, currentUser } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    if (!isGrammarEnabled(userProfile)) {
      navigate('/home');
      return;
    }
    const load = async () => {
      if (!currentUser) return;
      // 管理者: 担当クラス。生徒: classIdsのクラス。一旦両方取得
      const classIds = userProfile.classIds || [];
      const list: ClassData[] = [];
      if (userProfile.role === 'admin') {
        const [owner, co] = await Promise.all([
          getDocs(query(collection(db, 'classes'), where('adminId', '==', currentUser.uid))),
          getDocs(query(collection(db, 'classes'), where('coAdminIds', 'array-contains', currentUser.uid))),
        ]);
        const map = new Map<string, ClassData>();
        [...owner.docs, ...co.docs].forEach((d) => {
          map.set(d.id, { id: d.id, ...(d.data() as any) });
        });
        list.push(...Array.from(map.values()));
      } else {
        for (const cid of classIds) {
          const snap = await getDocs(query(collection(db, 'classes'), where('__name__', '==', cid)));
          snap.docs.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        }
      }
      setClasses(list);
      setLoading(false);
    };
    load();
  }, [userProfile, currentUser, navigate]);

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div style={{ maxWidth: 720, margin: '32px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
              🚧 開発中（生徒非公開）
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a3a6b', margin: 0 }}>文法</h1>
          </div>
          <button
            style={{ padding: '8px 14px', background: '#f3f4f6', borderRadius: 8, fontSize: 13, color: '#4b5563', border: 'none' }}
            onClick={() => navigate('/home')}
          >
            単語へ戻る
          </button>
        </div>

        {classes.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#6b7280' }}>
            クラスがありません
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {classes.map((c) => (
              <div
                key={c.id}
                style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a3a6b', marginBottom: 12 }}>
                  {c.name}
                </div>
                <button
                  style={{ width: '100%', padding: '12px', background: '#1a3a6b', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, border: 'none' }}
                  onClick={() => navigate(`/grammar/${c.id}`)}
                >
                  週一覧を開く
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default GrammarHomePage;

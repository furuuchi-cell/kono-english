import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isGrammarEnabled } from '../../constants/featureFlags';
import { useGrammarWeeks } from '../../hooks/useGrammar';
import Header from '../common/Header';

const GrammarWeekListPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const { weeks, loading } = useGrammarWeeks(classId || '');

  useEffect(() => {
    if (userProfile && !isGrammarEnabled(userProfile)) {
      navigate('/home');
    }
  }, [userProfile, navigate]);

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
        <button
          style={{ padding: '8px 14px', background: '#f3f4f6', borderRadius: 8, fontSize: 13, color: '#4b5563', border: 'none', marginBottom: 16 }}
          onClick={() => navigate('/grammar')}
        >
          ← クラス選択へ
        </button>

        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 16 }}>文法 週一覧</h1>

        {weeks.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#6b7280' }}>
            文法データがまだ登録されていません。
            {userProfile?.role === 'admin' && (
              <div style={{ marginTop: 16 }}>
                <button
                  style={{ padding: '10px 18px', background: '#1a3a6b', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none' }}
                  onClick={() => navigate(`/admin/class/${classId}/grammar-setup`)}
                >
                  セットアップを実行
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {weeks.map((w) => (
              <div key={w.id} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{w.weekLabel}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#1a3a6b', marginBottom: 12 }}>{w.theme}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={{ flex: 1, minWidth: 140, padding: '11px', background: '#1a3a6b', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none' }}
                    onClick={() => navigate(`/grammar/${classId}/study/${w.id}`)}
                  >
                    🧭 思考フロー学習
                  </button>
                  <button
                    style={{ flex: 1, minWidth: 140, padding: '11px', background: '#2c5aa0', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none' }}
                    onClick={() => navigate(`/grammar/${classId}/quiz/${w.id}`)}
                  >
                    ⚡ 4択クイズ
                  </button>
                  {w.weekNumber > 1 && (
                    <button
                      style={{ flex: 1, minWidth: 140, padding: '11px', background: '#7c2d12', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, border: 'none' }}
                      onClick={() => navigate(`/grammar/${classId}/class-test/${w.id}`)}
                    >
                      📝 授業内テスト
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default GrammarWeekListPage;

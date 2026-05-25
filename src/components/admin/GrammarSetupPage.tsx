import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../common/Header';
import grammarData from '../../data/grammar/AS2.json';

const GrammarSetupPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [existingWeeks, setExistingWeeks] = useState(0);
  const [existingProblems, setExistingProblems] = useState(0);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (userProfile && userProfile.role !== 'admin') {
      navigate('/');
    }
  }, [userProfile, navigate]);

  const check = async () => {
    if (!classId) return;
    setRunning(true);
    try {
      const [w, p] = await Promise.all([
        getDocs(collection(db, 'classes', classId, 'grammarWeeks')),
        getDocs(collection(db, 'classes', classId, 'grammarProblems')),
      ]);
      setExistingWeeks(w.size);
      setExistingProblems(p.size);
      setStatus(`既存: ${w.size}週、${p.size}問`);
      setChecked(true);
    } catch (e: any) {
      setStatus(`❌ 確認エラー: ${e.message}`);
    }
    setRunning(false);
  };

  const clearExisting = async () => {
    if (!classId) return;
    const weeks = await getDocs(collection(db, 'classes', classId, 'grammarWeeks'));
    const probs = await getDocs(collection(db, 'classes', classId, 'grammarProblems'));
    for (const d of weeks.docs) await deleteDoc(d.ref);
    for (const d of probs.docs) await deleteDoc(d.ref);
  };

  const setup = async (forceClear: boolean) => {
    if (!classId) return;
    setRunning(true);
    try {
      if (forceClear) {
        setStatus('既存データ削除中...');
        await clearExisting();
      }

      let totalProbs = 0;
      for (const week of grammarData.weeks) {
        setStatus(`第${week.weekNumber}週を登録中...`);

        // 問題を先に登録してIDを回収
        const problemIds: string[] = [];
        const batch = writeBatch(db);
        for (const p of week.problems) {
          const pRef = doc(collection(db, 'classes', classId, 'grammarProblems'));
          batch.set(pRef, {
            classId,
            weekId: '',  // 仮置き（次で上書き）
            sentence: p.sentence,
            choices: p.choices,
            primaryStepKey: p.primaryStepKey,
            explanation: p.explanation,
            ...(p.eliminationSteps ? { eliminationSteps: p.eliminationSteps } : {}),
          });
          problemIds.push(pRef.id);
        }
        await batch.commit();

        // 週を登録
        const weekRef = doc(collection(db, 'classes', classId, 'grammarWeeks'));
        await setDoc(weekRef, {
          classId,
          weekNumber: week.weekNumber,
          weekLabel: week.weekLabel,
          theme: week.theme,
          thinkingFlow: week.thinkingFlow,
          problemIds,
        });

        // 各問題の weekId を更新
        const updateBatch = writeBatch(db);
        for (const pid of problemIds) {
          updateBatch.update(doc(db, 'classes', classId, 'grammarProblems', pid), { weekId: weekRef.id });
        }
        await updateBatch.commit();

        totalProbs += week.problems.length;
      }

      setStatus(`✅ 完了！ ${grammarData.weeks.length}週・${totalProbs}問を登録しました`);
      setDone(true);
    } catch (e: any) {
      setStatus(`❌ エラー: ${e.message}`);
    }
    setRunning(false);
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 16px' }}>
        <button
          style={{ padding: '8px 16px', background: '#f3f4f6', borderRadius: 8, fontSize: 14, color: '#4b5563', marginBottom: 20 }}
          onClick={() => navigate(classId ? `/admin/class/${classId}` : '/admin')}
        >
          ← 戻る
        </button>

        <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
            🚧 開発中（生徒非公開）
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 8 }}>
            文法機能セットアップ
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
            第1週（品詞）・第3週（文・句・節）の演習問題1（各5問）を Firestore に登録します。
          </p>

          {status && (
            <div style={{ padding: '12px 16px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#374151', marginBottom: 16 }}>
              {status}
            </div>
          )}

          {!checked && !done && (
            <button
              style={{ width: '100%', padding: '14px', background: running ? '#9ca3af' : '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none' }}
              onClick={check}
              disabled={running}
            >
              {running ? '確認中...' : '状態を確認'}
            </button>
          )}

          {checked && !done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {existingWeeks === 0 && existingProblems === 0 ? (
                <button
                  style={{ width: '100%', padding: '14px', background: running ? '#9ca3af' : '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none' }}
                  onClick={() => setup(false)}
                  disabled={running}
                >
                  {running ? '処理中...' : '初期化を実行'}
                </button>
              ) : (
                <>
                  <button
                    style={{ width: '100%', padding: '14px', background: running ? '#9ca3af' : '#ef4444', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none' }}
                    onClick={() => setup(true)}
                    disabled={running}
                  >
                    {running ? '処理中...' : '全削除して再作成'}
                  </button>
                  <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                    ※ 既存の週・問題データは削除されます（生徒の進捗は別コレクション）
                  </p>
                </>
              )}
            </div>
          )}

          {done && (
            <button
              style={{ width: '100%', padding: '14px', background: '#10b981', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700, border: 'none' }}
              onClick={() => navigate(classId ? `/admin/class/${classId}` : '/admin')}
            >
              クラス管理に戻る
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default GrammarSetupPage;

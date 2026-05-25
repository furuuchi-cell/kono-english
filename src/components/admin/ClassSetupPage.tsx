import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, addDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import Header from '../common/Header';

const CLASS_ID = 'AS2EN001';
const TOTAL_WORDS = 2092;
const PER_WEEK = 150;
const PER_DAY = 30;
const DAYS = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

const ClassSetupPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const [existingPredictableId, setExistingPredictableId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const checkExisting = async () => {
    setRunning(true);
    setStatus('確認中...');
    try {
      const existing = await getDocs(query(collection(db, 'classes'), where('name', '==', CLASS_ID)));
      if (!existing.empty) {
        const found = existing.docs[0];
        if (found.id === CLASS_ID) {
          // 予測可能なID（クラス名と一致）
          setExistingPredictableId(found.id);
          setStatus(`⚠️ クラスIDが「${CLASS_ID}」のまま予測可能な状態です。再作成してランダムIDに変更できます。`);
        } else {
          setStatus(`✅ クラス AS2EN001 は既に存在します（ID: ${found.id}）。安全なランダムIDです。`);
          setDone(true);
        }
      } else {
        setStatus('クラスが存在しません。新規作成できます。');
      }
      setChecked(true);
    } catch (e: any) {
      setStatus(`❌ エラー: ${e.message}`);
    }
    setRunning(false);
  };

  const handleSetup = async (forceRecreate = false) => {
    if (!currentUser) return;
    setRunning(true);

    try {
      if (forceRecreate && existingPredictableId) {
        // 古いクラスのrangesを削除してからクラス本体を削除
        setStatus('既存クラスを削除中...');
        const oldRanges = await getDocs(collection(db, 'classes', existingPredictableId, 'ranges'));
        for (const rd of oldRanges.docs) {
          await deleteDoc(doc(db, 'classes', existingPredictableId, 'ranges', rd.id));
        }
        await deleteDoc(doc(db, 'classes', existingPredictableId));
        setExistingPredictableId(null);
      }

      // クラスを自動生成IDで作成
      setStatus('クラスを作成中...');
      const classRef = await addDoc(collection(db, 'classes'), {
        name: CLASS_ID,
        wordSetId: CLASS_ID,
        adminId: currentUser.uid,
        coAdminIds: [],
        studentIds: [],
        createdAt: new Date(),
      });
      const newClassId = classRef.id;

      // 週・曜日の範囲を作成
      const totalWeeks = Math.ceil(TOTAL_WORDS / PER_WEEK);
      let rangeCount = 0;

      for (let week = 1; week <= totalWeeks; week++) {
        const weekStart = (week - 1) * PER_WEEK + 1;
        const weekEnd = Math.min(week * PER_WEEK, TOTAL_WORDS);

        setStatus(`範囲を作成中... 第${week}週 / ${totalWeeks}週`);

        for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
          const dayName = DAYS[dayIdx];

          if (dayIdx === 5) {
            // 土曜日: 週全体
            await addDoc(collection(db, 'classes', newClassId, 'ranges'), {
              classId: newClassId,
              weekLabel: `第${week}週 ${dayName}`,
              startId: weekStart,
              endId: weekEnd,
              lessonDate: '',
            });
            rangeCount++;
          } else {
            // 月〜金: 30語ずつ
            const dayStart = weekStart + dayIdx * PER_DAY;
            const dayEnd = Math.min(dayStart + PER_DAY - 1, weekEnd);
            if (dayStart > weekEnd) break;
            await addDoc(collection(db, 'classes', newClassId, 'ranges'), {
              classId: newClassId,
              weekLabel: `第${week}週 ${dayName}`,
              startId: dayStart,
              endId: dayEnd,
              lessonDate: '',
            });
            rangeCount++;
          }
        }
      }

      setStatus(`✅ 完了！ クラス AS2EN001 を作成しました（ID: ${newClassId} / ${totalWeeks}週 / ${rangeCount}範囲）`);
      setDone(true);
    } catch (e: any) {
      setStatus(`❌ エラー: ${e.message}`);
    }
    setRunning(false);
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 500, margin: '60px auto', padding: '0 16px' }}>
        <button style={{ padding: '8px 16px', background: '#f3f4f6', borderRadius: 8, fontSize: 14, color: '#4b5563', marginBottom: 20 }}
          onClick={() => navigate('/admin')}>← 戻る</button>

        <div style={{ background: '#fff', borderRadius: 16, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 8 }}>
            AS2EN001 クラス初期化
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
            2092語・14週・84範囲（月〜金30語＋土曜レビュー）を Firestore に登録します。
          </p>

          {status && (
            <div style={{ padding: '12px 16px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#374151', marginBottom: 16 }}>
              {status}
            </div>
          )}

          {!checked && !done && (
            <button
              style={{ width: '100%', padding: '14px', background: running ? '#9ca3af' : '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700 }}
              onClick={checkExisting}
              disabled={running}
            >
              {running ? '確認中...' : '状態を確認'}
            </button>
          )}

          {checked && !done && !existingPredictableId && (
            <button
              style={{ width: '100%', padding: '14px', background: running ? '#9ca3af' : '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700 }}
              onClick={() => handleSetup(false)}
              disabled={running}
            >
              {running ? '処理中...' : '初期化を実行'}
            </button>
          )}

          {checked && existingPredictableId && !done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                style={{ width: '100%', padding: '14px', background: running ? '#9ca3af' : '#ef4444', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700 }}
                onClick={() => handleSetup(true)}
                disabled={running}
              >
                {running ? '処理中...' : '削除して再作成（IDをランダムに変更）'}
              </button>
              <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                ※ 既存の生徒データ・進捗は保持されません
              </p>
            </div>
          )}

          {done && (
            <button
              style={{ width: '100%', padding: '14px', background: '#10b981', color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 700 }}
              onClick={() => navigate('/admin')}
            >
              管理画面に戻る
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default ClassSetupPage;

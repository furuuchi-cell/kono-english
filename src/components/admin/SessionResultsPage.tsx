import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import Header from '../common/Header';
import { useWords } from '../../hooks/useWords';

const SessionResultsPage: React.FC = () => {
  const { classId, sessionId } = useParams<{ classId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { words: allWords } = useWords(classId || '');
  const [session, setSession] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!classId || !sessionId) return;
      const sessionDoc = await getDoc(doc(db, 'classes', classId, 'sessions', sessionId));
      if (!sessionDoc.exists()) return;
      setSession({ id: sessionDoc.id, ...sessionDoc.data() });

      const snap = await getDocs(
        collection(db, 'classes', classId, 'sessions', sessionId, 'answers')
      );
      // adminを除外
      const allAnswers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      const filtered: any[] = [];
      for (const a of allAnswers) {
        try {
          const uDoc = await getDoc(doc(db, 'users', a.uid));
          if (uDoc.exists() && uDoc.data().role === 'admin') continue;
        } catch {}
        filtered.push(a);
      }
      setAnswers(filtered);
      setLoading(false);
    };
    load();
  }, [classId, sessionId]);

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }
  if (!session) return null;

  const wordIds: number[] = session.wordIds || [];

  const totalCorrect = (answer: any) =>
    (answer.results || []).filter((r: any) => r.isCorrect).length;

  return (
    <>
      <Header />
      <div style={styles.page}>
        <button style={styles.backBtn} onClick={() => navigate(`/admin/class/${classId}`, { state: { tab: 'quiz' } })}>
          ← 戻る
        </button>
        <h1 style={styles.title}>授業クイズ 結果</h1>
        <p style={styles.meta}>
          {wordIds.length}問 ／ {session.intervalSeconds}秒／問 ／{' '}
          {new Date(session.startedAt).toLocaleDateString('ja-JP')}
        </p>

        {answers.length === 0 ? (
          <div style={styles.empty}>回答がありません</div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, textAlign: 'left', minWidth: 100, position: 'sticky' as const, left: 0, background: '#f8faff', zIndex: 2 }}>生徒名</th>
                  {wordIds.map((wid, i) => {
                    const word = allWords.find((w) => w.id === wid);
                    return (
                      <th key={i} style={styles.thWord}>
                        <div style={styles.wordEn}>{word?.english || `#${wid}`}</div>
                        <div style={styles.wordJp}>{word?.japanese || ''}</div>
                      </th>
                    );
                  })}
                  <th style={styles.th}>正解数</th>
                </tr>
              </thead>
              <tbody>
                {answers.map((answer) => {
                  const resultMap = new Map<number, boolean>();
                  (answer.results || []).forEach((r: any) =>
                    resultMap.set(r.wordIndex, r.isCorrect)
                  );
                  const correct = totalCorrect(answer);

                  return (
                    <tr key={answer.uid}>
                      <td style={{ ...styles.tdName, position: 'sticky' as const, left: 0, background: '#fff', zIndex: 1 }}>{answer.displayName}</td>
                      {wordIds.map((_, i) => {
                        const result = resultMap.get(i);
                        return (
                          <td key={i} style={styles.tdCenter}>
                            {result === true ? (
                              <span style={styles.correct}>○</span>
                            ) : result === false ? (
                              <span style={styles.wrong}>×</span>
                            ) : (
                              <span style={styles.unanswered}>−</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={styles.tdScore}>
                        {correct}/{wordIds.length}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...styles.tdName, background: '#f8faff', fontWeight: 700, fontSize: 12, position: 'sticky' as const, left: 0, zIndex: 1 }}>正答率</td>
                  {wordIds.map((_, i) => {
                    const total = answers.length;
                    const correctCount = answers.filter(a => {
                      const rm = new Map<number, boolean>();
                      (a.results || []).forEach((r: any) => rm.set(r.wordIndex, r.isCorrect));
                      return rm.get(i) === true;
                    }).length;
                    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
                    return (
                      <td key={i} style={{ ...styles.tdCenter, background: '#f8faff', fontWeight: 600, fontSize: 12, color: rate >= 70 ? '#10b981' : rate >= 40 ? '#f59e0b' : '#ef4444' }}>
                        {rate}%
                      </td>
                    );
                  })}
                  <td style={{ ...styles.tdScore, background: '#f8faff' }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: '20px 16px 60px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '50vh',
    fontSize: 18,
    color: '#6b7280',
  },
  backBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 16,
    border: 'none',
    cursor: 'pointer',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 4,
  },
  meta: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 24,
  },
  empty: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: 40,
    fontSize: 15,
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
  },
  th: {
    padding: '12px 16px',
    background: '#f8faff',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  thWord: {
    padding: '8px 12px',
    background: '#f8faff',
    fontSize: 11,
    fontWeight: 600,
    color: '#374151',
    borderBottom: '1px solid #e5e7eb',
    textAlign: 'center',
    minWidth: 72,
  },
  wordEn: {
    fontWeight: 700,
    color: '#1a3a6b',
    fontSize: 12,
  },
  wordJp: {
    color: '#9ca3af',
    fontSize: 10,
    marginTop: 2,
  },
  tdName: {
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: '#1a3a6b',
    borderBottom: '1px solid #f3f4f6',
    whiteSpace: 'nowrap',
  },
  tdCenter: {
    padding: '12px 8px',
    textAlign: 'center',
    borderBottom: '1px solid #f3f4f6',
  },
  tdScore: {
    padding: '12px 16px',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#1a3a6b',
    borderBottom: '1px solid #f3f4f6',
    whiteSpace: 'nowrap',
  },
  correct: {
    fontSize: 16,
    fontWeight: 700,
    color: '#10b981',
  },
  wrong: {
    fontSize: 16,
    fontWeight: 700,
    color: '#ef4444',
  },
  unanswered: {
    fontSize: 14,
    color: '#d1d5db',
  },
};

export default SessionResultsPage;

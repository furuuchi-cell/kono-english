import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { TestData, TestResult, UserProfile } from '../../types';
import Header from '../common/Header';

const TestResultsPage: React.FC = () => {
  const { classId, testId } = useParams<{ classId: string; testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<TestData | null>(null);
  const [results, setResults] = useState<(TestResult & { studentName: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!classId || !testId) return;

      const testDoc = await getDoc(doc(db, 'classes', classId, 'tests', testId));
      if (testDoc.exists()) {
        setTest({ id: testDoc.id, ...testDoc.data() } as TestData);
      }

      const resultsSnap = await getDocs(
        collection(db, 'classes', classId, 'tests', testId, 'results')
      );
      const loadedResults: (TestResult & { studentName: string })[] = [];
      for (const d of resultsSnap.docs) {
        const result = { id: d.id, ...d.data() } as TestResult;
        const userDoc = await getDoc(doc(db, 'users', result.userId));
        const name = userDoc.exists()
          ? (userDoc.data() as UserProfile).displayName
          : '不明';
        loadedResults.push({ ...result, studentName: name });
      }
      loadedResults.sort((a, b) => b.score - a.score);
      setResults(loadedResults);
      setLoading(false);
    };
    load();
  }, [classId, testId]);

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  if (!test) return null;

  const avgScore =
    results.length > 0
      ? Math.round(
          (results.reduce((sum, r) => sum + (r.score / r.totalQuestions) * 100, 0) /
            results.length)
        )
      : 0;

  return (
    <>
      <Header />
      <div style={styles.page}>
        <button style={styles.backBtn} onClick={() => navigate(`/admin/class/${classId}`, { state: { tab: 'tests' } })}>
          ← 戻る
        </button>

        <h1 style={styles.title}>{test.title} - 結果</h1>
        <p style={styles.range}>
          出題範囲: No.{test.startId} 〜 No.{test.endId}
        </p>

        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryNumber}>{results.length}</div>
            <div style={styles.summaryLabel}>受験者数</div>
          </div>
          <div style={styles.summaryItem}>
            <div style={styles.summaryNumber}>{avgScore}%</div>
            <div style={styles.summaryLabel}>平均正答率</div>
          </div>
        </div>

        <div style={styles.resultList}>
          {results.map((r, i) => {
            const percentage = Math.round((r.score / r.totalQuestions) * 100);
            return (
              <div key={r.id} style={styles.resultItem}>
                <div style={styles.rank}>{i + 1}</div>
                <div style={styles.resultInfo}>
                  <div style={styles.studentName}>{r.studentName}</div>
                  <div style={styles.resultDetail}>
                    {r.score}/{r.totalQuestions} 問正解
                    {r.wrongWords.length > 0 && (
                      <span style={styles.wrongCount}>
                        （{r.wrongWords.length}問不正解）
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    ...styles.percentage,
                    color: percentage >= 80 ? '#10b981' : percentage >= 60 ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {percentage}%
                </div>
              </div>
            );
          })}
          {results.length === 0 && (
            <p style={styles.emptyText}>まだ受験者がいません</p>
          )}
        </div>
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
  backBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  range: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  summary: {
    display: 'flex',
    gap: 16,
    marginBottom: 24,
  },
  summaryItem: {
    flex: 1,
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  summaryNumber: {
    fontSize: 32,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 18px',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  rank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 600,
    color: '#4b5563',
  },
  resultInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1a3a6b',
  },
  resultDetail: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  wrongCount: {
    color: '#ef4444',
  },
  percentage: {
    fontSize: 20,
    fontWeight: 700,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: 40,
  },
};

export default TestResultsPage;

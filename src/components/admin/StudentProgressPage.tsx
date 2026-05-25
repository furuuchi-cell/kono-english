import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, WordProgress, WeeklyRange, Word } from '../../types';
import Header from '../common/Header';
import { getWordsSync, useWords } from '../../hooks/useWords';

const StudentProgressPage: React.FC = () => {
  const { classId, studentId } = useParams<{ classId: string; studentId: string }>();
  const navigate = useNavigate();
  // クラスの単語セットをキャッシュにロード
  useWords(classId || '');
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [progress, setProgress] = useState<Map<number, WordProgress>>(new Map());
  const [ranges, setRanges] = useState<WeeklyRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'overall' | 'byRange'>('overall');
  const [filter, setFilter] = useState<'all' | 'mastered' | 'review' | 'unlearned'>('all');
  const [selectedRange, setSelectedRange] = useState<WeeklyRange | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!studentId || !classId) return;

      const studentDoc = await getDoc(doc(db, 'users', studentId));
      if (studentDoc.exists()) {
        setStudent(studentDoc.data() as UserProfile);
      }

      const progressDoc = await getDoc(doc(db, 'users', studentId, 'progress', classId));
      const map = new Map<number, WordProgress>();
      if (progressDoc.exists()) {
        Object.entries(progressDoc.data()).forEach(([key, value]: [string, any]) => {
          map.set(Number(key), value as WordProgress);
        });
      }
      setProgress(map);

      // Load ranges
      const rangesSnap = await getDocs(collection(db, 'classes', classId, 'ranges'));
      const loadedRanges = rangesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WeeklyRange))
        .sort((a, b) => a.startId - b.startId);
      setRanges(loadedRanges);

      setLoading(false);
    };
    load();
  }, [studentId, classId]);

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  const getStats = (words: Word[]) => {
    let mastered = 0, review = 0, unlearned = 0;
    words.forEach((w) => {
      const status = progress.get(w.id)?.status || 'unlearned';
      if (status === 'mastered') mastered++;
      else if (status === 'review') review++;
      else unlearned++;
    });
    return { mastered, review, unlearned, total: words.length };
  };

  const overallStats = getStats(getWordsSync(classId ?? ''));

  // Words to display based on view
  const displayWords = selectedRange
    ? getWordsSync(classId ?? '').filter((w) => w.id >= selectedRange.startId && w.id <= selectedRange.endId)
    : getWordsSync(classId ?? '');
  const displayStats = getStats(displayWords);

  const filteredWords = displayWords.filter((w) => {
    if (filter === 'all') return true;
    const status = progress.get(w.id)?.status || 'unlearned';
    return status === filter;
  });

  return (
    <>
      <Header />
      <div style={styles.page}>
        <button style={styles.backBtn} onClick={() => navigate(`/admin/class/${classId}`, { state: { tab: 'students' } })}>
          ← 戻る
        </button>

        <h1 style={styles.title}>{student?.displayName}の進捗</h1>

        {/* View toggle */}
        <div style={styles.viewToggle}>
          <button
            style={{ ...styles.viewBtn, ...(view === 'overall' ? styles.viewBtnActive : {}) }}
            onClick={() => { setView('overall'); setSelectedRange(null); }}
          >
            全体
          </button>
          <button
            style={{ ...styles.viewBtn, ...(view === 'byRange' ? styles.viewBtnActive : {}) }}
            onClick={() => setView('byRange')}
          >
            範囲別
          </button>
        </div>

        {/* Range selector */}
        {view === 'byRange' && (
          <div style={styles.rangeList}>
            {ranges.map((r) => {
              const rStats = getStats(getWordsSync(classId ?? '').filter((w) => w.id >= r.startId && w.id <= r.endId));
              const pct = rStats.total > 0 ? Math.round((rStats.mastered / rStats.total) * 100) : 0;
              const isSelected = selectedRange?.id === r.id;
              return (
                <button
                  key={r.id}
                  style={{
                    ...styles.rangeItem,
                    ...(isSelected ? styles.rangeItemSelected : {}),
                  }}
                  onClick={() => setSelectedRange(isSelected ? null : r)}
                >
                  <div>
                    <div style={styles.rangeLabel}>{r.weekLabel}</div>
                    <div style={styles.rangeSub}>No.{r.startId}〜{r.endId}</div>
                  </div>
                  <div style={styles.rangeRight}>
                    <div style={styles.rangePct}>{pct}%</div>
                    <div style={styles.rangeMini}>
                      <span style={{ color: '#10b981' }}>{rStats.mastered}</span>
                      {' / '}
                      <span style={{ color: '#f59e0b' }}>{rStats.review}</span>
                      {' / '}
                      <span style={{ color: '#94a3b8' }}>{rStats.unlearned}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            {ranges.length === 0 && (
              <p style={styles.emptyText}>範囲が設定されていません</p>
            )}
          </div>
        )}

        {/* Stats cards */}
        <div style={styles.statsGrid}>
          <div style={{ ...styles.statCard, borderLeftColor: '#10b981' }}>
            <div style={styles.statNumber}>{displayStats.mastered}</div>
            <div style={styles.statLabel}>習得済</div>
          </div>
          <div style={{ ...styles.statCard, borderLeftColor: '#f59e0b' }}>
            <div style={styles.statNumber}>{displayStats.review}</div>
            <div style={styles.statLabel}>苦手</div>
          </div>
          <div style={{ ...styles.statCard, borderLeftColor: '#94a3b8' }}>
            <div style={styles.statNumber}>{displayStats.unlearned}</div>
            <div style={styles.statLabel}>未学習</div>
          </div>
        </div>

        <div style={styles.progressBar}>
          <div style={{ ...styles.progressFill, width: `${displayStats.total > 0 ? (displayStats.mastered / displayStats.total) * 100 : 0}%`, background: '#10b981' }} />
          <div style={{ ...styles.progressFill, width: `${displayStats.total > 0 ? (displayStats.review / displayStats.total) * 100 : 0}%`, background: '#f59e0b' }} />
        </div>
        <div style={styles.progressText}>
          {displayStats.total > 0 ? Math.round((displayStats.mastered / displayStats.total) * 100) : 0}% 習得
          {selectedRange && <span>（{selectedRange.weekLabel}）</span>}
        </div>

        {/* Filter */}
        <div style={styles.filterRow}>
          {(['all', 'mastered', 'review', 'unlearned'] as const).map((f) => (
            <button
              key={f}
              style={{
                ...styles.filterBtn,
                ...(filter === f ? styles.filterBtnActive : {}),
              }}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? '全て' : f === 'mastered' ? '習得済' : f === 'review' ? '苦手' : '未学習'}
            </button>
          ))}
        </div>

        {/* Word list */}
        <div style={styles.wordList}>
          {filteredWords.slice(0, 200).map((w) => {
            const status = progress.get(w.id)?.status || 'unlearned';
            const color =
              status === 'mastered' ? '#10b981' : status === 'review' ? '#f59e0b' : '#94a3b8';
            return (
              <div key={w.id} style={styles.wordItem}>
                <div style={{ ...styles.wordDot, background: color }} />
                <span style={styles.wordId}>{w.id}</span>
                <span style={styles.wordEnglish}>{w.english}</span>
                <span style={styles.wordJapanese}>{w.japanese}</span>
              </div>
            );
          })}
          {filteredWords.length > 200 && (
            <p style={styles.moreText}>他 {filteredWords.length - 200} 語...</p>
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
    marginBottom: 16,
  },
  viewToggle: {
    display: 'flex',
    gap: 4,
    marginBottom: 16,
    background: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
  },
  viewBtn: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    background: 'transparent',
    color: '#6b7280',
    transition: 'all 0.2s',
  },
  viewBtnActive: {
    background: '#fff',
    color: '#1a3a6b',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  rangeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 20,
  },
  rangeItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#fff',
    borderRadius: 10,
    border: '2px solid #e5e7eb',
    textAlign: 'left',
    transition: 'all 0.2s',
    width: '100%',
    cursor: 'pointer',
  },
  rangeItemSelected: {
    borderColor: '#1a3a6b',
    background: '#f0f4ff',
  },
  rangeLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a3a6b',
  },
  rangeSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  rangeRight: {
    textAlign: 'right',
  },
  rangePct: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  rangeMini: {
    fontSize: 11,
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: 16,
    fontSize: 13,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    borderLeft: '4px solid',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  progressBar: {
    height: 8,
    background: '#e5e7eb',
    borderRadius: 4,
    display: 'flex',
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
  },
  progressText: {
    textAlign: 'right',
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '6px 14px',
    borderRadius: 16,
    fontSize: 13,
    background: '#f3f4f6',
    color: '#6b7280',
    border: '1px solid #e5e7eb',
  },
  filterBtnActive: {
    background: '#1a3a6b',
    color: '#fff',
    borderColor: '#1a3a6b',
  },
  wordList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  wordItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: '#fff',
    borderRadius: 8,
    fontSize: 14,
  },
  wordDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  wordId: {
    width: 36,
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'right',
  },
  wordEnglish: {
    fontWeight: 600,
    color: '#1a3a6b',
    minWidth: 120,
  },
  wordJapanese: {
    color: '#6b7280',
    fontSize: 13,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  moreText: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: 12,
    fontSize: 13,
  },
};

export default StudentProgressPage;

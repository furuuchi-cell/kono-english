import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useStudySession } from '../../hooks/useStudySession';
import { WeeklyRange } from '../../types';
import SwipeCard from './SwipeCard';
import Header from '../common/Header';
import StudyTutorial from '../common/StudyTutorial';
import { TOTAL_WORDS_BY_SET, useWords } from '../../hooks/useWords';

const StudyPage: React.FC = () => {
  const { classId, rangeId } = useParams<{ classId: string; rangeId: string }>();
  const { currentUser } = useAuth();
  // クラスの単語セットをキャッシュにロード（getWordsSyncで使われる）
  const { loading: wordsLoading } = useWords(classId || '');
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { subStart?: number; subEnd?: number; dayLabel?: string } | null;
  const [range, setRange] = useState<WeeklyRange | null>(null);
  const [mode, setMode] = useState<'normal' | 'random' | 'review'>('normal');
  const [rangeLoading, setRangeLoading] = useState(true);

  useEffect(() => {
    const loadRange = async () => {
      if (!classId || !rangeId) return;
      if (rangeId === '__all__') {
        // クラスのwordSetIdから総単語数を取得
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const wordSetId = classDoc.exists() ? classDoc.data().wordSetId : null;
        const totalWords = (wordSetId ? TOTAL_WORDS_BY_SET[wordSetId] : undefined) ?? 2350;
        setRange({
          id: '__all__',
          classId: classId,
          weekLabel: '総演習',
          startId: 1,
          endId: totalWords,
          lessonDate: '',
        });
        setRangeLoading(false);
        return;
      }
      const rangeDoc = await getDoc(doc(db, 'classes', classId, 'ranges', rangeId));
      if (rangeDoc.exists()) {
        setRange({ id: rangeDoc.id, ...rangeDoc.data() } as WeeklyRange);
      }
      setRangeLoading(false);
    };
    loadRange();
  }, [classId, rangeId]);

  const {
    currentWord,
    currentIndex,
    totalWords,
    isComplete,
    stats,
    progress,
    sessionResult,
    loading,
    handleSwipe,
    resetSession,
  } = useStudySession({
    userId: currentUser?.uid || '',
    classId: classId || '',
    rangeId: rangeId || '',
    startId: locationState?.subStart ?? range?.startId ?? 1,
    endId: locationState?.subEnd ?? range?.endId ?? 50,
    mode,
  });

  if (rangeLoading || loading || wordsLoading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  if (!range) {
    return (
      <>
        <Header />
        <div style={styles.loading}>範囲が見つかりません</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <StudyTutorial />
      <div style={isComplete ? styles.pageScrollable : styles.page}>
        <div style={styles.rangeInfo}>
          <h2 style={styles.rangeTitle}>
            {locationState?.dayLabel ? `${range.weekLabel}　${locationState.dayLabel}` : range.weekLabel}
          </h2>
          <p style={styles.rangeDesc}>
            No.{locationState?.subStart ?? range.startId} 〜 No.{locationState?.subEnd ?? range.endId}
          </p>
        </div>

        {/* Stats bar */}
        {!isComplete && <div style={styles.statsBar}>
          <div style={styles.stat}>
            <div style={{ ...styles.statDot, background: '#10b981' }} />
            <span>習得済 {stats.mastered}</span>
          </div>
          <div style={styles.stat}>
            <div style={{ ...styles.statDot, background: '#f59e0b' }} />
            <span>苦手 {stats.review}</span>
          </div>
          <div style={styles.stat}>
            <div style={{ ...styles.statDot, background: '#94a3b8' }} />
            <span>未学習 {stats.unlearned}</span>
          </div>
        </div>}

        {/* Progress bar */}
        {!isComplete && <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${((stats.mastered) / stats.total) * 100}%`,
              background: '#10b981',
            }}
          />
          <div
            style={{
              ...styles.progressFill,
              width: `${((stats.review) / stats.total) * 100}%`,
              background: '#f59e0b',
            }}
          />
        </div>}

        {/* Mode toggle */}
        {!isComplete && <div style={styles.modeToggle}>
          <button
            style={{
              ...styles.modeBtn,
              ...(mode === 'normal' ? styles.modeBtnActive : {}),
            }}
            onClick={() => setMode('normal')}
          >
            順番学習
          </button>
          <button
            style={{
              ...styles.modeBtn,
              ...(mode === 'random' ? styles.modeBtnActive : {}),
            }}
            onClick={() => setMode('random')}
          >
            ランダム
          </button>
          <button
            style={{
              ...styles.modeBtn,
              ...(mode === 'review' ? styles.modeBtnActive : {}),
            }}
            onClick={() => setMode('review')}
          >
            苦手単語 ({stats.review})
          </button>
        </div>}

        {isComplete ? (
          <div style={styles.completeCard}>
            <div style={styles.completeEmoji}>🎉</div>
            <h3 style={styles.completeTitle}>
              {mode === 'review' ? '苦手単語 完了！' : '学習完了！'}
            </h3>
            <p style={styles.completeText}>
              {mode === 'normal'
                ? `${range.weekLabel}の全単語を学習しました`
                : '苦手単語をすべて復習しました'}
            </p>

            {/* Session Summary */}
            <div style={styles.summarySection}>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>学習した単語数</span>
                <span style={styles.summaryValue}>{sessionResult.correctCount + sessionResult.incorrectCount} 語</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>正解数</span>
                <span style={{ ...styles.summaryValue, color: '#10b981' }}>{sessionResult.correctCount}</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>不正解数</span>
                <span style={{ ...styles.summaryValue, color: '#ef4444' }}>{sessionResult.incorrectCount}</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>正答率</span>
                <span style={styles.summaryValue}>
                  {sessionResult.correctCount + sessionResult.incorrectCount > 0
                    ? Math.round((sessionResult.correctCount / (sessionResult.correctCount + sessionResult.incorrectCount)) * 100)
                    : 0}%
                </span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>新たに習得した単語</span>
                <span style={{ ...styles.summaryValue, color: '#10b981' }}>{sessionResult.newlyMastered} 語</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>苦手に入った単語</span>
                <span style={{ ...styles.summaryValue, color: '#f59e0b' }}>{sessionResult.newlyReview} 語</span>
              </div>
            </div>

            <div style={styles.completeActions}>
              <button style={styles.completeBtn} onClick={resetSession}>
                もう一度
              </button>
              <button
                style={{ ...styles.completeBtn, background: '#6b7280' }}
                onClick={() => navigate('/')}
              >
                ホームに戻る
              </button>
            </div>
          </div>
        ) : currentWord ? (
          <SwipeCard
            word={currentWord}
            progress={progress.get(currentWord.id)}
            onSwipe={handleSwipe}
            index={currentIndex}
            total={totalWords}
          />
        ) : (
          <div style={styles.emptyCard}>
            {mode === 'review'
              ? '苦手単語はありません'
              : '学習する単語がありません'}
          </div>
        )}
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 500,
    margin: '0 auto',
    padding: '12px 16px 0',
    position: 'fixed' as const,
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    overflowX: 'hidden' as const,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  pageScrollable: {
    maxWidth: 500,
    margin: '0 auto',
    padding: '12px 16px 40px',
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
    alignSelf: 'flex-start',
    padding: '6px 14px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 8,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  rangeInfo: {
    textAlign: 'center',
    marginBottom: 16,
  },
  rangeTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  rangeDesc: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  statsBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 12,
  },
  stat: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: '#4b5563',
  },
  statDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  progressBar: {
    height: 6,
    background: '#e5e7eb',
    borderRadius: 3,
    display: 'flex',
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s',
  },
  modeToggle: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'center',
  },
  modeBtn: {
    padding: '8px 20px',
    borderRadius: 20,
    fontSize: 14,
    fontWeight: 500,
    background: '#f3f4f6',
    color: '#6b7280',
    border: '1px solid #e5e7eb',
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    background: '#1a3a6b',
    color: '#fff',
    borderColor: '#1a3a6b',
  },
  completeCard: {
    textAlign: 'center',
    padding: 40,
    background: '#fff',
    borderRadius: 20,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  completeEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 8,
  },
  completeText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  completeActions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
  },
  completeBtn: {
    padding: '12px 24px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    background: '#1a3a6b',
    color: '#fff',
  },
  summarySection: {
    textAlign: 'left' as const,
    background: '#f9fafb',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 24,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #e5e7eb',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#4b5563',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  emptyCard: {
    textAlign: 'center',
    padding: 60,
    background: '#fff',
    borderRadius: 20,
    color: '#6b7280',
    fontSize: 16,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
};

export default StudyPage;

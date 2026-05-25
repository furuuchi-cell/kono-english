import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { WeeklyRange } from '../../types';
import Header from '../common/Header';
import { getRank, getAggregateRank } from '../../utils/rank';
import wordsData from '../../data/words.json';

const allWords = wordsData as any[];

const RankBadge: React.FC<{ accuracyPercent: number; size?: 'sm' | 'md' }> = ({ accuracyPercent, size = 'md' }) => {
  const info = getRank(accuracyPercent);
  const dim = size === 'sm' ? 32 : 40;
  const fs = size === 'sm' ? 12 : 15;
  return (
    <div style={{
      width: dim, height: dim, borderRadius: dim / 2,
      background: info.bg, color: info.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fs, fontWeight: 900, flexShrink: 0,
    }}>
      {info.rank}
    </div>
  );
};

const QuizHistoryPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [ranges, setRanges] = useState<WeeklyRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeFilter, setRangeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!currentUser) return;
      const snap = await getDocs(collection(db, 'users', currentUser.uid, 'quizResults'));
      let all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
      if (classId) all = all.filter((q) => q.classId === classId);
      all.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
      setHistory(all);

      if (classId) {
        const rangesSnap = await getDocs(collection(db, 'classes', classId, 'ranges'));
        setRanges(
          rangesSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as WeeklyRange))
            .sort((a, b) => a.startId - b.startId)
        );
      }
      setLoading(false);
    };
    load();
  }, [currentUser, classId]);

  const filtered = rangeFilter === 'all'
    ? history
    : history.filter((q) => q.rangeId === rangeFilter);

  // 表示中セッションの合算ランク
  const summaryRank = getAggregateRank(filtered);
  const summaryLabel = rangeFilter === 'all'
    ? '総合ランク'
    : (ranges.find((r) => r.id === rangeFilter)?.weekLabel ?? '') + ' ランク';
  const summaryCorrect = filtered.reduce((s, q) => s + (q.correctCount || 0), 0);
  const summaryTotal = filtered.reduce((s, q) => s + (q.totalQuestions || 0), 0);
  const summaryRate = summaryTotal > 0 ? Math.round((summaryCorrect / summaryTotal) * 100) : 0;

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
        <button style={styles.backBtn} onClick={() => navigate(-1)}>← 戻る</button>
        <h1 style={styles.title}>授業クイズ 履歴</h1>

        {/* Filter */}
        <div style={styles.filterRow}>
          <select
            value={rangeFilter}
            onChange={(e) => setRangeFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">一覧</option>
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>{r.weekLabel}</option>
            ))}
          </select>
        </div>

        {/* Summary rank card */}
        {history.length > 0 && (
          <div style={styles.summaryCard}>
            <div style={styles.summaryLeft}>
              <div style={styles.summaryLabel}>{summaryLabel}</div>
              {summaryRank ? (
                <>
                  <div style={styles.summaryRankRow}>
                    <div style={{ ...styles.summaryBadge, background: summaryRank.bg }}>
                      {summaryRank.rank}
                    </div>
                    <div>
                      <div style={styles.summaryRankLabel}>{summaryRank.label}</div>
                      <div style={styles.summaryMeta}>
                        正答率 {summaryRate}%　{filtered.length}回
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={styles.summaryEmpty}>データなし</div>
              )}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={styles.empty}>
            {rangeFilter === 'all' ? 'まだクイズ履歴がありません' : 'この週のクイズ履歴がありません'}
          </div>
        ) : (
          <div style={styles.list}>
            {filtered.map((q) => {
              const rate = q.totalQuestions > 0 ? Math.round((q.correctCount / q.totalQuestions) * 100) : 0;
              const date = q.completedAt?.toDate
                ? q.completedAt.toDate()
                : q.completedAt?.seconds
                ? new Date(q.completedAt.seconds * 1000)
                : new Date();
              const isExpanded = expandedId === q.id;
              const wordIds: number[] = q.wordIds || [];
              const resultMap = new Map<number, any>();
              (q.results || []).forEach((r: any) => resultMap.set(r.wordIndex, r));
              const rangeName = ranges.find((r) => r.id === q.rangeId)?.weekLabel;

              return (
                <div key={q.id} style={styles.card}>
                  <button
                    style={styles.summaryRow}
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  >
                    <div style={styles.cardLeft}>
                      <RankBadge accuracyPercent={rate} size="sm" />
                      <div>
                        <div style={styles.cardDate}>
                          {date.toLocaleDateString('ja-JP')}　{date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          {rangeName && <span style={styles.rangePill}>{rangeName}</span>}
                        </div>
                        <div style={styles.cardScore}>
                          {q.correctCount} / {q.totalQuestions} 正解
                          {q.answeredCount < q.totalQuestions && (
                            <span style={styles.cardUnanswered}>　未回答 {q.totalQuestions - q.answeredCount}問</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={styles.cardRight}>
                      <div style={{ ...styles.cardRate, color: rate >= 80 ? '#10b981' : rate >= 60 ? '#f59e0b' : '#ef4444' }}>
                        {rate}%
                      </div>
                      <span style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={styles.detail}>
                      {wordIds.map((wid, i) => {
                        const word = allWords.find((w) => w.id === wid);
                        const result = resultMap.get(i);
                        return (
                          <div key={i} style={styles.wordRow}>
                            <div style={styles.wordInfo}>
                              <span style={styles.wordEn}>{word?.english || `#${wid}`}</span>
                              <span style={styles.wordJp}>{word?.japanese || ''}</span>
                            </div>
                            <div style={styles.wordResult}>
                              {!result ? (
                                <span style={styles.unanswered}>未回答</span>
                              ) : result.isCorrect ? (
                                <span style={styles.correct}>○</span>
                              ) : (
                                <div style={styles.wrongBlock}>
                                  <span style={styles.wrong}>×</span>
                                  <span style={styles.wrongAnswer}>→ {result.selected}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
  page: { maxWidth: 600, margin: '0 auto', padding: '20px 16px 60px' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 18, color: '#6b7280' },
  backBtn: { padding: '8px 16px', background: '#f3f4f6', borderRadius: 8, fontSize: 14, color: '#4b5563', marginBottom: 16, border: 'none', cursor: 'pointer' },
  title: { fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 16 },
  filterRow: { marginBottom: 14 },
  filterSelect: { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer', minWidth: 140 },
  summaryCard: {
    background: '#fff',
    borderRadius: 14,
    padding: '16px 18px',
    marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  summaryLeft: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  summaryLabel: { fontSize: 12, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em' },
  summaryRankRow: { display: 'flex', alignItems: 'center', gap: 14 },
  summaryBadge: {
    width: 56, height: 56, borderRadius: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, fontWeight: 900, color: '#fff', flexShrink: 0,
  },
  summaryRankLabel: { fontSize: 16, fontWeight: 700, color: '#1a3a6b' },
  summaryMeta: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  summaryEmpty: { fontSize: 14, color: '#d1d5db' },
  empty: { textAlign: 'center' as const, color: '#9ca3af', padding: 40, fontSize: 15 },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' },
  summaryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  cardDate: { fontSize: 12, color: '#9ca3af', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 },
  rangePill: { background: '#eff6ff', color: '#3b82f6', padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 600 },
  cardScore: { fontSize: 15, fontWeight: 600, color: '#1a3a6b' },
  cardUnanswered: { fontSize: 12, color: '#9ca3af', fontWeight: 400 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 10 },
  cardRate: { fontSize: 20, fontWeight: 700 },
  expandIcon: { fontSize: 11, color: '#9ca3af' },
  detail: { borderTop: '1px solid #f3f4f6', padding: '8px 0' },
  wordRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #f9fafb' },
  wordInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  wordEn: { fontSize: 14, fontWeight: 600, color: '#1a3a6b' },
  wordJp: { fontSize: 12, color: '#6b7280' },
  wordResult: { textAlign: 'right' as const },
  correct: { fontSize: 18, fontWeight: 700, color: '#10b981' },
  wrongBlock: { display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 2 },
  wrong: { fontSize: 18, fontWeight: 700, color: '#ef4444' },
  wrongAnswer: { fontSize: 11, color: '#ef4444' },
  unanswered: { fontSize: 12, color: '#d1d5db' },
};

export default QuizHistoryPage;

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDocs, setDoc, getDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { isGrammarEnabled } from '../../constants/featureFlags';
import { fetchGrammarProblemsByWeeks } from '../../hooks/useGrammar';
import { GrammarChoice, GrammarProblem, GrammarWeek } from '../../types';
import Header from '../common/Header';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 授業内テストの出題数設定
const COUNT_FROM_LAST_WEEK = 10;   // 先週から
const COUNT_FROM_PAST_WEEKS = 20;  // それ以前の週から
const OVERLAP_RATIO = 0.5;         // 前回テストとの被り率（過去週枠のうち）

// 問題を selectN する。間違えた問題を優先する
const pickPrioritized = (
  pool: GrammarProblem[],
  n: number,
  progressMap: Map<string, { mistakeCount: number; status: string }>,
  excludeIds: Set<string> = new Set(),
): GrammarProblem[] => {
  const filtered = pool.filter((p) => !excludeIds.has(p.id));
  const mistakes = filtered.filter((p) => (progressMap.get(p.id)?.mistakeCount || 0) > 0);
  const rest = filtered.filter((p) => (progressMap.get(p.id)?.mistakeCount || 0) === 0);
  const picked: GrammarProblem[] = [];
  for (const p of shuffle(mistakes)) {
    if (picked.length >= n) break;
    picked.push(p);
  }
  for (const p of shuffle(rest)) {
    if (picked.length >= n) break;
    picked.push(p);
  }
  return picked;
};

type AnswerRecord = {
  problemId: string;
  shuffledChoices: GrammarChoice[];
  selectedIdx: number | null;
};

const GrammarClassTestPage: React.FC = () => {
  const { classId, weekId } = useParams<{ classId: string; weekId: string }>();
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [weeks, setWeeks] = useState<GrammarWeek[]>([]);
  const [targetWeek, setTargetWeek] = useState<GrammarWeek | null>(null);
  const [questions, setQuestions] = useState<GrammarProblem[]>([]);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [index, setIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userProfile && !isGrammarEnabled(userProfile)) navigate('/home');
  }, [userProfile, navigate]);

  useEffect(() => {
    const load = async () => {
      if (!classId || !weekId || !currentUser) return;
      setLoading(true);
      try {
        // 全週取得
        const weekSnap = await getDocs(
          query(collection(db, 'classes', classId, 'grammarWeeks'), orderBy('weekNumber', 'asc'))
        );
        const allWeeks: GrammarWeek[] = weekSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setWeeks(allWeeks);
        const target = allWeeks.find((w) => w.id === weekId);
        if (!target) { setError('週が見つかりません'); setLoading(false); return; }
        setTargetWeek(target);

        // 先週（target.weekNumber - 1）と過去週（それ以前）を特定
        const lastWeek = allWeeks.find((w) => w.weekNumber === target.weekNumber - 1);
        const pastWeeks = allWeeks.filter((w) => w.weekNumber < target.weekNumber - 1);

        if (!lastWeek) {
          setError('第1週は授業内テストの対象外です（先週がない）');
          setLoading(false);
          return;
        }

        // 各週の問題を取得
        const lastWeekProblems = await fetchGrammarProblemsByWeeks(classId, [lastWeek.id]);
        const pastWeekProblems = pastWeeks.length > 0
          ? await fetchGrammarProblemsByWeeks(classId, pastWeeks.map((w) => w.id))
          : [];

        // 進捗取得
        const progressSnap = await getDocs(collection(db, 'users', currentUser.uid, `grammarProgress_${classId}`));
        const progressMap = new Map<string, { mistakeCount: number; status: string }>();
        progressSnap.docs.forEach((d) => {
          const data = d.data() as any;
          progressMap.set(d.id, { mistakeCount: data.mistakeCount || 0, status: data.status || 'unlearned' });
        });

        // 直近の授業内テスト履歴（前回出題問題IDを取得）
        const historySnap = await getDocs(collection(db, 'users', currentUser.uid, `grammarClassTests_${classId}`));
        let prevTestProblemIds = new Set<string>();
        if (!historySnap.empty) {
          // 最新のテストを探す
          const sorted = historySnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .sort((a, b) => (b.takenAt?.seconds || 0) - (a.takenAt?.seconds || 0));
          if (sorted[0]?.problemIds) {
            prevTestProblemIds = new Set<string>(sorted[0].problemIds);
          }
        }

        // 先週から10問（mistakes優先）
        const lastPick = pickPrioritized(lastWeekProblems, COUNT_FROM_LAST_WEEK, progressMap);

        // 過去週枠: 前回と50%被らせる
        const overlapCount = Math.min(Math.floor(COUNT_FROM_PAST_WEEKS * OVERLAP_RATIO), pastWeekProblems.length);
        const newCount = COUNT_FROM_PAST_WEEKS - overlapCount;

        // 被せる問題（前回テストで出題、かつ過去週プールに含まれる）
        const overlapPool = pastWeekProblems.filter((p) => prevTestProblemIds.has(p.id));
        const overlapPick = pickPrioritized(overlapPool, overlapCount, progressMap);

        // 新規（過去週プールのうち前回テストに含まれないもの）
        const overlapIds = new Set(overlapPick.map((p) => p.id));
        const newPick = pickPrioritized(pastWeekProblems, newCount, progressMap, overlapIds);

        const combined = shuffle([...lastPick, ...overlapPick, ...newPick]);
        setQuestions(combined);
        setRecords(combined.map((p) => ({
          problemId: p.id,
          shuffledChoices: shuffle(p.choices),
          selectedIdx: null,
        })));
        setLoading(false);
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
      }
    };
    load();
  }, [classId, weekId, currentUser]);

  const totalCorrect = useMemo(() => {
    return records.reduce((acc, r) => {
      if (r.selectedIdx !== null && r.shuffledChoices[r.selectedIdx]?.isCorrect) return acc + 1;
      return acc;
    }, 0);
  }, [records]);

  if (loading) {
    return (
      <>
        <Header />
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>問題を準備中...</div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 16px' }}>
          <div style={{ background: '#fee2e2', borderRadius: 12, padding: 20, color: '#991b1b', fontSize: 14 }}>{error}</div>
          <button
            style={{ marginTop: 16, padding: '10px 18px', background: '#1a3a6b', color: '#fff', borderRadius: 8, fontSize: 13, border: 'none' }}
            onClick={() => navigate(`/grammar/${classId}`)}
          >
            週一覧に戻る
          </button>
        </div>
      </>
    );
  }

  if (questions.length === 0) {
    return (
      <>
        <Header />
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>出題できる問題がありません</div>
      </>
    );
  }

  const current = questions[index];
  const currentRecord = records[index];

  const selectChoice = (i: number) => {
    if (!currentRecord || currentRecord.selectedIdx !== null) return;
    const next = [...records];
    next[index] = { ...currentRecord, selectedIdx: i };
    setRecords(next);
  };

  const goNext = () => {
    if (index + 1 >= questions.length) {
      finalize();
    } else {
      setIndex((n) => n + 1);
    }
  };

  const finalize = async () => {
    if (!currentUser || !classId) return;
    // 進捗を一括保存
    for (const r of records) {
      if (r.selectedIdx === null) continue;
      const isCorrect = r.shuffledChoices[r.selectedIdx]?.isCorrect;
      const problem = questions.find((p) => p.id === r.problemId);
      const progressRef = doc(db, 'users', currentUser.uid, `grammarProgress_${classId}`, r.problemId);
      const existing = await getDoc(progressRef);
      const prev = existing.exists() ? (existing.data() as any) : { consecutiveCorrect: 0, mistakeCount: 0, stepMistakes: {} };
      const consecutive = isCorrect ? (prev.consecutiveCorrect || 0) + 1 : 0;
      const mistakeCount = isCorrect ? (prev.mistakeCount || 0) : (prev.mistakeCount || 0) + 1;
      const status = consecutive >= 3 ? 'mastered' : (mistakeCount > 0 ? 'review' : 'unlearned');
      const stepMistakes = { ...(prev.stepMistakes || {}) };
      if (!isCorrect && problem?.primaryStepKey) {
        stepMistakes[problem.primaryStepKey] = (stepMistakes[problem.primaryStepKey] || 0) + 1;
      }
      await setDoc(progressRef, {
        problemId: r.problemId,
        status,
        consecutiveCorrect: consecutive,
        mistakeCount,
        stepMistakes,
        lastAnswered: serverTimestamp(),
      }, { merge: true });
    }

    // テスト履歴保存（次回の被り計算用）
    const testRef = doc(collection(db, 'users', currentUser.uid, `grammarClassTests_${classId}`));
    await setDoc(testRef, {
      weekId,
      problemIds: questions.map((p) => p.id),
      correctCount: totalCorrect,
      total: questions.length,
      takenAt: serverTimestamp(),
    });

    setShowSummary(true);
  };

  if (showSummary) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 16 }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>📝</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 8 }}>テスト終了</h2>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#1a3a6b' }}>
              {totalCorrect} / {questions.length}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
              正答率 {Math.round((totalCorrect / questions.length) * 100)}%
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>問題ごとに結果を確認できます（タップで解説を開く）</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {questions.map((p, i) => {
              const r = records[i];
              const isCorrect = r?.selectedIdx !== null && r.shuffledChoices[r.selectedIdx!]?.isCorrect;
              const isExpanded = expandedIdx === i;
              return (
                <div key={p.id} style={{ background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                  <button
                    onClick={() => setExpandedIdx(isExpanded ? null : i)}
                    style={{
                      width: '100%', padding: '12px 14px', textAlign: 'left', background: 'transparent',
                      border: 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: isCorrect ? '#10b981' : '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700,
                    }}>
                      {isCorrect ? '✓' : '✗'}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>問{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.sentence}
                    </span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{isExpanded ? '▲' : '▼'}</span>
                  </button>
                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 14, color: '#111827', marginTop: 12, marginBottom: 12, lineHeight: 1.7 }}>{p.sentence}</div>
                      {r.shuffledChoices.map((c, ci) => {
                        const picked = r.selectedIdx === ci;
                        const mark = c.isCorrect ? '●' : (picked ? '×' : '○');
                        const color = c.isCorrect ? '#10b981' : (picked ? '#ef4444' : '#9ca3af');
                        return (
                          <div key={ci} style={{ fontSize: 13, color: '#374151', marginBottom: 6, lineHeight: 1.6 }}>
                            <span style={{ color, fontWeight: 700, marginRight: 6 }}>{['①','②','③','④'][ci]} {mark}</span>
                            {c.text}
                            {c.reason && <div style={{ marginLeft: 22, fontSize: 12, color: '#6b7280' }}>{c.reason}</div>}
                          </div>
                        );
                      })}
                      <div style={{ marginTop: 12, padding: 12, background: '#f0f7ff', borderRadius: 8, fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
                        {p.explanation}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            style={{ width: '100%', padding: '14px', background: '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none' }}
            onClick={() => navigate(`/grammar/${classId}`)}
          >
            週一覧に戻る
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>授業内テスト / {targetWeek?.weekLabel}</div>
          <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 700 }}>{index + 1} / {questions.length}</div>
        </div>

        <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700, marginBottom: 16 }}>
          📝 授業内テスト（解答は最後に表示）
        </div>

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 17, lineHeight: 1.7, color: '#111827' }}>{current.sentence}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {currentRecord.shuffledChoices.map((c, i) => {
            const picked = currentRecord.selectedIdx === i;
            const bg = picked ? '#dbeafe' : '#fff';
            const border = picked ? '2px solid #1a3a6b' : '1px solid #e5e7eb';
            return (
              <button
                key={i}
                onClick={() => selectChoice(i)}
                style={{
                  padding: '14px 16px',
                  background: bg,
                  border,
                  borderRadius: 10,
                  fontSize: 14,
                  color: '#111827',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontWeight: 700, marginRight: 8 }}>{['①','②','③','④'][i]}</span>
                {c.text}
              </button>
            );
          })}
        </div>

        <button
          disabled={currentRecord.selectedIdx === null}
          style={{
            width: '100%', padding: '14px',
            background: currentRecord.selectedIdx === null ? '#9ca3af' : '#1a3a6b',
            color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none',
            cursor: currentRecord.selectedIdx === null ? 'default' : 'pointer',
          }}
          onClick={goNext}
        >
          {index + 1 >= questions.length ? '結果を表示' : '次の問題へ'}
        </button>
      </div>
    </>
  );
};

export default GrammarClassTestPage;

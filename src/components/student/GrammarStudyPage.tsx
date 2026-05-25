import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, getDocs, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { isGrammarEnabled } from '../../constants/featureFlags';
import { useGrammarProblems } from '../../hooks/useGrammar';
import { GrammarProblem } from '../../types';
import Header from '../common/Header';

type Mode = 'normal' | 'random' | 'review';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

type ProgressMap = Map<string, { mistakeCount: number; status: string }>;

const GrammarStudyPage: React.FC = () => {
  const { classId, weekId } = useParams<{ classId: string; weekId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const { week, problems, loading } = useGrammarProblems(classId || '', weekId || '');

  const initialMode = (searchParams.get('mode') as Mode) || 'normal';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [progressMap, setProgressMap] = useState<ProgressMap>(new Map());
  const [progressLoaded, setProgressLoaded] = useState(false);

  const [order, setOrder] = useState<number[]>([]);
  const [index, setIndex] = useState(0);
  const [eliminated, setEliminated] = useState<Set<number>>(new Set());
  const [stepIdx, setStepIdx] = useState(0);
  const [stepWrong, setStepWrong] = useState(false);
  const [pickingFinal, setPickingFinal] = useState(false);
  const [finalSelection, setFinalSelection] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (userProfile && !isGrammarEnabled(userProfile)) navigate('/home');
  }, [userProfile, navigate]);

  // 進捗を読み込む（苦手モード判定用）
  useEffect(() => {
    if (!currentUser || !classId) return;
    const load = async () => {
      const snap = await getDocs(collection(db, 'users', currentUser.uid, `grammarProgress_${classId}`));
      const m: ProgressMap = new Map();
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        m.set(d.id, { mistakeCount: data.mistakeCount || 0, status: data.status || 'unlearned' });
      });
      setProgressMap(m);
      setProgressLoaded(true);
    };
    load();
  }, [currentUser, classId]);

  // モードに応じた問題順序
  const filteredProblems = useMemo<GrammarProblem[]>(() => {
    if (!progressLoaded) return [];
    if (mode === 'review') {
      return problems.filter((p) => {
        const pr = progressMap.get(p.id);
        return pr && (pr.mistakeCount > 0 || pr.status === 'review');
      });
    }
    return problems;
  }, [problems, mode, progressMap, progressLoaded]);

  // モード変更時に出題順を再生成
  useEffect(() => {
    if (filteredProblems.length === 0) {
      setOrder([]);
      return;
    }
    const baseOrder = filteredProblems.map((_, i) => i);
    setOrder(mode === 'random' ? shuffle(baseOrder) : baseOrder);
    setIndex(0);
    setEliminated(new Set());
    setStepIdx(0);
    setStepWrong(false);
    setPickingFinal(false);
    setFinalSelection(null);
    setShowExplanation(false);
    setCorrectCount(0);
    setDone(false);
  }, [mode, filteredProblems]);

  const current = order.length > 0 ? filteredProblems[order[index]] : null;

  // 問題が変わったらステップ状態リセット
  useEffect(() => {
    if (current) {
      setEliminated(new Set());
      setStepIdx(0);
      setStepWrong(false);
      setPickingFinal(false);
      setFinalSelection(null);
      setShowExplanation(false);
    }
  }, [current?.id]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setSearchParams({ mode: m });
  };

  if (loading || !progressLoaded || !week) {
    return (
      <>
        <Header />
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>読み込み中...</div>
      </>
    );
  }

  const reviewCount = problems.filter((p) => {
    const pr = progressMap.get(p.id);
    return pr && (pr.mistakeCount > 0 || pr.status === 'review');
  }).length;

  const renderModeToggle = () => (
    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
      {(['normal', 'random', 'review'] as Mode[]).map((m) => {
        const active = mode === m;
        const label = m === 'normal' ? '順番学習' : m === 'random' ? 'ランダム' : `苦手 (${reviewCount})`;
        return (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              flex: 1,
              padding: '10px 8px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              border: active ? '2px solid #1a3a6b' : '1px solid #e5e7eb',
              background: active ? '#1a3a6b' : '#fff',
              color: active ? '#fff' : '#4b5563',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  if (filteredProblems.length === 0) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px' }}>
          <button
            style={{ padding: '8px 14px', background: '#f3f4f6', borderRadius: 8, fontSize: 13, color: '#4b5563', border: 'none', marginBottom: 16 }}
            onClick={() => navigate(`/grammar/${classId}`)}
          >← 週一覧</button>
          {renderModeToggle()}
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, textAlign: 'center', color: '#6b7280' }}>
            {mode === 'review' ? '苦手な問題はありません' : '問題がまだ登録されていません'}
          </div>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 36, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 8 }}>学習完了</h2>
            <div style={{ fontSize: 15, color: '#6b7280', marginBottom: 24 }}>
              {filteredProblems.length}問中 {correctCount}問を一発で導出
            </div>
            <button
              style={{ width: '100%', padding: '12px', background: '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none' }}
              onClick={() => navigate(`/grammar/${classId}`)}
            >
              週一覧に戻る
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!current) return null;

  const steps = current.eliminationSteps || [];
  const hasSteps = steps.length > 0;
  const currentStep = steps[stepIdx];
  const isLastStep = stepIdx >= steps.length - 1;

  const onPickStepOption = (optIdx: number) => {
    if (!currentStep) return;
    const isCorrect = currentStep.options[optIdx].isCorrect;
    if (isCorrect) {
      // 選択肢を消す
      setEliminated((prev) => {
        const next = new Set(prev);
        currentStep.eliminateOriginalIndexes.forEach((i) => next.add(i));
        return next;
      });
      setStepWrong(false);
      // 次へ
      setTimeout(() => {
        if (isLastStep) {
          // 残った選択肢が1つなら自動で確定、複数残っていれば最終選択へ
          setEliminated((prev) => {
            const remaining = current.choices.map((_, i) => i).filter((i) => !prev.has(i));
            if (remaining.length === 1) {
              autoConfirm(remaining[0]);
            } else {
              setPickingFinal(true);
            }
            return prev;
          });
        } else {
          setStepIdx((s) => s + 1);
        }
      }, 400);
    } else {
      setStepWrong(true);
    }
  };

  const autoConfirm = (originalIndex: number) => {
    setFinalSelection(originalIndex);
    finalize(originalIndex);
  };

  const onPickFinal = (originalIndex: number) => {
    if (eliminated.has(originalIndex)) return;
    setFinalSelection(originalIndex);
    finalize(originalIndex);
  };

  const finalize = async (originalIndex: number) => {
    const isCorrect = current.choices[originalIndex].isCorrect;
    if (isCorrect) setCorrectCount((n) => n + 1);
    setShowExplanation(true);

    // 進捗保存
    if (!currentUser || !classId) return;
    const progressRef = doc(db, 'users', currentUser.uid, `grammarProgress_${classId}`, current.id);
    const existing = await getDoc(progressRef);
    const prev = existing.exists() ? (existing.data() as any) : { consecutiveCorrect: 0, mistakeCount: 0, stepMistakes: {} };
    const consecutive = isCorrect ? (prev.consecutiveCorrect || 0) + 1 : 0;
    const mistakeCount = isCorrect ? (prev.mistakeCount || 0) : (prev.mistakeCount || 0) + 1;
    const status = consecutive >= 3 ? 'mastered' : (mistakeCount > 0 ? 'review' : 'unlearned');
    const stepMistakes = { ...(prev.stepMistakes || {}) };
    if (!isCorrect && current.primaryStepKey) {
      stepMistakes[current.primaryStepKey] = (stepMistakes[current.primaryStepKey] || 0) + 1;
    }
    await setDoc(progressRef, {
      problemId: current.id,
      status,
      consecutiveCorrect: consecutive,
      mistakeCount,
      stepMistakes,
      lastAnswered: serverTimestamp(),
    }, { merge: true });
  };

  const goNext = () => {
    if (index + 1 >= order.length) {
      setDone(true);
    } else {
      setIndex((n) => n + 1);
    }
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button
            style={{ padding: '8px 14px', background: '#f3f4f6', borderRadius: 8, fontSize: 13, color: '#4b5563', border: 'none' }}
            onClick={() => navigate(`/grammar/${classId}`)}
          >← 週一覧</button>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{index + 1} / {order.length}</div>
        </div>

        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{week.weekLabel} / {week.theme}</div>
        <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#dbeafe', color: '#1e3a8a', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
          🧭 思考プロセス学習（段階的に絞り込む）
        </div>

        {renderModeToggle()}

        {/* 問題文 */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 14 }}>
          <div style={{ fontSize: 17, lineHeight: 1.7, color: '#111827' }}>{current.sentence}</div>
        </div>

        {/* 選択肢（消えた選択肢はグレーアウト＋打ち消し線） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {current.choices.map((c, i) => {
            const isElim = eliminated.has(i);
            const isFinalPick = finalSelection === i;
            const showResult = finalSelection !== null;
            let bg = '#fff';
            let border = '1px solid #e5e7eb';
            let color = '#111827';
            let textDecoration: 'none' | 'line-through' = 'none';
            let opacity = 1;

            if (isElim && !showResult) {
              bg = '#f9fafb'; border = '1px dashed #d1d5db'; color = '#9ca3af';
              textDecoration = 'line-through'; opacity = 0.7;
            }
            if (showResult) {
              if (c.isCorrect) { bg = '#d1fae5'; border = '2px solid #10b981'; color = '#065f46'; }
              else if (isFinalPick && !c.isCorrect) { bg = '#fee2e2'; border = '2px solid #ef4444'; color = '#991b1b'; }
              else if (isElim) { opacity = 0.5; textDecoration = 'line-through'; }
            }
            const clickable = pickingFinal && !isElim && finalSelection === null;

            return (
              <button
                key={i}
                disabled={!clickable}
                onClick={() => clickable && onPickFinal(i)}
                style={{
                  padding: '14px 16px',
                  background: bg,
                  border,
                  borderRadius: 10,
                  fontSize: 14,
                  color,
                  textAlign: 'left',
                  textDecoration,
                  opacity,
                  cursor: clickable ? 'pointer' : 'default',
                }}
              >
                <span style={{ fontWeight: 700, marginRight: 8 }}>{['①','②','③','④'][i]}</span>
                {c.text}
              </button>
            );
          })}
        </div>

        {/* ステップ／最終選択／解説のいずれか */}
        {hasSteps && !showExplanation && !pickingFinal && currentStep && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #1a3a6b' }}>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 6 }}>
              ステップ {stepIdx + 1} / {steps.length}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a6b', marginBottom: 14, lineHeight: 1.5 }}>
              {currentStep.question}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentStep.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => onPickStepOption(i)}
                  style={{
                    padding: '12px 14px',
                    background: '#f0f7ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#1e3a8a',
                    fontWeight: 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {stepWrong && currentStep.hint && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                💡 {currentStep.hint}
              </div>
            )}
          </div>
        )}

        {/* 最終選択フェーズ（複数残ったとき） */}
        {pickingFinal && finalSelection === null && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #2c5aa0' }}>
            <div style={{ fontSize: 14, color: '#1a3a6b', fontWeight: 700 }}>
              残った選択肢から正解を選んでください
            </div>
          </div>
        )}

        {/* 解説 */}
        {showExplanation && finalSelection !== null && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: current.choices[finalSelection].isCorrect ? '#10b981' : '#ef4444', marginBottom: 10 }}>
              {current.choices[finalSelection].isCorrect ? '✓ 正解' : '✗ 不正解'}
            </div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8, marginBottom: 14 }}>
              {current.explanation}
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, marginTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>選択肢ごとの解説</div>
              {current.choices.map((c, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 12, color: '#4b5563', lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 700, color: c.isCorrect ? '#10b981' : '#6b7280', marginRight: 6 }}>
                    {['①','②','③','④'][i]} {c.text}
                  </span>
                  {c.reason && <span>— {c.reason}</span>}
                </div>
              ))}
            </div>
            <button
              style={{ width: '100%', padding: '12px', background: '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', marginTop: 14 }}
              onClick={goNext}
            >
              {index + 1 >= order.length ? '結果を見る' : '次の問題へ'}
            </button>
          </div>
        )}

        {/* eliminationStepsがない問題はそのまま4択選ばせる */}
        {!hasSteps && !showExplanation && (
          <div style={{ background: '#fef3c7', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12, color: '#92400e' }}>
            この問題は段階的解説が用意されていません。直接答えを選んでください。
          </div>
        )}
        {!hasSteps && !pickingFinal && finalSelection === null && (
          <button
            style={{ width: '100%', padding: '12px', background: '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none', marginBottom: 16 }}
            onClick={() => setPickingFinal(true)}
          >
            選択肢から答える
          </button>
        )}
      </div>
    </>
  );
};

export default GrammarStudyPage;

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, setDoc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { isGrammarEnabled } from '../../constants/featureFlags';
import { useGrammarProblems } from '../../hooks/useGrammar';
import { GrammarChoice, GrammarProblem } from '../../types';
import Header from '../common/Header';

type Mode = 'normal' | 'random' | 'review';
type ProgressMap = Map<string, { mistakeCount: number; status: string }>;

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const GrammarQuizPage: React.FC = () => {
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
  const [shuffledChoices, setShuffledChoices] = useState<GrammarChoice[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (userProfile && !isGrammarEnabled(userProfile)) navigate('/home');
  }, [userProfile, navigate]);

  // 進捗を読む（苦手フィルタ用）
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

  const reviewCount = problems.filter((p) => {
    const pr = progressMap.get(p.id);
    return pr && (pr.mistakeCount > 0 || pr.status === 'review');
  }).length;

  // モード変更時に出題順生成
  useEffect(() => {
    if (filteredProblems.length === 0) {
      setOrder([]);
      return;
    }
    const baseOrder = filteredProblems.map((_, i) => i);
    setOrder(mode === 'random' ? shuffle(baseOrder) : baseOrder);
    setIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setDone(false);
  }, [mode, filteredProblems]);

  const current = order.length > 0 ? filteredProblems[order[index]] : null;

  useEffect(() => {
    if (current) {
      setShuffledChoices(shuffle(current.choices));
      setSelected(null);
    }
  }, [current?.id]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setSearchParams({ mode: m });
  };

  if (loading || !week || !progressLoaded) {
    return (
      <>
        <Header />
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>読み込み中...</div>
      </>
    );
  }

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
              border: active ? '2px solid #2c5aa0' : '1px solid #e5e7eb',
              background: active ? '#2c5aa0' : '#fff',
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

  const saveProgress = async (isCorrect: boolean) => {
    if (!currentUser || !current || !classId) return;
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

  const selectChoice = async (i: number) => {
    if (selected !== null || !current) return;
    setSelected(i);
    const isCorrect = shuffledChoices[i].isCorrect;
    if (isCorrect) setCorrectCount((n) => n + 1);
    await saveProgress(isCorrect);
  };

  const goNext = () => {
    if (index + 1 >= order.length) {
      setDone(true);
    } else {
      setIndex((n) => n + 1);
    }
  };

  if (done) {
    return (
      <>
        <Header />
        <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 36, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 8 }}>クイズ終了</h2>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#1a3a6b', marginBottom: 4 }}>
              {correctCount} / {order.length}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
              正答率 {Math.round((correctCount / order.length) * 100)}%
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                style={{ flex: 1, padding: '12px', background: '#2c5aa0', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none' }}
                onClick={() => switchMode(mode)}
              >
                もう一度
              </button>
              <button
                style={{ flex: 1, padding: '12px', background: '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none' }}
                onClick={() => navigate(`/grammar/${classId}`)}
              >
                週一覧へ
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!current) return null;
  const isCorrectSelected = selected !== null && shuffledChoices[selected]?.isCorrect;

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
        <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: '#ede9fe', color: '#5b21b6', fontSize: 11, fontWeight: 700, marginBottom: 12 }}>
          ⚡ 4択クイズモード
        </div>

        {renderModeToggle()}

        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontSize: 17, lineHeight: 1.7, color: '#111827' }}>{current.sentence}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {shuffledChoices.map((c, i) => {
            const picked = selected === i;
            const showResult = selected !== null;
            let bg = '#fff';
            let border = '1px solid #e5e7eb';
            if (showResult) {
              if (c.isCorrect) { bg = '#d1fae5'; border = '2px solid #10b981'; }
              else if (picked && !c.isCorrect) { bg = '#fee2e2'; border = '2px solid #ef4444'; }
            } else if (picked) {
              bg = '#dbeafe'; border = '2px solid #1a3a6b';
            }
            return (
              <button
                key={i}
                disabled={selected !== null}
                onClick={() => selectChoice(i)}
                style={{
                  padding: '14px 16px',
                  background: bg,
                  border,
                  borderRadius: 10,
                  fontSize: 14,
                  color: '#111827',
                  textAlign: 'left',
                  cursor: selected === null ? 'pointer' : 'default',
                }}
              >
                <span style={{ fontWeight: 700, marginRight: 8 }}>{['①','②','③','④'][i]}</span>
                {c.text}
              </button>
            );
          })}
        </div>

        {selected !== null && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: isCorrectSelected ? '#10b981' : '#ef4444', marginBottom: 10 }}>
              {isCorrectSelected ? '✓ 正解' : '✗ 不正解'}
            </div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.8, marginBottom: 12 }}>
              {current.explanation}
            </div>
            <button
              style={{ width: '100%', padding: '12px', background: '#1a3a6b', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 700, border: 'none' }}
              onClick={goNext}
            >
              {index + 1 >= order.length ? '結果を見る' : '次の問題へ'}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default GrammarQuizPage;

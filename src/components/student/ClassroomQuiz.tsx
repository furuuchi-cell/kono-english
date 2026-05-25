import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { parseMeaning } from '../../utils/pos';
import { RECALL_MS, REVIEW_MS } from '../../constants/quizConfig';
import { getRank } from '../../utils/rank';
import { useWords } from '../../hooks/useWords';

export interface ClassroomSessionData {
  id: string;
  classId: string;
  wordIds: number[];
  intervalSeconds: number;
  startedAt: number; // Unix ms
  status: 'active' | 'finished';
  rangeId?: string;
}

interface Props {
  classId: string;
  session: ClassroomSessionData;
  onClose: () => void;
}

const ClassroomQuiz: React.FC<Props> = ({ classId, session, onClose }) => {
  const { currentUser, userProfile } = useAuth();
  const { words: allWords, loading: wordsLoading } = useWords(classId);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(session.intervalSeconds);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answeredIndices, setAnsweredIndices] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);
  const [classResults, setClassResults] = useState<{ displayName: string; correct: number; uid: string }[]>([]);
  const [classRanges, setClassRanges] = useState<{ id: string; weekLabel: string; startId: number; endId: number }[]>([]);
  const [classResultsLoading, setClassResultsLoading] = useState(true);
  const [phase, setPhase] = useState<'answer' | 'review'>('answer');
  const [reviewTimeLeft, setReviewTimeLeft] = useState(0);
  const [choicesVisible, setChoicesVisible] = useState(false);

  const [allChoices, setAllChoices] = useState<string[][]>([]);
  const resultsRef = useRef<any[]>([]);
  const answeredRef = useRef<Set<number>>(new Set());
  const lastWordIndexRef = useRef(-1);
  const lastPhaseRef = useRef<'answer' | 'review'>('answer');

  // Lock background scroll while quiz is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Pre-generate all choices (単語ロード完了後)
  useEffect(() => {
    if (wordsLoading || allWords.length === 0) return;

    const rangeWords = allWords.filter((w) => session.wordIds.includes(w.id));
    const outsideWords = allWords.filter((w) => !session.wordIds.includes(w.id));

    const generated = session.wordIds.map((wordId) => {
      const word = allWords.find((w) => w.id === wordId);
      if (!word) return [];

      // 範囲内から正解以外をシャッフルして最大3つ取る
      const rangeDistractors = rangeWords
        .filter((w) => w.id !== wordId)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((w) => w.japanese);

      // 範囲内が3未満なら範囲外で補完
      const needed = 3 - rangeDistractors.length;
      const outsideDistractors = needed > 0
        ? outsideWords
            .sort(() => Math.random() - 0.5)
            .slice(0, needed)
            .map((w) => w.japanese)
        : [];

      const others = [...rangeDistractors, ...outsideDistractors];
      return [...others, word.japanese].sort(() => Math.random() - 0.5);
    });
    setAllChoices(generated);
  }, [wordsLoading, allWords]); // eslint-disable-line

  // Timer — all clients sync to startedAt
  useEffect(() => {
    const intervalMs = session.intervalSeconds * 1000;
    // スロット = 想起(2s) + 回答(intervalMs) + 復習(REVIEW_MS)
    const slotMs = RECALL_MS + intervalMs + REVIEW_MS;

    const tick = () => {
      const elapsed = Date.now() - session.startedAt;
      const slotIndex = Math.floor(elapsed / slotMs);

      if (slotIndex >= session.wordIds.length) {
        setFinished(true);
        return;
      }

      const slotElapsed = elapsed % slotMs;
      const newPhase: 'answer' | 'review' = slotElapsed < RECALL_MS + intervalMs ? 'answer' : 'review';

      if (slotIndex !== lastWordIndexRef.current) {
        lastWordIndexRef.current = slotIndex;
        setCurrentWordIndex(slotIndex);
        setSelectedAnswer(null);
        setChoicesVisible(false);
      }

      if (newPhase !== lastPhaseRef.current) {
        lastPhaseRef.current = newPhase;
        setPhase(newPhase);
      }

      if (newPhase === 'answer') {
        const visible = slotElapsed >= RECALL_MS;
        setChoicesVisible(visible);
        // タイマーは選択肢が出てから回答終了までをカウント
        setTimeLeft(Math.max(0, Math.ceil((RECALL_MS + intervalMs - slotElapsed) / 1000)));
      } else {
        setReviewTimeLeft(Math.ceil((slotMs - slotElapsed) / 1000));
      }
    };

    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [session]);

  // Listen for teacher stopping the session
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'classes', classId, 'sessions', session.id),
      (snap) => {
        if (snap.exists() && snap.data().status === 'finished') {
          setFinished(true);
        }
      }
    );
    return () => unsubscribe();
  }, [classId, session.id]);

  const handleAnswer = async (choice: string) => {
    if (answeredRef.current.has(currentWordIndex) || !currentUser) return;

    const wordId = session.wordIds[currentWordIndex];
    const word = allWords.find((w) => w.id === wordId);
    if (!word) return;

    const isCorrect = choice === word.japanese;
    setSelectedAnswer(choice);
    const newAnswered = new Set(Array.from(answeredRef.current).concat(currentWordIndex));
    answeredRef.current = newAnswered;
    setAnsweredIndices(new Set(Array.from(newAnswered)));

    resultsRef.current = [
      ...resultsRef.current,
      { wordIndex: currentWordIndex, wordId, selected: choice, correct: word.japanese, isCorrect },
    ];

    await setDoc(
      doc(db, 'classes', classId, 'sessions', session.id, 'answers', currentUser.uid),
      {
        displayName: userProfile?.displayName || currentUser.displayName || 'Unknown',
        results: resultsRef.current,
      }
    );

    // Update word progress (wrong → review, correct → mastered logic)
    try {
      const progressRef = doc(db, 'users', currentUser.uid, 'progress', classId);
      const progressDoc = await getDoc(progressRef);
      const currentProg = progressDoc.exists()
        ? (progressDoc.data()[wordId.toString()] as { status?: string; consecutiveCorrect?: number } | undefined)
        : undefined;

      let newStatus: string;
      let newConsecutive: number;

      if (isCorrect) {
        const consecutive = (currentProg?.consecutiveCorrect || 0) + 1;
        if (currentProg?.status === 'review') {
          newStatus = consecutive >= 2 ? 'mastered' : 'review';
        } else {
          newStatus = 'mastered';
        }
        newConsecutive = consecutive;
      } else {
        newStatus = 'review';
        newConsecutive = 0;
      }

      await setDoc(
        progressRef,
        { [wordId.toString()]: { status: newStatus, consecutiveCorrect: newConsecutive, lastStudied: new Date() } },
        { merge: true }
      );
    } catch {
      // progress update failure is non-critical
    }
  };

  // Fetch class results + ranges when finished
  useEffect(() => {
    if (!finished) return;
    const fetchClassResults = async () => {
      // 範囲データを取得（間違い単語の週ラベル表示用）
      const rangesSnap = await getDocs(collection(db, 'classes', classId, 'ranges'));
      setClassRanges(
        rangesSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => a.startId - b.startId)
      );

      // Wait a moment for other students' answers to propagate
      await new Promise((r) => setTimeout(r, 1500));
      const snap = await getDocs(collection(db, 'classes', classId, 'sessions', session.id, 'answers'));
      const allResults = snap.docs.map((d) => {
        const data = d.data();
        const correct = (data.results || []).filter((r: any) => r.isCorrect).length;
        return { uid: d.id, displayName: data.displayName || 'Unknown', correct };
      });
      // adminを除外
      const adminUids = new Set<string>();
      for (const r of allResults) {
        try {
          const uDoc = await getDoc(doc(db, 'users', r.uid));
          if (uDoc.exists() && uDoc.data().role === 'admin') adminUids.add(r.uid);
        } catch {}
      }
      const results = allResults.filter((r) => !adminUids.has(r.uid));
      results.sort((a, b) => b.correct - a.correct);
      setClassResults(results);
      setClassResultsLoading(false);
    };
    fetchClassResults();
  }, [finished]); // eslint-disable-line

  // Save final results to student's own collection when finished
  useEffect(() => {
    if (!finished || !currentUser || resultsRef.current.length === 0) return;
    const correct = resultsRef.current.filter((r) => r.isCorrect).length;
    setDoc(
      doc(db, 'users', currentUser.uid, 'quizResults', session.id),
      {
        classId,
        sessionId: session.id,
        rangeId: session.rangeId || null,
        wordIds: session.wordIds,
        totalQuestions: session.wordIds.length,
        answeredCount: resultsRef.current.length,
        correctCount: correct,
        intervalSeconds: session.intervalSeconds,
        completedAt: new Date(),
        results: resultsRef.current,
      }
    ).catch(() => {});
  }, [finished]); // eslint-disable-line

  const correctCount = resultsRef.current.filter((r) => r.isCorrect).length;
  const totalAnswered = resultsRef.current.length;

  if (finished) {
    const myRank = classResults.findIndex((r) => r.uid === currentUser?.uid) + 1;
    const medals = ['🥇', '🥈', '🥉'];
    const medalColors = ['#f59e0b', '#9ca3af', '#cd7c2f'];
    const total = session.wordIds.length;
    const myRate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const myRankInfo = getRank(myRate);

    return (
      <div style={styles.overlay}>
        <div style={styles.resultCard}>
          <h2 style={styles.resultTitle}>クイズ終了</h2>

          {/* Rank badge */}
          <div style={styles.rankBadgeArea}>
            <div style={{ ...styles.rankBadgeLarge, background: myRankInfo.bg }}>
              {myRankInfo.rank}
            </div>
            <div style={styles.rankBadgeLabel}>{myRankInfo.label}</div>
          </div>

          {/* My score */}
          <div style={styles.myScoreBox}>
            <div style={styles.myScoreRow}>
              <div>
                <span style={styles.myScoreNum}>{correctCount}</span>
                <span style={styles.myScoreDivider}> / {total}</span>
              </div>
              <div style={styles.myScoreRight}>
                <div style={styles.myScoreLabel}>正答数</div>
                <div style={{
                  ...styles.myRateNum,
                  color: myRate >= 70 ? '#10b981' : myRate >= 50 ? '#f59e0b' : '#ef4444',
                }}>{myRate}%</div>
              </div>
            </div>
            {totalAnswered < total && (
              <div style={styles.unansweredNote}>未回答 {total - totalAnswered}問</div>
            )}
            {myRank > 0 && (
              <div style={styles.myRankBadge}>
                {myRank <= 3 ? `${medals[myRank - 1]} ` : ''}{myRank}位 / {classResults.length}人中
              </div>
            )}
          </div>

          {/* Class ranking */}
          <div style={styles.rankingSection}>
          {classResultsLoading ? (
            <div style={styles.rankingLoading}>クラス結果を取得中...</div>
          ) : classResults.length > 0 ? (
            <>
              <div style={styles.rankingHeader}>
                <span style={styles.rankingTitle}>クラス結果</span>
                <span style={styles.rankingMeta}>{classResults.length}人参加</span>
              </div>

              {/* Top 3 podium */}
              {classResults.length >= 2 && (
                <div style={styles.podium}>
                  {classResults.slice(0, Math.min(3, classResults.length)).map((r, i) => {
                    const isMe = r.uid === currentUser?.uid;
                    return (
                      <div key={r.uid} style={{ ...styles.podiumItem, order: i === 1 ? -1 : i === 0 ? 0 : 1 }}>
                        <div style={{ ...styles.podiumMedal, color: medalColors[i] }}>{medals[i]}</div>
                        <div style={{ ...styles.podiumName, fontWeight: isMe ? 700 : 600 }}>
                          {r.displayName}{isMe ? '★' : ''}
                        </div>
                        <div style={styles.podiumScore}>{r.correct}<span style={styles.podiumScoreSub}>/{total} 正答</span></div>
                        <div style={{ ...styles.podiumBar, height: i === 0 ? 48 : i === 1 ? 64 : 32, background: medalColors[i] + '33', borderTop: `3px solid ${medalColors[i]}` }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Full list */}
              <div style={styles.rankingList}>
                {classResults.map((r, i) => {
                  const isMe = r.uid === currentUser?.uid;
                  const rate = Math.round((r.correct / total) * 100);
                  return (
                    <div key={r.uid} style={{ ...styles.rankingRow, ...(isMe ? styles.rankingRowMe : {}) }}>
                      <span style={{ ...styles.rankNum, color: i < 3 ? medalColors[i] : '#9ca3af' }}>
                        {i < 3 ? medals[i] : `${i + 1}位`}
                      </span>
                      <span style={styles.rankName}>{r.displayName}{isMe ? '　（自分）' : ''}</span>
                      <div style={styles.rankRight}>
                        <span style={styles.rankScore}>{r.correct}/{total}<span style={styles.rankScoreLabel}> 正答</span></span>
                        <span style={{ ...styles.rankRate, color: rate >= 70 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444' }}>{rate}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={styles.rankingLoading}>参加者がいませんでした</div>
          )}
          </div>

          {/* Wrong words */}
          {(() => {
            const wrongResults = resultsRef.current.filter((r) => !r.isCorrect);
            if (wrongResults.length === 0) return null;
            return (
              <div style={styles.wrongSection}>
                <div style={styles.wrongTitle}>苦手に追加された単語（{wrongResults.length}個）</div>
                {wrongResults.map((r: any) => {
                  const word = allWords.find((w) => w.id === r.wordId);
                  const range = classRanges.find((rng) => word && word.id >= rng.startId && word.id <= rng.endId);
                  return (
                    <div key={r.wordIndex} style={styles.wrongRow}>
                      <div style={styles.wrongLeft}>
                        <span style={styles.wrongEnglish}>{word?.english}</span>
                        <span style={styles.wrongJapanese}>{word?.japanese}</span>
                      </div>
                      {range && <span style={styles.wrongRange}>{range.weekLabel}</span>}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <button
            style={{ ...styles.closeBtn, ...(classResultsLoading ? { opacity: 0.4, cursor: 'default' } : {}) }}
            onClick={() => { if (!classResultsLoading) onClose(); }}
          >
            {classResultsLoading ? 'クラス結果を取得中...' : '閉じる'}
          </button>
        </div>
      </div>
    );
  }

  const currentWord = allWords.find((w) => w.id === session.wordIds[currentWordIndex]);
  const currentChoices = allChoices[currentWordIndex] || [];
  const hasAnswered = answeredIndices.has(currentWordIndex);

  if (!currentWord) return null;

  const timerPercent = (timeLeft / session.intervalSeconds) * 100;
  const myResult = resultsRef.current.find((r) => r.wordIndex === currentWordIndex);

  // Review phase — show word card back
  if (phase === 'review') {
    return (
      <div style={styles.overlay}>
        <div style={styles.quizCard}>
          <div style={styles.headerRow}>
            <span style={styles.progress}>{currentWordIndex + 1} / {session.wordIds.length}</span>
          </div>

          {/* Result indicator */}
          <div style={{
            ...styles.resultIndicator,
            background: !myResult ? '#f3f4f6' : myResult.isCorrect ? '#dcfce7' : '#fee2e2',
            color: !myResult ? '#6b7280' : myResult.isCorrect ? '#065f46' : '#991b1b',
          }}>
            {!myResult ? '未回答' : myResult.isCorrect ? '✓ 正解！' : '✗ 不正解'}
          </div>

          {/* Word details — 単語カード裏面と同じ表示 */}
          <div style={styles.reviewCard}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div style={styles.reviewEnglish}>{currentWord.english}</div>
              {currentWord.pronunciation && (
                <span style={{ fontSize: 12, color: '#7c3aed', fontFamily: 'serif' }}>{currentWord.pronunciation}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {parseMeaning(currentWord.pos, currentWord.japanese).map((p: any, pi: number) => (
                <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: '#6b7280', borderRadius: 4, padding: '1px 6px' }}>{p.badge}</span>
                  <span style={styles.reviewJapanese}>{p.meaning}</span>
                </span>
              ))}
            </div>
            {currentWord.example && (
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, padding: '6px 10px', background: '#f9fafb', borderRadius: 8, marginTop: 8 }}>
                {currentWord.example.split('\n').map((line: string, i: number) => {
                  const isEnglishLine = /[a-zA-Z]{2,}/.test(line) && !/[\u3000-\u9fff\uff00-\uffef]/.test(line);
                  if (isEnglishLine) {
                    const stem = currentWord.english.endsWith('y') ? currentWord.english.slice(0, -1) : currentWord.english.endsWith('e') ? currentWord.english.slice(0, -1) : currentWord.english;
                    const regex = new RegExp(`(\\b${stem}\\w*\\b)`, 'gi');
                    const parts = line.split(regex);
                    return (
                      <div key={i} style={i > 0 ? { marginTop: 3 } : undefined}>
                        {parts.map((part: string, j: number) =>
                          new RegExp(`^${stem}\\w*$`, 'i').test(part)
                            ? <span key={j} style={{ color: '#dc2626', fontWeight: 600 }}>{part}</span>
                            : <span key={j}>{part}</span>
                        )}
                      </div>
                    );
                  }
                  const exLines = currentWord.example!.split('\n');
                  return <div key={i} style={{ marginTop: 3, ...(i === 0 && exLines.length > 2 ? { fontWeight: 600, color: '#1a3a6b' } : {}) }}>{line}</div>;
                })}
              </div>
            )}
            {currentWord.derivatives && (
              <div style={{ fontSize: 12, color: '#0369a1', padding: '4px 10px', background: '#f0f9ff', borderRadius: 6, marginTop: 4, lineHeight: 1.4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: '#0ea5e9', borderRadius: 3, padding: '0px 5px', marginRight: 6 }}>派生語</span>
                {currentWord.derivatives}
              </div>
            )}
            {currentWord.mnemonic && (
              <div style={styles.reviewMnemonic}>
                <span style={styles.reviewMnemonicLabel}>覚え方</span>
                {currentWord.mnemonic}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.quizCard}>
        {/* Header */}
        <div style={styles.headerRow}>
          <span style={styles.progress}>
            {currentWordIndex + 1} / {session.wordIds.length}
          </span>
          <span style={styles.timerNum}>{timeLeft}秒</span>
        </div>

        {/* Timer bar */}
        <div style={styles.timerTrack}>
          <div
            style={{
              ...styles.timerFill,
              width: `${timerPercent}%`,
              background: timeLeft <= 2 ? '#ef4444' : '#1a3a6b',
            }}
          />
        </div>

        {/* Question */}
        <div style={styles.questionArea}>
          <p style={styles.questionLabel}>この単語の意味は？</p>
          <p style={styles.questionText}>{currentWord.english}</p>
          <p style={styles.questionPos}>{'\u00A0'}</p>
          <p style={{ ...styles.recallHint, opacity: choicesVisible ? 0 : 1, transition: 'opacity 0.3s ease' }}>意味を思い出して...</p>
        </div>

        {/* Choices */}
        <div style={{ ...styles.choicesGrid, opacity: choicesVisible ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: choicesVisible ? 'auto' : 'none' }}>
          {currentChoices.map((choice, i) => {
            let extra: React.CSSProperties = {};
            if (hasAnswered) {
              if (choice === currentWord.japanese) {
                extra = { background: '#dcfce7', borderColor: '#10b981', color: '#065f46' };
              } else if (choice === selectedAnswer) {
                extra = { background: '#fee2e2', borderColor: '#ef4444', color: '#991b1b' };
              }
            }
            return (
              <button
                key={i}
                style={{ ...styles.choiceBtn, ...extra }}
                onClick={() => handleAnswer(choice)}
                disabled={hasAnswered}
              >
                {choice}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#fff',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column' as const,
    overflowY: 'auto' as const,
  },
  quizCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '32px 24px 40px',
    maxWidth: 560,
    width: '100%',
    margin: '0 auto',
    justifyContent: 'center',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progress: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: 600,
  },
  timerNum: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  timerTrack: {
    height: 6,
    background: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 20,
  },
  timerFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.1s linear, background 0.3s',
  },
  questionArea: {
    marginBottom: 20,
    textAlign: 'center',
  },
  questionLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 28,
    fontWeight: 700,
    color: '#1a3a6b',
    lineHeight: 1.4,
    letterSpacing: '0.02em',
  },
  questionPos: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  recallHint: {
    fontSize: 13,
    color: '#d1d5db',
    marginTop: 12,
    fontStyle: 'italic',
  },
  choicesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  choiceBtn: {
    padding: '0 8px',
    minHeight: 64,
    background: '#f8faff',
    border: '2px solid #e2e8f0',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    color: '#1a3a6b',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s',
    lineHeight: 1.3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    wordBreak: 'break-word' as const,
  },
  reviewTimerNum: {
    fontSize: 13,
    fontWeight: 600,
    color: '#10b981',
  },
  resultIndicator: {
    textAlign: 'center' as const,
    padding: '8px 16px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 16,
  },
  reviewCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    background: '#f8faff',
    borderRadius: 16,
    padding: '20px 18px',
    overflowY: 'auto' as const,
  },
  reviewEnglish: {
    fontSize: 30,
    fontWeight: 700,
    color: '#1a3a6b',
    lineHeight: 1.2,
  },
  reviewPos: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: 500,
  },
  reviewJapanese: {
    fontSize: 20,
    fontWeight: 700,
    color: '#374151',
    lineHeight: 1.4,
  },
  reviewExample: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 1.7,
    borderTop: '1px solid #e5e7eb',
    paddingTop: 10,
  },
  reviewMnemonic: {
    fontSize: 13,
    color: '#7c3aed',
    lineHeight: 1.6,
    background: '#f5f3ff',
    borderRadius: 8,
    padding: '8px 12px',
  },
  reviewMnemonicLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#7c3aed',
    display: 'block',
    marginBottom: 2,
  },
  resultCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '28px 20px 36px',
    maxWidth: 560,
    width: '100%',
    margin: '0 auto',
    overflowY: 'auto' as const,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 16,
    textAlign: 'center' as const,
    letterSpacing: '0.05em',
  },
  myScoreBox: {
    background: 'linear-gradient(135deg, #1a3a6b 0%, #2d5fa8 100%)',
    borderRadius: 16,
    padding: '20px 20px 16px',
    marginBottom: 20,
    color: '#fff',
  },
  myScoreRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  myScoreNum: {
    fontSize: 52,
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
  },
  myScoreDivider: {
    fontSize: 20,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
  },
  myScoreRight: {
    textAlign: 'right' as const,
  },
  myScoreLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  myRateNum: {
    fontSize: 28,
    fontWeight: 700,
  },
  unansweredNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  myRankBadge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: '4px 14px',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
  },
  rankingSection: {
    flex: 1,
    marginBottom: 20,
  },
  rankingHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rankingTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#374151',
  },
  rankingMeta: {
    fontSize: 12,
    color: '#9ca3af',
  },
  rankingLoading: {
    textAlign: 'center' as const,
    padding: '24px 0',
    color: '#9ca3af',
    fontSize: 14,
  },
  podium: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 16,
    padding: '0 8px',
  },
  podiumItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 4,
  },
  podiumMedal: {
    fontSize: 24,
    lineHeight: 1,
  },
  podiumName: {
    fontSize: 12,
    color: '#1a3a6b',
    textAlign: 'center' as const,
    wordBreak: 'break-all' as const,
    lineHeight: 1.3,
  },
  podiumScore: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  podiumScoreSub: {
    fontSize: 10,
    fontWeight: 400,
    color: '#9ca3af',
  },
  podiumBar: {
    width: '100%',
    borderRadius: '4px 4px 0 0',
    marginTop: 4,
  },
  rankingList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 5,
  },
  rankingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#f9fafb',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
  },
  rankingRowMe: {
    background: '#eff6ff',
    border: '1.5px solid #93c5fd',
  },
  rankNum: {
    fontSize: 15,
    minWidth: 32,
    textAlign: 'center' as const,
    fontWeight: 700,
  },
  rankName: {
    flex: 1,
    fontSize: 14,
    fontWeight: 600,
    color: '#1a3a6b',
  },
  rankRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 1,
  },
  rankScore: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  rankScoreLabel: {
    fontSize: 11,
    fontWeight: 400,
    color: '#9ca3af',
  },
  rankRate: {
    fontSize: 12,
    fontWeight: 700,
  },
  rankBadgeArea: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  rankBadgeLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 900,
    color: '#fff',
    letterSpacing: '-0.5px',
  },
  rankBadgeLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#6b7280',
  },
  wrongSection: {
    marginBottom: 16,
    border: '1px solid #fecaca',
    borderRadius: 10,
    overflow: 'hidden',
  },
  wrongTitle: {
    padding: '10px 14px',
    background: '#fff1f2',
    fontSize: 13,
    fontWeight: 700,
    color: '#991b1b',
  },
  wrongRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    borderTop: '1px solid #fecaca',
    background: '#fff',
  },
  wrongLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  wrongEnglish: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  wrongJapanese: {
    fontSize: 12,
    color: '#6b7280',
  },
  wrongRange: {
    fontSize: 11,
    color: '#9ca3af',
    background: '#f3f4f6',
    padding: '2px 8px',
    borderRadius: 99,
    whiteSpace: 'nowrap' as const,
  },
  closeBtn: {
    padding: '14px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    width: '100%',
  },
};

export default ClassroomQuiz;

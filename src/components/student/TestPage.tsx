import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { TestData, TestQuestion, Word } from '../../types';
import Header from '../common/Header';
import { useWords } from '../../hooks/useWords';

const shuffleArray = <T,>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const getPosGroup = (pos: string): string => {
  if (pos.startsWith('verb')) return 'verb';
  return pos;
};

const generateQuestions = (test: TestData, allWords: Word[]): TestQuestion[] => {
  const targetWords = allWords.filter(
    (w) => w.id >= test.startId && w.id <= test.endId
  );
  const otherWords = allWords.filter(
    (w) => w.id < test.startId || w.id > test.endId
  );

  return shuffleArray(targetWords).map((word) => {
    const posGroup = getPosGroup(word.pos);

    // 同じ品詞かつ同じ週（範囲内）の単語を優先
    const samePosSameRange = targetWords.filter(
      (w) => w.id !== word.id && getPosGroup(w.pos) === posGroup
    );
    // 同じ品詞の範囲外
    const samePosOther = otherWords.filter(
      (w) => getPosGroup(w.pos) === posGroup
    );
    // フォールバック
    const anyOther = otherWords;

    // 3つの不正解選択肢を作成: まず同じ週+同品詞、次に他週+同品詞、最後に任意
    const distractors: string[] = [];
    const used = new Set<string>([word.japanese]);

    const addFrom = (pool: Word[]) => {
      for (const w of shuffleArray(pool)) {
        if (distractors.length >= 3) break;
        if (!used.has(w.japanese)) {
          distractors.push(w.japanese);
          used.add(w.japanese);
        }
      }
    };

    addFrom(samePosSameRange);
    addFrom(samePosOther);
    addFrom(anyOther);

    const choices = shuffleArray([word.japanese, ...distractors]);
    return {
      wordId: word.id,
      english: word.english,
      correctAnswer: word.japanese,
      choices,
    };
  });
};

const TestPage: React.FC = () => {
  const { classId, testId } = useParams<{ classId: string; testId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  // クラスの単語セットをキャッシュにロード
  const { words: classWords, loading: wordsLoading } = useWords(classId || '');
  const [test, setTest] = useState<TestData | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [wrongWords, setWrongWords] = useState<number[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [choicesVisible, setChoicesVisible] = useState(true);

  useEffect(() => {
    if (wordsLoading) return;
    const loadTest = async () => {
      if (!classId || !testId) return;
      const testDoc = await getDoc(doc(db, 'classes', classId, 'tests', testId));
      if (testDoc.exists()) {
        const testData = { id: testDoc.id, ...testDoc.data() } as TestData;
        setTest(testData);
        setQuestions(generateQuestions(testData, classWords));
      }
      setLoading(false);
    };
    loadTest();
  }, [classId, testId, wordsLoading, classWords]);

  const handleAnswer = (answer: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(answer);

    const isCorrect = answer === questions[currentQ].correctAnswer;
    if (isCorrect) {
      setScore((s) => s + 1);
    } else {
      setWrongWords((w) => [...w, questions[currentQ].wordId]);
    }

    const newWrongWords = isCorrect ? wrongWords : [...wrongWords, questions[currentQ].wordId];
    setTimeout(() => {
      if (currentQ + 1 >= questions.length) {
        finishTest(isCorrect ? score + 1 : score, newWrongWords);
      } else {
        setCurrentQ((q) => q + 1);
        setSelectedAnswer(null);
      }
    }, 1000);
  };

  const finishTest = async (finalScore: number, finalWrongWords: number[]) => {
    setIsFinished(true);
    if (!currentUser || !classId || !testId) return;

    try {
      // Save test result
      const resultRef = doc(
        collection(db, 'classes', classId, 'tests', testId, 'results')
      );
      await setDoc(resultRef, {
        testId,
        userId: currentUser.uid,
        score: finalScore,
        totalQuestions: questions.length,
        wrongWords: finalWrongWords,
        completedAt: new Date(),
      });

      // Mark wrong words as 'review' in progress
      if (finalWrongWords.length > 0) {
        const progressRef = doc(db, 'users', currentUser.uid, 'progress', classId);
        const progressDoc = await getDoc(progressRef);
        const existing = progressDoc.exists() ? progressDoc.data() : {};
        const updates: Record<string, { status: string; consecutiveCorrect: number }> = {};
        for (const wId of finalWrongWords) {
          // Only downgrade if not already 'review'
          const current = existing[wId.toString()];
          if (!current || current.status !== 'review') {
            updates[wId.toString()] = { status: 'review', consecutiveCorrect: 0 };
          }
        }
        if (Object.keys(updates).length > 0) {
          await setDoc(progressRef, { ...existing, ...updates });
        }
      }
    } catch (err) {
      console.error('Failed to save test result:', err);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  if (!test) {
    return (
      <>
        <Header />
        <div style={styles.loading}>チェックテストが見つかりません</div>
      </>
    );
  }

  if (isFinished) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <>
        <Header />
        <div style={styles.page}>
          <div style={styles.resultCard}>
            <div style={styles.resultEmoji}>
              {percentage >= 80 ? '🎉' : percentage >= 60 ? '💪' : '📚'}
            </div>
            <h2 style={styles.resultTitle}>チェックテスト結果</h2>
            <div style={styles.scoreCircle}>
              <div style={styles.scoreNumber}>{percentage}%</div>
              <div style={styles.scoreDetail}>
                {score} / {questions.length}
              </div>
            </div>
            {wrongWords.length > 0 && (
              <div style={styles.wrongSection}>
                <h3 style={styles.wrongTitle}>間違えた単語</h3>
                {wrongWords.map((wId) => {
                  const word = classWords.find((w) => w.id === wId);
                  return word ? (
                    <div key={wId} style={styles.wrongItem}>
                      <span style={styles.wrongEnglish}>{word.english}</span>
                      <span style={styles.wrongJapanese}>{word.japanese}</span>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <button style={styles.homeBtn} onClick={() => navigate('/')}>
              ホームに戻る
            </button>
          </div>
        </div>
      </>
    );
  }

  const question = questions[currentQ];

  return (
    <>
      <Header />
      <div style={styles.page}>
        <div style={styles.testHeader}>
          <span>{test.title}</span>
          <span>
            {currentQ + 1} / {questions.length}
          </span>
        </div>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${((currentQ + 1) / questions.length) * 100}%`,
            }}
          />
        </div>

        <div style={styles.questionCard}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              {selectedAnswer && (
                <span style={{
                  position: 'absolute',
                  top: -20,
                  left: -28,
                  fontSize: 27,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: selectedAnswer === question.correctAnswer ? '#10b981' : '#ef4444',
                }}>
                  {selectedAnswer === question.correctAnswer ? '○' : '×'}
                </span>
              )}
              <div style={{ ...styles.questionWord, marginBottom: 0 }}>{question.english}</div>
            </div>
          </div>
          <div style={styles.choices}>
            {question.choices.map((choice, i) => {
              let bg = '#f9fafb';
              let border = '#e5e7eb';
              let color = '#1a1a2e';
              if (selectedAnswer) {
                if (choice === question.correctAnswer) {
                  bg = '#d1fae5';
                  border = '#10b981';
                  color = '#065f46';
                } else if (choice === selectedAnswer) {
                  bg = '#fee2e2';
                  border = '#ef4444';
                  color = '#991b1b';
                }
              }
              return (
                <button
                  key={i}
                  style={{ ...styles.choiceBtn, background: bg, borderColor: border, color }}
                  onClick={() => handleAnswer(choice)}
                  disabled={!!selectedAnswer}
                >
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 500,
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
  testHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    background: '#e5e7eb',
    borderRadius: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#1a3a6b',
    transition: 'width 0.3s',
  },
  questionCard: {
    background: '#fff',
    borderRadius: 20,
    padding: 32,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    textAlign: 'center',
  },
  questionWord: {
    fontSize: 32,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 16,
  },
  thinkingHint: {
    fontSize: 13,
    color: '#d1d5db',
    fontStyle: 'italic',
    textAlign: 'center' as const,
    marginBottom: 16,
  },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  choiceBtn: {
    padding: '16px',
    borderRadius: 12,
    border: '2px solid #e5e7eb',
    fontSize: 16,
    fontWeight: 500,
    textAlign: 'left',
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  resultCard: {
    background: '#fff',
    borderRadius: 20,
    padding: 40,
    textAlign: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
  },
  resultEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 20,
  },
  scoreCircle: {
    margin: '0 auto 24px',
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  scoreDetail: {
    fontSize: 16,
    color: '#6b7280',
  },
  wrongSection: {
    textAlign: 'left',
    marginTop: 20,
    padding: 16,
    background: '#fef2f2',
    borderRadius: 12,
  },
  wrongTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#991b1b',
    marginBottom: 8,
  },
  wrongItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #fecaca',
    fontSize: 14,
  },
  wrongEnglish: {
    fontWeight: 600,
    color: '#1a1a2e',
  },
  wrongJapanese: {
    color: '#6b7280',
  },
  backBtn: {
    padding: '6px 14px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 8,
    border: 'none',
    cursor: 'pointer',
  },
  homeBtn: {
    marginTop: 24,
    padding: '14px 32px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 10,
    fontSize: 16,
    fontWeight: 600,
  },
};

export default TestPage;

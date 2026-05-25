import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Word, WordProgress, WordStatus } from '../types';
import { getWordsSync, useWords } from './useWords';

interface UseStudySessionProps {
  userId: string;
  classId: string;
  rangeId: string;
  startId: number;
  endId: number;
  mode: 'normal' | 'random' | 'review';
}

interface SessionResult {
  correctCount: number;
  incorrectCount: number;
  newlyMastered: number;
  newlyReview: number;
}

interface StudyState {
  words: Word[];
  currentIndex: number;
  progress: Map<number, WordProgress>;
  isComplete: boolean;
  stats: {
    mastered: number;
    review: number;
    unlearned: number;
    total: number;
  };
  sessionResult: SessionResult;
}

const getTodayString = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getYesterdayString = (): string => {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const updateStreak = async (userId: string): Promise<void> => {
  const today = getTodayString();
  const streakRef = doc(db, 'users', userId, 'streak', 'current');
  try {
    const streakDoc = await getDoc(streakRef);
    if (streakDoc.exists()) {
      const data = streakDoc.data() as { lastStudyDate: string; streakCount: number };
      if (data.lastStudyDate === today) {
        // Already studied today, no update needed
        return;
      }
      const yesterday = getYesterdayString();
      const newCount = data.lastStudyDate === yesterday ? data.streakCount + 1 : 1;
      await setDoc(streakRef, { lastStudyDate: today, streakCount: newCount });
    } else {
      await setDoc(streakRef, { lastStudyDate: today, streakCount: 1 });
    }
  } catch (error) {
    console.error('Failed to update streak:', error);
  }
};

export const useStudySession = ({
  userId,
  classId,
  rangeId,
  startId,
  endId,
  mode,
}: UseStudySessionProps) => {
  // クラスの単語セットをキャッシュにロード
  const { words: classWords, loading: wordsLoading } = useWords(classId);

  const [state, setState] = useState<StudyState>({
    words: [],
    currentIndex: 0,
    progress: new Map(),
    isComplete: false,
    stats: { mastered: 0, review: 0, unlearned: 0, total: 0 },
    sessionResult: { correctCount: 0, incorrectCount: 0, newlyMastered: 0, newlyReview: 0 },
  });
  const [loading, setLoading] = useState(true);

  // Load progress and session from Firestore
  useEffect(() => {
    if (wordsLoading) return; // 単語ロード完了を待つ

    const loadSession = async () => {
      setLoading(true);

      // Get word progress
      const progressDoc = await getDoc(
        doc(db, 'users', userId, 'progress', classId)
      );
      const progressData: Map<number, WordProgress> = new Map();
      if (progressDoc.exists()) {
        const data = progressDoc.data();
        Object.entries(data).forEach(([key, value]: [string, any]) => {
          progressData.set(Number(key), value as WordProgress);
        });
      }

      // Filter words by range (classWords is now guaranteed to be loaded)
      const rangeWords = classWords.filter(
        (w) => w.id >= startId && w.id <= endId
      );

      // Filter by mode
      let studyWords: Word[];
      if (mode === 'review') {
        studyWords = rangeWords.filter((w) => {
          const p = progressData.get(w.id);
          return p?.status === 'review';
        });
      } else if (mode === 'random') {
        studyWords = [...rangeWords];
        for (let i = studyWords.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [studyWords[i], studyWords[j]] = [studyWords[j], studyWords[i]];
        }
      } else {
        studyWords = rangeWords;
      }

      // Get saved session position
      const sessionDoc = await getDoc(
        doc(db, 'users', userId, 'sessions', `${classId}_${rangeId}_${startId}_${endId}_${mode}`)
      );
      let savedIndex = 0;
      if (sessionDoc.exists()) {
        savedIndex = sessionDoc.data().currentIndex || 0;
        if (savedIndex >= studyWords.length) savedIndex = 0;
      }

      const stats = calculateStats(rangeWords, progressData);

      setState({
        words: studyWords,
        currentIndex: savedIndex,
        progress: progressData,
        isComplete: studyWords.length === 0,
        stats,
        sessionResult: { correctCount: 0, incorrectCount: 0, newlyMastered: 0, newlyReview: 0 },
      });
      setLoading(false);
    };

    if (userId && classId) {
      loadSession();
    }
  }, [userId, classId, rangeId, startId, endId, mode, wordsLoading, classWords]);

  const calculateStats = (
    words: Word[],
    progress: Map<number, WordProgress>
  ) => {
    let mastered = 0;
    let review = 0;
    let unlearned = 0;
    words.forEach((w) => {
      const p = progress.get(w.id);
      if (!p || p.status === 'unlearned') unlearned++;
      else if (p.status === 'review') review++;
      else if (p.status === 'mastered') mastered++;
    });
    return { mastered, review, unlearned, total: words.length };
  };

  const handleSwipe = useCallback(
    async (direction: 'right' | 'left') => {
      const currentWord = state.words[state.currentIndex];
      if (!currentWord) return;

      const knew = direction === 'right';
      const currentProgress = state.progress.get(currentWord.id);
      const currentStatus: WordStatus = currentProgress?.status || 'unlearned';
      const consecutiveCorrect = currentProgress?.consecutiveCorrect || 0;

      let newStatus: WordStatus;
      let newConsecutive: number;

      if (knew) {
        if (currentStatus === 'unlearned') {
          newStatus = 'mastered';
          newConsecutive = 1;
        } else if (currentStatus === 'review') {
          newConsecutive = consecutiveCorrect + 1;
          newStatus = newConsecutive >= 2 ? 'mastered' : 'review';
        } else {
          newStatus = 'mastered';
          newConsecutive = consecutiveCorrect + 1;
        }
      } else {
        newStatus = currentStatus === 'unlearned' ? 'review' : 'review';
        newConsecutive = 0;
      }

      // Track session results
      const isNewlyMastered = newStatus === 'mastered' && currentStatus !== 'mastered';
      const isNewlyReview = newStatus === 'review' && currentStatus !== 'review';

      const updatedProgress: WordProgress = {
        wordId: currentWord.id,
        status: newStatus,
        consecutiveCorrect: newConsecutive,
        lastStudied: new Date(),
      };

      // Update local state
      const newProgressMap = new Map(state.progress);
      newProgressMap.set(currentWord.id, updatedProgress);

      const nextIndex = state.currentIndex + 1;
      const isComplete = nextIndex >= state.words.length;

      const rangeWords = classWords.filter(
        (w) => w.id >= startId && w.id <= endId
      );
      const stats = calculateStats(rangeWords, newProgressMap);

      setState((prev) => ({
        ...prev,
        progress: newProgressMap,
        currentIndex: isComplete ? prev.currentIndex : nextIndex,
        isComplete,
        stats,
        sessionResult: {
          correctCount: prev.sessionResult.correctCount + (knew ? 1 : 0),
          incorrectCount: prev.sessionResult.incorrectCount + (knew ? 0 : 1),
          newlyMastered: prev.sessionResult.newlyMastered + (isNewlyMastered ? 1 : 0),
          newlyReview: prev.sessionResult.newlyReview + (isNewlyReview ? 1 : 0),
        },
      }));

      // Save to Firestore
      try {
        const progressRef = doc(db, 'users', userId, 'progress', classId);
        await setDoc(
          progressRef,
          { [currentWord.id.toString()]: updatedProgress },
          { merge: true }
        );

        const sessionRef = doc(
          db,
          'users',
          userId,
          'sessions',
          `${classId}_${rangeId}_${startId}_${endId}_${mode}`
        );
        await setDoc(sessionRef, {
          currentIndex: isComplete ? 0 : nextIndex,
          lastUpdated: new Date(),
        });

        // Update streak
        await updateStreak(userId);
      } catch (error) {
        console.error('Failed to save progress:', error);
      }
    },
    [state, userId, classId, rangeId, startId, endId, mode]
  );

  const resetSession = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      currentIndex: 0,
      isComplete: false,
      sessionResult: { correctCount: 0, incorrectCount: 0, newlyMastered: 0, newlyReview: 0 },
    }));
    try {
      const sessionRef = doc(
        db,
        'users',
        userId,
        'sessions',
        `${classId}_${rangeId}_${startId}_${endId}_${mode}`
      );
      await setDoc(sessionRef, { currentIndex: 0, lastUpdated: new Date() });
    } catch (error) {
      console.error('Failed to reset session:', error);
    }
  }, [userId, classId, rangeId, mode]);

  return {
    currentWord: state.words[state.currentIndex] || null,
    currentIndex: state.currentIndex,
    totalWords: state.words.length,
    isComplete: state.isComplete,
    stats: state.stats,
    progress: state.progress,
    sessionResult: state.sessionResult,
    loading,
    handleSwipe,
    resetSession,
  };
};

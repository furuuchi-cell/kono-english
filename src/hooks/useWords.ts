import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Word } from '../types';
import wordsData from '../data/words.json';
import as2en001Data from '../data/classWords/AS2EN001.json';

const baseWords: Word[] = wordsData as Word[];

// wordSetId → バンドル単語リスト
const bundledWordSets: Record<string, Word[]> = {
  AS2EN001: as2en001Data as Word[],
};

// wordSetId → 1ページあたり単語数
export const WORDS_PER_PAGE_BY_SET: Record<string, number> = {
  AS2EN001: 150,
};

// wordSetId → 総単語数
export const TOTAL_WORDS_BY_SET: Record<string, number> = {
  AS2EN001: 2092,
};

// Per-class cache
const cacheByClass: Record<string, Word[]> = {};
const wordSetIdByClass: Record<string, string | null> = {};

const applyOverrides = (words: Word[], overrides: Record<string, any>): Word[] =>
  words.map((w) => {
    const o = overrides[w.id.toString()];
    if (!o) return w;
    return {
      ...w,
      japanese: o.japanese ?? w.japanese,
      pos: o.pos ?? w.pos,
      example: o.example ?? w.example,
      derivatives: o.derivatives ?? w.derivatives,
      mnemonic: o.mnemonic ?? w.mnemonic,
      pronunciation: o.pronunciation ?? w.pronunciation,
    };
  });

export const useWords = (classId: string) => {
  const [words, setWords] = useState<Word[]>(cacheByClass[classId] ?? baseWords);
  const [loading, setLoading] = useState(!cacheByClass[classId]);
  const [wordSetId, setWordSetId] = useState<string | null>(wordSetIdByClass[classId] ?? null);

  useEffect(() => {
    if (cacheByClass[classId]) {
      setWords(cacheByClass[classId]);
      setWordSetId(wordSetIdByClass[classId] ?? null);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        // クラスドキュメントから wordSetId を取得
        const classDoc = await getDoc(doc(db, 'classes', classId));
        const setId: string | null = classDoc.exists() ? (classDoc.data().wordSetId ?? null) : null;
        wordSetIdByClass[classId] = setId;
        setWordSetId(setId);

        const baseList = (setId && bundledWordSets[setId]) ? bundledWordSets[setId] : baseWords;

        // Firestore overrides（バンドル済みクラスも上書き可能）
        const overrideDoc = await getDoc(doc(db, 'classes', classId, 'settings', 'wordOverrides'));
        if (overrideDoc.exists()) {
          const merged = applyOverrides(baseList, overrideDoc.data());
          cacheByClass[classId] = merged;
          setWords(merged);
        } else {
          cacheByClass[classId] = baseList;
          setWords(baseList);
        }
      } catch {
        cacheByClass[classId] = baseWords;
        setWords(baseWords);
      }
      setLoading(false);
    };
    load();
  }, [classId]);

  return { words, loading, wordSetId };
};

export const invalidateWordsCache = (classId: string) => {
  delete cacheByClass[classId];
  delete wordSetIdByClass[classId];
};

export const getWordsSync = (classId: string): Word[] =>
  cacheByClass[classId] ?? baseWords;

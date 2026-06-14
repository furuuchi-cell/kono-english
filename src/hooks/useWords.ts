import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Word } from '../types';

/**
 * 単語データ（words.json は 420KB、AS2EN001.json は 628KB と大きいため、
 * メインバンドルから切り離して動的 import で必要時のみフェッチする。
 * 結果はモジュールレベルでキャッシュするので、2回目以降は即時返却される。
 */

// wordSetId → 1ページあたり単語数
export const WORDS_PER_PAGE_BY_SET: Record<string, number> = {
  AS2EN001: 150,
};

// wordSetId → 総単語数
export const TOTAL_WORDS_BY_SET: Record<string, number> = {
  AS2EN001: 2092,
};

// ベース単語リスト(words.json)の総件数（HomePage の総単語数表示で fallback として使用）
export const BASE_WORDS_COUNT = 2092;

// --- 動的ロード用キャッシュとローダー ---
let baseWordsCache: Word[] | null = null;
export const loadBaseWords = async (): Promise<Word[]> => {
  if (baseWordsCache) return baseWordsCache;
  const mod = await import(/* webpackChunkName: "words-base" */ '../data/words.json');
  baseWordsCache = ((mod as any).default ?? mod) as Word[];
  return baseWordsCache;
};

const wordSetLoaders: Record<string, () => Promise<Word[]>> = {
  AS2EN001: async () => {
    const mod = await import(/* webpackChunkName: "wordset-as2en001" */ '../data/classWords/AS2EN001.json');
    return ((mod as any).default ?? mod) as Word[];
  },
};

const wordSetCache: Record<string, Word[]> = {};
const loadWordSet = async (setId: string): Promise<Word[] | null> => {
  if (wordSetCache[setId]) return wordSetCache[setId];
  const loader = wordSetLoaders[setId];
  if (!loader) return null;
  const data = await loader();
  wordSetCache[setId] = data;
  return data;
};

// クラス単位のキャッシュ
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
  const [words, setWords] = useState<Word[]>(cacheByClass[classId] ?? []);
  const [loading, setLoading] = useState(!cacheByClass[classId]);
  const [wordSetId, setWordSetId] = useState<string | null>(wordSetIdByClass[classId] ?? null);

  useEffect(() => {
    let cancelled = false;

    if (cacheByClass[classId]) {
      setWords(cacheByClass[classId]);
      setWordSetId(wordSetIdByClass[classId] ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const load = async () => {
      try {
        // クラスドキュメントから wordSetId を取得（並列でベース単語のロードも開始）
        const [classDoc, baseList0] = await Promise.all([
          getDoc(doc(db, 'classes', classId)),
          loadBaseWords(),
        ]);
        if (cancelled) return;

        const setId: string | null = classDoc.exists() ? (classDoc.data().wordSetId ?? null) : null;
        wordSetIdByClass[classId] = setId;
        setWordSetId(setId);

        // wordSetId が指定されていればその専用セットを、そうでなければ baseWords を使う
        let baseList: Word[] = baseList0;
        if (setId) {
          const set = await loadWordSet(setId);
          if (set) baseList = set;
        }
        if (cancelled) return;

        // Firestore overrides（バンドル済みクラスも上書き可能）
        const overrideDoc = await getDoc(doc(db, 'classes', classId, 'settings', 'wordOverrides'));
        if (cancelled) return;

        if (overrideDoc.exists()) {
          const merged = applyOverrides(baseList, overrideDoc.data());
          cacheByClass[classId] = merged;
          setWords(merged);
        } else {
          cacheByClass[classId] = baseList;
          setWords(baseList);
        }
      } catch {
        // 失敗時はベースだけでも返す
        try {
          const fallback = await loadBaseWords();
          if (!cancelled) {
            cacheByClass[classId] = fallback;
            setWords(fallback);
          }
        } catch {
          /* noop */
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();

    return () => { cancelled = true; };
  }, [classId]);

  return { words, loading, wordSetId };
};

export const invalidateWordsCache = (classId: string) => {
  delete cacheByClass[classId];
  delete wordSetIdByClass[classId];
};

/**
 * 同期取得用。useWords が事前に呼ばれてキャッシュに乗っている前提。
 * 未ロードの場合は空配列を返す（旧実装の baseWords フォールバックは無くなった）。
 * 必要なら呼び出し側で loadBaseWords() を await すること。
 */
export const getWordsSync = (classId: string): Word[] =>
  cacheByClass[classId] ?? [];

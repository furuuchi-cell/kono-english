import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { GrammarWeek, GrammarProblem } from '../types';

export const useGrammarWeeks = (classId: string) => {
  const [weeks, setWeeks] = useState<GrammarWeek[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!classId) { setLoading(false); return; }
      setLoading(true);
      const snap = await getDocs(
        query(collection(db, 'classes', classId, 'grammarWeeks'), orderBy('weekNumber', 'asc'))
      );
      const list: GrammarWeek[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      if (!cancelled) {
        setWeeks(list);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [classId]);

  return { weeks, loading };
};

export const useGrammarProblems = (classId: string, weekId: string) => {
  const [week, setWeek] = useState<GrammarWeek | null>(null);
  const [problems, setProblems] = useState<GrammarProblem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!classId || !weekId) { setLoading(false); return; }
      setLoading(true);
      const weekSnap = await getDoc(doc(db, 'classes', classId, 'grammarWeeks', weekId));
      if (!weekSnap.exists()) { setLoading(false); return; }
      const weekData: GrammarWeek = { id: weekSnap.id, ...(weekSnap.data() as any) };

      const probSnap = await getDocs(
        query(collection(db, 'classes', classId, 'grammarProblems'), where('weekId', '==', weekId))
      );
      const probMap = new Map<string, GrammarProblem>();
      probSnap.docs.forEach((d) => {
        probMap.set(d.id, { id: d.id, ...(d.data() as any) });
      });
      const ordered = weekData.problemIds.map((pid) => probMap.get(pid)).filter(Boolean) as GrammarProblem[];

      if (!cancelled) {
        setWeek(weekData);
        setProblems(ordered);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [classId, weekId]);

  return { week, problems, loading };
};

// 複数週の問題をまとめて取得（授業内テスト用）
export const fetchGrammarProblemsByWeeks = async (
  classId: string,
  weekIds: string[]
): Promise<GrammarProblem[]> => {
  if (weekIds.length === 0) return [];
  const results: GrammarProblem[] = [];
  // Firestoreのin句は10件までなので分割
  const chunks: string[][] = [];
  for (let i = 0; i < weekIds.length; i += 10) {
    chunks.push(weekIds.slice(i, i + 10));
  }
  for (const chunk of chunks) {
    const snap = await getDocs(
      query(collection(db, 'classes', classId, 'grammarProblems'), where('weekId', 'in', chunk))
    );
    snap.docs.forEach((d) => {
      results.push({ id: d.id, ...(d.data() as any) } as GrammarProblem);
    });
  }
  return results;
};

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { WordProgress, WeeklyRange } from '../../types';
import Header from '../common/Header';
import WordListView from '../common/WordListView';
import { useWords, WORDS_PER_PAGE_BY_SET } from '../../hooks/useWords';

const WordListPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [progress, setProgress] = useState<Map<number, WordProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const { words, loading: wordsLoading, wordSetId } = useWords(classId ?? '');
  const [ranges, setRanges] = useState<WeeklyRange[]>([]);

  // 印刷ダイアログ
  const [showPrint, setShowPrint] = useState(false);
  const [printStart, setPrintStart] = useState<string>('1');
  const [printEnd, setPrintEnd] = useState<string>('30');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      if (!currentUser || !classId) return;
      const progressDoc = await getDoc(doc(db, 'users', currentUser.uid, 'progress', classId));
      const map = new Map<number, WordProgress>();
      if (progressDoc.exists()) {
        Object.entries(progressDoc.data()).forEach(([key, value]: [string, any]) => {
          map.set(Number(key), value as WordProgress);
        });
      }
      setProgress(map);

      // 公開されている範囲を取得
      const rangesSnap = await getDocs(collection(db, 'classes', classId, 'ranges'));
      const loadedRanges = rangesSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as WeeklyRange))
        .sort((a, b) => a.startId - b.startId);
      setRanges(loadedRanges);

      setLoading(false);
    };
    load();
  }, [currentUser, classId]);

  if (loading || wordsLoading) {
    return (
      <>
        <Header />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', fontSize: 18, color: '#6b7280' }}>
          読み込み中...
        </div>
      </>
    );
  }

  const wordsPerPage = (wordSetId && WORDS_PER_PAGE_BY_SET[wordSetId]) || 50;
  // 公開されている範囲の単語のみ表示
  const maxEndId = ranges.length > 0 ? Math.max(...ranges.map(r => r.endId)) : 0;
  const limitedWords = maxEndId > 0 ? words.filter(w => w.id <= maxEndId) : words;
  const maxPage = ranges.length > 0 ? Math.ceil(maxEndId / wordsPerPage) : undefined;

  const handlePrint = () => {
    const start = Math.max(1, Number(printStart) || 1);
    const end = Math.min(Number(printEnd) || 30, limitedWords.length);
    const printWords = limitedWords.filter(w => w.id >= start && w.id <= end).slice(0, 30);

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html><head><title>単語リスト No.${start}-${end}</title>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        td:first-child { width: 50%; font-weight: 600; }
        td:last-child { width: 50%; text-align: right; }
        @media print { body { padding: 10px; } td { padding: 6px 12px; font-size: 12px; } }
      </style></head><body>
      <table>${printWords.map(w => `<tr><td>${w.english}</td><td>${w.japanese}</td></tr>`).join('')}</table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>
        <button
          style={{ padding: '8px 16px', background: '#f3f4f6', borderRadius: 8, fontSize: 14, color: '#4b5563', marginBottom: 12 }}
          onClick={() => navigate('/')}
        >
          ← 戻る
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', margin: 0 }}>
            単語リスト
          </h1>
          <button
            style={{ padding: '6px 14px', background: '#1a3a6b', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
            onClick={() => setShowPrint(true)}
          >
            印刷
          </button>
        </div>

        {showPrint && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>印刷範囲（最大30語）</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>No.</span>
              <input type="text" inputMode="numeric" value={printStart} onChange={e => setPrintStart(e.target.value)} style={{ width: 70, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
              <span style={{ fontSize: 13, color: '#6b7280' }}>〜 No.</span>
              <input type="text" inputMode="numeric" value={printEnd} onChange={e => setPrintEnd(e.target.value)} style={{ width: 70, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '8px 20px', background: '#1a3a6b', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }} onClick={handlePrint}>印刷する</button>
              <button style={{ padding: '8px 20px', background: '#f3f4f6', color: '#6b7280', borderRadius: 8, fontSize: 13 }} onClick={() => setShowPrint(false)}>キャンセル</button>
            </div>
          </div>
        )}

        <WordListView
          words={limitedWords}
          wordsPerPage={wordsPerPage}
          progress={progress}
          showProgress={true}
          showAudio={true}
          maxPage={maxPage}
        />
      </div>
    </>
  );
};

export default WordListPage;

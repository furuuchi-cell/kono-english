import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { RECALL_MS, REVIEW_MS } from '../../constants/quizConfig';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ClassData, WeeklyRange, UserProfile, TestData } from '../../types';
import Header from '../common/Header';
import { TOTAL_WORDS_BY_SET, useWords } from '../../hooks/useWords';

const ClassManagePage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { words: allWords } = useWords(classId || '');
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [ranges, setRanges] = useState<WeeklyRange[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [tests, setTests] = useState<TestData[]>([]);
  const initialTab = (location.state as any)?.tab ?? 'ranges';
  const [tab, setTab] = useState<'ranges' | 'students' | 'tests' | 'quiz'>(initialTab);
  const [loading, setLoading] = useState(true);
  const [maintenanceOn, setMaintenanceOn] = useState(false);

  // Quiz session state
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [quizRangeId, setQuizRangeId] = useState<string>('__all__');
  const [quizInterval, setQuizInterval] = useState<string>('3');
  const [quizWordCount, setQuizWordCount] = useState<string>('20');
  const [quizStarting, setQuizStarting] = useState(false);
  const [liveAnswers, setLiveAnswers] = useState<any[]>([]);
  const [adminCurrentIndex, setAdminCurrentIndex] = useState(0);
  const [adminSessionEnded, setAdminSessionEnded] = useState(false);
  const autoEndedRef = React.useRef<string | null>(null);

  // Range form
  const [showRangeForm, setShowRangeForm] = useState(false);
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const [rangeWeekLabel, setRangeWeekLabel] = useState('');
  const [rangeStartId, setRangeStartId] = useState('1');
  const [rangeEndId, setRangeEndId] = useState('50');
  const [rangeLessonDate, setRangeLessonDate] = useState('');

  // Sort
  const [rangeSort, setRangeSort] = useState<'startId_asc' | 'startId_desc' | 'date_asc' | 'date_desc'>('startId_asc');
  const [studentSort, setStudentSort] = useState<'name_asc' | 'name_desc'>('name_asc');
  const [testSort, setTestSort] = useState<'default' | 'startId_asc' | 'startId_desc' | 'title_asc'>('default');
  const [selectedTestRangeId, setSelectedTestRangeId] = useState<string | null>(null);

  // Furigana editing
  const [editingFuriganaUid, setEditingFuriganaUid] = useState<string | null>(null);
  const [furiganaInput, setFuriganaInput] = useState('');


  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const handleDeleteSession = async (sessionId: string) => {
    if (!classId || !window.confirm('このセッション履歴を削除しますか？')) return;
    setDeletingSessionId(sessionId);
    try {
      // サブコレクション answers を削除
      const answersSnap = await getDocs(collection(db, 'classes', classId, 'sessions', sessionId, 'answers'));
      for (const d of answersSnap.docs) {
        await deleteDoc(doc(db, 'classes', classId, 'sessions', sessionId, 'answers', d.id));
      }
      // セッション本体を削除
      await deleteDoc(doc(db, 'classes', classId, 'sessions', sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
    setDeletingSessionId(null);
  };

  // Test form
  const [showTestForm, setShowTestForm] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [testTitle, setTestTitle] = useState('');
  const [testStartId, setTestStartId] = useState('1');
  const [testEndId, setTestEndId] = useState('50');

  useEffect(() => {
    loadAll();
  }, [classId]);

  // セッションをリアルタイム監視（loadAllに頼らず自動反映）
  useEffect(() => {
    if (!classId) return;
    const unsub = onSnapshot(collection(db, 'classes', classId, 'sessions'), (snap) => {
      const loaded = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.startedAt || 0) - (a.startedAt || 0));
      setSessions(loaded);
      setActiveSession(loaded.find((s: any) => s.status === 'active') || null);
    });
    return () => unsub();
  }, [classId]); // eslint-disable-line

  // Admin timer: track current word in active session + auto-end
  useEffect(() => {
    if (!activeSession) { setAdminCurrentIndex(0); setAdminSessionEnded(false); return; }
    const intervalMs = activeSession.intervalSeconds * 1000;
    const slotMs = RECALL_MS + intervalMs + REVIEW_MS;
    const tick = () => {
      const elapsed = Date.now() - activeSession.startedAt;
      const idx = Math.floor(elapsed / slotMs);
      if (idx >= (activeSession.wordIds?.length || 0)) {
        setAdminCurrentIndex((activeSession.wordIds?.length || 1) - 1);
        setAdminSessionEnded(true);
        // Auto-end: write directly in tick to avoid effect-chain issues
        if (autoEndedRef.current !== activeSession.id) {
          autoEndedRef.current = activeSession.id;
          setDoc(doc(db, 'classes', classId!, 'sessions', activeSession.id), { status: 'finished' }, { merge: true });
        }
      } else {
        setAdminCurrentIndex(idx);
        setAdminSessionEnded(false);
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [activeSession?.id]); // eslint-disable-line

  // Real-time listener for active session answers
  useEffect(() => {
    if (!activeSession || !classId) {
      setLiveAnswers([]);
      return;
    }
    const unsubscribe = onSnapshot(
      collection(db, 'classes', classId, 'sessions', activeSession.id, 'answers'),
      (snap) => {
        setLiveAnswers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      }
    );
    return () => unsubscribe();
  }, [activeSession?.id, classId]); // eslint-disable-line

  const loadAll = async () => {
    if (!classId) return;

    const classDoc = await getDoc(doc(db, 'classes', classId));
    if (!classDoc.exists()) return;
    const cls = { id: classDoc.id, ...classDoc.data() } as ClassData;
    setClassData(cls);
    setMaintenanceOn(cls.maintenanceEnabled === true);

    // Load ranges
    const rangesSnap = await getDocs(collection(db, 'classes', classId, 'ranges'));
    const loadedRanges = rangesSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as WeeklyRange))
      .sort((a, b) => a.startId - b.startId);
    setRanges(loadedRanges);

    // Load students (adminを除外)
    const loadedStudents: UserProfile[] = [];
    for (const sid of cls.studentIds) {
      const studentDoc = await getDoc(doc(db, 'users', sid));
      if (studentDoc.exists()) {
        const profile = studentDoc.data() as UserProfile;
        if (profile.role !== 'admin') {
          loadedStudents.push(profile);
        }
      }
    }
    setStudents(loadedStudents);

    // Load tests
    const testsSnap = await getDocs(collection(db, 'classes', classId, 'tests'));
    setTests(
      testsSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as TestData))
        .sort((a, b) => {
          const aKey = a.sortKey ?? Number.MAX_SAFE_INTEGER;
          const bKey = b.sortKey ?? Number.MAX_SAFE_INTEGER;
          if (aKey !== bKey) return aKey - bKey;
          return (b.createdAt as any)?.seconds - (a.createdAt as any)?.seconds;
        })
    );

    setLoading(false);
  };

  const handleAddRange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;

    const data = {
      classId,
      weekLabel: rangeWeekLabel,
      startId: Number(rangeStartId),
      endId: Number(rangeEndId),
      lessonDate: rangeLessonDate,
    };

    if (editingRangeId) {
      await setDoc(doc(db, 'classes', classId, 'ranges', editingRangeId), data);
    } else {
      const rangeRef = doc(collection(db, 'classes', classId, 'ranges'));
      await setDoc(rangeRef, data);
    }
    resetRangeForm();
    loadAll();
  };

  const handleEditRange = (range: WeeklyRange) => {
    setEditingRangeId(range.id);
    setRangeWeekLabel(range.weekLabel);
    setRangeStartId(String(range.startId));
    setRangeEndId(String(range.endId));
    setRangeLessonDate(range.lessonDate || '');
    setShowRangeForm(true);
  };

  const resetRangeForm = () => {
    setShowRangeForm(false);
    setEditingRangeId(null);
    setRangeWeekLabel('');
    setRangeStartId('1');
    setRangeEndId('50');
    setRangeLessonDate('');
  };

  const handleDeleteRange = async (rangeId: string) => {
    if (!classId || !window.confirm('この範囲を削除しますか？')) return;
    await deleteDoc(doc(db, 'classes', classId, 'ranges', rangeId));
    loadAll();
  };

  const handleAddTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;

    const data = {
      classId,
      title: testTitle,
      startId: Number(testStartId),
      endId: Number(testEndId),
      createdAt: new Date(),
      isActive: true,
    };

    if (editingTestId) {
      await setDoc(doc(db, 'classes', classId, 'tests', editingTestId), data);
    } else {
      await setDoc(doc(collection(db, 'classes', classId, 'tests')), data);
    }
    resetTestForm();
    loadAll();
  };

  const handleEditTest = (t: TestData) => {
    setEditingTestId(t.id);
    setTestTitle(t.title);
    setTestStartId(String(t.startId));
    setTestEndId(String(t.endId));
    setShowTestForm(true);
  };

  const handleDeleteTest = async (testId: string) => {
    if (!classId || !window.confirm('このテストを削除しますか？')) return;
    await deleteDoc(doc(db, 'classes', classId, 'tests', testId));
    loadAll();
  };

  const resetTestForm = () => {
    setShowTestForm(false);
    setEditingTestId(null);
    setTestTitle('');
    setTestStartId('1');
    setTestEndId('50');
  };

  const handleGenerateCumulativeTests = async () => {
    if (!classId) return;
    const sorted = [...ranges].sort((a, b) => a.startId - b.startId);
    if (sorted.length === 0) {
      alert('先にスピード周回の範囲を設定してください。');
      return;
    }
    if (!window.confirm('チェックテストを一括生成します。\n既存の自動生成テストは削除されます。よろしいですか？')) return;

    // 既存の自動生成テストを削除
    for (const t of tests.filter((t) => t.isAutoGenerated)) {
      await deleteDoc(doc(db, 'classes', classId, 'tests', t.id));
    }

    const dayNames = ['月曜', '火曜', '水曜', '木曜', '金曜'];
    const todayRaw = new Date().getDay();
    const todayIdx = todayRaw === 0 ? 6 : todayRaw - 1; // 0=月〜6=日
    const currentRangeIdx = sorted.length - 1; // 最後の週 = 今週とみなす

    let sortKey = 0;
    for (let wi = 0; wi < sorted.length; wi++) {
      const range = sorted[wi];
      const total = range.endId - range.startId + 1;
      const perDay = Math.ceil(total / 5);

      // 曜日別テスト（月〜金）
      for (let di = 0; di < 5; di++) {
        const s = range.startId + di * perDay;
        const e = Math.min(range.startId + (di + 1) * perDay - 1, range.endId);
        const title = `${range.weekLabel}　${dayNames[di]}　No.${s}〜${e}`;
        await setDoc(doc(collection(db, 'classes', classId, 'tests')), {
          classId, title, startId: s, endId: e,
          createdAt: new Date(), isActive: true,
          isAutoGenerated: true, sortKey: sortKey++,
        });
      }

      // まとめテスト
      let matomeEnd: number;
      let matomeLabel: string;
      if (wi < currentRangeIdx || todayIdx >= 5) {
        // 過去週 or 土日：週全体
        matomeEnd = range.endId;
        matomeLabel = `${range.weekLabel}　週まとめ　No.${range.startId}〜${matomeEnd}`;
      } else {
        // 今週：今日まで
        const todayEndId = Math.min(range.startId + (todayIdx + 1) * perDay - 1, range.endId);
        matomeEnd = todayEndId;
        matomeLabel = `${range.weekLabel}　月〜${dayNames[Math.min(todayIdx, 4)]}まとめ　No.${range.startId}〜${matomeEnd}`;
      }
      await setDoc(doc(collection(db, 'classes', classId, 'tests')), {
        classId, title: matomeLabel,
        startId: range.startId, endId: matomeEnd,
        createdAt: new Date(), isActive: true,
        isAutoGenerated: true, sortKey: sortKey++,
      });
    }

    loadAll();
    alert('チェックテストを生成しました。');
  };

  const handleViewProgress = (studentId: string) => {
    navigate(`/admin/class/${classId}/student/${studentId}`);
  };

  const handleSaveFurigana = async (uid: string) => {
    await setDoc(doc(db, 'users', uid), { furigana: furiganaInput }, { merge: true });
    setStudents((prev) => prev.map((s) => s.uid === uid ? { ...s, furigana: furiganaInput } : s));
    setEditingFuriganaUid(null);
    setFuriganaInput('');
  };

  const handleStartSession = async () => {
    if (!classId || !currentUser) return;
    setQuizStarting(true);

    let wordIds: number[];
    if (quizRangeId === '__all__') {
      wordIds = allWords.map((w) => w.id);
    } else {
      const range = ranges.find((r) => r.id === quizRangeId);
      if (!range) { setQuizStarting(false); return; }
      wordIds = Array.from({ length: range.endId - range.startId + 1 }, (_, i) => range.startId + i);
    }
    const shuffled = wordIds.sort(() => Math.random() - 0.5).slice(0, Number(quizWordCount) || 20);

    const sessionRef = doc(collection(db, 'classes', classId, 'sessions'));
    await setDoc(sessionRef, {
      classId,
      wordIds: shuffled,
      intervalSeconds: Number(quizInterval) || 3,
      startedAt: Date.now(),
      status: 'active',
      createdBy: currentUser.uid,
      rangeId: quizRangeId,
    });

    setQuizStarting(false);
    // onSnapshotが自動でsessions/activeSessionを更新するのでloadAll()不要
  };

  const handleStopSession = async (sessionId: string) => {
    if (!classId) return;
    await setDoc(doc(db, 'classes', classId, 'sessions', sessionId), { status: 'finished' }, { merge: true });
    // onSnapshotが自動反映
  };

  const toggleMaintenance = async () => {
    if (!classId) return;
    const newValue = !maintenanceOn;
    setMaintenanceOn(newValue);
    // メンテナンス解除時にタイムスタンプを更新（生徒側で検知してリロード）
    const updateData: any = { maintenanceEnabled: newValue };
    if (!newValue) {
      updateData.lastUpdatedAt = new Date().getTime();
    }
    await updateDoc(doc(db, 'classes', classId), updateData);
  };

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  if (!classData) return null;

  return (
    <>
      <Header />
      <div style={styles.page}>
        <div style={styles.headerRow}>
          <button style={styles.backBtn} onClick={() => navigate('/admin')}>
            ← 戻る
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={styles.title}>{classData.name}</h1>
            <p style={styles.classIdText}>クラスID: {classData.id}</p>
          </div>
          <button style={styles.wordMgmtBtn} onClick={() => navigate(`/admin/class/${classId}/words`)}>
            単語管理
          </button>
        </div>

        {/* Per-class controls */}
        <div style={styles.controlBar}>
          <button style={styles.previewBtn} onClick={() => navigate('/home', { state: { previewClassId: classId } })}>
            生徒画面プレビュー
          </button>
          <div style={styles.maintenanceBar}>
            <div style={styles.maintenanceInfo}>
              <span style={styles.maintenanceLabel}>メンテナンス</span>
              <span style={styles.maintenanceStatus}>
                {maintenanceOn ? 'オン（生徒はアクセス不可）' : 'オフ（通常運用中）'}
              </span>
            </div>
            <button
              style={{ ...styles.maintenanceToggle, background: maintenanceOn ? '#ef4444' : '#d1d5db' }}
              onClick={toggleMaintenance}
            >
              <div style={{ ...styles.maintenanceKnob, transform: maintenanceOn ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(['ranges', 'students', 'tests', 'quiz'] as const).map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
              onClick={() => setTab(t)}
            >
              {t === 'ranges' ? 'スピード周回'
                : t === 'students' ? `生徒 (${students.length})`
                : t === 'tests' ? `チェックテスト (${tests.length})`
                : '授業クイズ'}
            </button>
          ))}
        </div>

        {/* Ranges tab */}
        {tab === 'ranges' && (
          <div>
            <div style={styles.tabToolbar}>
              <button style={styles.addBtn} onClick={() => setShowRangeForm(true)}>+ 範囲を追加</button>
              <select value={rangeSort} onChange={(e) => setRangeSort(e.target.value as any)} style={styles.sortSelect}>
                <option value="startId_asc">No. 昇順</option>
                <option value="startId_desc">No. 降順</option>
                <option value="date_asc">日付 古→新</option>
                <option value="date_desc">日付 新→古</option>
              </select>
            </div>

            {showRangeForm && (
              <form onSubmit={handleAddRange} style={styles.formCard}>
                <div style={styles.formRow}>
                  <div style={styles.field}>
                    <label style={styles.label}>週ラベル</label>
                    <input
                      type="text"
                      value={rangeWeekLabel}
                      onChange={(e) => setRangeWeekLabel(e.target.value)}
                      style={styles.input}
                      placeholder="例：第1週"
                      required
                    />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.field}>
                    <label style={styles.label}>開始番号</label>
                    <input
                      type="number"
                      value={rangeStartId}
                      onChange={(e) => setRangeStartId(e.target.value)}
                      style={styles.input}
                      min={1}
                      max={classData?.wordSetId ? (TOTAL_WORDS_BY_SET[classData.wordSetId] ?? allWords.length) : allWords.length}
                      required
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>終了番号</label>
                    <input
                      type="number"
                      value={rangeEndId}
                      onChange={(e) => setRangeEndId(e.target.value)}
                      style={styles.input}
                      min={1}
                      max={classData?.wordSetId ? (TOTAL_WORDS_BY_SET[classData.wordSetId] ?? allWords.length) : allWords.length}
                      required
                    />
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.field}>
                    <label style={styles.label}>授業日（その週の日曜日）</label>
                    <input
                      type="date"
                      value={rangeLessonDate}
                      onChange={(e) => setRangeLessonDate(e.target.value)}
                      style={styles.input}
                      required
                    />
                  </div>
                </div>
                <div style={styles.formActions}>
                  <button type="submit" style={styles.submitBtn}>
                    {editingRangeId ? '更新' : '追加'}
                  </button>
                  <button
                    type="button"
                    style={styles.cancelBtn}
                    onClick={resetRangeForm}
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            )}

            <div style={styles.list}>
              {[...ranges].sort((a, b) => {
                if (rangeSort === 'startId_asc') return a.startId - b.startId;
                if (rangeSort === 'startId_desc') return b.startId - a.startId;
                if (rangeSort === 'date_asc') return (a.lessonDate || '').localeCompare(b.lessonDate || '');
                return (b.lessonDate || '').localeCompare(a.lessonDate || '');
              }).map((r) => (
                <div key={r.id} style={styles.listItem}>
                  <div>
                    <div style={styles.itemTitle}>{r.weekLabel}</div>
                    <div style={styles.itemSub}>
                      No.{r.startId} 〜 No.{r.endId}（{r.lessonDate}）
                    </div>
                  </div>
                  <div style={styles.itemActions}>
                    <button
                      style={styles.editBtn}
                      onClick={() => handleEditRange(r)}
                    >
                      編集
                    </button>
                    <button
                      style={styles.deleteBtn}
                      onClick={() => handleDeleteRange(r.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
              {ranges.length === 0 && (
                <p style={styles.emptyText}>まだ範囲が設定されていません</p>
              )}
            </div>
          </div>
        )}

        {/* Students tab */}
        {tab === 'students' && (
          <div>
            <div style={styles.tabToolbar}>
              <div />
              <select value={studentSort} onChange={(e) => setStudentSort(e.target.value as any)} style={styles.sortSelect}>
                <option value="name_asc">名前 昇順</option>
                <option value="name_desc">名前 降順</option>
              </select>
            </div>
          <div style={styles.list}>
            {[...students].sort((a, b) => {
              const dir = studentSort === 'name_asc' ? 1 : -1;
              // furigana があればそれで、なければ displayName で比較
              const aKey = (a.furigana || a.displayName).toLowerCase();
              const bKey = (b.furigana || b.displayName).toLowerCase();
              return dir * aKey.localeCompare(bKey, 'ja', { sensitivity: 'base' });
            }).map((s) => (
              <div
                key={s.uid}
                style={{ ...styles.listItem, flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '12px 18px', cursor: 'pointer' }}
                onClick={() => { if (editingFuriganaUid !== s.uid) handleViewProgress(s.uid); }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.itemTitle}>{s.displayName}</div>
                    {editingFuriganaUid === s.uid ? (
                      <div
                        style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          value={furiganaInput}
                          onChange={(e) => setFuriganaInput(e.target.value)}
                          placeholder="ふりがな（ひらがな）"
                          style={{ ...styles.input, padding: '4px 8px', fontSize: 13, flex: 1 }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveFurigana(s.uid); if (e.key === 'Escape') setEditingFuriganaUid(null); }}
                        />
                        <button style={{ ...styles.editBtn, padding: '4px 10px', fontSize: 12 }} onClick={() => handleSaveFurigana(s.uid)}>保存</button>
                        <button style={{ ...styles.cancelBtn, padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingFuriganaUid(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: s.furigana ? '#6b7280' : '#d1d5db' }}>
                          {s.furigana || 'ふりがな未設定'}
                        </span>
                        <button
                          style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
                          onClick={(e) => { e.stopPropagation(); setEditingFuriganaUid(s.uid); setFuriganaInput(s.furigana || ''); }}
                        >編集</button>
                      </div>
                    )}
                    <div style={{ ...styles.itemSub, marginTop: 2 }}>{s.email}</div>
                  </div>
                  <span style={styles.arrow}>進捗 →</span>
                </div>
              </div>
            ))}
            {students.length === 0 && (
              <div style={styles.emptyCard}>
                <p>まだ生徒がいません。</p>
                <p style={styles.emptyHint}>
                  クラスID「{classData.id}」を生徒に共有してください。
                </p>
              </div>
            )}
          </div>
          </div>
        )}

        {/* Tests tab */}
        {tab === 'tests' && (() => {
          const sortedTests = [...tests].sort((a, b) => {
            if (testSort === 'startId_asc') return a.startId - b.startId;
            if (testSort === 'startId_desc') return b.startId - a.startId;
            if (testSort === 'title_asc') return a.title.localeCompare(b.title, 'ja');
            const aKey = a.sortKey ?? Number.MAX_SAFE_INTEGER;
            const bKey = b.sortKey ?? Number.MAX_SAFE_INTEGER;
            return aKey - bKey;
          });
          const sortedRanges = [...ranges].sort((a, b) => a.startId - b.startId);
          const selectedRange = selectedTestRangeId ? ranges.find((r) => r.id === selectedTestRangeId) : null;

          const renderTestItem = (t: TestData) => (
            <div key={t.id} style={{ ...styles.listItem, cursor: 'default' }}>
              <div style={{ flex: 1 }}>
                <div style={styles.itemTitle}>
                  {selectedRange ? t.title.replace(selectedRange.weekLabel, '').replace(/^[　\s]+/, '') : t.title}
                </div>
                <div style={styles.itemSub}>No.{t.startId} 〜 No.{t.endId}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button style={styles.resultBtn} onClick={() => navigate(`/admin/class/${classId}/test/${t.id}`)}>結果</button>
                <button style={styles.editBtn} onClick={(e) => { e.stopPropagation(); handleEditTest(t); }}>編集</button>
                <button style={styles.deleteBtn} onClick={(e) => { e.stopPropagation(); handleDeleteTest(t.id); }}>削除</button>
              </div>
            </div>
          );

          // ── 週の中のテスト一覧 ──
          if (selectedTestRangeId && selectedRange) {
            const rangeTests = sortedTests.filter(
              (t) => t.startId >= selectedRange.startId && t.endId <= selectedRange.endId
            );
            return (
              <div>
                <div style={styles.tabToolbar}>
                  <button style={styles.backBtnSm} onClick={() => { setSelectedTestRangeId(null); resetTestForm(); }}>← 週一覧へ</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={styles.addBtn} onClick={() => setShowTestForm(true)}>+ 手動で作成</button>
                  </div>
                </div>

                {/* 週ヘッダー */}
                <div style={styles.testWeekHeader}>
                  <div style={styles.testWeekHeaderLabel}>チェックテスト</div>
                  <div style={styles.testWeekHeaderTitle}>{selectedRange.weekLabel}</div>
                  <div style={styles.testWeekHeaderRange}>No.{selectedRange.startId} 〜 No.{selectedRange.endId}　全{selectedRange.endId - selectedRange.startId + 1}語</div>
                </div>

                {showTestForm && (
                  <form onSubmit={handleAddTest} style={styles.formCard}>
                    <div style={styles.field}>
                      <label style={styles.label}>チェックテスト名</label>
                      <input type="text" value={testTitle} onChange={(e) => setTestTitle(e.target.value)} style={styles.input} placeholder="例：月曜" required />
                    </div>
                    <div style={styles.formRow}>
                      <div style={styles.field}>
                        <label style={styles.label}>出題範囲（開始）</label>
                        <input type="number" value={testStartId} onChange={(e) => setTestStartId(e.target.value)} style={styles.input} min={1} max={classData?.wordSetId ? (TOTAL_WORDS_BY_SET[classData.wordSetId] ?? allWords.length) : allWords.length} required />
                      </div>
                      <div style={styles.field}>
                        <label style={styles.label}>出題範囲（終了）</label>
                        <input type="number" value={testEndId} onChange={(e) => setTestEndId(e.target.value)} style={styles.input} min={1} max={classData?.wordSetId ? (TOTAL_WORDS_BY_SET[classData.wordSetId] ?? allWords.length) : allWords.length} required />
                      </div>
                    </div>
                    <div style={styles.formActions}>
                      <button type="submit" style={styles.submitBtn}>{editingTestId ? '更新' : '作成'}</button>
                      <button type="button" style={styles.cancelBtn} onClick={resetTestForm}>キャンセル</button>
                    </div>
                  </form>
                )}

                <div style={styles.list}>
                  {rangeTests.map(renderTestItem)}
                  {rangeTests.length === 0 && <p style={styles.emptyText}>この週のチェックテストはありません</p>}
                </div>
              </div>
            );
          }

          // ── 週一覧 ──
          return (
            <div>
              <div style={styles.tabToolbar}>
                <button style={{ ...styles.addBtn, background: '#10b981' }} onClick={handleGenerateCumulativeTests}>累積テストを一括生成</button>
                <select value={testSort} onChange={(e) => setTestSort(e.target.value as any)} style={styles.sortSelect}>
                  <option value="default">デフォルト順</option>
                  <option value="startId_asc">No. 昇順</option>
                  <option value="startId_desc">No. 降順</option>
                </select>
              </div>

              <div style={styles.list}>
                {sortedRanges.map((range) => {
                  const rangeTests = tests.filter(
                    (t) => t.startId >= range.startId && t.endId <= range.endId
                  );
                  return (
                    <div
                      key={range.id}
                      style={{ ...styles.listItem, cursor: 'pointer' }}
                      onClick={() => setSelectedTestRangeId(range.id)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={styles.itemTitle}>{range.weekLabel}</div>
                        <div style={styles.itemSub}>
                          No.{range.startId} 〜 No.{range.endId}　／　テスト {rangeTests.length} 件
                        </div>
                      </div>
                      <span style={styles.arrow}>→</span>
                    </div>
                  );
                })}
                {sortedRanges.length === 0 && <p style={styles.emptyText}>スピード周回の範囲を先に設定してください</p>}
              </div>
            </div>
          );
        })()}
        {/* Quiz tab */}
        {tab === 'quiz' && (
          <div>
            {activeSession ? (
              <div style={styles.activeSessionCard}>
                {adminSessionEnded && (
                  <div style={styles.sessionEndedBanner}>
                    ✓ 全問終了しました。セッションを終了してください。
                  </div>
                )}
                <div style={styles.activeSessionHeader}>
                  <div>
                    <div style={styles.activeSessionBadge}>
                      {adminSessionEnded ? '● 全問終了' : '● 進行中'}
                    </div>
                    <p style={styles.activeSessionInfo}>
                      {adminSessionEnded ? (
                        `全${activeSession.wordIds?.length}問 完了`
                      ) : (
                        <>
                          問題 {adminCurrentIndex + 1} / {activeSession.wordIds?.length}
                          {(() => {
                            const wid = activeSession.wordIds?.[adminCurrentIndex];
                            const word = allWords.find((w: any) => w.id === wid);
                            return word ? `　「${word.english}」` : '';
                          })()}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    style={styles.stopBtn}
                    onClick={() => handleStopSession(activeSession.id)}
                  >
                    終了
                  </button>
                </div>

                {/* Live progress matrix */}
                {liveAnswers.length > 0 ? (
                  <div style={{ overflowX: 'auto', borderRadius: 8, marginTop: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ ...styles.liveTh, textAlign: 'left', minWidth: 80, position: 'sticky', left: 0, background: '#f8faff', zIndex: 1 }}>生徒名</th>
                          {(activeSession.wordIds || []).map((wid: number, i: number) => {
                            const w = allWords.find((x: any) => x.id === wid);
                            return <th key={i} style={{ ...styles.liveTh, minWidth: 50, fontSize: 10 }}>{w?.english || `#${wid}`}</th>;
                          })}
                          <th style={styles.liveTh}>正解</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liveAnswers.filter((a) => a.role !== 'admin').map((a) => {
                          const resultMap = new Map<number, boolean>();
                          (a.results || []).forEach((r: any) => resultMap.set(r.wordIndex, r.isCorrect));
                          const correct = (a.results || []).filter((r: any) => r.isCorrect).length;
                          return (
                            <tr key={a.uid}>
                              <td style={{ ...styles.liveTd, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{a.displayName}</td>
                              {(activeSession.wordIds || []).map((_: any, i: number) => {
                                const r = resultMap.get(i);
                                return (
                                  <td key={i} style={styles.liveTdCenter}>
                                    {r === true ? <span style={{ color: '#10b981', fontWeight: 700 }}>○</span>
                                     : r === false ? <span style={{ color: '#ef4444', fontWeight: 700 }}>×</span>
                                     : <span style={{ color: '#d1d5db' }}>−</span>}
                                  </td>
                                );
                              })}
                              <td style={{ ...styles.liveTdCenter, fontWeight: 700 }}>{correct}/{(activeSession.wordIds || []).length}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={styles.liveWaiting}>生徒の回答待ち...</p>
                )}
              </div>
            ) : (
              <div style={styles.formCard}>
                <h3 style={styles.quizFormTitle}>授業クイズを開始</h3>
                <div style={styles.field}>
                  <label style={styles.label}>出題範囲</label>
                  <select
                    value={quizRangeId}
                    onChange={(e) => setQuizRangeId(e.target.value)}
                    style={styles.input}
                  >
                    <option value="__all__">全単語</option>
                    {ranges.map((r) => (
                      <option key={r.id} value={r.id}>{r.weekLabel}（No.{r.startId}〜{r.endId}）</option>
                    ))}
                  </select>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.field}>
                    <label style={styles.label}>出題数</label>
                    <input
                      type="number"
                      value={quizWordCount}
                      onChange={(e) => setQuizWordCount(e.target.value)}
                      style={styles.input}
                      min={1}
                      max={50}
                    />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>秒数／問</label>
                    <input
                      type="number"
                      value={quizInterval}
                      onChange={(e) => setQuizInterval(e.target.value)}
                      style={styles.input}
                      min={3}
                      max={30}
                    />
                  </div>
                </div>
                <button
                  style={styles.submitBtn}
                  onClick={handleStartSession}
                  disabled={quizStarting}
                >
                  {quizStarting ? '開始中...' : 'クイズを開始'}
                </button>
              </div>
            )}

            {/* Past sessions */}
            <h3 style={styles.pastSessionsTitle}>過去のセッション</h3>
            <div style={styles.list}>
              {sessions.filter((s) => s.status === 'finished').map((s) => (
                <div
                  key={s.id}
                  style={styles.listItem}
                >
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/admin/class/${classId}/session/${s.id}`)}>
                    <div style={styles.itemTitle}>
                      {new Date(s.startedAt).toLocaleDateString('ja-JP')} {new Date(s.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={styles.itemSub}>
                      {s.wordIds?.length}問 ／ {s.intervalSeconds}秒
                      {s.rangeId && (
                        <span style={styles.sessionRangePill}>
                          {s.rangeId === '__all__' ? '全単語' : (ranges.find((r) => r.id === s.rangeId)?.weekLabel ?? s.rangeId)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ ...styles.arrow, cursor: 'pointer' }} onClick={() => navigate(`/admin/class/${classId}/session/${s.id}`)}>結果 →</span>
                  <button
                    style={{ marginLeft: 8, padding: '4px 10px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', flexShrink: 0 }}
                    onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                    disabled={deletingSessionId === s.id}
                  >
                    {deletingSessionId === s.id ? '...' : '削除'}
                  </button>
                </div>
              ))}
              {sessions.filter((s) => s.status === 'finished').length === 0 && (
                <p style={styles.emptyText}>過去のセッションはありません</p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 800,
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
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  backBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 14,
    color: '#4b5563',
    flexShrink: 0,
  },
  wordMgmtBtn: {
    padding: '8px 16px',
    background: '#fff',
    color: '#1a3a6b',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    border: '2px solid #1a3a6b',
    flexShrink: 0,
  },
  controlBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap' as const,
  },
  previewBtn: {
    padding: '8px 16px',
    background: '#10b981',
    color: '#fff',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
  },
  maintenanceBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 14px',
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #e5e7eb',
  },
  maintenanceInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
  },
  maintenanceLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
  },
  maintenanceStatus: {
    fontSize: 11,
    color: '#6b7280',
  },
  maintenanceToggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s',
    padding: 0,
    flexShrink: 0,
  },
  maintenanceKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    left: 2,
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  classIdText: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  tabs: {
    display: 'flex',
    gap: 4,
    marginBottom: 20,
    background: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    padding: '10px 16px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    background: 'transparent',
    color: '#6b7280',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#fff',
    color: '#1a3a6b',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  tabToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sortSelect: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    fontSize: 13,
    color: '#374151',
    background: '#f9fafb',
    cursor: 'pointer',
  },
  addBtn: {
    padding: '10px 20px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
  },
  formCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  formRow: {
    display: 'flex',
    gap: 12,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 15,
    outline: 'none',
  },
  formActions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  submitBtn: {
    padding: '10px 24px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  },
  cancelBtn: {
    padding: '10px 24px',
    background: '#f3f4f6',
    color: '#6b7280',
    borderRadius: 8,
    fontSize: 14,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  listItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    cursor: 'pointer',
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1a3a6b',
  },
  itemSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  itemActions: {
    display: 'flex',
    gap: 6,
  },
  resultBtn: {
    padding: '6px 14px',
    background: '#f3f4f6',
    color: '#4b5563',
    borderRadius: 6,
    fontSize: 13,
  },
  editBtn: {
    padding: '6px 14px',
    background: '#f0f4ff',
    color: '#1a3a6b',
    borderRadius: 6,
    fontSize: 13,
  },
  deleteBtn: {
    padding: '6px 14px',
    background: '#fef2f2',
    color: '#dc2626',
    borderRadius: 6,
    fontSize: 13,
  },
  arrow: {
    fontSize: 13,
    color: '#9ca3af',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: 20,
  },
  emptyCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
  },
  activeSessionCard: {
    background: '#f0fdf4',
    border: '2px solid #10b981',
    borderRadius: 12,
    padding: '16px 20px',
    marginBottom: 24,
  },
  activeSessionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeSessionBadge: {
    fontSize: 13,
    fontWeight: 700,
    color: '#10b981',
    marginBottom: 4,
  },
  activeSessionInfo: {
    fontSize: 14,
    color: '#374151',
  },
  stopBtn: {
    padding: '8px 18px',
    background: '#ef4444',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  liveTable: {
    background: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid #d1fae5',
  },
  liveTh: {
    padding: '8px 12px',
    background: '#ecfdf5',
    fontSize: 12,
    fontWeight: 600,
    color: '#065f46',
    textAlign: 'center' as const,
    borderBottom: '1px solid #d1fae5',
  },
  liveTd: {
    padding: '8px 12px',
    fontSize: 13,
    color: '#1a3a6b',
    fontWeight: 600,
    borderBottom: '1px solid #f0fdf4',
  },
  liveTdCenter: {
    padding: '8px 12px',
    fontSize: 13,
    color: '#374151',
    textAlign: 'center' as const,
    borderBottom: '1px solid #f0fdf4',
  },
  liveWaiting: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center' as const,
    padding: '8px 0 4px',
  },
  sessionEndedBanner: {
    background: '#dcfce7',
    color: '#065f46',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 12px',
    borderRadius: 8,
    marginBottom: 10,
    textAlign: 'center' as const,
  },
  quizFormTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 4,
  },
  pastSessionsTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 12,
    marginTop: 8,
  },
  backBtnSm: {
    padding: '6px 14px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 13,
    color: '#4b5563',
    border: 'none',
    cursor: 'pointer',
  },
  testWeekHeader: {
    background: '#7c3aed',
    borderRadius: 14,
    padding: '16px 18px 14px',
    marginBottom: 16,
    color: '#fff',
  },
  testWeekHeaderLabel: {
    fontSize: 11,
    color: '#ddd6fe',
    fontWeight: 600,
    letterSpacing: '0.08em',
    marginBottom: 4,
  },
  testWeekHeaderTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  testWeekHeaderRange: {
    fontSize: 13,
    color: '#93c5fd',
  },
  testGroupHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: '#6b7280',
    letterSpacing: '0.05em',
    padding: '4px 2px 6px',
    borderBottom: '1px solid #e5e7eb',
    marginBottom: 6,
  },
  sessionRangePill: {
    display: 'inline-block',
    marginLeft: 8,
    background: '#eff6ff',
    color: '#3b82f6',
    padding: '1px 7px',
    borderRadius: 99,
    fontSize: 11,
    fontWeight: 600,
  },
};

export default ClassManagePage;

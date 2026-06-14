import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ClassData, WeeklyRange, TestData, WordProgress } from '../../types';
import Header from '../common/Header';
import Tutorial from '../common/Tutorial';
import { getRank } from '../../utils/rank';
import { TOTAL_WORDS_BY_SET, BASE_WORDS_COUNT } from '../../hooks/useWords';

const getTotalWords = (cls: ClassData): number =>
  (cls.wordSetId ? TOTAL_WORDS_BY_SET[cls.wordSetId] : undefined) ?? BASE_WORDS_COUNT;

interface ClassRanking {
  topThree: { name: string; mastered: number }[];
  myMastered: number;
  myRank: number;
  totalMembers: number;
}

function getTodayDayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1; // 0=月 〜 6=日
}

/**
 * lessonDate（その週の日曜日＝授業日）から今日が週の何日目かを返す
 * 授業日(日曜)から6日引いて月曜を算出し、今日との差分を計算
 * -1: 週開始前, 0-6: 月〜日, 7: 週終了後, null: 日付未設定/不正
 */
function getDayIndexFromLessonDate(lessonDate: string): number | null {
  if (!lessonDate) return null;
  const sunday = new Date(lessonDate);
  if (isNaN(sunday.getTime())) return null;
  // 授業日(日曜)から6日引いて月曜を算出
  const monday = new Date(sunday);
  monday.setDate(monday.getDate() - 6);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  monday.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return -1;
  if (diff > 6) return 7;
  return diff; // 0=月, 1=火, ..., 6=日
}

function getTodaySubRange(startId: number, endId: number, dayIndex: number): { subStart: number; subEnd: number; dayLabel: string } | null {
  const dayNames = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];
  if (dayIndex === 6) return null; // 日曜はクイズ
  const total = endId - startId + 1;
  const perDay = Math.ceil(total / 5);
  if (dayIndex === 5) {
    return { subStart: startId, subEnd: endId, dayLabel: '土曜日' };
  }
  const s = startId + dayIndex * perDay;
  const e = Math.min(startId + (dayIndex + 1) * perDay - 1, endId);
  return { subStart: s, subEnd: e, dayLabel: dayNames[dayIndex] };
}

const HomePage: React.FC = () => {
  const { userProfile, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const previewClassId = (location.state as any)?.previewClassId as string | undefined;
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [ranges, setRanges] = useState<Map<string, WeeklyRange[]>>(new Map());
  const [tests, setTests] = useState<Map<string, TestData[]>>(new Map());
  const [progressStats, setProgressStats] = useState<Map<string, { mastered: number; review: number; unlearned: number }>>(new Map());
  const [progressData, setProgressData] = useState<Map<string, Map<number, WordProgress>>>(new Map());
  const [classRankings, setClassRankings] = useState<Map<string, ClassRanking>>(new Map());
  const [quizRankings, setQuizRankings] = useState<Map<string, { uid: string; displayName: string; rate: number; totalCorrect: number; totalQ: number }[]>>(new Map());
  const [rankingTab, setRankingTab] = useState<Map<string, 'mastered' | 'quiz'>>(new Map());
  const [rangeFilter, setRangeFilter] = useState<Map<string, string>>(new Map()); // '' = 一覧, '__all__' = 総演習, rangeId = 特定の週
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      if (!userProfile || !currentUser) return;

      // Load classes
      const classIds = previewClassId ? [previewClassId] : (userProfile.classIds || []);
      const loadedClasses: ClassData[] = [];
      for (const cid of classIds) {
        const classDoc = await getDoc(doc(db, 'classes', cid));
        if (classDoc.exists()) {
          loadedClasses.push({ id: classDoc.id, ...classDoc.data() } as ClassData);
        }
      }
      setClasses(loadedClasses);

      // Load ranges and progress for each class
      const rangeMap = new Map<string, WeeklyRange[]>();
      const statsMap = new Map<string, { mastered: number; review: number; unlearned: number }>();
      const progressDataMap = new Map<string, Map<number, WordProgress>>();

      for (const cls of loadedClasses) {
        const rangesSnap = await getDocs(collection(db, 'classes', cls.id, 'ranges'));
        const classRanges = rangesSnap.docs.map(d => ({ id: d.id, ...d.data() } as WeeklyRange));
        classRanges.sort((a, b) => a.startId - b.startId);
        rangeMap.set(cls.id, classRanges);

        // Load progress
        const progressDoc = await getDoc(doc(db, 'users', currentUser.uid, 'progress', cls.id));
        let mastered = 0, review = 0, unlearned = 0;
        const wordProgressMap = new Map<number, WordProgress>();
        if (progressDoc.exists()) {
          const data = progressDoc.data();
          Object.entries(data).forEach(([key, value]: [string, any]) => {
            const wp = value as WordProgress;
            wordProgressMap.set(Number(key), wp);
            if (wp.status === 'mastered') mastered++;
            else if (wp.status === 'review') review++;
          });
        }
        unlearned = getTotalWords(cls) - mastered - review;
        statsMap.set(cls.id, { mastered, review, unlearned });
        progressDataMap.set(cls.id, wordProgressMap);
      }

      // Load tests for each class
      const testMap = new Map<string, TestData[]>();
      for (const cls of loadedClasses) {
        const testsSnap = await getDocs(collection(db, 'classes', cls.id, 'tests'));
        const classTests = testsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as TestData))
          .filter(t => t.isActive);
        testMap.set(cls.id, classTests);
      }

      setRanges(rangeMap);
      setTests(testMap);
      setProgressStats(statsMap);
      setProgressData(progressDataMap);

      // Load classmate rankings (async, non-blocking) — 2人以上いる場合のみ
      const rankingMap = new Map<string, ClassRanking>();
      for (const cls of loadedClasses) {
        try {
          const adminIds = new Set([cls.adminId, ...(cls.coAdminIds || [])]);
          const allMemberIds = (cls.studentIds || []).filter((uid: string) => !adminIds.has(uid));

          // roleがadminのユーザーも除外
          const memberIds: string[] = [];
          for (const uid of allMemberIds) {
            try {
              const userDoc = await getDoc(doc(db, 'users', uid));
              if (userDoc.exists() && userDoc.data().role !== 'admin') {
                memberIds.push(uid);
              }
            } catch {
              memberIds.push(uid); // エラー時は含める
            }
          }
          if (memberIds.length < 1) continue;

          const myStats = statsMap.get(cls.id);
          const myMastered = myStats?.mastered || 0;

          // Load members' progress with names
          const members: { uid: string; mastered: number }[] = [];
          const idsToLoad = memberIds.slice(0, 30);
          for (const uid of idsToLoad) {
            if (uid === currentUser.uid) {
              members.push({ uid, mastered: myMastered });
              continue;
            }
            try {
              const memberProgressDoc = await getDoc(doc(db, 'users', uid, 'progress', cls.id));
              let memberMastered = 0;
              if (memberProgressDoc.exists()) {
                const data = memberProgressDoc.data();
                Object.values(data).forEach((value: any) => {
                  if (value.status === 'mastered') memberMastered++;
                });
              }
              members.push({ uid, mastered: memberMastered });
            } catch {
              members.push({ uid, mastered: 0 });
            }
          }

          // Sort by mastered count descending
          members.sort((a, b) => b.mastered - a.mastered);
          const myRank = members.findIndex(m => m.uid === currentUser.uid) + 1;

          // Get top 3 with names
          const topThree: { name: string; mastered: number }[] = [];
          for (const m of members.slice(0, 3)) {
            let name = 'Unknown';
            try {
              const userDoc = await getDoc(doc(db, 'users', m.uid));
              if (userDoc.exists()) {
                name = (userDoc.data() as any).displayName || 'Unknown';
              }
            } catch {}
            topThree.push({ name, mastered: m.mastered });
          }

          rankingMap.set(cls.id, {
            topThree,
            myMastered,
            myRank: myRank || 1,
            totalMembers: memberIds.length,
          });
        } catch {
          // ranking load failed, skip
        }
      }
      setClassRankings(rankingMap);

      // Load quiz rankings per class (from session answers)
      try {
        const quizRankingMap = new Map<string, { uid: string; displayName: string; rate: number; totalCorrect: number; totalQ: number }[]>();
        for (const cls of loadedClasses) {
          const sessionsSnap = await getDocs(
            query(collection(db, 'classes', cls.id, 'sessions'), where('status', '==', 'finished'))
          );
          const studentStats = new Map<string, { displayName: string; totalCorrect: number; totalQ: number }>();
          for (const sessionDoc of sessionsSnap.docs) {
            const sessionData = sessionDoc.data();
            const totalQ = sessionData.wordIds?.length || 0;
            const answersSnap = await getDocs(collection(db, 'classes', cls.id, 'sessions', sessionDoc.id, 'answers'));
            for (const answerDoc of answersSnap.docs) {
              const data = answerDoc.data();
              const uid = answerDoc.id;
              const correct = (data.results || []).filter((r: any) => r.isCorrect).length;
              if (!studentStats.has(uid)) {
                studentStats.set(uid, { displayName: data.displayName || 'Unknown', totalCorrect: 0, totalQ: 0 });
              }
              const s = studentStats.get(uid)!;
              s.totalCorrect += correct;
              s.totalQ += totalQ;
            }
          }
          const classAdminIds = new Set([cls.adminId, ...(cls.coAdminIds || [])]);
          // roleがadminのユーザーも除外
          const adminUids = new Set<string>();
          const statsEntries = Array.from(studentStats.entries());
          for (const [uid] of statsEntries) {
            if (classAdminIds.has(uid)) { adminUids.add(uid); continue; }
            try {
              const uDoc = await getDoc(doc(db, 'users', uid));
              if (uDoc.exists() && uDoc.data().role === 'admin') adminUids.add(uid);
            } catch {}
          }
          const entries = statsEntries
            .filter(([uid]) => !adminUids.has(uid))
            .map(([uid, s]) => ({
              uid,
              displayName: s.displayName,
              totalCorrect: s.totalCorrect,
              totalQ: s.totalQ,
              rate: s.totalQ > 0 ? Math.round((s.totalCorrect / s.totalQ) * 100) : 0,
            }))
            .sort((a, b) => b.rate - a.rate);
          if (entries.length >= 1) quizRankingMap.set(cls.id, entries);
        }
        setQuizRankings(quizRankingMap);
      } catch {}

      setLoading(false);
    };

    loadData();
  }, [userProfile, currentUser]);

  // メンテナンス解除時に自動リロード（クラスのlastUpdatedAtを監視）
  useEffect(() => {
    if (!userProfile || !currentUser || classes.length === 0) return;
    const unsubs = classes.map(cls =>
      onSnapshot(doc(db, 'classes', cls.id), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        // メンテナンスが解除された場合、ページをリロード
        if (data.lastUpdatedAt && !data.maintenanceEnabled) {
          const stored = sessionStorage.getItem(`lastUpdated_${cls.id}`);
          const current = String(data.lastUpdatedAt);
          if (stored && stored !== current) {
            sessionStorage.setItem(`lastUpdated_${cls.id}`, current);
            window.location.reload();
          }
          sessionStorage.setItem(`lastUpdated_${cls.id}`, current);
        }
      })
    );
    return () => unsubs.forEach(u => u());
  }, [classes.length]); // eslint-disable-line

  if (loading) {
    return (
      <>
        <Header />
        <div style={styles.loading}>読み込み中...</div>
      </>
    );
  }

  return (
    <>
      <Header />
      <Tutorial />
      <div style={styles.page}>
        {userProfile?.role === 'admin' && (
          <button
            style={styles.adminBackBar}
            onClick={() => navigate('/admin')}
          >
            ← 管理画面に戻る
          </button>
        )}
        <div style={styles.greeting}>
          <h1 style={styles.greetingTitle}>
            こんにちは、{userProfile?.displayName}さん
          </h1>
          <p style={styles.greetingText}>今日も英単語を学習しましょう！</p>
        </div>

        {/* 今日の学習 */}
        {classes.length > 0 && (() => {
          const dayFullNames = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];

          const cards = classes.flatMap((cls) => {
            const classRanges = ranges.get(cls.id) || [];
            if (classRanges.length === 0) return [];

            // lessonDateがある範囲から「今週」か「次の開始週」を選ぶ
            const activeRange = classRanges.find((r) => {
              const d = getDayIndexFromLessonDate(r.lessonDate || '');
              return d !== null && d >= 0 && d <= 6;
            }) ?? classRanges.find((r) => {
              const d = getDayIndexFromLessonDate(r.lessonDate || '');
              return d === -1; // 開始前
            }) ?? classRanges[classRanges.length - 1];

            const lessonDayIdx = getDayIndexFromLessonDate(activeRange.lessonDate || '');

            // lessonDateが未設定 → カレンダーの曜日で判定
            const dayIdx = lessonDayIdx ?? getTodayDayIndex();

            if (lessonDayIdx === -1) {
              // 週開始前：授業日(日曜)から6日引いて月曜を算出
              const sunday = new Date(activeRange.lessonDate);
              const monday = new Date(sunday);
              monday.setDate(monday.getDate() - 6);
              const label = `${monday.getMonth() + 1}/${monday.getDate()}（月）から学習開始`;
              return [(
                <div key={cls.id} style={{ ...styles.todayCard, cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.todayCardTitle}>{cls.name}　{activeRange.weekLabel}</div>
                    <div style={styles.todayCardDesc}>{label}</div>
                  </div>
                </div>
              )];
            }

            if (dayIdx === 6) {
              return [(
                <div key={cls.id} style={{ ...styles.todayCard, cursor: 'default' }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.todayCardTitle}>{cls.name}</div>
                    <div style={styles.todayCardDesc}>本日は授業クイズです</div>
                  </div>
                </div>
              )];
            }

            const sub = getTodaySubRange(activeRange.startId, activeRange.endId, dayIdx);
            if (!sub) return [];
            return [(
              <button
                key={cls.id}
                style={styles.todayCard}
                onClick={() => navigate(`/study/${cls.id}/${activeRange.id}`, {
                  state: { subStart: sub.subStart, subEnd: sub.subEnd, dayLabel: sub.dayLabel },
                })}
              >
                <div style={{ flex: 1 }}>
                  <div style={styles.todayCardTitle}>{cls.name}　{activeRange.weekLabel}</div>
                  <div style={styles.todayCardDesc}>{dayFullNames[dayIdx]}　No.{sub.subStart}〜{sub.subEnd}</div>
                </div>
                <div style={styles.todayArrow}>→</div>
              </button>
            )];
          });

          if (cards.length === 0) return null;
          const todayLabel = (() => {
            // 代表クラスの曜日ラベル
            const cls0 = classes[0];
            const r0 = (ranges.get(cls0.id) || []);
            if (r0.length === 0) return '';
            const activeR = r0.find((r) => { const d = getDayIndexFromLessonDate(r.lessonDate || ''); return d !== null && d >= 0 && d <= 6; })
              ?? r0.find((r) => getDayIndexFromLessonDate(r.lessonDate || '') === -1)
              ?? r0[r0.length - 1];
            const d = getDayIndexFromLessonDate(activeR.lessonDate || '') ?? getTodayDayIndex();
            return d >= 0 && d <= 6 ? dayFullNames[d] : '';
          })();

          return (
            <div style={styles.todaySection}>
              <div style={styles.todaySectionLabel}>
                今日の学習{todayLabel && <span style={styles.todayDayName}>　{todayLabel}</span>}
              </div>
              {cards}
            </div>
          );
        })()}

        {classes.length === 0 ? (
          <div style={styles.emptyCard}>
            <p>まだクラスに参加していません。</p>
            <p style={styles.emptyHint}>先生からクラスIDを受け取って参加してください。</p>
            <button
              style={styles.joinBtn}
              onClick={() => navigate('/join-class')}
            >
              クラスに参加する
            </button>
          </div>
        ) : (
          classes.map((cls) => {
            const classRanges = ranges.get(cls.id) || [];
            const clsTotalWords = getTotalWords(cls);
            const stats = progressStats.get(cls.id) || { mastered: 0, review: 0, unlearned: clsTotalWords };
            const total = stats.mastered + stats.review + stats.unlearned;

            const isAdmin = userProfile?.role === 'admin';
            const isMaintenance = cls.maintenanceEnabled === true && !isAdmin;

            return (
              <div key={cls.id} style={{ ...styles.classCard, opacity: isMaintenance ? 0.7 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ ...styles.className, marginBottom: 0 }}>{cls.name}</h2>
                    {isMaintenance && (
                      <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                        メンテナンス中
                      </span>
                    )}
                  </div>
                  {!isMaintenance && (
                    <button
                      style={styles.quizHistoryBtn}
                      onClick={() => navigate(`/quiz-history/${cls.id}`)}
                    >
                      クイズ履歴
                    </button>
                  )}
                </div>
                {isMaintenance && (
                  <div style={{ padding: '16px', textAlign: 'center', color: '#6b7280', fontSize: 14, background: '#f9fafb', borderRadius: 10, marginBottom: 12 }}>
                    現在このクラスはメンテナンス中です。しばらくお待ちください。
                  </div>
                )}
                {!isMaintenance && <>
                {/* Overall progress */}
                <div style={styles.overallProgress}>
                  <div style={styles.progressHeader}>
                    <span>全体の進捗</span>
                    <span>{Math.round((stats.mastered / total) * 100)}% 習得</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${(stats.mastered / total) * 100}%`,
                        background: '#10b981',
                      }}
                    />
                    <div
                      style={{
                        ...styles.progressFill,
                        width: `${(stats.review / total) * 100}%`,
                        background: '#f59e0b',
                      }}
                    />
                  </div>
                  <div style={styles.statsRow}>
                    <span style={{ color: '#10b981' }}>習得済 {stats.mastered}</span>
                    <span style={{ color: '#f59e0b' }}>苦手 {stats.review}</span>
                    <span style={{ color: '#94a3b8' }}>未学習 {stats.unlearned}</span>
                  </div>
                  {(classRankings.has(cls.id) || quizRankings.has(cls.id)) && (() => {
                    const medals = ['🥇', '🥈', '🥉'];
                    const currentTab = rankingTab.get(cls.id) ?? 'mastered';
                    const setTab = (t: 'mastered' | 'quiz') =>
                      setRankingTab((prev) => new Map(prev).set(cls.id, t));
                    const ranking = classRankings.get(cls.id);
                    const qRanking = quizRankings.get(cls.id) || [];
                    const myQuizEntry = qRanking.find((e) => e.uid === currentUser?.uid);
                    const myQuizRank = qRanking.findIndex((e) => e.uid === currentUser?.uid) + 1;
                    return (
                      <div style={styles.rankingSection}>
                        {/* Tabs */}
                        <div style={styles.rankingTabRow}>
                          {classRankings.has(cls.id) && (
                            <button
                              style={{ ...styles.rankingTabBtn, ...(currentTab === 'mastered' ? styles.rankingTabActive : {}) }}
                              onClick={() => setTab('mastered')}
                            >習得</button>
                          )}
                          {quizRankings.has(cls.id) && (
                            <button
                              style={{ ...styles.rankingTabBtn, ...(currentTab === 'quiz' ? styles.rankingTabActive : {}) }}
                              onClick={() => setTab('quiz')}
                            >クイズ</button>
                          )}
                        </div>

                        {/* 習得ランキング */}
                        {currentTab === 'mastered' && ranking && (
                          <>
                            {ranking.topThree.map((m, i) => (
                              <div key={i} style={styles.rankingItem}>
                                <span>{medals[i]} {m.name}</span>
                                <span style={styles.rankingRate}>{m.mastered}語</span>
                              </div>
                            ))}
                            <div style={styles.rankingMyPos}>
                              あなた: {ranking.myMastered}語（{ranking.myRank}位/{ranking.totalMembers}人中）
                            </div>
                          </>
                        )}

                        {/* クイズランキング */}
                        {currentTab === 'quiz' && (
                          <>
                            {qRanking.slice(0, 3).map((e, i) => {
                              const info = getRank(e.rate);
                              return (
                                <div key={e.uid} style={styles.rankingItem}>
                                  <span>{medals[i]} {e.displayName}</span>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ width: 20, height: 20, borderRadius: 10, background: info.bg, color: '#fff', fontSize: 9, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{info.rank}</span>
                                    <span style={{ ...styles.rankingRate, color: e.rate >= 80 ? '#10b981' : e.rate >= 60 ? '#f59e0b' : '#ef4444' }}>{e.rate}%</span>
                                  </span>
                                </div>
                              );
                            })}
                            {myQuizEntry && (
                              <div style={styles.rankingMyPos}>
                                あなた: {myQuizEntry.rate}%（{myQuizRank}位/{qRanking.length}人中）
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Word list link */}
                <h3 style={styles.sectionTitle}>単語リスト</h3>
                <button
                  style={styles.rangeItem}
                  onClick={() => navigate(`/wordlist/${cls.id}`)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={styles.rangeLabel}>全単語一覧</div>
                  </div>
                  <div style={styles.rangeArrow}>→</div>
                </button>

                {/* スピード周回＆チェックリスト */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                  <h3 style={{ ...styles.sectionTitle, marginTop: 0, marginBottom: 0 }}>スピード周回＆チェックリスト</h3>
                  <select
                    value={rangeFilter.get(cls.id) || ''}
                    onChange={(e) => setRangeFilter(prev => { const next = new Map(prev); next.set(cls.id, e.target.value); return next; })}
                    style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#6b7280', fontWeight: 500 }}
                  >
                    <option value="">一覧</option>
                    <option value="__all__">総演習</option>
                    {classRanges.map((r) => (
                      <option key={r.id} value={r.id}>{r.weekLabel}</option>
                    ))}
                  </select>
                </div>
                <div style={{ ...styles.rangeList, marginTop: 10 }}>
                  {/* 総演習カード */}
                  {(!(rangeFilter.get(cls.id)) || rangeFilter.get(cls.id) === '__all__') && (
                  <div style={{ ...styles.rangeItem, cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={styles.rangeLabel}>総演習（{clsTotalWords}個）</span>
                        {(() => {
                          const maxEnd = classRanges.length > 0 ? Math.max(...classRanges.map(r => r.endId)) : 0;
                          return maxEnd < clsTotalWords ? <span style={{ fontSize: 11, color: '#9ca3af' }}>公開準備中...</span> : null;
                        })()}
                      </div>
                      <div style={styles.wordListStats}>
                        <span style={styles.statBadgeGreen}>✓ 習得済 {stats.mastered}</span>
                        <span style={styles.statBadgeYellow}>! 苦手 {stats.review}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(() => {
                        const maxRangeEnd = classRanges.length > 0 ? Math.max(...classRanges.map(r => r.endId)) : 0;
                        const allPublished = maxRangeEnd >= clsTotalWords;
                        return <>
                          <button
                            style={{ ...styles.weekActionBtn, ...(!allPublished ? { opacity: 0.4, cursor: 'default' } : {}) }}
                            onClick={() => allPublished && navigate(`/study/${cls.id}/__all__`)}
                          >スピード周回 →</button>
                          <button
                            style={{ ...styles.weekActionBtn, ...styles.weekActionBtnTest, opacity: 0.4, cursor: 'default' }}
                          >チェックテスト →</button>
                        </>;
                      })()}
                    </div>
                  </div>
                  )}

                  {/* 週カード */}
                  {classRanges.filter((r) => { const f = rangeFilter.get(cls.id); return !f || f === '__all__' || f === r.id; }).map((range) => {
                      const clsProgress = progressData.get(cls.id) || new Map();
                      const rangeWordIds = Array.from({ length: range.endId - range.startId + 1 }, (_, i) => range.startId + i);
                      const rangeReview = rangeWordIds.filter(id => clsProgress.get(id)?.status === 'review').length;
                      const rangeMastered = rangeWordIds.filter(id => clsProgress.get(id)?.status === 'mastered').length;
                      const allMastered = rangeMastered === rangeWordIds.length;
                      const classTests = tests.get(cls.id) || [];
                      const hasTests = classTests.some(t => t.startId >= range.startId && t.endId <= range.endId);
                      return (
                        <div
                          key={range.id}
                          style={{ ...styles.rangeItem, ...(allMastered ? styles.rangeItemComplete : {}), cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={styles.rangeLabel}>{range.weekLabel}</div>
                              <div style={styles.rangeNums}>
                                No.{range.startId}〜{range.endId}
                                {range.lessonDate && (() => {
                                  const d = new Date(range.lessonDate);
                                  return <span>　授業日 {d.getMonth() + 1}/{d.getDate()}</span>;
                                })()}
                              </div>
                            </div>
                            {rangeReview > 0 && <span style={styles.reviewBadge}>苦手 {rangeReview}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              style={styles.weekActionBtn}
                              onClick={() => navigate(`/weekly-plan/${cls.id}/${range.id}`)}
                            >
                              スピード周回 →
                            </button>
                            <button
                              style={{
                                ...styles.weekActionBtn,
                                ...styles.weekActionBtnTest,
                                ...(!hasTests ? { opacity: 0.4, cursor: 'default' } : {}),
                              }}
                              onClick={() => hasTests && navigate(`/test-week/${cls.id}/${range.id}`)}
                            >
                              チェックテスト →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
                </>}
              </div>
            );
          })
        )}

        <button
          style={styles.joinBtnFloat}
          onClick={() => navigate('/join-class')}
        >
          + クラスに参加
        </button>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '20px 16px 80px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '60vh',
    fontSize: 18,
    color: '#6b7280',
  },
  greeting: {
    marginBottom: 24,
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  greetingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  adminBackBar: {
    display: 'block',
    width: '100%',
    padding: '10px 16px',
    background: '#10b981',
    color: '#fff',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    marginBottom: 12,
    textAlign: 'left' as const,
  },
  todaySection: {
    marginBottom: 20,
  },
  todaySectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    letterSpacing: '0.05em',
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  todayDayName: {
    fontSize: 12,
    color: '#1a3a6b',
    fontWeight: 700,
  },
  todayCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    background: '#1a3a6b',
    borderRadius: 14,
    padding: '14px 18px',
    color: '#fff',
    textAlign: 'left' as const,
    boxShadow: '0 2px 10px rgba(26,58,107,0.18)',
    marginBottom: 8,
  },
  todayCardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 3,
  },
  todayCardDesc: {
    fontSize: 13,
    color: '#93c5fd',
  },
  todayArrow: {
    fontSize: 18,
    color: '#93c5fd',
    flexShrink: 0,
  },
  emptyCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  emptyHint: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 8,
  },
  joinBtn: {
    marginTop: 16,
    padding: '12px 24px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
  },
  classCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  className: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 16,
  },
  overallProgress: {
    marginBottom: 20,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
  },
  progressBar: {
    height: 8,
    background: '#e5e7eb',
    borderRadius: 4,
    display: 'flex',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s',
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    fontWeight: 500,
  },
  rankingSection: {
    marginTop: 10,
    padding: '10px 14px',
    background: '#eef2ff',
    borderRadius: 10,
  },
  rankingTabRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 8,
  },
  rankingTabBtn: {
    padding: '3px 12px',
    borderRadius: 99,
    border: '1px solid #c7d2fe',
    background: 'transparent',
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    cursor: 'pointer',
  },
  rankingTabActive: {
    background: '#1a3a6b',
    borderColor: '#1a3a6b',
    color: '#fff',
  },
  rankingItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    padding: '3px 0',
    color: '#374151',
  },
  rankingRate: {
    fontWeight: 700,
    color: '#1a3a6b',
  },
  rankingMyPos: {
    marginTop: 6,
    paddingTop: 6,
    borderTop: '1px solid #c7d2fe',
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center' as const,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 10,
  },
  tabSection: {
    marginTop: 16,
  },
  tabBar: {
    display: 'flex',
    background: '#e5e7eb',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    padding: '9px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    background: 'transparent',
    color: '#6b7280',
    textAlign: 'center' as const,
    transition: 'all 0.2s',
  },
  tabBtnActive: {
    background: '#1a3a6b',
    color: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  filterRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  rangeSelect: {
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 13,
    color: '#1a3a6b',
    background: '#fff',
    fontWeight: 500,
    outline: 'none',
  },
  wordListStats: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  statBadgeGreen: {
    fontSize: 12,
    fontWeight: 600,
    color: '#065f46',
    background: '#d1fae5',
    padding: '2px 10px',
    borderRadius: 10,
  },
  statBadgeYellow: {
    fontSize: 12,
    fontWeight: 600,
    color: '#92400e',
    background: '#fef3c7',
    padding: '2px 10px',
    borderRadius: 10,
  },
  reviewBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#92400e',
    background: '#fef3c7',
    padding: '3px 8px',
    borderRadius: 10,
    flexShrink: 0,
  },
  rangeItemComplete: {
    borderColor: '#10b981',
    background: '#f0fdf4',
  },
  completeMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    background: '#10b981',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rangeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  rangeItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    background: '#f9fafb',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    textAlign: 'left',
    transition: 'background 0.2s',
    width: '100%',
  },
  rangeLabel: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1a3a6b',
  },
  rangeNums: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  rangeArrow: {
    fontSize: 18,
    color: '#9ca3af',
  },
  weekActionBtn: {
    flex: 1,
    padding: '9px 0',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center' as const,
    cursor: 'pointer',
  },
  weekActionBtnTest: {
    background: '#7c3aed',
  },
  joinBtnFloat: {
    position: 'fixed',
    bottom: 20,
    right: 20,
    padding: '12px 20px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 25,
    fontSize: 14,
    fontWeight: 600,
    boxShadow: '0 4px 12px rgba(26,58,107,0.3)',
  },
  wordListToggle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  toggleArrow: {
    fontSize: 12,
    color: '#9ca3af',
  },
  wordListSection: {
    marginBottom: 16,
  },
  wordSearchInput: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    marginBottom: 8,
    boxSizing: 'border-box' as const,
  },
  wordList: {
    maxHeight: 300,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  wordItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: '#f9fafb',
    borderRadius: 6,
    fontSize: 13,
  },
  wordId: {
    width: 30,
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'right' as const,
    flexShrink: 0,
  },
  statusIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    background: '#10b981',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusIconReview: {
    width: 18,
    height: 18,
    borderRadius: 9,
    background: '#f59e0b',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusIconEmpty: {
    width: 18,
    height: 18,
    flexShrink: 0,
  },
  wordEnglish: {
    fontWeight: 600,
    color: '#1a3a6b',
    minWidth: 90,
    flexShrink: 0,
  },
  wordJapanese: {
    color: '#6b7280',
    fontSize: 12,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  moreText: {
    textAlign: 'center' as const,
    color: '#9ca3af',
    padding: 8,
    fontSize: 12,
  },
  quizHistoryBtn: {
    padding: '6px 14px',
    background: '#f0f4ff',
    color: '#1a3a6b',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid #dbeafe',
    cursor: 'pointer',
    flexShrink: 0,
  },
};

export default HomePage;

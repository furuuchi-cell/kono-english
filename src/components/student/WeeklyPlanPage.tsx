import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { getRank } from '../../utils/rank';
import Header from '../common/Header';

function getTodayIndex(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1; // 0=月 〜 6=日
}

interface DayInfo {
  day: string;
  short: string;
  startId: number | null;
  endId: number | null;
  isReview: boolean; // 土曜：全体復習
  isQuiz: boolean;   // 日曜
}

/** rangeのstartId〜endIdを5日分に均等分割 + 土曜全体 + 日曜クイズ */
function buildDayPlans(startId: number, endId: number): DayInfo[] {
  const total = endId - startId + 1;
  const perDay = Math.ceil(total / 5);
  const days: DayInfo[] = [];
  const dayNames = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日'];
  const dayShorts = ['月', '火', '水', '木', '金'];

  for (let i = 0; i < 5; i++) {
    const s = startId + i * perDay;
    const e = Math.min(startId + (i + 1) * perDay - 1, endId);
    days.push({ day: dayNames[i], short: dayShorts[i], startId: s, endId: e, isReview: false, isQuiz: false });
  }
  // 土：全体復習
  days.push({ day: '土曜日', short: '土', startId, endId, isReview: true, isQuiz: false });
  // 日：クイズ
  days.push({ day: '日曜日', short: '日', startId: null, endId: null, isReview: false, isQuiz: true });
  return days;
}

const WeeklyPlanPage: React.FC = () => {
  const { classId, rangeId } = useParams<{ classId: string; rangeId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [weekLabel, setWeekLabel] = useState('');
  const [lessonDate, setLessonDate] = useState('');
  const [dayPlans, setDayPlans] = useState<DayInfo[]>([]);
  const [latestQuiz, setLatestQuiz] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const todayIndex = getTodayIndex();

  // 授業日(日曜)からこの週が「今週」かどうか判定
  const isCurrentWeek = (() => {
    if (!lessonDate) return true; // 未設定なら常に今日バッジを表示
    const sunday = new Date(lessonDate);
    const monday = new Date(sunday);
    monday.setDate(monday.getDate() - 6);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    monday.setHours(0, 0, 0, 0);
    sunday.setHours(23, 59, 59, 999);
    return today >= monday && today <= sunday;
  })();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!classId || !rangeId || !currentUser) return;

      const rangeDoc = await getDoc(doc(db, 'classes', classId, 'ranges', rangeId));
      if (rangeDoc.exists()) {
        const data = rangeDoc.data() as any;
        setWeekLabel(data.weekLabel || '');
        setLessonDate(data.lessonDate || '');
        setDayPlans(buildDayPlans(data.startId, data.endId));
      }

      // 直近のクイズ結果を取得
      const quizSnap = await getDocs(collection(db, 'users', currentUser.uid, 'quizResults'));
      const clsQuizzes = quizSnap.docs
        .map((d) => d.data() as any)
        .filter((q) => q.classId === classId && q.rangeId === rangeId)
        .sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
      setLatestQuiz(clsQuizzes[0] || null);

      setLoading(false);
    };
    load();
  }, [classId, rangeId, currentUser]);

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
      <div style={styles.page}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>← 戻る</button>

        <div style={styles.headerCard}>
          <div style={styles.headerLabel}>スピード周回</div>
          <div style={styles.headerTitle}>{weekLabel}</div>
          {dayPlans.length > 0 && dayPlans[0].startId !== null && (
            <div style={styles.headerRange}>
              No.{dayPlans[0].startId} 〜 No.{dayPlans[5].endId}　全{(dayPlans[5].endId! - dayPlans[0].startId! + 1)}語
            </div>
          )}
        </div>

        <div style={styles.list}>
          {dayPlans.map((plan, i) => {
            const isToday = isCurrentWeek && i === todayIndex;

            if (plan.isQuiz) {
              // 日曜：クイズ結果表示
              const rate = latestQuiz?.totalQuestions > 0
                ? Math.round((latestQuiz.correctCount / latestQuiz.totalQuestions) * 100)
                : null;
              const rankInfo = rate !== null ? getRank(rate) : null;
              const date = latestQuiz?.completedAt?.toDate
                ? latestQuiz.completedAt.toDate()
                : latestQuiz?.completedAt?.seconds
                ? new Date(latestQuiz.completedAt.seconds * 1000)
                : null;

              return (
                <div key={i} style={{ ...styles.dayCard, ...styles.dayCardQuiz, cursor: 'default' }}>
                  <div style={{ ...styles.dayBadge, background: '#e0e7ff', color: '#4338ca' }}>
                    {plan.short}
                  </div>
                  <div style={styles.dayContent}>
                    <div style={styles.dayTitle}>
                      {plan.day}
                      {isToday && <span style={styles.todayBadge}>今日</span>}
                    </div>
                    {latestQuiz && rankInfo ? (
                      <div style={styles.quizResult}>
                        <div style={{ ...styles.quizRankBadge, background: rankInfo.bg, color: rankInfo.color }}>
                          {rankInfo.rank}
                        </div>
                        <div>
                          <div style={styles.quizScore}>
                            {latestQuiz.correctCount} / {latestQuiz.totalQuestions}問正解　{rate}%
                          </div>
                          {date && (
                            <div style={styles.quizDate}>
                              {date.toLocaleDateString('ja-JP')}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={styles.dayDesc}>授業クイズ（未受験）</div>
                    )}
                  </div>
                </div>
              );
            }

            const rangeLabel = plan.isReview
              ? `全体復習　No.${plan.startId}〜${plan.endId}`
              : `No.${plan.startId}〜${plan.endId}`;

            return (
              <div
                key={i}
                style={{
                  ...styles.dayCard,
                  ...(isToday ? styles.dayCardToday : {}),
                  cursor: 'pointer',
                }}
                onClick={() =>
                  navigate(`/study/${classId}/${rangeId}`, {
                    state: {
                      subStart: plan.startId,
                      subEnd: plan.endId,
                      dayLabel: plan.day,
                    },
                  })
                }
              >
                <div style={{
                  ...styles.dayBadge,
                  background: isToday ? '#1a3a6b' : '#f3f4f6',
                  color: isToday ? '#fff' : '#9ca3af',
                }}>
                  {plan.short}
                </div>
                <div style={styles.dayContent}>
                  <div style={styles.dayTitle}>
                    {plan.day}
                    {isToday && <span style={styles.todayBadge}>今日</span>}
                    {plan.isReview && <span style={styles.reviewBadge}>全体復習</span>}
                  </div>
                  <div style={styles.dayDesc}>{rangeLabel}</div>
                </div>
                <div style={{ ...styles.arrow, color: '#1a3a6b' }}>→</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: { maxWidth: 600, margin: '0 auto', padding: '20px 16px 60px' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', fontSize: 18, color: '#6b7280' },
  backBtn: { padding: '8px 16px', background: '#f3f4f6', borderRadius: 8, fontSize: 14, color: '#4b5563', marginBottom: 16, border: 'none', cursor: 'pointer' },
  headerCard: {
    background: '#1a3a6b',
    borderRadius: 16,
    padding: '20px 20px 18px',
    marginBottom: 20,
    color: '#fff',
  },
  headerLabel: { fontSize: 11, color: '#93c5fd', fontWeight: 600, letterSpacing: '0.08em', marginBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  headerRange: { fontSize: 13, color: '#93c5fd' },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
  dayCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: '#fff',
    borderRadius: 14,
    padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1.5px solid transparent',
    transition: 'box-shadow 0.15s',
  },
  dayCardToday: {
    border: '1.5px solid #1a3a6b',
    boxShadow: '0 2px 10px rgba(26,58,107,0.14)',
  },
  dayCardQuiz: {
    background: '#f5f3ff',
    border: '1.5px solid #e0e7ff',
  },
  dayBadge: {
    width: 40, height: 40, borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700, flexShrink: 0,
  },
  dayContent: { flex: 1 },
  dayTitle: { fontSize: 14, fontWeight: 700, color: '#1a3a6b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' as const },
  todayBadge: { fontSize: 10, background: '#1a3a6b', color: '#fff', padding: '1px 7px', borderRadius: 99, fontWeight: 600 },
  reviewBadge: { fontSize: 10, background: '#10b981', color: '#fff', padding: '1px 7px', borderRadius: 99, fontWeight: 600 },
  dayDesc: { fontSize: 13, color: '#6b7280' },
  arrow: { fontSize: 18, fontWeight: 300, flexShrink: 0 },
  dayCardQuizStyle: {},
  quizResult: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 },
  quizRankBadge: {
    width: 32, height: 32, borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 900, flexShrink: 0,
  },
  quizScore: { fontSize: 13, fontWeight: 700, color: '#1a3a6b' },
  quizDate: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
};

export default WeeklyPlanPage;

export interface RankInfo {
  rank: 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';
  label: string;
  color: string; // text color
  bg: string;    // background color
}

export function getRank(accuracyPercent: number): RankInfo {
  if (accuracyPercent >= 95) return { rank: 'SS', label: 'マスター',            color: '#7a4f00', bg: '#fbbf24' }; // 金
  if (accuracyPercent >= 90) return { rank: 'S',  label: 'エキスパート',        color: '#3d3d3d', bg: '#d1d5db' }; // 銀
  if (accuracyPercent >= 80) return { rank: 'A',  label: 'アドバンスド',        color: '#fff',    bg: '#b87333' }; // 銅
  if (accuracyPercent >= 70) return { rank: 'B',  label: 'インターミディエイト', color: '#fff', bg: '#10b981' };
  if (accuracyPercent >= 60) return { rank: 'C',  label: 'ベーシック',          color: '#fff', bg: '#f97316' };
  return                            { rank: 'D',  label: 'ビギナー',            color: '#fff', bg: '#9ca3af' };
}

/** 複数セッションの合算から総合ランクを計算 */
export function getAggregateRank(sessions: { correctCount: number; totalQuestions: number }[]): RankInfo | null {
  if (sessions.length === 0) return null;
  const totalCorrect = sessions.reduce((s, q) => s + (q.correctCount || 0), 0);
  const totalQuestions = sessions.reduce((s, q) => s + (q.totalQuestions || 0), 0);
  if (totalQuestions === 0) return null;
  return getRank(Math.round((totalCorrect / totalQuestions) * 100));
}

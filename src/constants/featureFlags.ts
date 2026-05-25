import { UserProfile } from '../types';

/**
 * 文法機能は開発中のため、原則非公開。
 * 管理者（role === 'admin'）のみアクセス可能。
 * 完成後は `isGrammarEnabled` を単純に `true` を返すように変更すれば全員に公開される。
 */
export const isGrammarEnabled = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  return profile.role === 'admin';
};

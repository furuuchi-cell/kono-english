const posMap: Record<string, string> = {
  verb: '動詞',
  'verb-jido': '[自] 自動詞',
  'verb-tado': '[他] 他動詞',
  'verb-both': '[自][他] 動詞',
  noun: '名詞',
  adjective: '形容詞',
  adverb: '副詞',
  phrase: 'フレーズ',
  conjunction: '接続詞',
  preposition: '前置詞',
};

export const posToJapanese = (pos: string): string => {
  return posMap[pos] || pos;
};

const posSectionMap: Record<string, string> = {
  'verb-tado': '動詞',
  'verb-jido': '動詞',
  'verb-both': '動詞',
  verb: '動詞',
  noun: '名詞',
  adjective: '形容詞',
  adverb: '副詞',
  conjunction: '接続詞',
  preposition: '前置詞',
  phrase: 'フレーズ',
};

export const posSectionLabel = (pos: string): string => {
  return posSectionMap[pos] || pos;
};

const posBadgeMap: Record<string, string> = {
  verb: '動',
  'verb-jido': '自',
  'verb-tado': '他',
  'verb-both': '自/他',
  noun: '名',
  adjective: '形',
  adverb: '副',
  phrase: '句',
  conjunction: '接',
  preposition: '前',
};

export const posToBadge = (pos: string): string => {
  return posBadgeMap[pos] || pos;
};

/**
 * 意味テキストを品詞マーカーで分割し、[{badge, meaning}] の配列を返す
 * 例: '自：〜だとわかる 他：〜を証明する' → [{badge:'自', meaning:'〜だとわかる'}, {badge:'他', meaning:'〜を証明する'}]
 * 例: '経済' (pos='noun') → [{badge:'名', meaning:'経済'}]
 */
export const parseMeaning = (pos: string, japanese: string): { badge: string; meaning: string }[] => {
  const markerRegex = /(自|他|名|形|副)(?:：|:)\s*/g;
  const markers: { badge: string; index: number }[] = [];
  let match;
  while ((match = markerRegex.exec(japanese)) !== null) {
    markers.push({ badge: match[1], index: match.index });
  }

  if (markers.length === 0) {
    // マーカーなし → posフィールドからバッジ
    return [{ badge: posBadgeMap[pos] || pos, meaning: japanese }];
  }

  const parts: { badge: string; meaning: string }[] = [];

  // マーカー前のテキストがあれば、posフィールドのバッジで追加
  const beforeFirst = japanese.slice(0, markers[0].index).trim();
  if (beforeFirst) {
    parts.push({ badge: posBadgeMap[pos] || pos, meaning: beforeFirst });
  }

  // 各マーカーの意味を抽出
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index + markers[i].badge.length + 1; // badge + ：
    const end = i + 1 < markers.length ? markers[i + 1].index : japanese.length;
    const meaning = japanese.slice(start, end).replace(/^[\s：:]+/, '').trim();
    if (meaning) {
      parts.push({ badge: markers[i].badge, meaning });
    }
  }

  return parts.length > 0 ? parts : [{ badge: posBadgeMap[pos] || pos, meaning: japanese }];
};

/**
 * 意味テキストとposフィールドから品詞バッジを自動生成
 * 例: pos='noun', japanese='価値 他：〜を大切にする' → '名/他'
 * 例: pos='verb-both', japanese='自：広がる 他：〜を広げる' → '自/他'
 * 例: pos='noun', japanese='経済' → '名'
 */
export const autoPosBadge = (pos: string, japanese: string): string => {
  const badges: string[] = [];

  // 意味テキストから品詞マーカーを検出
  const hasJi = /自：|自:/.test(japanese);
  const hasTa = /他：|他:/.test(japanese);
  const hasMei = /名：|名:/.test(japanese);
  const hasKei = /形：|形:/.test(japanese);
  const hasFuku = /副：|副:/.test(japanese);

  if (hasJi || hasTa || hasMei || hasKei || hasFuku) {
    // 意味テキストにマーカーがある場合、そこから判定
    if (hasMei) badges.push('名');
    if (hasKei) badges.push('形');
    if (hasFuku) badges.push('副');
    if (hasJi) badges.push('自');
    if (hasTa) badges.push('他');

    // マーカーなしの意味が残っている場合、posフィールドで補完
    // 例: '価値 他：〜を大切にする' → 「価値」は名詞マーカーなし → posから名詞を追加
    const stripped = japanese
      .replace(/自：[^\s]*|他：[^\s]*|名：[^\s]*|形：[^\s]*|副：[^\s]*/g, '')
      .replace(/自:[^\s]*|他:[^\s]*|名:[^\s]*|形:[^\s]*|副:[^\s]*/g, '')
      .trim();
    if (stripped && !hasJi && !hasTa && pos.startsWith('verb')) {
      // posが動詞だが意味テキストにマーカーなしの部分がある → posを追加しない（マーカーのみ信頼）
    } else if (stripped && !hasMei && (pos === 'noun' || pos === 'noun/verb')) {
      badges.unshift('名');
    } else if (stripped && !hasKei && pos === 'adjective') {
      badges.unshift('形');
    }

    // 重複除去
    const seen = new Set<string>();
    const unique = badges.filter(b => { if (seen.has(b)) return false; seen.add(b); return true; });
    return unique.join('/');
  }

  // マーカーがない場合はposフィールドから判定（従来の動作）
  return posBadgeMap[pos] || pos;
};

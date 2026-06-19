import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Word } from '../../types';
import Header from '../common/Header';
import { posToJapanese, parseMeaning, posSectionLabel } from '../../utils/pos';
import { invalidateWordsCache, useWords, WORDS_PER_PAGE_BY_SET } from '../../hooks/useWords';

interface WordOverride {
  japanese?: string;
  pos?: string;
  example?: string;
  derivatives?: string;
  mnemonic?: string;
  pronunciation?: string;
}

const WordEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();
  const { words: allWords, wordSetId } = useWords(classId || '');
  const PER_WEEK = (wordSetId ? WORDS_PER_PAGE_BY_SET[wordSetId] : undefined) ?? 50;
  const TOTAL_WEEKS = Math.ceil(allWords.length / PER_WEEK);
  const [overrides, setOverrides] = useState<Record<string, WordOverride>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<WordOverride>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState(1);
  const [showWeekSelector, setShowWeekSelector] = useState(false);

  useEffect(() => {
    if (!classId) return;
    const loadOverrides = async () => {
      const overrideDoc = await getDoc(doc(db, 'classes', classId, 'settings', 'wordOverrides'));
      if (overrideDoc.exists()) {
        setOverrides(overrideDoc.data() as Record<string, WordOverride>);
      }
      setLoading(false);
    };
    loadOverrides();
  }, [classId]);

  const getWord = useCallback((w: Word): Word => {
    const override = overrides[w.id.toString()];
    if (!override) return w;
    return {
      ...w,
      japanese: override.japanese ?? w.japanese,
      pos: override.pos ?? w.pos,
      example: override.example ?? w.example,
      derivatives: override.derivatives ?? w.derivatives,
      mnemonic: override.mnemonic ?? w.mnemonic,
      pronunciation: override.pronunciation ?? w.pronunciation,
    };
  }, [overrides]);

  const handleEdit = (word: Word) => {
    const merged = getWord(word);
    setEditingId(word.id);
    setEditForm({
      japanese: merged.japanese,
      pos: merged.pos,
      example: merged.example,
      derivatives: merged.derivatives || '',
      mnemonic: merged.mnemonic || '',
      pronunciation: merged.pronunciation || '',
    });
  };

  const handleSave = async () => {
    if (editingId === null || !classId) return;
    setSaving(true);
    const newOverrides = { ...overrides, [editingId.toString()]: editForm };
    setOverrides(newOverrides);
    try {
      await setDoc(doc(db, 'classes', classId, 'settings', 'wordOverrides'), newOverrides);
      invalidateWordsCache(classId);
    } catch (err) {
      console.error('Failed to save:', err);
    }
    setEditingId(null);
    setSaving(false);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const isSearching = searchQuery.trim().length > 0;
  const q = searchQuery.toLowerCase().trim();

  const startId = (week - 1) * PER_WEEK + 1;
  const endId = Math.min(week * PER_WEEK, allWords.length);

  const posOrder = ['verb-tado', 'verb-jido', 'verb-both', 'verb', 'noun', 'adjective', 'adverb', 'conjunction', 'preposition', 'phrase'];
  const getPosOrder = (pos: string) => { const i = posOrder.indexOf(pos); return i >= 0 ? i : posOrder.length; };

  const displayed = isSearching
    ? allWords.filter((w) => {
        const merged = getWord(w);
        return (
          merged.english.toLowerCase().includes(q) ||
          merged.japanese.includes(searchQuery) ||
          w.id.toString() === searchQuery
        );
      })
    : [...allWords.filter((w) => w.id >= startId && w.id <= endId)].sort((a, b) => getPosOrder(getWord(a).pos) - getPosOrder(getWord(b).pos));

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
        <div style={styles.headerRow}>
          <button style={styles.backBtn} onClick={() => navigate(`/admin/class/${classId}`)}>
            ← 戻る
          </button>
          <h1 style={styles.title}>単語管理</h1>
        </div>

        {/* Search + Week selector */}
        <div style={styles.topRow}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
            placeholder="検索..."
          />
          <div style={styles.weekSelectorWrapper}>
            <button
              style={styles.weekBtn}
              onClick={() => setShowWeekSelector(!showWeekSelector)}
            >
              第{week}週 ▼
            </button>
            {showWeekSelector && (
              <div style={styles.weekDropdown}>
                {Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1).map((w) => {
                  const wStart = (w - 1) * PER_WEEK + 1;
                  const wEnd = Math.min(w * PER_WEEK, allWords.length);
                  return (
                    <button
                      key={w}
                      style={{
                        ...styles.weekOption,
                        ...(w === week ? styles.weekOptionActive : {}),
                      }}
                      onClick={() => {
                        setWeek(w);
                        setShowWeekSelector(false);
                        setSearchQuery('');
                      }}
                    >
                      <span>第{w}週</span>
                      <span style={styles.weekRange}>No.{wStart}-{wEnd}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {!isSearching && (
          <div style={styles.weekInfo}>
            第{week}週（No.{startId}〜{endId}）
          </div>
        )}
        {isSearching && (
          <div style={styles.weekInfo}>検索結果: {displayed.length}件</div>
        )}

        {/* Word list */}
        <div style={styles.wordList}>
          {displayed.map((w, idx) => {
            const merged = getWord(w);
            const hasOverride = !!overrides[w.id.toString()];
            const isEditing = editingId === w.id;
            const prevLabel = idx > 0 ? posSectionLabel(getWord(displayed[idx - 1]).pos) : null;
            const showSection = !isSearching && posSectionLabel(merged.pos) !== prevLabel;

            if (isEditing) {
              return (
                <React.Fragment key={w.id}>
                {showSection && (
                  <div style={{ padding: '8px 12px 4px', marginTop: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3a6b', background: '#e0e7ff', padding: '3px 10px', borderRadius: 4 }}>{posSectionLabel(merged.pos)}</span>
                  </div>
                )}
                <div style={styles.editCard}>
                  <div style={styles.editHeader}>
                    <span style={styles.editId}>No.{startId + idx}</span>
                    <span style={styles.editEnglish}>{w.english}</span>
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>日本語訳</label>
                    <input
                      type="text"
                      value={editForm.japanese || ''}
                      onChange={(e) => setEditForm({ ...editForm, japanese: e.target.value })}
                      style={styles.editInput}
                    />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>発音記号 <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（例: /ˈdez.ə.bəl/）</span></label>
                    <input
                      type="text"
                      value={editForm.pronunciation || ''}
                      onChange={(e) => setEditForm({ ...editForm, pronunciation: e.target.value })}
                      style={{ ...styles.editInput, fontFamily: 'serif' }}
                      placeholder="発音記号を入力"
                    />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>分類セクション <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（単語一覧のどのセクションに表示するか）</span></label>
                    <select
                      value={editForm.pos || ''}
                      onChange={(e) => setEditForm({ ...editForm, pos: e.target.value })}
                      style={styles.editInput}
                    >
                      <option value="verb-tado">動詞（他動詞）</option>
                      <option value="verb-jido">動詞（自動詞）</option>
                      <option value="verb-both">動詞（自他動詞）</option>
                      <option value="verb">動詞（その他）</option>
                      <option value="noun">名詞</option>
                      <option value="adjective">形容詞</option>
                      <option value="adverb">副詞</option>
                      <option value="conjunction">接続詞</option>
                      <option value="preposition">前置詞</option>
                      <option value="phrase">フレーズ</option>
                    </select>
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>使い方・例文 <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（1行目: 重要表現、2行目: 例文、3行目: 和訳）</span></label>
                    <textarea
                      value={editForm.example || ''}
                      onChange={(e) => setEditForm({ ...editForm, example: e.target.value })}
                      style={{ ...styles.editInput, minHeight: 80 }}
                    />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>派生語 <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（任意。例: desirable 形容詞（望ましい））</span></label>
                    <textarea
                      value={editForm.derivatives || ''}
                      onChange={(e) => setEditForm({ ...editForm, derivatives: e.target.value })}
                      style={{ ...styles.editInput, minHeight: 40 }}
                      placeholder="派生語を入力"
                    />
                  </div>
                  <div style={styles.editField}>
                    <label style={styles.editLabel}>覚え方 <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>（任意）</span></label>
                    <textarea
                      value={editForm.mnemonic || ''}
                      onChange={(e) => setEditForm({ ...editForm, mnemonic: e.target.value })}
                      style={{ ...styles.editInput, minHeight: 60 }}
                      placeholder="覚え方を入力"
                    />
                  </div>
                  <div style={styles.editActions}>
                    <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : '保存'}
                    </button>
                    <button style={styles.cancelBtn} onClick={handleCancel}>
                      キャンセル
                    </button>
                  </div>
                </div>
                </React.Fragment>
              );
            }

            const exampleLines = merged.example ? merged.example.split('\n') : [];
            return (
              <React.Fragment key={w.id}>
              {showSection && (
                <div style={{ padding: '8px 12px 4px', marginTop: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1a3a6b', background: '#e0e7ff', padding: '3px 10px', borderRadius: 4 }}>{posSectionLabel(merged.pos)}</span>
                </div>
              )}
              <div
                style={{
                  ...styles.wordItem,
                  ...(hasOverride ? styles.wordItemOverridden : {}),
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 4,
                }}
                onClick={() => handleEdit(w)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={styles.wordId}>{startId + idx}</span>
                  <span style={styles.wordEnglish}>{merged.english}</span>
                  {merged.pronunciation && <span style={{ fontSize: 11, color: '#7c3aed', fontFamily: 'serif' }}>{merged.pronunciation}</span>}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flex: 1, flexWrap: 'wrap' }}>
                    {parseMeaning(merged.pos, merged.japanese).map((p, pi) => (
                      <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: '#9ca3af', borderRadius: 3, padding: '0px 4px' }}>{p.badge}</span>
                        <span style={styles.wordJapanese}>{p.meaning}</span>
                      </span>
                    ))}
                  </span>
                  {merged.mnemonic && <span style={styles.wordMnemonic}>覚</span>}
                  {hasOverride && <span style={styles.editedBadge}>編集済</span>}
                </div>
                {merged.derivatives && (
                  <div style={{ fontSize: 12, color: '#0369a1', padding: '6px 10px', background: '#f0f9ff', borderRadius: 8, marginTop: 6, marginLeft: 32, lineHeight: 1.5 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: '#0ea5e9', borderRadius: 3, padding: '0px 5px', marginRight: 6 }}>派生語</span>
                    {merged.derivatives}
                  </div>
                )}
                {exampleLines.length > 0 && (
                  <div style={{ fontSize: 12, color: '#6b7280', paddingLeft: 32, lineHeight: 1.5 }}>
                    {exampleLines.map((line, i) => {
                      const isEnglishLine = /[a-zA-Z]{2,}/.test(line) && !/[\u3000-\u9fff\uff00-\uffef]/.test(line);
                      if (isEnglishLine) {
                        const stem = merged.english.endsWith('y') ? merged.english.slice(0, -1) : merged.english.endsWith('e') ? merged.english.slice(0, -1) : merged.english;
                        const regex = new RegExp(`(\\b${stem}\\w*\\b)`, 'gi');
                        const parts = line.split(regex);
                        return (
                          <div key={i}>
                            {parts.map((part, j) =>
                              new RegExp(`^${stem}\\w*$`, 'i').test(part)
                                ? <span key={j} style={{ color: '#dc2626', fontWeight: 600 }}>{part}</span>
                                : <span key={j}>{part}</span>
                            )}
                          </div>
                        );
                      }
                      return <div key={i} style={i === 0 && exampleLines.length > 2 ? { fontWeight: 600, color: '#1a3a6b' } : undefined}>{line}</div>;
                    })}
                  </div>
                )}
              </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Week navigation */}
        {!isSearching && (
          <div style={styles.navRow}>
            {week > 1 ? (
              <button style={styles.navBtn} onClick={() => setWeek(week - 1)}>
                ← 前の週
              </button>
            ) : <div />}
            <span style={styles.navLabel}>第{week}週</span>
            {week < TOTAL_WEEKS ? (
              <button style={styles.navBtn} onClick={() => setWeek(week + 1)}>
                次の週 →
              </button>
            ) : <div />}
          </div>
        )}
      </div>
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    maxWidth: 900,
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
    marginBottom: 16,
  },
  backBtn: {
    padding: '8px 16px',
    background: '#f3f4f6',
    borderRadius: 8,
    fontSize: 14,
    color: '#4b5563',
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  topRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
  },
  weekSelectorWrapper: {
    position: 'relative',
  },
  weekBtn: {
    padding: '8px 14px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  weekDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    maxHeight: 320,
    overflowY: 'auto',
    zIndex: 50,
    width: 200,
  },
  weekOption: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f3f4f6',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
    gap: 8,
  },
  weekOptionActive: {
    background: '#f0f4ff',
    fontWeight: 700,
    color: '#1a3a6b',
  },
  weekRange: {
    fontSize: 11,
    color: '#9ca3af',
  },
  weekInfo: {
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 10,
  },
  wordList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  wordItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#fff',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    border: '1px solid #e5e7eb',
  },
  wordItemOverridden: {
    borderColor: '#4a90d9',
    background: '#f8faff',
  },
  wordId: {
    width: 36,
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'right',
    flexShrink: 0,
  },
  wordEnglish: {
    fontWeight: 600,
    color: '#1a3a6b',
    minWidth: 110,
    flexShrink: 0,
  },
  wordPos: {
    fontSize: 11,
    color: '#6b7280',
    background: '#f3f4f6',
    padding: '2px 6px',
    borderRadius: 4,
    flexShrink: 0,
  },
  wordJapanese: {
    color: '#4b5563',
    fontSize: 13,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  wordMnemonic: {
    fontSize: 10,
    color: '#7c3aed',
    background: '#f5f3ff',
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 600,
    flexShrink: 0,
  },
  editedBadge: {
    fontSize: 10,
    color: '#4a90d9',
    background: '#e8f0fe',
    padding: '2px 6px',
    borderRadius: 4,
    fontWeight: 600,
    flexShrink: 0,
  },
  editCard: {
    background: '#fff',
    border: '2px solid #1a3a6b',
    borderRadius: 12,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  editHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  editId: {
    fontSize: 13,
    color: '#9ca3af',
  },
  editEnglish: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  editField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  editLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  editInput: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical' as any,
  },
  editActions: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  saveBtn: {
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
  navRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: '8px 0',
  },
  navBtn: {
    padding: '8px 16px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
  },
  navLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
};

export default WordEditPage;

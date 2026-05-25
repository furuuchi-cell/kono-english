import React, { useState, useRef } from 'react';
import { Word, WordProgress } from '../../types';
import { parseMeaning, posSectionLabel } from '../../utils/pos';
import { speakWord } from '../../utils/speech';

interface Props {
  words: Word[];
  wordsPerPage?: number;
  progress?: Map<number, WordProgress>;
  showProgress?: boolean;
  onEdit?: (word: Word) => void;
  showAudio?: boolean;
  maxPage?: number;
}

const WordListView: React.FC<Props> = ({
  words,
  wordsPerPage = 50,
  progress,
  showProgress = true,
  onEdit,
  showAudio = false,
  maxPage,
}) => {
  const [page, setPage] = useState(1);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  const totalPages = maxPage ?? Math.ceil(words.length / wordsPerPage);
  const startIdx = (page - 1) * wordsPerPage;
  const endIdx = startIdx + wordsPerPage;

  const isSearching = search.trim().length > 0;
  const q = search.toLowerCase().trim();

  const posOrder = ['verb-tado', 'verb-jido', 'verb-both', 'verb', 'noun', 'adjective', 'adverb', 'conjunction', 'preposition', 'phrase'];
  const getPosOrder = (pos: string) => { const i = posOrder.indexOf(pos); return i >= 0 ? i : posOrder.length; };

  const displayWords = isSearching
    ? words.filter(w =>
        w.english.toLowerCase().includes(q) ||
        w.japanese.includes(search) ||
        w.id.toString() === q
      )
    : [...words.slice(startIdx, endIdx)].sort((a, b) => getPosOrder(a.pos) - getPosOrder(b.pos));

  const pageWords = words.slice(startIdx, endIdx);
  const pageMastered = pageWords.filter(w => progress?.get(w.id)?.status === 'mastered').length;
  const pageReview = pageWords.filter(w => progress?.get(w.id)?.status === 'review').length;

  return (
    <div style={styles.container}>
      {/* Header row: search + page selector */}
      <div style={styles.topRow}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
          placeholder="検索..."
        />
        <div style={styles.weekSelectorWrapper} ref={selectorRef}>
          <button
            style={styles.weekBtn}
            onClick={() => setShowPageSelector(!showPageSelector)}
          >
            第{page}週 ▼
          </button>
          {showPageSelector && (
            <div style={styles.weekDropdown}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const pStart = (p - 1) * wordsPerPage;
                const pEnd = Math.min(p * wordsPerPage, words.length);
                const pWords = words.slice(pStart, pEnd);
                const pMastered = pWords.filter(w => progress?.get(w.id)?.status === 'mastered').length;
                return (
                  <button
                    key={p}
                    style={{
                      ...styles.weekOption,
                      ...(p === page ? styles.weekOptionActive : {}),
                    }}
                    onClick={() => {
                      setPage(p);
                      setShowPageSelector(false);
                      setSearch('');
                    }}
                  >
                    <span>第{p}週</span>
                    <span style={styles.weekRange}>No.{pStart + 1}-{pEnd}</span>
                    {showProgress && (
                      <span style={styles.weekPct}>{Math.round((pMastered / pWords.length) * 100)}%</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Page info */}
      {!isSearching && (
        <div style={styles.weekInfo}>
          <span style={styles.weekTitle}>
            第{page}週（No.{startIdx + 1}〜{Math.min(endIdx, words.length)}）
          </span>
          {showProgress && (
            <span style={styles.weekStats}>
              <span style={{ color: '#10b981' }}>✓習得済 {pageMastered}</span>
              {' '}
              <span style={{ color: '#f59e0b' }}>! 苦手 {pageReview}</span>
            </span>
          )}
        </div>
      )}

      {isSearching && (
        <div style={styles.weekInfo}>
          <span style={styles.weekTitle}>検索結果: {displayWords.length}件</span>
        </div>
      )}

      {/* Word list */}
      <div style={styles.wordList}>
        {displayWords.map((w, idx) => {
          const status = progress?.get(w.id)?.status || 'unlearned';
          const isExpanded = expandedId === w.id;
          const exampleLines = w.example ? w.example.split('\n') : [];
          const prevLabel = idx > 0 ? posSectionLabel(displayWords[idx - 1].pos) : null;
          const showSection = !isSearching && posSectionLabel(w.pos) !== prevLabel;
          return (
            <React.Fragment key={w.id}>
            {showSection && (
              <div style={styles.posSection}>
                <span style={styles.posSectionLabel}>{posSectionLabel(w.pos)}</span>
              </div>
            )}
            <div style={{ ...styles.wordItem, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onEdit?.(w)}>
                {showAudio && (
                  <button
                    style={styles.audioBtn}
                    onClick={(e) => { e.stopPropagation(); speakWord(w.english); }}
                  >
                    🔊
                  </button>
                )}
                <span style={styles.wordId}>{startIdx + idx + 1}</span>
                {showProgress && status === 'mastered' && <span style={styles.iconGreen}>✓</span>}
                {showProgress && status === 'review'   && <span style={styles.iconYellow}>!</span>}
                {showProgress && status === 'unlearned' && <span style={styles.iconEmpty}> </span>}
                {!showProgress && <span style={styles.iconEmpty}> </span>}
                <div style={styles.wordMain}>
                  <div style={styles.wordEnglishRow}>
                    <span style={styles.wordEnglish}>{w.english}</span>
                    {w.pronunciation && (
                      <span style={styles.wordPronunciation}>{w.pronunciation}</span>
                    )}
                  </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                    {parseMeaning(w.pos, w.japanese).map((p, pi) => (
                      <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: '#9ca3af', borderRadius: 3, padding: '0px 4px', flexShrink: 0 }}>{p.badge}</span>
                        <span style={styles.wordJapanese}>{p.meaning}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {(w.example || w.mnemonic) && (
                  <button
                    style={styles.expandBtn}
                    onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : w.id); }}
                  >
                    {isExpanded ? '▲' : '使い方'}
                  </button>
                )}
              </div>
              {isExpanded && (
                <div style={styles.expandedArea}>
                  {exampleLines.length > 0 && (
                    <div style={styles.expandedExample}>
                      {exampleLines.map((line, i) => {
                        const isEnglishLine = /[a-zA-Z]{2,}/.test(line) && !/[\u3000-\u9fff\uff00-\uffef]/.test(line);
                        if (isEnglishLine) {
                          const stem = w.english.endsWith('y') ? w.english.slice(0, -1) : w.english.endsWith('e') ? w.english.slice(0, -1) : w.english;
                          const regex = new RegExp(`(\\b${stem}\\w*\\b)`, 'gi');
                          const parts = line.split(regex);
                          return (
                            <div key={i} style={{ marginTop: i > 0 ? 3 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>
                                {parts.map((part, j) =>
                                  new RegExp(`^${stem}\\w*$`, 'i').test(part) ? (
                                    <span key={j} style={{ color: '#dc2626', fontWeight: 600 }}>{part}</span>
                                  ) : <span key={j}>{part}</span>
                                )}
                              </span>
                              <button
                                style={{ ...styles.audioBtn, width: 22, height: 22, borderRadius: 11, fontSize: 11, flexShrink: 0 }}
                                onClick={(e) => { e.stopPropagation(); speakWord(line); }}
                              >🔊</button>
                            </div>
                          );
                        }
                        return (
                          <div key={i} style={{ marginTop: 3, ...(i === 0 && exampleLines.length > 2 ? { fontWeight: 600, color: '#1a3a6b' } : {}) }}>
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {w.derivatives && (
                    <div style={styles.expandedDerivatives}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#fff', background: '#0ea5e9', borderRadius: 3, padding: '0px 5px', marginRight: 6 }}>派生語</span>
                      {w.derivatives}
                    </div>
                  )}
                  {w.mnemonic && (
                    <div style={styles.expandedMnemonic}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: '#7c3aed', borderRadius: 4, padding: '1px 5px', marginRight: 6 }}>覚え方</span>
                      {w.mnemonic}
                    </div>
                  )}
                </div>
              )}
            </div>
            </React.Fragment>
          );
        })}
        {displayWords.length === 0 && (
          <p style={styles.emptyText}>該当する単語がありません</p>
        )}
      </div>

      {/* Page navigation */}
      {!isSearching && (() => {
        const effectiveMax = maxPage ?? totalPages;
        return (
          <div style={styles.navRow}>
            {page > 1 ? (
              <button style={styles.navBtn} onClick={() => setPage(page - 1)}>
                ← 前の週
              </button>
            ) : <div style={{ width: 80 }} />}
            <span style={styles.navLabel}>第{page}週</span>
            {page < effectiveMax ? (
              <button style={styles.navBtn} onClick={() => setPage(page + 1)}>
                次の週 →
              </button>
            ) : <div style={{ width: 80 }} />}
          </div>
        );
      })()}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {},
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
    width: 220,
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
    flex: 1,
    textAlign: 'right',
  },
  weekPct: {
    fontSize: 12,
    fontWeight: 600,
    color: '#1a3a6b',
    minWidth: 32,
    textAlign: 'right',
  },
  weekInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  weekTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
  },
  weekStats: {
    fontSize: 12,
    fontWeight: 500,
  },
  wordList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  wordItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#fff',
    borderRadius: 8,
    fontSize: 14,
    border: '1px solid #f3f4f6',
    cursor: 'default',
  },
  audioBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
  },
  wordId: {
    width: 32,
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'right',
    flexShrink: 0,
  },
  iconGreen: {
    width: 20,
    height: 20,
    borderRadius: 10,
    background: '#10b981',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconYellow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    background: '#f59e0b',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconEmpty: {
    width: 20,
    height: 20,
    flexShrink: 0,
  },
  wordMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  wordEnglishRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  wordEnglish: {
    fontWeight: 600,
    color: '#1a3a6b',
    flexShrink: 0,
  },
  wordPronunciation: {
    fontSize: 11,
    color: '#7c3aed',
    fontFamily: 'serif',
  },
  wordJapanese: {
    color: '#6b7280',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  posSection: {
    padding: '8px 12px 4px',
    marginTop: 8,
  },
  posSectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: '#1a3a6b',
    background: '#e0e7ff',
    padding: '3px 10px',
    borderRadius: 4,
  },
  expandBtn: {
    padding: '3px 8px',
    background: '#f0f4ff',
    color: '#1a3a6b',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid #dbeafe',
    flexShrink: 0,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  expandedArea: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #f3f4f6',
  },
  expandedExample: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 1.5,
    padding: '6px 10px',
    background: '#f9fafb',
    borderRadius: 8,
  },
  expandedDerivatives: {
    fontSize: 12,
    color: '#0369a1',
    padding: '6px 10px',
    background: '#f0f9ff',
    borderRadius: 8,
    marginTop: 6,
    lineHeight: 1.5,
  },
  expandedMnemonic: {
    fontSize: 12,
    color: '#7c3aed',
    padding: '6px 10px',
    background: '#f5f3ff',
    borderRadius: 8,
    marginTop: 6,
    lineHeight: 1.5,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    padding: 20,
    fontSize: 13,
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

export default WordListView;

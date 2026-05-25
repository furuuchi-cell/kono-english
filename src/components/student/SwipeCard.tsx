import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Word, WordProgress } from '../../types';
import { speakWord, cancelSpeech } from '../../utils/speech';
import { parseMeaning } from '../../utils/pos';

interface Props {
  word: Word;
  progress?: WordProgress;
  onSwipe: (direction: 'right' | 'left') => void;
  index: number;
  total: number;
}

const SwipeCard: React.FC<Props> = ({ word, progress, onSwipe, index, total }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState<'left' | 'right' | null>(null);
  const [isEntering, setIsEntering] = useState(true);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsFlipped(false);
    setDragX(0);
    setIsExiting(null);
    setIsEntering(true);
    // Auto-speak after card enters
    const speakTimer = setTimeout(() => speakWord(word.english), 500);
    // Trigger enter animation
    const timer = setTimeout(() => {
      setIsEntering(false);
    }, 50);
    return () => { clearTimeout(timer); clearTimeout(speakTimer); };
  }, [word]);

  const handleStart = (clientX: number) => {
    setIsDragging(true);
    startX.current = clientX;
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    const diff = clientX - startX.current;
    setDragX(diff);
  };

  const handleEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = dragX > 0 ? 90 : 60; // 右スワイプはやや深めに
    if (Math.abs(dragX) > threshold) {
      const direction = dragX > 0 ? 'right' : 'left';
      setIsExiting(direction);
      setTimeout(() => {
        onSwipe(direction);
      }, 300);
    } else {
      // Tap detection: if barely moved, treat as tap to flip
      if (Math.abs(dragX) < 10) {
        setIsFlipped((prev) => !prev);
      }
      setDragX(0);
    }
  };

  const handleButtonSwipe = useCallback((direction: 'right' | 'left') => {
    setIsExiting(direction);
    setTimeout(() => {
      onSwipe(direction);
    }, 300);
  }, [onSwipe]);

  useEffect(() => {
    const isTouchDevice = navigator.maxTouchPoints > 0;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowRight') handleButtonSwipe('right');
      if (e.key === 'ArrowLeft') handleButtonSwipe('left');
      if (e.key === ' ') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
      if (!isTouchDevice && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleButtonSwipe]);

  const getTransform = () => {
    if (isExiting) {
      return 'scale(0.85)';
    }
    const rotation = dragX * 0.05;
    return `translateX(${dragX}px) rotate(${rotation}deg)`;
  };

  const opacity = isEntering ? 0 : isExiting ? 0 : 1;

  const statusColor =
    progress?.status === 'mastered'
      ? '#10b981'
      : progress?.status === 'review'
      ? '#f59e0b'
      : '#94a3b8';

  const statusLabel =
    progress?.status === 'mastered'
      ? '習得済'
      : progress?.status === 'review'
      ? '苦手'
      : '未学習';

  return (
    <div style={styles.wrapper}>
      <div style={styles.counter}>
        {index + 1} / {total}
      </div>

      <div
        ref={cardRef}
        style={{
          ...styles.card,
          transform: getTransform(),
          opacity,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
        }}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={(e) => { e.preventDefault(); handleStart(e.touches[0].clientX); }}
        onTouchMove={(e) => { e.preventDefault(); handleMove(e.touches[0].clientX); }}
        onTouchEnd={(e) => { e.preventDefault(); handleEnd(); }}
        onClick={(e) => e.preventDefault()}
      >
        {/* Swipe indicators */}
        {dragX > 30 && (
          <div style={{ ...styles.swipeLabel, ...styles.swipeLabelRight }}>
            わかる ✓
          </div>
        )}
        {dragX < -30 && (
          <div style={{ ...styles.swipeLabel, ...styles.swipeLabelLeft }}>
            わからない ✗
          </div>
        )}

        {/* 表面・裏面を重ねてopacityで切り替え */}
        <div style={{ ...styles.front, gridArea: 'overlay', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: isFlipped ? 0 : 1, pointerEvents: isFlipped ? 'none' : 'auto' }}>
          <div style={styles.english}>{word.english}</div>
          <div style={styles.tapHint}>タップで意味を表示</div>
        </div>
        <div style={{ ...styles.back, gridArea: 'overlay', paddingTop: 48, opacity: isFlipped ? 1 : 0, pointerEvents: isFlipped ? 'auto' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={styles.englishSmall}>{word.english}</div>
            {word.pronunciation && (
              <span style={styles.pronunciation}>{word.pronunciation}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {parseMeaning(word.pos, word.japanese).map((p, pi) => (
              <span key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={styles.posBadge}>{p.badge}</span>
                <span style={styles.japanese}>{p.meaning}</span>
              </span>
            ))}
          </div>
          {word.example && (
            <div style={styles.example}>
              {word.example.split('\n').map((line, i) => {
                const isEnglishLine = /[a-zA-Z]{2,}/.test(line) && !/[\u3000-\u9fff\uff00-\uffef]/.test(line);
                if (isEnglishLine) {
                  const stem = word.english.endsWith('y') ? word.english.slice(0, -1) : word.english.endsWith('e') ? word.english.slice(0, -1) : word.english;
                  const regex = new RegExp(`(\\b${stem}\\w*\\b)`, 'gi');
                  const parts = line.split(regex);
                  return (
                    <div key={i} style={i > 0 ? { marginTop: 3 } : undefined}>
                      {parts.map((part, j) =>
                        new RegExp(`^${stem}\\w*$`, 'i').test(part) ? (
                          <span key={j} style={{ color: '#dc2626', fontWeight: 600 }}>{part}</span>
                        ) : <span key={j}>{part}</span>
                      )}
                    </div>
                  );
                }
                return <div key={i} style={{ marginTop: 3, ...(i === 0 && word.example!.split('\n').length > 2 ? { fontWeight: 600, color: '#1a3a6b' } : {}) }}>{line}</div>;
              })}
            </div>
          )}
          {word.derivatives && (
            <div style={styles.derivatives}>
              <span style={styles.derivativesLabel}>派生語</span>
              {word.derivatives}
            </div>
          )}
        </div>
      </div>

      {/* PC buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, flexShrink: 0 }}>
        <div style={styles.buttons}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: 48, color: '#ef4444', lineHeight: '1', opacity: 0.4 }}>⟸</span>
            <button
              style={{ ...styles.btn, ...styles.btnLeft }}
              onClick={() => handleButtonSwipe('left')}
            >
              わからない ×
            </button>
          </div>
          <button
            style={styles.btnSpeak}
            onClick={(e) => {
              e.stopPropagation();
              speakWord(word.english);
            }}
          >
            🔊
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <span style={{ fontSize: 48, color: '#10b981', lineHeight: '1', opacity: 0.4 }}>⟹</span>
            <button
              style={{ ...styles.btn, ...styles.btnRight }}
              onClick={() => handleButtonSwipe('right')}
            >
              わかる ✓
            </button>
          </div>
        </div>
      </div>

      <div style={styles.keyHint}>
        ←→ キーでスワイプ / ↑↓ キーで裏返し
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: '4px 16px 12px',
    outline: 'none',
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 0,
  },
  counter: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
    flexShrink: 0,
  },
  card: {
    width: 'min(85vw, 340px)',
    minHeight: 'min(70vw, 280px)',
    flexShrink: 0,
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    padding: '16px 20px',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'grab',
    userSelect: 'none',
    display: 'grid',
    gridTemplateAreas: '"overlay"',
  },
  statusBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: '4px 12px',
    borderRadius: 20,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
  },
  swipeLabel: {
    position: 'absolute',
    top: 8,
    padding: '4px 12px',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 700,
    zIndex: 10,
  },
  swipeLabelRight: {
    left: 16,
    color: '#10b981',
    border: '3px solid #10b981',
    background: 'rgba(16,185,129,0.1)',
  },
  swipeLabelLeft: {
    right: 16,
    color: '#ef4444',
    border: '3px solid #ef4444',
    background: 'rgba(239,68,68,0.1)',
  },
  front: {
    textAlign: 'center',
  },
  english: {
    fontSize: 36,
    fontWeight: 700,
    color: '#1a3a6b',
    marginBottom: 16,
  },
  tapHint: {
    fontSize: 13,
    color: '#9ca3af',
  },
  back: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  englishSmall: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  pronunciation: {
    fontSize: 12,
    color: '#7c3aed',
    fontFamily: 'serif',
  },
  posBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#fff',
    background: '#6b7280',
    borderRadius: 4,
    padding: '1px 6px',
    flexShrink: 0,
  },
  japanese: {
    fontSize: 17,
    fontWeight: 600,
    color: '#1a1a2e',
  },
  example: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 1.5,
    padding: '6px 10px',
    background: '#f9fafb',
    borderRadius: 8,
    marginTop: 8,
  },
  mnemonic: {
    fontSize: 13,
    color: '#7c3aed',
    padding: '8px 12px',
    background: '#f5f3ff',
    borderRadius: 8,
    lineHeight: 1.5,
  },
  mnemonicLabel: {
    fontWeight: 600,
    marginRight: 8,
    fontSize: 12,
    background: '#7c3aed',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 4,
  },
  derivatives: {
    fontSize: 12,
    color: '#0369a1',
    padding: '4px 10px',
    background: '#f0f9ff',
    borderRadius: 6,
    marginTop: 4,
    lineHeight: 1.4,
  },
  derivativesLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    background: '#0ea5e9',
    borderRadius: 3,
    padding: '0px 5px',
    marginRight: 6,
  },
  buttons: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexShrink: 0,
    padding: '4px 0',
  },
  btn: {
    padding: '10px 0',
    width: 120,
    textAlign: 'center' as const,
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    transition: 'transform 0.1s',
  },
  btnLeft: {
    background: '#ef4444',
  },
  btnRight: {
    background: '#10b981',
  },
  btnSpeak: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: '#f3f4f6',
    fontSize: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #e5e7eb',
  },
  keyHint: {
    fontSize: 11,
    color: '#9ca3af',
    flexShrink: 0,
    paddingBottom: 4,
  },
};

export default SwipeCard;

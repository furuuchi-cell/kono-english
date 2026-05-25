import React, { useState, useEffect } from 'react';

const STUDY_TUTORIAL_KEY = 'kono_study_tutorial_done';

const StudyTutorial: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STUDY_TUTORIAL_KEY)) {
      setShow(true);
    }
  }, []);

  const handleDone = () => {
    localStorage.setItem(STUDY_TUTORIAL_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h2 style={styles.title}>スワイプで学習しよう</h2>

        {/* Swipe illustration */}
        <div style={styles.swipeRow}>
          <div style={styles.swipeItem}>
            <div style={styles.arrowLeft}>←</div>
            <div style={styles.swipeLabelRed}>わからない</div>
            <div style={styles.swipeSub}>苦手に追加</div>
          </div>

          <div style={styles.cardMock}>
            <div style={styles.cardMockWord}>apple</div>
            <div style={styles.cardMockHint}>タップで意味表示</div>
          </div>

          <div style={styles.swipeItem}>
            <div style={styles.arrowRight}>→</div>
            <div style={styles.swipeLabelGreen}>わかる</div>
            <div style={styles.swipeSub}>習得に近づく</div>
          </div>
        </div>

        {/* Rule explanation */}
        <div style={styles.ruleBox}>
          <div style={styles.ruleIcon}>🔄</div>
          <div>
            <p style={styles.ruleTitle}>苦手単語の習得ルール</p>
            <p style={styles.ruleText}>
              苦手単語は<strong>2回連続でわかる</strong>と<br />
              「習得済み」になります
            </p>
          </div>
        </div>

        {/* Status flow */}
        <div style={styles.statusFlow}>
          <div style={styles.statusBadge}>
            <div style={{ ...styles.statusDot, background: '#94a3b8' }} />
            <span style={styles.statusLabel}>未学習</span>
          </div>
          <span style={styles.flowArrow}>→</span>
          <div style={styles.statusBadge}>
            <div style={{ ...styles.statusDot, background: '#f59e0b' }} />
            <span style={styles.statusLabel}>苦手</span>
          </div>
          <div style={styles.flowArrowDouble}>
            <span style={styles.flowArrow}>→→</span>
            <span style={styles.flowArrowNote}>2回連続</span>
          </div>
          <div style={styles.statusBadge}>
            <div style={{ ...styles.statusDot, background: '#10b981' }} />
            <span style={styles.statusLabel}>習得済</span>
          </div>
        </div>

        <button style={styles.startBtn} onClick={handleDone}>
          学習をはじめる
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 20,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: '28px 20px 24px',
    maxWidth: 360,
    width: '100%',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a3a6b',
    textAlign: 'center',
    marginBottom: 20,
  },
  swipeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  swipeItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minWidth: 72,
  },
  arrowLeft: {
    fontSize: 28,
    color: '#ef4444',
    fontWeight: 700,
    lineHeight: 1,
  },
  arrowRight: {
    fontSize: 28,
    color: '#10b981',
    fontWeight: 700,
    lineHeight: 1,
  },
  swipeLabelRed: {
    fontSize: 12,
    fontWeight: 700,
    color: '#ef4444',
  },
  swipeLabelGreen: {
    fontSize: 12,
    fontWeight: 700,
    color: '#10b981',
  },
  swipeSub: {
    fontSize: 10,
    color: '#9ca3af',
  },
  cardMock: {
    width: 96,
    height: 96,
    background: '#f8faff',
    border: '2px solid #dbeafe',
    borderRadius: 14,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  cardMockWord: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a3a6b',
  },
  cardMockHint: {
    fontSize: 9,
    color: '#9ca3af',
  },
  ruleBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 12,
    padding: '12px 14px',
    marginBottom: 16,
  },
  ruleIcon: {
    fontSize: 24,
    flexShrink: 0,
  },
  ruleTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#92400e',
    marginBottom: 3,
  },
  ruleText: {
    fontSize: 12,
    color: '#78350f',
    lineHeight: 1.6,
  },
  statusFlow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 20,
    flexWrap: 'wrap' as const,
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  },
  flowArrow: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: 700,
  },
  flowArrowDouble: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 1,
  },
  flowArrowNote: {
    fontSize: 9,
    color: '#f59e0b',
    fontWeight: 600,
  },
  startBtn: {
    display: 'block',
    width: '100%',
    padding: '13px',
    background: '#1a3a6b',
    color: '#fff',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    border: 'none',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
};

export default StudyTutorial;

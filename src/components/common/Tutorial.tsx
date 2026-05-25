import React, { useState, useEffect } from 'react';

const HOME_TUTORIAL_KEY = 'kono_home_tutorial_done';

const Tutorial: React.FC = () => {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipAbove, setTooltipAbove] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(HOME_TUTORIAL_KEY)) return;

    const tryFind = (attempts = 0) => {
      const el = document.querySelector('[data-tutorial="tab-bar"]');
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        // If tooltip below would go off screen, show above
        setTooltipAbove(r.bottom + 120 > window.innerHeight);
        setShow(true);
      } else if (attempts < 20) {
        setTimeout(() => tryFind(attempts + 1), 300);
      }
    };
    setTimeout(() => tryFind(), 600);
  }, []);

  const handleDone = () => {
    localStorage.setItem(HOME_TUTORIAL_KEY, 'true');
    setShow(false);
  };

  if (!show || !rect) return null;

  const pad = 10;
  const sTop = rect.top - pad;
  const sLeft = rect.left - pad;
  const sWidth = rect.width + pad * 2;
  const sHeight = rect.height + pad * 2;

  const tooltipWidth = 256;
  let tooltipLeft = sLeft + sWidth / 2 - tooltipWidth / 2;
  if (tooltipLeft < 8) tooltipLeft = 8;
  if (tooltipLeft + tooltipWidth > window.innerWidth - 8) {
    tooltipLeft = window.innerWidth - tooltipWidth - 8;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      {/* Masks */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: sTop, background: 'rgba(0,0,0,0.68)', pointerEvents: 'auto' }} />
      <div style={{ position: 'absolute', top: sTop + sHeight, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.68)', pointerEvents: 'auto' }} />
      <div style={{ position: 'absolute', top: sTop, left: 0, width: sLeft, height: sHeight, background: 'rgba(0,0,0,0.68)', pointerEvents: 'auto' }} />
      <div style={{ position: 'absolute', top: sTop, left: sLeft + sWidth, right: 0, height: sHeight, background: 'rgba(0,0,0,0.68)', pointerEvents: 'auto' }} />

      {/* Spotlight border */}
      <div style={{
        position: 'absolute',
        top: sTop,
        left: sLeft,
        width: sWidth,
        height: sHeight,
        borderRadius: 14,
        border: '2.5px solid rgba(255,255,255,0.9)',
        boxShadow: '0 0 0 4px rgba(255,255,255,0.15)',
        pointerEvents: 'none',
      }} />

      {/* Tooltip */}
      <div style={{
        position: 'absolute',
        top: tooltipAbove ? sTop - 16 - 148 : sTop + sHeight + 16,
        left: tooltipLeft,
        width: tooltipWidth,
        background: '#fff',
        borderRadius: 16,
        padding: '16px 18px',
        textAlign: 'center',
        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
        pointerEvents: 'auto',
      }}>
        {/* Arrow */}
        <div style={{
          position: 'absolute',
          [tooltipAbove ? 'bottom' : 'top']: -9,
          left: Math.min(Math.max(sLeft + sWidth / 2 - tooltipLeft - 9, 16), tooltipWidth - 32),
          width: 0,
          height: 0,
          borderLeft: '9px solid transparent',
          borderRight: '9px solid transparent',
          [tooltipAbove ? 'borderTop' : 'borderBottom']: '9px solid #fff',
        }} />

        <div style={{ fontSize: 22, marginBottom: 6 }}>👆</div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#1a3a6b', marginBottom: 6 }}>
          タブで切り替えできます
        </p>
        <p style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6, marginBottom: 14 }}>
          「スピード周回」でスワイプ学習、「チェックテスト」でテストを受けられます
        </p>
        <button
          onClick={handleDone}
          style={{
            padding: '9px 28px',
            background: '#1a3a6b',
            color: '#fff',
            borderRadius: 20,
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          わかった！
        </button>
      </div>
    </div>
  );
};

export default Tutorial;

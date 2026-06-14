import React from 'react';

interface Props {
  /** 表示メッセージ。省略時は表示なし */
  message?: string;
  /** フルスクリーン表示にするか（既定 true） */
  fullScreen?: boolean;
  /** ブランド色のグラデーション背景を使うか（ログイン直後など） */
  branded?: boolean;
}

/**
 * 共通ローディング表示。
 * - スピナーは CSS keyframes（global.css 側で `@keyframes kono-spin` を定義）
 * - 「読み込み中...」テキストだけだった旧UIから、回転スピナー + メッセージへ刷新
 */
const Loading: React.FC<Props> = ({
  message = '読み込み中...',
  fullScreen = true,
  branded = false,
}) => {
  const wrapperStyle: React.CSSProperties = fullScreen
    ? {
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: branded
          ? 'linear-gradient(135deg, #1a3a6b 0%, #2c5aa0 100%)'
          : '#ffffff',
        zIndex: 1000,
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
      };

  const spinnerColor = branded ? '#ffffff' : '#1a3a6b';
  const textColor = branded ? 'rgba(255,255,255,0.9)' : '#6b7280';

  return (
    <div style={wrapperStyle} role="status" aria-live="polite" aria-busy="true">
      <div
        style={{
          width: 44,
          height: 44,
          border: `4px solid ${branded ? 'rgba(255,255,255,0.25)' : '#e5e7eb'}`,
          borderTopColor: spinnerColor,
          borderRadius: '50%',
          animation: 'kono-spin 0.9s linear infinite',
        }}
      />
      {message && (
        <div style={{ fontSize: 15, color: textColor, fontWeight: 500 }}>
          {message}
        </div>
      )}
    </div>
  );
};

export default Loading;

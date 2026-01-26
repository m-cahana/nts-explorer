import { useState, useEffect } from 'react';

interface LoadingScreenProps {
  loading: boolean;
  progress: number;
  trackCount: number;
  onEnter: () => void;
}

export function LoadingScreen({ loading, progress, trackCount, onEnter }: LoadingScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (fading) {
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [fading]);

  const handleClick = () => {
    if (!loading) {
      setFading(true);
      onEnter();
    }
  };

  if (!visible) return null;

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: loading ? 'default' : 'pointer',
        zIndex: 1000,
        transition: 'opacity 0.5s ease-out',
        opacity: fading ? 0 : 1,
      }}
    >
      <div style={{ fontSize: '24px', fontWeight: 300, marginBottom: '20px' }}>
        NTS Explorer
      </div>
      <div style={{ fontSize: '16px', color: '#666' }}>
        {loading
          ? `Loading... ${progress}%`
          : trackCount > 0
            ? `${trackCount.toLocaleString()} tracks - Click to explore`
            : 'No tracks found'}
      </div>
    </div>
  );
}

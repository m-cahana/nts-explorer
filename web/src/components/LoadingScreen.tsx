import { useState, useEffect } from 'react';
import './LoadingScreen.css';

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

  let className = 'loading-screen';
  if (fading) className += ' loading-screen--fading';
  if (!loading) className += ' loading-screen--clickable';

  return (
    <div className={className} onClick={handleClick}>
      <div className="loading-screen__title">NTS Explorer</div>
      <div className="loading-screen__status">
        {loading
          ? `Loading... ${progress}%`
          : trackCount > 0
            ? `${trackCount.toLocaleString()} tracks - Click to explore`
            : 'No tracks found'}
      </div>
    </div>
  );
}

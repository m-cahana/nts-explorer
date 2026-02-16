import { useState, useEffect } from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
  loading: boolean;
  progress: number;
  trackCount: number;
  onEnter: () => void;
}

export function LoadingScreen({ loading, progress, onEnter }: LoadingScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoaded(true);
    }
  }, [loading]);

  useEffect(() => {
    if (fading) {
      const timer = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [fading]);

  const handleClick = () => {
    if (loaded) {
      setFading(true);
      onEnter();
    }
  };

  if (!visible) return null;

  let className = 'loading-screen';
  if (fading) className += ' loading-screen--fading';
  if (loaded) className += ' loading-screen--clickable';

  return (
    <div className={className} onClick={handleClick}>
      <div className="loading-screen__title">
        NTS <span className="loading-screen__title-italic">archives</span>
      </div>
      <div className="loading-screen__bar">
        <div
          className={`loading-screen__fill${loaded ? ' loading-screen__fill--complete' : ''}`}
          style={{ width: `${progress}%` }}
        />
        <div className={`loading-screen__cta${loaded ? ' loading-screen__cta--visible' : ''}`}>
          click to explore
        </div>
      </div>
    </div>
  );
}

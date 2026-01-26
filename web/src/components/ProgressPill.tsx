import { useRef, useState, useCallback } from 'react';
import './ProgressPill.css';

interface ProgressPillProps {
  position: number;
  duration: number;
  isPaused: boolean;
  onPlayPause: () => void;
  onSeek: (positionMs: number) => void;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function ProgressPill({ position, duration, isPaused, onPlayPause, onSeek }: ProgressPillProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, percent * duration)));
  }, [duration, onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleBarClick(e);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!barRef.current || !duration) return;
      const rect = barRef.current.getBoundingClientRect();
      const percent = (moveEvent.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(duration, percent * duration)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [duration, onSeek, handleBarClick]);

  if (!duration) return null;

  return (
    <div className="progress-pill">
      <button
        onClick={onPlayPause}
        className="progress-pill__play-button"
      >
        {isPaused ? (
          <svg width="12" height="14" viewBox="0 0 12 14" fill="white">
            <path d="M0 0L12 7L0 14Z" />
          </svg>
        ) : (
          <svg width="10" height="12" viewBox="0 0 10 12" fill="white">
            <rect x="0" y="0" width="3" height="12" />
            <rect x="7" y="0" width="3" height="12" />
          </svg>
        )}
      </button>

      <span className="progress-pill__time">
        {formatTime(position)}
      </span>

      <div
        ref={barRef}
        onMouseDown={handleMouseDown}
        className="progress-pill__bar"
      >
        <div
          className="progress-pill__bar-fill"
          style={{ width: `${progress}%` }}
        />
        <div
          className={`progress-pill__bar-thumb ${isDragging ? 'progress-pill__bar-thumb--dragging' : 'progress-pill__bar-thumb--idle'}`}
          style={{ left: `${progress}%` }}
        />
      </div>

      <span className="progress-pill__time">
        {formatTime(duration)}
      </span>
    </div>
  );
}

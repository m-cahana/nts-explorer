import { useRef, useState, useCallback } from 'react';

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
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        background: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '20px',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      <button
        onClick={onPlayPause}
        style={{
          width: '28px',
          height: '28px',
          border: 'none',
          background: '#000',
          borderRadius: '50%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
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

      <span style={{ fontSize: '12px', color: '#666', minWidth: '45px' }}>
        {formatTime(position)}
      </span>

      <div
        ref={barRef}
        onMouseDown={handleMouseDown}
        style={{
          width: '120px',
          height: '4px',
          background: '#e0e0e0',
          borderRadius: '2px',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: '#000',
            borderRadius: '2px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: `${progress}%`,
            transform: 'translate(-50%, -50%)',
            width: isDragging ? '14px' : '10px',
            height: isDragging ? '14px' : '10px',
            background: '#000',
            borderRadius: '50%',
            transition: 'width 0.1s, height 0.1s',
          }}
        />
      </div>

      <span style={{ fontSize: '12px', color: '#666', minWidth: '45px' }}>
        {formatTime(duration)}
      </span>
    </div>
  );
}

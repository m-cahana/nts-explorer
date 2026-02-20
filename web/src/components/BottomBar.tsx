import { useRef, useState, useCallback, useEffect } from 'react';
import type { Track } from '../types';
import './BottomBar.css';

function getArtworkUrl(url: string | null, size = 't67x67'): string {
  if (!url) return '';
  return url
    .replace(/-large\./, `-${size}.`)
    .replace(/-t\d+x\d+\./, `-${size}.`);
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

interface BottomBarProps {
  activeTrack: Track | null;
  previewTrack: Track | null;
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  isLoading: boolean;
  position: number;
  duration: number;
  isPaused: boolean;
  onPlayPause: () => void;
  onSeek: (positionMs: number) => void;
  onArtworkClick?: (track: Track) => void;
  savedTracks?: Track[];
  onSaveTrack?: (track: Track) => void;
  onUnsaveTrack?: (track: Track) => void;
}

export function BottomBar({
  activeTrack,
  previewTrack,
  years,
  selectedYear,
  onYearChange,
  isLoading,
  position,
  duration,
  isPaused,
  onPlayPause,
  onSeek,
  onArtworkClick,
  savedTracks = [],
  onSaveTrack,
  onUnsaveTrack,
}: BottomBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showSaveOverlay, setShowSaveOverlay] = useState(false);
  const lastArtworkClickTime = useRef(0);

  const track = previewTrack || activeTrack;
  const isSaved = track ? savedTracks.some(t => t.id === track.id) : false;
  const progress = duration > 0 ? (position / duration) * 100 : 0;

  // Auto-clear save overlay after 2s
  useEffect(() => {
    if (!showSaveOverlay) return;
    const timer = setTimeout(() => setShowSaveOverlay(false), 2000);
    return () => clearTimeout(timer);
  }, [showSaveOverlay]);

  const seekFromEvent = useCallback((clientX: number) => {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const percent = (clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(duration, percent * duration)));
  }, [duration, onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    seekFromEvent(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      seekFromEvent(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [seekFromEvent]);

  return (
    <div className="bottom-bar">
      {/* Left: Now Playing */}
      <div className="bottom-bar__left">
        {track && (
          <>
            <div className="bottom-bar__left-text">
              <span className="bottom-bar__label">
                {previewTrack ? 'Previewing' : 'Now Playing'}
              </span>
              <span className="bottom-bar__title">{track.title}</span>
            </div>
            {track.artwork_url && (
              <div className="bottom-bar__artwork-wrapper">
                <img
                  className="bottom-bar__artwork"
                  src={getArtworkUrl(track.artwork_url)}
                  alt=""
                  draggable={false}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    const now = Date.now();
                    const sinceLastClick = now - lastArtworkClickTime.current;
                    lastArtworkClickTime.current = now;
                    if (sinceLastClick < 300) {
                      e.stopPropagation();
                      setShowSaveOverlay(true);
                    } else {
                      onArtworkClick?.(track);
                    }
                  }}
                />
                {showSaveOverlay && (
                  <div
                    className="track-tile-save-overlay"
                    onClick={(e) => {
                      e.stopPropagation();
                      isSaved ? onUnsaveTrack?.(track) : onSaveTrack?.(track);
                      setShowSaveOverlay(false);
                    }}
                  >
                    {isSaved ? 'unsave' : 'save'}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Center: Year navigation */}
      <div className="bottom-bar__center">
        {isLoading ? (
          <div className="bottom-bar__spinner" />
        ) : (
          years.map((year) => (
            <button
              key={year}
              className={`bottom-bar__year${year === selectedYear ? ' bottom-bar__year--selected' : ''}`}
              onClick={() => onYearChange(year)}
            >
              {year}
            </button>
          ))
        )}
      </div>

      {/* Right: Playback controls */}
      <div className="bottom-bar__right">
        <button className="bottom-bar__play-button" onClick={onPlayPause}>
          {isPaused ? (
            <svg width="12" height="14" viewBox="0 0 12 14" fill="#000">
              <path d="M0 0L12 7L0 14Z" />
            </svg>
          ) : (
            <svg width="10" height="12" viewBox="0 0 10 12" fill="#000">
              <rect x="0" y="0" width="3" height="12" />
              <rect x="7" y="0" width="3" height="12" />
            </svg>
          )}
        </button>

        <div
          ref={barRef}
          className="bottom-bar__progress-bar"
          onMouseDown={handleMouseDown}
        >
          <div
            className="bottom-bar__progress-fill"
            style={{ width: `${progress}%` }}
          />
          <div
            className={`bottom-bar__progress-dot${isDragging ? ' bottom-bar__progress-dot--dragging' : ''}`}
            style={{ left: `${progress}%` }}
          />
        </div>

        <span className="bottom-bar__time">
          {formatTime(position)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

import { useRef, useState, useCallback, useEffect } from "react";
import type { Track } from "../types";
import "./BottomBar.css";

function getArtworkUrl(url: string | null, size = "t67x67"): string {
  if (!url) return "";
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
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
}: BottomBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [latchedProgress, setLatchedProgress] = useState<number | null>(null);

  const track = previewTrack || activeTrack;
  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const displayProgress = dragProgress ?? latchedProgress ?? progress;

  useEffect(() => {
    if (latchedProgress === null) return;
    if (Math.abs(progress - latchedProgress) < 0.6) {
      setLatchedProgress(null);
      return;
    }
    const timer = window.setTimeout(() => setLatchedProgress(null), 1200);
    return () => window.clearTimeout(timer);
  }, [latchedProgress, progress]);

  const progressFromClientX = useCallback(
    (clientX: number): number | null => {
      if (!barRef.current || !duration) return null;
      const rect = barRef.current.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!duration) return;
      e.preventDefault();
      setIsDragging(true);
      setLatchedProgress(null);
      const pct = progressFromClientX(e.clientX);
      if (pct !== null) setDragProgress(pct * 100);

      const pointerId = e.pointerId;
      const target = e.currentTarget;
      target.setPointerCapture(pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const p = progressFromClientX(moveEvent.clientX);
        if (p !== null) setDragProgress(p * 100);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        // Seek once at the final drag position
        const p = progressFromClientX(upEvent.clientX);
        if (p !== null) {
          setLatchedProgress(p * 100);
          onSeek(p * duration);
        }
        setIsDragging(false);
        setDragProgress(null);
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // no-op: Safari can throw if capture is already released
        }
        target.removeEventListener("pointermove", handlePointerMove);
        target.removeEventListener("pointerup", handlePointerUp);
        target.removeEventListener("pointercancel", handlePointerUp);
      };

      // Listen on the capturing element — captured pointer events are
      // dispatched to it directly and may not bubble reliably to window.
      target.addEventListener("pointermove", handlePointerMove);
      target.addEventListener("pointerup", handlePointerUp);
      target.addEventListener("pointercancel", handlePointerUp);
    },
    [duration, onSeek, progressFromClientX],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!duration || e.touches.length === 0) return;
      e.preventDefault();
      setIsDragging(true);
      setLatchedProgress(null);
      const pct = progressFromClientX(e.touches[0].clientX);
      if (pct !== null) setDragProgress(pct * 100);

      const handleTouchMove = (moveEvent: TouchEvent) => {
        if (moveEvent.touches.length > 0) {
          const p = progressFromClientX(moveEvent.touches[0].clientX);
          if (p !== null) setDragProgress(p * 100);
        }
      };

      const handleTouchEnd = (endEvent: TouchEvent) => {
        const touch = endEvent.changedTouches[0];
        if (touch) {
          const p = progressFromClientX(touch.clientX);
          if (p !== null) {
            setLatchedProgress(p * 100);
            onSeek(p * duration);
          }
        }
        setIsDragging(false);
        setDragProgress(null);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
        window.removeEventListener("touchcancel", handleTouchEnd);
      };

      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      window.addEventListener("touchcancel", handleTouchEnd);
    },
    [duration, onSeek, progressFromClientX],
  );

  const handlePlayTouchStart = useCallback(
    (e: React.TouchEvent<HTMLButtonElement>) => {
      // Trigger playback immediately inside a touch gesture for iOS Safari.
      e.preventDefault();
      onPlayPause();
    },
    [onPlayPause],
  );

  return (
    <div className="bottom-bar">
      {/* Left: Now Playing */}
      <div className="bottom-bar__left">
        {track && (
          <>
            <div className="bottom-bar__left-text">
              <span className="bottom-bar__label">
                {previewTrack ? "Previewing" : "Now Playing"}
              </span>
              {track.nts_url ? (
                <a
                  className="bottom-bar__title bottom-bar__title--link"
                  href={track.nts_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {track.title}
                </a>
              ) : (
                <span className="bottom-bar__title">{track.title}</span>
              )}
            </div>
            {track.artwork_url && (
              <img
                className="bottom-bar__artwork"
                src={getArtworkUrl(track.artwork_url)}
                alt=""
                draggable={false}
                onClick={() => onArtworkClick?.(track)}
                style={{ cursor: onArtworkClick ? "pointer" : undefined }}
              />
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
              className={`bottom-bar__year${year === selectedYear ? " bottom-bar__year--selected" : ""}`}
              onClick={() => onYearChange(year)}
            >
              {year}
            </button>
          ))
        )}
      </div>

      {/* Right: Playback controls */}
      <div className="bottom-bar__right">
        <button
          className="bottom-bar__play-button"
          onClick={onPlayPause}
          onTouchStart={handlePlayTouchStart}
        >
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
          onPointerDown={handlePointerDown}
          onTouchStart={handleTouchStart}
        >
          <div
            className="bottom-bar__progress-fill"
            style={{ width: `${displayProgress}%` }}
          />
          <div
            className={`bottom-bar__progress-dot${isDragging ? " bottom-bar__progress-dot--dragging" : ""}`}
            style={{ left: `${displayProgress}%` }}
          />
        </div>

        <span className="bottom-bar__time">
          {formatTime(position)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

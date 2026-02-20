import { useState, useRef, useEffect } from 'react';
import type { Track } from '../types';
import './SavesSidebar.css';

function getArtworkUrl(url: string | null, size = 't67x67'): string {
  if (!url) return '';
  return url
    .replace(/-large\./, `-${size}.`)
    .replace(/-t\d+x\d+\./, `-${size}.`);
}

interface SavesSidebarProps {
  savedTracks: Track[];
  onPlay: (track: Track) => void;
  onRemove: (track: Track) => void;
  onDrop: (track: Track) => void;
}

export function SavesSidebar({ savedTracks, onPlay, onRemove, onDrop }: SavesSidebarProps) {
  const [overlayTrackId, setOverlayTrackId] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [scrollThumb, setScrollThumb] = useState<{ top: number; height: number } | null>(null);
  const tilesRef = useRef<HTMLDivElement>(null);

  // Custom scrollbar tracking
  useEffect(() => {
    const el = tilesRef.current;
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) {
        setScrollThumb(null);
        return;
      }
      const ratio = clientHeight / scrollHeight;
      const thumbH = Math.max(20, ratio * clientHeight);
      const maxTop = clientHeight - thumbH;
      const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop;
      setScrollThumb({ top, height: thumbH });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [savedTracks]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const raw = e.dataTransfer.getData('application/nts-track');
    if (!raw) return;
    try {
      const track = JSON.parse(raw) as Track;
      onDrop(track);
    } catch {}
  };

  return (
    <div
      className={`saves-sidebar${isDragOver ? ' saves-sidebar--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPointerDown={() => setOverlayTrackId(null)}
    >
      <span className="saves-sidebar__label">saves</span>
      <div className="saves-sidebar__tiles" ref={tilesRef}>
        {savedTracks.map((track) => {
          const artworkUrl = getArtworkUrl(track.artwork_url);
          const showOverlay = overlayTrackId === track.id;

          return (
            <div
              key={track.id}
              className="saves-tile"
              draggable
              onClick={(e) => {
                e.stopPropagation();
                if (!showOverlay) onPlay(track);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setOverlayTrackId(track.id);
              }}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/nts-track', JSON.stringify(track));
              }}
              onDragEnd={(e) => {
                if (e.dataTransfer.dropEffect === 'none') {
                  onRemove(track);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {artworkUrl && <img src={artworkUrl} alt="" draggable={false} />}
              {showOverlay && (
                <div
                  className="track-tile-save-overlay"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(track);
                    setOverlayTrackId(null);
                  }}
                >
                  unsave
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="saves-scrollbar-track">
        <div
          className="saves-scrollbar-thumb"
          style={scrollThumb ? { top: scrollThumb.top, height: scrollThumb.height } : { top: 0, height: '100%' }}
        />
      </div>
    </div>
  );
}

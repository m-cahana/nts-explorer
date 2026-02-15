import { useMemo, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { computeGridLayout } from '../lib/genreLayout';
import type { Track } from '../types';
import './MobileGenreScroll.css';

function getArtworkUrl(url: string | null, size = 't500x500'): string {
  if (!url) return '';
  return url
    .replace(/-large\./, `-${size}.`)
    .replace(/-t\d+x\d+\./, `-${size}.`);
}

interface MobileGenreScrollProps {
  tracks: Track[];
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
}

export function MobileGenreScroll({
  tracks,
  onHover,
  onHoverEnd,
  onClick,
}: MobileGenreScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const trackMapRef = useRef<Map<number, Track>>(new Map());
  const centerTrackRef = useRef<Track | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback refs
  const onHoverRef = useRef(onHover);
  const onHoverEndRef = useRef(onHoverEnd);
  const onClickRef = useRef(onClick);
  onHoverRef.current = onHover;
  onHoverEndRef.current = onHoverEnd;
  onClickRef.current = onClick;

  const orderedGroups = useMemo(() => {
    if (tracks.length === 0) return [];
    return computeGridLayout(tracks).orderedGroups;
  }, [tracks]);

  // Build track lookup map
  useEffect(() => {
    const map = new Map<number, Track>();
    for (const track of tracks) {
      map.set(track.id, track);
    }
    trackMapRef.current = map;
  }, [tracks]);

  // Scale center tile + snap + preview/play logic
  useEffect(() => {
    const container = containerRef.current;
    if (!container || tracks.length === 0) return;

    const CENTER_SCALE = 1.3;
    let currentCenterId: number | null = null;

    const findClosestTile = (): { tile: HTMLDivElement; centerY: number } | null => {
      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      let best: HTMLDivElement | null = null;
      let bestDist = Infinity;

      tileRefs.current.forEach((tile) => {
        const rect = tile.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - centerY);
        if (dist < bestDist) {
          bestDist = dist;
          best = tile;
        }
      });

      return best ? { tile: best, centerY } : null;
    };

    const updateCenterTile = () => {
      const found = findClosestTile();
      const newCenterId = found ? Number(found.tile.dataset.trackId) : null;

      if (newCenterId !== currentCenterId) {
        if (currentCenterId !== null) {
          const prev = tileRefs.current.get(currentCenterId);
          if (prev) prev.style.transform = 'scale(1)';
        }
        if (found) {
          found.tile.style.transform = `scale(${CENTER_SCALE})`;
        }
        currentCenterId = newCenterId;

        // Preview while scrolling
        if (isScrollingRef.current && newCenterId !== null) {
          const track = trackMapRef.current.get(newCenterId);
          if (track) onHoverRef.current(track);
        }
      }
    };

    const settleOnCenter = () => {
      // Snap scroll position
      const found = findClosestTile();
      if (!found) return;

      const tileRect = found.tile.getBoundingClientRect();
      const offset = tileRect.top + tileRect.height / 2 - found.centerY;
      gsap.to(container, {
        scrollTop: container.scrollTop + offset,
        duration: 0.3,
        ease: 'power2.out',
        onUpdate: updateCenterTile,
        onComplete: () => {
          // Full play on the settled center tile
          const settled = findClosestTile();
          if (!settled) return;
          const trackId = Number(settled.tile.dataset.trackId);
          const track = trackMapRef.current.get(trackId);
          if (track) {
            centerTrackRef.current = track;
            onClickRef.current(track);
          }
        },
      });
    };

    const handleScroll = () => {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        onHoverEndRef.current();
      }

      updateCenterTile();

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        settleOnCenter();
      }, 150);
    };

    // Initial pass
    requestAnimationFrame(updateCenterTile);

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [tracks]);

  const setTileRef = useCallback((el: HTMLDivElement | null, trackId: number) => {
    if (el) {
      tileRefs.current.set(trackId, el);
    } else {
      tileRefs.current.delete(trackId);
    }
  }, []);

  // Click a tile → scroll it to center (which triggers play on settle)
  const handleTileClick = useCallback((trackId: number) => {
    const container = containerRef.current;
    const tile = tileRefs.current.get(trackId);
    if (!container || !tile) return;

    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    const tileRect = tile.getBoundingClientRect();
    const offset = tileRect.top + tileRect.height / 2 - centerY;

    gsap.to(container, {
      scrollTop: container.scrollTop + offset,
      duration: 0.3,
      ease: 'power2.out',
      onUpdate: () => {
        // Update center tile scale during scroll
        const found = findClosestTileFromContainer(container, tileRefs.current);
        if (found) {
          tileRefs.current.forEach((t, id) => {
            t.style.transform = id === Number(found.tile.dataset.trackId) ? 'scale(1.3)' : 'scale(1)';
          });
        }
      },
      onComplete: () => {
        const track = trackMapRef.current.get(trackId);
        if (track) {
          onClickRef.current(track);
        }
      },
    });
  }, []);

  if (orderedGroups.length === 0) {
    return <div className="mobile-scroll" />;
  }

  return (
    <div className="mobile-scroll" ref={containerRef}>
      <div className="mobile-scroll__inner">
        {orderedGroups.map((group) => (
          <MobileGenreSection
            key={group.genre}
            genre={group.displayLabel}
            tracks={group.tracks}
            setTileRef={setTileRef}
            onTileClick={handleTileClick}
          />
        ))}
      </div>
    </div>
  );
}

function findClosestTileFromContainer(
  container: HTMLDivElement,
  tiles: Map<number, HTMLDivElement>,
): { tile: HTMLDivElement; centerY: number } | null {
  const containerRect = container.getBoundingClientRect();
  const centerY = containerRect.top + containerRect.height / 2;
  let best: HTMLDivElement | null = null;
  let bestDist = Infinity;

  tiles.forEach((tile) => {
    const rect = tile.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - centerY);
    if (dist < bestDist) {
      bestDist = dist;
      best = tile;
    }
  });

  return best ? { tile: best, centerY } : null;
}

interface MobileGenreSectionProps {
  genre: string;
  tracks: Track[];
  setTileRef: (el: HTMLDivElement | null, trackId: number) => void;
  onTileClick: (trackId: number) => void;
}

function MobileGenreSection({
  genre,
  tracks,
  setTileRef,
  onTileClick,
}: MobileGenreSectionProps) {
  return (
    <>
      <div className="mobile-genre-label">{genre}</div>
      <hr className="mobile-genre-divider" />
      {tracks.map((track) => {
        const artworkUrl = getArtworkUrl(track.artwork_url);

        return (
          <div
            key={track.id}
            className="mobile-tile"
            data-track-id={track.id}
            ref={(el) => setTileRef(el, track.id)}
            onClick={() => onTileClick(track.id)}
          >
            {artworkUrl && (
              <img src={artworkUrl} alt="" loading="lazy" draggable={false} />
            )}
          </div>
        );
      })}
    </>
  );
}

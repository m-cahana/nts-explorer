import { useMemo, useEffect, useRef, useCallback } from 'react';
import { gsap } from 'gsap';
import { computeGridLayout } from '../lib/genreLayout';
import { AZScrollHelper } from './AZScrollHelper';
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
  onClick: (track: Track) => void;
}

export function MobileGenreScroll({
  tracks,
  onClick,
}: MobileGenreScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const tileCenterYRef = useRef<Map<number, number>>(new Map());
  const trackMapRef = useRef<Map<number, Track>>(new Map());
  const centerTrackRef = useRef<Track | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const genreDividerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevCenterIdRef = useRef<number | null>(null);

  // Stable callback refs
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  const audioUnlockedRef = useRef(false);

  const orderedGroups = useMemo(() => {
    if (tracks.length === 0) return [];
    return computeGridLayout(tracks, true).orderedGroups;
  }, [tracks]);

  // Map first letter → all genre keys starting with that letter
  const letterToGenres = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of orderedGroups) {
      const letter = group.genre[0]?.toUpperCase();
      if (!letter) continue;
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(group.genre);
    }
    return map;
  }, [orderedGroups]);

  const activeLetters = useMemo(
    () => new Set(letterToGenres.keys()),
    [letterToGenres],
  );

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

    // Uses cached offsetTop positions — zero DOM reads during scroll
    const findClosestTile = (): { tile: HTMLDivElement; centerY: number } | null => {
      const containerCenterY = container.scrollTop + container.clientHeight / 2;
      let bestId: number | null = null;
      let bestDist = Infinity;
      tileCenterYRef.current.forEach((centerY, trackId) => {
        const dist = Math.abs(centerY - containerCenterY);
        if (dist < bestDist) { bestDist = dist; bestId = trackId; }
      });
      if (bestId === null) return null;
      const tile = tileRefs.current.get(bestId);
      if (!tile) return null;
      const containerRect = container.getBoundingClientRect();
      return { tile, centerY: containerRect.top + container.clientHeight / 2 };
    };

    const updateCenterTile = () => {
      const found = findClosestTile();
      const newCenterId = found ? Number(found.tile.dataset.trackId) : null;

      if (newCenterId !== prevCenterIdRef.current) {
        if (prevCenterIdRef.current !== null) {
          const prev = tileRefs.current.get(prevCenterIdRef.current);
          if (prev) {
            prev.style.transform = 'scale(1)';
            prev.style.willChange = 'auto';
          }
        }
        if (found) {
          found.tile.style.transform = `scale(${CENTER_SCALE})`;
          found.tile.style.willChange = 'transform';
        }
        prevCenterIdRef.current = newCenterId;
      }
    };

    const settleOnCenter = () => {
      // Snap scroll position — single getBoundingClientRect on the closest tile only
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
          updateCenterTile();
          const settled = findClosestTile();
          if (!settled) return;
          const trackId = Number(settled.tile.dataset.trackId);
          const track = trackMapRef.current.get(trackId);
          // Only fire if the settled track is different from the one already playing.
          // This prevents restarting a track that was just started by a tap.
          if (track && track.id !== centerTrackRef.current?.id) {
            centerTrackRef.current = track;
            onClickRef.current(track);
          }
        },
      });
    };

    const handleScroll = () => {
      isScrollingRef.current = true;

      updateCenterTile();

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
        settleOnCenter();
      }, 150);
    };

    // Rebuild cached tile center Y positions on container resize (e.g. orientation change)
    const refreshTileCache = () => {
      tileRefs.current.forEach((tile, trackId) => {
        tileCenterYRef.current.set(trackId, tile.offsetTop + tile.offsetHeight / 2);
      });
    };

    const resizeObserver = new ResizeObserver(refreshTileCache);
    resizeObserver.observe(container);

    // Initial pass — scale and attempt to play the first centered tile.
    // On real iOS Safari this will be blocked (no gesture) — user must tap.
    // On desktop / DevTools mobile simulation it works normally.
    requestAnimationFrame(() => {
      updateCenterTile();
      const found = findClosestTile();
      if (found) {
        const trackId = Number(found.tile.dataset.trackId);
        const track = trackMapRef.current.get(trackId);
        if (track) {
          centerTrackRef.current = track;
          onClickRef.current(track);
        }
      }
    });

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      resizeObserver.disconnect();
    };
  }, [tracks]);

  const setTileRef = useCallback((el: HTMLDivElement | null, trackId: number) => {
    if (el) {
      tileRefs.current.set(trackId, el);
      tileCenterYRef.current.set(trackId, el.offsetTop + el.offsetHeight / 2);
    } else {
      tileRefs.current.delete(trackId);
      tileCenterYRef.current.delete(trackId);
    }
  }, []);

  const setDividerRef = useCallback((el: HTMLDivElement | null, genreKey: string) => {
    if (el) {
      genreDividerRefs.current.set(genreKey, el);
    } else {
      genreDividerRefs.current.delete(genreKey);
    }
  }, []);

  // Click a tile → call play synchronously (iOS gesture chain), then animate scroll
  const handleTileClick = useCallback((trackId: number) => {
    const container = containerRef.current;
    const tile = tileRefs.current.get(trackId);
    if (!container || !tile) return;

    // One-time iOS audio context unlock — must happen synchronously within user gesture.
    // Marks the parent document as "user-activated for audio" so that subsequent
    // postMessage-triggered plays in the cross-origin SC iframe are honoured.
    if (!audioUnlockedRef.current) {
      audioUnlockedRef.current = true;
      const sil = new Audio();
      sil.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      sil.play().catch(() => {});
    }

    // MUST call synchronously here to preserve iOS gesture chain
    const track = trackMapRef.current.get(trackId);
    if (track) {
      centerTrackRef.current = track;
      onClickRef.current(track);
    }

    // Animate scroll for visual effect only
    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    const tileRect = tile.getBoundingClientRect();
    const offset = tileRect.top + tileRect.height / 2 - centerY;

    gsap.to(container, {
      scrollTop: container.scrollTop + offset,
      duration: 0.3,
      ease: 'power2.out',
      onUpdate: () => {
        // Use cached positions — no getBoundingClientRect on tiles, only update 2 tiles max
        const containerCenterY = container.scrollTop + container.clientHeight / 2;
        let bestId: number | null = null;
        let bestDist = Infinity;
        tileCenterYRef.current.forEach((cy, id) => {
          const d = Math.abs(cy - containerCenterY);
          if (d < bestDist) { bestDist = d; bestId = id; }
        });
        if (bestId !== null && bestId !== prevCenterIdRef.current) {
          if (prevCenterIdRef.current !== null) {
            const prev = tileRefs.current.get(prevCenterIdRef.current);
            if (prev) { prev.style.transform = 'scale(1)'; prev.style.willChange = 'auto'; }
          }
          const next = tileRefs.current.get(bestId);
          if (next) { next.style.transform = 'scale(1.3)'; next.style.willChange = 'transform'; }
          prevCenterIdRef.current = bestId;
        }
      },
    });
  }, []);

  const handleScrollToGenre = useCallback((genreKey: string) => {
    const container = containerRef.current;
    if (!container) return;

    const divider = genreDividerRefs.current.get(genreKey);
    if (!divider) return;

    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    const dividerRect = divider.getBoundingClientRect();
    const offset = dividerRect.top - centerY + 40; // offset slightly below divider

    gsap.to(container, {
      scrollTop: container.scrollTop + offset,
      duration: 0.4,
      ease: 'power2.out',
    });
  }, []);

  if (orderedGroups.length === 0) {
    return <div className="mobile-scroll" />;
  }

  return (
    <>
      <div className="mobile-scroll" ref={containerRef}>
        <div className="mobile-scroll__inner">
          {orderedGroups.map((group, index) => (
            <MobileGenreSection
              key={group.genre}
              genreKey={group.genre}
              genre={group.displayLabel}
              tracks={group.tracks}
              index={index}
              setTileRef={setTileRef}
              setDividerRef={setDividerRef}
              onTileClick={handleTileClick}
            />
          ))}
        </div>
      </div>
      <AZScrollHelper
        activeLetters={activeLetters}
        letterToGenres={letterToGenres}
        containerRef={containerRef}
        onScrollToGenre={handleScrollToGenre}
      />
    </>
  );
}

interface MobileGenreSectionProps {
  genreKey: string;
  genre: string;
  tracks: Track[];
  index: number;
  setTileRef: (el: HTMLDivElement | null, trackId: number) => void;
  setDividerRef: (el: HTMLDivElement | null, genreKey: string) => void;
  onTileClick: (trackId: number) => void;
}

function MobileGenreSection({
  genreKey,
  genre,
  tracks,
  index,
  setTileRef,
  setDividerRef,
  onTileClick,
}: MobileGenreSectionProps) {
  return (
    <>
      <div
        className={`mobile-genre-divider ${index % 2 === 0 ? 'mobile-genre-divider--left' : 'mobile-genre-divider--right'}${index === 0 ? ' mobile-genre-divider--first' : ''}`}
        ref={(el) => setDividerRef(el, genreKey)}
      >
        <span className="mobile-genre-divider__label">{genre}</span>
        <span className="mobile-genre-divider__line" />
      </div>
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
              <img src={artworkUrl} alt="" draggable={false} />
            )}
          </div>
        );
      })}
    </>
  );
}

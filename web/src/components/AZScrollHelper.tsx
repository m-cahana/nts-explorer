import { useState, useEffect, useCallback } from 'react';
import './AZScrollHelper.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface AZScrollHelperProps {
  activeLetters: Set<string>;
  letterToGenres: Map<string, string[]>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScrollToGenre: (genreKey: string) => void;
}

export function AZScrollHelper({
  activeLetters,
  letterToGenres,
  containerRef,
  onScrollToGenre,
}: AZScrollHelperProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Track scroll progress
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateProgress = () => {
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (maxScroll <= 0) {
        setScrollProgress(0);
        return;
      }
      setScrollProgress(container.scrollTop / maxScroll);
    };

    updateProgress();
    container.addEventListener('scroll', updateProgress, { passive: true });
    return () => container.removeEventListener('scroll', updateProgress);
  }, [containerRef]);

  // Close on outside tap
  useEffect(() => {
    if (!expanded) return;

    const handleTap = () => {
      setExpanded(false);
      setActiveLetter(null);
    };
    document.addEventListener('pointerdown', handleTap);
    return () => document.removeEventListener('pointerdown', handleTap);
  }, [expanded]);

  const handleWidgetTap = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
    setActiveLetter(null);
  }, []);

  const handleLetterTap = useCallback(
    (e: React.PointerEvent, letter: string) => {
      e.stopPropagation();
      const genres = letterToGenres.get(letter);
      if (!genres) return;

      if (genres.length === 1) {
        // Single genre — scroll directly
        onScrollToGenre(genres[0]);
        setExpanded(false);
        setActiveLetter(null);
      } else {
        // Multiple genres — show submenu
        setActiveLetter((prev) => (prev === letter ? null : letter));
      }
    },
    [letterToGenres, onScrollToGenre],
  );

  const handleGenreTap = useCallback(
    (e: React.PointerEvent, genreKey: string) => {
      e.stopPropagation();
      onScrollToGenre(genreKey);
      setExpanded(false);
      setActiveLetter(null);
    },
    [onScrollToGenre],
  );

  const progressTop = `calc(${scrollProgress * 100}% - ${scrollProgress * 2}px)`;
  const activeGenres = activeLetter ? letterToGenres.get(activeLetter) ?? [] : [];

  return (
    <div
      className="az-helper"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {expanded ? (
        <div className="az-helper__expanded-row">
          <div className="az-helper__expanded" onPointerDown={(e) => e.stopPropagation()}>
            {LETTERS.map((letter) => {
              const active = activeLetters.has(letter);
              const isSelected = activeLetter === letter;
              return (
                <button
                  key={letter}
                  className={
                    `az-helper__letter-btn` +
                    (active ? '' : ' az-helper__letter-btn--dim') +
                    (isSelected ? ' az-helper__letter-btn--active' : '')
                  }
                  disabled={!active}
                  onPointerDown={(e) => active && handleLetterTap(e, letter)}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          {activeLetter && activeGenres.length > 1 && (
            <div
              className="az-helper__genre-list"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {activeGenres.map((genre) => (
                <button
                  key={genre}
                  className="az-helper__genre-btn"
                  onPointerDown={(e) => handleGenreTap(e, genre)}
                >
                  {genre}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div onPointerDown={handleWidgetTap}>
          <div className="az-helper__label">A-Z</div>
          <div className="az-helper__progress-box">
            <div
              className="az-helper__progress-line"
              style={{ top: progressTop }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import type { Track } from '../types';
import './MobileTopBar.css';

interface MobileTopBarProps {
  activeTrack: Track | null;
  previewTrack: Track | null;
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  isLoading: boolean;
  loadingProgress: number;
}

type BarPhase = 'hidden' | 'loading' | 'completing' | 'fading';

export function MobileTopBar({
  activeTrack,
  previewTrack,
  years,
  selectedYear,
  onYearChange,
  isLoading,
  loadingProgress,
}: MobileTopBarProps) {
  const track = previewTrack || activeTrack;
  const [barPhase, setBarPhase] = useState<BarPhase>('hidden');

  useEffect(() => {
    if (isLoading) {
      setBarPhase('loading');
      return;
    }

    setBarPhase((prev) => {
      if (prev === 'hidden') return 'hidden';
      return 'completing';
    });

    const fadingTimer = setTimeout(() => setBarPhase('fading'), 150);
    const hiddenTimer = setTimeout(() => setBarPhase('hidden'), 550);

    return () => {
      clearTimeout(fadingTimer);
      clearTimeout(hiddenTimer);
    };
  }, [isLoading]);

  return (
    <div className="mobile-top-bar">
      <div className="mobile-top-bar__left">
        {track && (
          <>
            <span className="mobile-top-bar__label">
              {previewTrack ? 'Previewing' : 'Now Playing'}
            </span>
            {track.nts_url ? (
              <a
                className="mobile-top-bar__title mobile-top-bar__title--link"
                href={track.nts_url}
                target="_blank"
                rel="noreferrer"
              >
                {track.title}
              </a>
            ) : (
              <span className="mobile-top-bar__title">{track.title}</span>
            )}
          </>
        )}
      </div>
      <div className="mobile-top-bar__right">
        {barPhase !== 'hidden' ? (
          <div className={`mobile-top-bar__bar${barPhase === 'fading' ? ' mobile-top-bar__bar--fading' : ''}`}>
            <div
              className="mobile-top-bar__bar__fill"
              style={{ height: barPhase === 'loading' ? `${loadingProgress}%` : '100%' }}
            />
          </div>
        ) : (
          years.map((year) => (
            <button
              key={year}
              className={`mobile-top-bar__year${year === selectedYear ? ' mobile-top-bar__year--selected' : ''}`}
              onClick={() => onYearChange(year)}
            >
              {year}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

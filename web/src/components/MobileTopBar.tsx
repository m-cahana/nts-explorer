import type { Track } from '../types';
import './MobileTopBar.css';

interface MobileTopBarProps {
  activeTrack: Track | null;
  previewTrack: Track | null;
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  isLoading: boolean;
}

export function MobileTopBar({
  activeTrack,
  previewTrack,
  years,
  selectedYear,
  onYearChange,
  isLoading,
}: MobileTopBarProps) {
  const track = previewTrack || activeTrack;

  return (
    <div className="mobile-top-bar">
      <div className="mobile-top-bar__left">
        {track && (
          <>
            <span className="mobile-top-bar__label">
              {previewTrack ? 'Previewing' : 'Now Playing'}
            </span>
            <span className="mobile-top-bar__title">{track.title}</span>
          </>
        )}
      </div>
      <div className="mobile-top-bar__right">
        {isLoading ? (
          <div className="mobile-top-bar__spinner" />
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

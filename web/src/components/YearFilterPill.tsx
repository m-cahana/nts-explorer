import { useState } from 'react';
import './YearFilterPill.css';

interface YearFilterPillProps {
  years: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  isLoading: boolean;
}

export function YearFilterPill({
  years,
  selectedYear,
  onYearChange,
  isLoading,
}: YearFilterPillProps) {
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const displayYear = hoveredYear ?? selectedYear;

  return (
    <div className="year-filter-pill">
      <div
        className={`year-filter-pill__tooltip ${
          hoveredYear ? '' : 'year-filter-pill__tooltip--active'
        }`}
      >
        {displayYear}
      </div>

      {isLoading ? (
        <div className="year-filter-pill__spinner" />
      ) : (
        <div className="year-filter-pill__bars">
          {years.map((year) => (
            <button
              key={year}
              className={`year-filter-pill__bar ${
                year === selectedYear ? 'year-filter-pill__bar--active' : ''
              }`}
              onClick={() => onYearChange(year)}
              onMouseEnter={() => setHoveredYear(year)}
              onMouseLeave={() => setHoveredYear(null)}
              aria-label={`Filter by year ${year}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MIN_YEAR = 2021;
const MAX_YEAR = new Date().getFullYear();

export function useAvailableYears() {
  const [years, setYears] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchYears() {
      // Check each year from MIN_YEAR to current year for data
      const potentialYears = [];
      for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
        potentialYears.push(y);
      }

      // Query each year in parallel to check if it has data
      const yearChecks = await Promise.all(
        potentialYears.map(async (year) => {
          const startDate = `${year}-01-01T00:00:00.000Z`;
          const endDate = `${year + 1}-01-01T00:00:00.000Z`;

          const { count } = await supabase
            .from('tracks')
            .select('*', { count: 'exact', head: true })
            .not('nts_broadcast', 'is', null)
            .gte('nts_broadcast', startDate)
            .lt('nts_broadcast', endDate);

          return { year, hasData: (count ?? 0) > 0 };
        })
      );

      const availableYears = yearChecks
        .filter((check) => check.hasData)
        .map((check) => check.year)
        .sort((a, b) => b - a); // Descending

      setYears(availableYears);
      setLoading(false);
    }
    fetchYears();
  }, []);

  return { years, loading };
}

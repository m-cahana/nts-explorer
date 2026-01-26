import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

const SAMPLE_SIZE = 1000;

export function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTracks() {
      try {
        setProgress(10);

        // Fetch a random sample using random ordering
        const { data, error: fetchError } = await supabase
          .from('tracks')
          .select('*')
          .eq('is_streamable', true)
          .limit(SAMPLE_SIZE);

        if (fetchError) throw fetchError;

        setProgress(80);

        if (!data || data.length === 0) {
          console.log('[useTracks] No tracks found');
          setLoading(false);
          return;
        }

        // Shuffle the results for random distribution
        const shuffled = data.sort(() => Math.random() - 0.5);

        console.log('[useTracks] Loaded tracks:', shuffled.length);

        setProgress(100);
        setTracks(shuffled);
        setLoading(false);
      } catch (err) {
        console.error('[useTracks] Error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch tracks');
        setLoading(false);
      }
    }

    fetchTracks();
  }, []);

  return { tracks, loading, progress, error };
}

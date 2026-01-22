import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

const PAGE_SIZE = 1000;

export function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAllTracks() {
      try {
        // First get total count
        const { count, error: countError } = await supabase
          .from('tracks')
          .select('*', { count: 'exact', head: true })
          .eq('is_streamable', true);

        if (countError) throw countError;
        const totalCount = count || 0;

        const allTracks: Track[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('tracks')
            .select('id, soundcloud_id, title, permalink_url, artwork_url, duration_ms, genre_tags, play_count, is_streamable')
            .eq('is_streamable', true)
            .order('id', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allTracks.push(...(data as Track[]));
            from += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
            // Update progress
            const currentProgress = Math.min(100, Math.round((allTracks.length / totalCount) * 100));
            setProgress(currentProgress);
          } else {
            hasMore = false;
          }
        }

        setProgress(100);
        setTracks(allTracks);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tracks');
      } finally {
        setLoading(false);
      }
    }

    fetchAllTracks();
  }, []);

  return { tracks, loading, progress, error };
}

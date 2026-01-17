import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

export function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTracks() {
      try {
        const { data, error } = await supabase
          .from('tracks')
          .select('id, soundcloud_id, title, permalink_url, artwork_url, duration_ms, genre_tags, is_streamable')
          .eq('is_streamable', true)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTracks(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tracks');
      } finally {
        setLoading(false);
      }
    }

    fetchTracks();
  }, []);

  return { tracks, loading, error };
}

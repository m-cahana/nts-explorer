import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Track } from '../types';

const PAGE_SIZE = 1000;

interface NtsEpisode {
  id: number;
  episode_alias: string;
  show_name: string | null;
  name: string | null;
  soundcloud_url: string | null;
  picture_url: string | null;
  genres: string[] | null;
  moods: string[] | null;
  location_short: string | null;
}

export function useTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAllTracks() {
      try {
        const allTracks: Track[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('nts_episodes')
            .select('id, episode_alias, show_name, name, soundcloud_url, picture_url, genres, moods, location_short')
            .not('soundcloud_url', 'is', null)
            .order('id', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            // Map NTS fields to Track interface
            const mapped: Track[] = (data as NtsEpisode[]).map(ep => ({
              id: ep.id,
              episode_alias: ep.episode_alias,
              show_name: ep.show_name,
              title: ep.name || 'Untitled',
              permalink_url: ep.soundcloud_url!,
              artwork_url: ep.picture_url,
              genres: ep.genres,
              moods: ep.moods,
              location_short: ep.location_short,
            }));
            allTracks.push(...mapped);
            from += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
          } else {
            hasMore = false;
          }
        }

        setTracks(allTracks);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch tracks');
      } finally {
        setLoading(false);
      }
    }

    fetchAllTracks();
  }, []);

  return { tracks, loading, error };
}

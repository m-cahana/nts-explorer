import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Track } from "../types";

const PAGE_SIZE = 1000;

// Set to a number to randomly sample up to that many tracks, or null to fetch all
const SAMPLE_SIZE: number | null = 6000;

export function useTracks(year?: number) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setTracks([]);
    setProgress(0);

    // Simulate smooth progress: ease toward 90%, never reaching it on its own
    const interval = setInterval(() => {
      setProgress((prev) => prev + (90 - prev) * 0.06);
    }, 80);

    async function fetchTracks() {
      try {
        const allTracks: Track[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from("tracks")
            .select("*")
            .eq("is_streamable", true)
            .range(from, from + PAGE_SIZE - 1);

          if (year) {
            const startDate = `${year}-01-01T00:00:00.000Z`;
            const endDate = `${year + 1}-01-01T00:00:00.000Z`;
            query = query
              .not("nts_broadcast", "is", null)
              .gte("nts_broadcast", startDate)
              .lt("nts_broadcast", endDate);
          }

          const { data, error: fetchError } = await query;

          if (fetchError) throw fetchError;

          if (data && data.length > 0) {
            allTracks.push(...data);
            from += PAGE_SIZE;
          }

          hasMore = data !== null && data.length === PAGE_SIZE;
        }

        if (allTracks.length === 0) {
          console.log("[useTracks] No tracks found");
          clearInterval(interval);
          setProgress(100);
          setLoading(false);
          return;
        }

        // Shuffle the results for random distribution
        const shuffled = allTracks.sort(() => Math.random() - 0.5);

        // If SAMPLE_SIZE is set, take only that many tracks
        const finalTracks = SAMPLE_SIZE
          ? shuffled.slice(0, SAMPLE_SIZE)
          : shuffled;

        console.log("[useTracks] Loaded tracks:", finalTracks.length);

        clearInterval(interval);
        setProgress(100);
        setTracks(finalTracks);
        setLoading(false);
      } catch (err) {
        console.error("[useTracks] Error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch tracks");
        clearInterval(interval);
        setLoading(false);
      }
    }

    fetchTracks();

    return () => clearInterval(interval);
  }, [year]);

  return { tracks, loading, progress, error };
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTracks } from '../hooks/useTracks';
import { Dot } from './Dot';
import { SoundCloudPlayer } from './SoundCloudPlayer';
import type { SoundCloudPlayerHandle } from './SoundCloudPlayer';
import type { Track, DotPosition } from '../types';

const PREVIEW_SEEK_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

// Seeded random for consistent positions across renders
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generatePositions(tracks: Track[]): Map<number, DotPosition> {
  const positions = new Map<number, DotPosition>();

  tracks.forEach((track, index) => {
    // Use track.id as seed for consistent positioning
    const seed = track.id;
    positions.set(track.id, {
      id: track.id,
      x: seededRandom(seed) * 90 + 5,      // 5-95% to avoid edges
      y: seededRandom(seed * 2) * 90 + 5,  // 5-95%
    });
  });

  return positions;
}

export function DotsVisualization() {
  const { tracks, loading, error } = useTracks();
  const [activeTrackId, setActiveTrackId] = useState<number | null>(null);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<number | null>(null);
  const playerRef = useRef<SoundCloudPlayerHandle>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  // Generate random positions for each dot (memoized)
  const positions = useMemo(() => generatePositions(tracks), [tracks]);

  // Get track by ID
  const getTrack = useCallback((id: number): Track | undefined => {
    return tracks.find(t => t.id === id);
  }, [tracks]);

  // Play a track (optionally seek to a position)
  const playTrack = useCallback((trackId: number, seekToMs?: number) => {
    const track = getTrack(trackId);
    if (track && playerRef.current) {
      playerRef.current.loadTrack(track.permalink_url, seekToMs);
      setCurrentlyPlayingId(trackId);
    }
  }, [getTrack]);

  // Select a random track on first load
  useEffect(() => {
    if (tracks.length > 0 && activeTrackId === null) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomIndex];
      setActiveTrackId(randomTrack.id);
      // Small delay to ensure widget is ready
      setTimeout(() => playTrack(randomTrack.id), 500);
    }
  }, [tracks, activeTrackId, playTrack]);

  // Handle hover start (with 200ms debounce)
  const handleHoverStart = useCallback((trackId: number) => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Don't preview if it's already the active track
    if (trackId === activeTrackId) return;

    // Set timeout to play preview (seek 5 min in to skip intro)
    hoverTimeoutRef.current = window.setTimeout(() => {
      playTrack(trackId, PREVIEW_SEEK_MS);
    }, 0);
  }, [activeTrackId, playTrack]);

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
    // Clear the timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Resume active track if we were previewing something else
    if (activeTrackId && currentlyPlayingId !== activeTrackId) {
      playTrack(activeTrackId);
    }
  }, [activeTrackId, currentlyPlayingId, playTrack]);

  // Handle click - set as new active track
  const handleClick = useCallback((trackId: number) => {
    // Clear any hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    setActiveTrackId(trackId);
    playTrack(trackId);
  }, [playTrack]);

  // Handle track end - play next random track
  const handleTrackEnd = useCallback(() => {
    if (tracks.length > 0) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomIndex];
      setActiveTrackId(randomTrack.id);
      playTrack(randomTrack.id);
    }
  }, [tracks, playTrack]);

  // Get current track info for display
  const activeTrack = activeTrackId ? getTrack(activeTrackId) : null;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: '#666'
      }}>
        Loading tracks...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: '#ff0000'
      }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      backgroundColor: '#f5f5f5',
      overflow: 'hidden'
    }}>
      {/* Hidden SoundCloud Player */}
      <SoundCloudPlayer ref={playerRef} onTrackEnd={handleTrackEnd} />

      {/* Dots */}
      {tracks.map(track => {
        const pos = positions.get(track.id);
        if (!pos) return null;

        return (
          <Dot
            key={track.id}
            x={pos.x}
            y={pos.y}
            isActive={track.id === activeTrackId}
            onMouseEnter={() => handleHoverStart(track.id)}
            onMouseLeave={handleHoverEnd}
            onClick={() => handleClick(track.id)}
          />
        );
      })}

      {/* Track info overlay */}
      {activeTrack && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          maxWidth: '400px',
          fontSize: '14px',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            Now Playing
          </div>
          <div style={{ opacity: 0.9 }}>
            {activeTrack.title}
          </div>
        </div>
      )}

      {/* Track count */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '4px',
        fontSize: '12px',
      }}>
        {tracks.length} tracks
      </div>
    </div>
  );
}

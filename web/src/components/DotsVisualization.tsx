import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTracks } from '../hooks/useTracks';
import { Dot } from './Dot';
import { SoundCloudPlayer } from './SoundCloudPlayer';
import type { SoundCloudPlayerHandle } from './SoundCloudPlayer';
import type { Track, DotPosition } from '../types';

const PREVIEW_SEEK_MS = 5 * 60 * 1000; // 5 minutes in milliseconds

// Format milliseconds as m:ss or h:mm:ss
function formatTime(ms: number, forceHours: boolean = false): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0 || forceHours) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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
  const [previewTrackId, setPreviewTrackId] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [savedPosition, setSavedPosition] = useState(0);
  const [isMainPlayerReady, setIsMainPlayerReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const mainPlayerRef = useRef<SoundCloudPlayerHandle>(null);
  const previewPlayerRef = useRef<SoundCloudPlayerHandle>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const positionIntervalRef = useRef<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Generate random positions for each dot (memoized)
  const positions = useMemo(() => generatePositions(tracks), [tracks]);

  // Get track by ID
  const getTrack = useCallback((id: number): Track | undefined => {
    return tracks.find(t => t.id === id);
  }, [tracks]);

  // Play a track on main player
  const playMainTrack = useCallback((trackId: number, seekToMs?: number) => {
    const track = getTrack(trackId);
    if (track && mainPlayerRef.current) {
      mainPlayerRef.current.loadTrack(track.permalink_url, seekToMs);
      setIsPaused(false);
      setCurrentPosition(seekToMs || 0);
    }
  }, [getTrack]);

  // Play a track on preview player
  const playPreviewTrack = useCallback((trackId: number, seekToMs?: number) => {
    const track = getTrack(trackId);
    if (track && previewPlayerRef.current) {
      previewPlayerRef.current.loadTrack(track.permalink_url, seekToMs);
    }
  }, [getTrack]);

  // Poll position every 500ms when playing
  useEffect(() => {
    if (isPaused || !activeTrackId) {
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
        positionIntervalRef.current = null;
      }
      return;
    }

    // Poll the appropriate player based on whether we're previewing
    const player = previewTrackId ? previewPlayerRef.current : mainPlayerRef.current;

    positionIntervalRef.current = window.setInterval(() => {
      if (player) {
        player.getPosition((pos) => {
          setCurrentPosition(pos);
        });
      }
    }, 500);

    return () => {
      if (positionIntervalRef.current) {
        clearInterval(positionIntervalRef.current);
        positionIntervalRef.current = null;
      }
    };
  }, [isPaused, activeTrackId, previewTrackId]);

  // Select a random track on first load (wait for main player to be ready)
  useEffect(() => {
    if (tracks.length > 0 && activeTrackId === null && isMainPlayerReady) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomIndex];
      setActiveTrackId(randomTrack.id);
      playMainTrack(randomTrack.id);
    }
  }, [tracks, activeTrackId, isMainPlayerReady, playMainTrack]);

  // Handle hover start (with 100ms debounce to prevent race with click)
  const handleHoverStart = useCallback((trackId: number) => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Don't preview if it's already the active track
    if (trackId === activeTrackId) return;

    // Set timeout to play preview
    hoverTimeoutRef.current = window.setTimeout(() => {
      // Save current position from main player before switching
      if (mainPlayerRef.current) {
        mainPlayerRef.current.getPosition((pos) => {
          setSavedPosition(pos);
        });
        // Pause main player
        mainPlayerRef.current.pause();
      }

      setPreviewTrackId(trackId);
      // Play preview on separate player (seek 5 min in to skip intro)
      playPreviewTrack(trackId, PREVIEW_SEEK_MS);
    }, 100);
  }, [activeTrackId, playPreviewTrack]);

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
    // Clear the timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // If we were previewing, stop preview and resume main
    if (previewTrackId !== null) {
      // Pause preview player
      if (previewPlayerRef.current) {
        previewPlayerRef.current.pause();
      }

      // Resume main player at saved position (track is still loaded!)
      if (mainPlayerRef.current && !isPaused) {
        mainPlayerRef.current.seekTo(savedPosition);
        mainPlayerRef.current.play();
      }

      // Restore position display
      setCurrentPosition(savedPosition);
    }

    // Clear preview state
    setPreviewTrackId(null);
  }, [previewTrackId, savedPosition, isPaused]);

  // Handle click - set as new active track
  const handleClick = useCallback((trackId: number) => {
    // Clear any hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Pause preview player if it was playing
    if (previewPlayerRef.current) {
      previewPlayerRef.current.pause();
    }

    // Clear preview state since we're making this the active track
    setPreviewTrackId(null);
    setActiveTrackId(trackId);
    // Load and play on main player from start
    playMainTrack(trackId);
  }, [playMainTrack]);

  // Handle track end - play next random track
  const handleTrackEnd = useCallback(() => {
    if (tracks.length > 0) {
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomIndex];
      setActiveTrackId(randomTrack.id);
      playMainTrack(randomTrack.id);
    }
  }, [tracks, playMainTrack]);

  // Toggle pause/play
  const togglePause = useCallback(() => {
    // Use appropriate player based on whether we're previewing
    const player = previewTrackId ? previewPlayerRef.current : mainPlayerRef.current;
    if (!player) return;

    if (isPaused) {
      player.play();
      setIsPaused(false);
    } else {
      player.pause();
      setIsPaused(true);
    }
  }, [isPaused, previewTrackId]);

  // Seek to position
  const handleSeek = useCallback((ms: number) => {
    const player = previewTrackId ? previewPlayerRef.current : mainPlayerRef.current;
    if (player) {
      player.seekTo(ms);
      setCurrentPosition(ms);
    }
  }, [previewTrackId]);

  // Get current track info for display
  const activeTrack = activeTrackId ? getTrack(activeTrackId) : null;
  const previewTrack = previewTrackId ? getTrack(previewTrackId) : null;
  const isPreviewingDifferentTrack = previewTrackId !== null && previewTrackId !== activeTrackId;
  const displayTrack = isPreviewingDifferentTrack ? previewTrack : activeTrack;

  // Calculate position from mouse event
  const getPositionFromMouse = useCallback((clientX: number): number => {
    if (!progressBarRef.current || !activeTrack?.duration_ms) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.floor(percentage * activeTrack.duration_ms);
  }, [activeTrack]);

  // Mouse move and mouse up handlers (attached to window during drag)
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragPosition(getPositionFromMouse(e.clientX));
    };

    const handleMouseUp = (e: MouseEvent) => {
      const finalPosition = getPositionFromMouse(e.clientX);
      handleSeek(finalPosition);
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, getPositionFromMouse, handleSeek]);

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
      {/* Hidden SoundCloud Players - Main and Preview */}
      <SoundCloudPlayer
        id="main-player"
        ref={mainPlayerRef}
        onTrackEnd={handleTrackEnd}
        onReady={() => setIsMainPlayerReady(true)}
      />
      <SoundCloudPlayer
        id="preview-player"
        ref={previewPlayerRef}
      />

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
      {displayTrack && (
        <div style={{
          position: 'fixed',
          bottom: '90px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '8px',
          maxWidth: '400px',
          fontSize: '14px',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {isPreviewingDifferentTrack ? 'Previewing' : 'Now Playing'}
          </div>
          <div style={{ opacity: 0.9 }}>
            {displayTrack.title}
          </div>
        </div>
      )}

      {/* Playback controls pill */}
      {activeTrack && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '10px 16px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '13px',
          fontFamily: 'monospace',
        }}>
          {/* Play/Pause button */}
          <button
            onClick={togglePause}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            {isPaused ? '▶' : '⏸'}
          </button>

          {/* Current time */}
          <span style={{ minWidth: '55px' }}>
            {formatTime(isDragging ? dragPosition : currentPosition)}
          </span>

          {/* Progress bar */}
          <div
            ref={progressBarRef}
            style={{
              width: '200px',
              height: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.3)',
              borderRadius: '3px',
              cursor: 'pointer',
              position: 'relative',
            }}
            onMouseDown={(e) => {
              // Allow clicking anywhere on bar to seek
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const percentage = clickX / rect.width;
              const duration = activeTrack.duration_ms || 0;
              const newPos = Math.floor(percentage * duration);
              setDragPosition(newPos);
              setIsDragging(true);
            }}
          >
            {/* Filled portion */}
            <div
              style={{
                width: `${activeTrack.duration_ms ? ((isDragging ? dragPosition : currentPosition) / activeTrack.duration_ms) * 100 : 0}%`,
                height: '100%',
                backgroundColor: 'white',
                borderRadius: '3px',
                pointerEvents: 'none',
              }}
            />
            {/* Draggable dot */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: `${activeTrack.duration_ms ? ((isDragging ? dragPosition : currentPosition) / activeTrack.duration_ms) * 100 : 0}%`,
                transform: 'translate(-50%, -50%)',
                width: isDragging ? '14px' : '12px',
                height: isDragging ? '14px' : '12px',
                backgroundColor: 'white',
                borderRadius: '50%',
                cursor: 'grab',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transition: isDragging ? 'none' : 'left 0.1s linear',
                pointerEvents: 'none',
              }}
            />
          </div>

          {/* Total duration */}
          <span style={{ minWidth: '55px', opacity: 0.7 }}>
            {formatTime(activeTrack.duration_ms || 0)}
          </span>
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

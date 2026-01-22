import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTracks } from '../hooks/useTracks';
import { ReactTileCloud } from './ReactTileCloud';
import { SoundCloudPlayer } from './SoundCloudPlayer';
import type { SoundCloudPlayerHandle } from './SoundCloudPlayer';
import type { Track } from '../types';

const PREVIEW_SEEK_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
const STORAGE_KEY = 'nts-explorer-playback';
const SAVE_INTERVAL_MS = 5000; // Save every 5 seconds

interface PersistedPlayback {
  trackId: number;
  position: number;
  timestamp: number;
}

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

export function DotsVisualization() {
  const { tracks, loading, progress, error } = useTracks();
  const [activeTrackId, setActiveTrackId] = useState<number | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(true); // Start paused (browser blocks autoplay)
  const [currentPosition, setCurrentPosition] = useState(0);
  const [savedPosition, setSavedPosition] = useState(0);
  const [isMainPlayerReady, setIsMainPlayerReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false); // Triggers fade-in of welcome text
  const [isExiting, setIsExiting] = useState(false); // Triggers fade-out of overlay
  const mainPlayerRef = useRef<SoundCloudPlayerHandle>(null);
  const previewPlayerRef = useRef<SoundCloudPlayerHandle>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const currentPositionRef = useRef(0); // For synchronous access to position

  // Filter to random subset of 4k tracks for performance
  const filteredTracks = useMemo(() => {
    if (tracks.length <= 4000) return tracks;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4000);
  }, [tracks]);

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
      setTrackDuration(0); // Reset until we get the new duration via onLoad
    }
  }, [getTrack]);

  // Play a track on preview player
  const playPreviewTrack = useCallback((trackId: number, seekToMs?: number) => {
    const track = getTrack(trackId);
    if (track && previewPlayerRef.current) {
      previewPlayerRef.current.loadTrack(track.permalink_url, seekToMs);
    }
  }, [getTrack]);

  // Handle progress updates from main player (event-based, not polling)
  const handleMainProgress = useCallback((position: number) => {
    // Only update if we're not previewing a different track
    if (previewTrackId === null) {
      setCurrentPosition(position);
      currentPositionRef.current = position;
    }
  }, [previewTrackId]);

  // Handle progress updates from preview player
  const handlePreviewProgress = useCallback((position: number) => {
    // Only update if we're actively previewing
    if (previewTrackId !== null) {
      setCurrentPosition(position);
    }
  }, [previewTrackId]);

  // Restore from localStorage or select random track on first load
  useEffect(() => {
    if (tracks.length > 0 && activeTrackId === null && isMainPlayerReady) {
      // Try to restore from localStorage
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const persisted: PersistedPlayback = JSON.parse(stored);
          // Check if not stale (24 hours)
          const isStale = Date.now() - persisted.timestamp > 24 * 60 * 60 * 1000;
          const track = tracks.find(t => t.id === persisted.trackId);

          if (!isStale && track) {
            setActiveTrackId(persisted.trackId);
            setCurrentPosition(persisted.position);
            currentPositionRef.current = persisted.position;
            if (mainPlayerRef.current) {
              mainPlayerRef.current.loadTrack(track.permalink_url, persisted.position);
            }
            return;
          }
        }
      } catch {
        // Ignore localStorage errors
      }

      // No valid persisted state, select random track
      const randomIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomIndex];
      setActiveTrackId(randomTrack.id);
      if (mainPlayerRef.current) {
        mainPlayerRef.current.loadTrack(randomTrack.permalink_url);
      }
    }
  }, [tracks, activeTrackId, isMainPlayerReady]);

  // Save playback state to localStorage periodically
  useEffect(() => {
    if (!activeTrackId || isPaused || !hasUserInteracted) return;

    const saveState = () => {
      const state: PersistedPlayback = {
        trackId: activeTrackId,
        position: currentPositionRef.current,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore localStorage errors
      }
    };

    // Save immediately on track change
    saveState();

    // Then save periodically
    const interval = setInterval(saveState, SAVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeTrackId, isPaused, hasUserInteracted]);

  // Trigger welcome text fade-in when loading completes and track is ready
  useEffect(() => {
    if (!loading && isMainPlayerReady && activeTrackId !== null && !showWelcome) {
      // Small delay before showing welcome text for smooth transition
      const timer = setTimeout(() => setShowWelcome(true), 300);
      return () => clearTimeout(timer);
    }
  }, [loading, isMainPlayerReady, activeTrackId, showWelcome]);

  // Handle user clicking the welcome overlay to start playback
  const handleStartPlayback = useCallback(() => {
    if (!showWelcome) return; // Don't allow click during loading
    setIsExiting(true);
    // Wait for fade-out animation before showing main content
    setTimeout(() => {
      setHasUserInteracted(true);
      if (mainPlayerRef.current) {
        mainPlayerRef.current.play();
        setIsPaused(false);
      }
    }, 500);
  }, [showWelcome]);

  // Handle hover start - instant preview, no delay
  const handleHoverStart = useCallback((trackId: number) => {
    // Don't preview if it's already the active track
    if (trackId === activeTrackId) return;

    // Save current position synchronously from ref (no async callback race)
    setSavedPosition(currentPositionRef.current);

    // Pause main player
    if (mainPlayerRef.current) {
      mainPlayerRef.current.pause();
    }

    setPreviewTrackId(trackId);
    // Play preview on separate player (seek 5 min in to skip intro)
    playPreviewTrack(trackId, PREVIEW_SEEK_MS);
  }, [activeTrackId, playPreviewTrack]);

  // Handle hover end
  const handleHoverEnd = useCallback(() => {
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
    if (!progressBarRef.current || !trackDuration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.floor(percentage * trackDuration);
  }, [trackDuration]);

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

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        color: '#ff0000',
        backgroundColor: 'white',
      }}>
        Error: {error}
      </div>
    );
  }

  // Determine if we should show the overlay (loading or waiting for interaction)
  const showOverlay = !hasUserInteracted;

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
        onLoad={(duration) => setTrackDuration(duration)}
        onProgress={handleMainProgress}
      />
      <SoundCloudPlayer
        id="preview-player"
        ref={previewPlayerRef}
        onProgress={handlePreviewProgress}
      />

      {/* Centered Canvas Area */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '80vw',
        height: '80vh',
        overflow: 'hidden',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
        opacity: hasUserInteracted ? 1 : 0,
        transition: 'opacity 0.5s ease-in',
        transitionDelay: hasUserInteracted ? '0.3s' : '0s',
      }}>
        <ReactTileCloud
          tracks={filteredTracks}
          activeTrackId={activeTrackId}
          onHoverStart={handleHoverStart}
          onHoverEnd={handleHoverEnd}
          onClick={handleClick}
        />
      </div>

      {/* Track info overlay - right aligned */}
      {displayTrack && hasUserInteracted && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '10px 16px',
          borderRadius: '8px',
          maxWidth: '400px',
          fontSize: '13px',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
            {isPreviewingDifferentTrack ? 'Previewing' : 'Now Playing'}
          </div>
          <div style={{ opacity: 0.9 }}>
            {displayTrack.title}
          </div>
        </div>
      )}

      {/* Playback controls pill */}
      {activeTrack && hasUserInteracted && (
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
              const newPos = Math.floor(percentage * trackDuration);
              setDragPosition(newPos);
              setIsDragging(true);
            }}
          >
            {/* Filled portion */}
            <div
              style={{
                width: `${trackDuration ? ((isDragging ? dragPosition : currentPosition) / trackDuration) * 100 : 0}%`,
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
                left: `${trackDuration ? ((isDragging ? dragPosition : currentPosition) / trackDuration) * 100 : 0}%`,
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
            {trackDuration ? formatTime(trackDuration) : '--:--'}
          </span>
        </div>
      )}

      {/* Track count */}
      {hasUserInteracted && (
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
          {filteredTracks.length} tracks
        </div>
      )}

      {/* Unified loading/welcome overlay */}
      {showOverlay && (
        <div
          onClick={handleStartPlayback}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'white',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: showWelcome ? 'pointer' : 'default',
            zIndex: 1000,
            opacity: isExiting ? 0 : 1,
            transition: 'opacity 0.5s ease-out',
          }}
        >
          {/* Loading percentage */}
          <div style={{
            opacity: showWelcome ? 0 : 1,
            transition: 'opacity 0.3s ease-out',
            position: 'absolute',
          }}>
            <span style={{
              color: '#000',
              fontSize: '48px',
              fontWeight: 200,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '-2px',
            }}>
              {progress}%
            </span>
          </div>

          {/* Welcome text */}
          <div style={{
            opacity: showWelcome ? 1 : 0,
            transition: 'opacity 0.5s ease-in',
            transitionDelay: showWelcome ? '0.2s' : '0s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <h1 style={{
              color: '#000',
              fontSize: '48px',
              fontWeight: 200,
              marginBottom: '16px',
              letterSpacing: '-1px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}>
              NTS Explorer
            </h1>
            <p style={{
              color: 'rgba(0, 0, 0, 0.5)',
              fontSize: '16px',
              fontWeight: 400,
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}>
              Click anywhere to explore
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

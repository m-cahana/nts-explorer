import { useState, useRef, useCallback, useEffect } from 'react';
import { useTracks } from './hooks/useTracks';
import { useAvailableYears } from './hooks/useAvailableYears';
import { useIsMobile } from './hooks/useIsMobile';
import { LoadingScreen } from './components/LoadingScreen';
import { GenreLines } from './components/GenreLines';
import { MobileTopBar } from './components/MobileTopBar';
import { MobileGenreScroll } from './components/MobileGenreScroll';
import { SoundCloudPlayer } from './components/SoundCloudPlayer';
import { BottomBar } from './components/BottomBar';
import type { Track, SoundCloudPlayerHandle } from './types';

const PREVIEW_START_MS = 300000; // 5 minutes
const DEFAULT_YEAR = 2025;

function App() {
  const isMobile = useIsMobile();
  const [selectedYear, setSelectedYear] = useState(DEFAULT_YEAR);
  const { years, loading: yearsLoading } = useAvailableYears();
  const { tracks, loading, progress, error } = useTracks(selectedYear);
  const [hasEntered, setHasEntered] = useState(false);

  // Audio state
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPaused, setIsPaused] = useState(true);

  // Player refs
  const mainPlayerRef = useRef<SoundCloudPlayerHandle>(null);
  const previewPlayerRef = useRef<SoundCloudPlayerHandle>(null);

  // Ref to track activeTrack without causing callback recreation
  const activeTrackRef = useRef(activeTrack);
  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);
  const savedPositionRef = useRef(0);

  const handleEnter = useCallback(() => {
    setHasEntered(true);
  }, []);

  const handleProgress = useCallback((pos: number, dur: number) => {
    setPosition(pos);
    setDuration(dur);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPaused(false);
  }, []);

  const handlePause = useCallback(() => {
    setIsPaused(true);
  }, []);

  const handleHover = useCallback((track: Track) => {
    // Save current position and pause main player
    if (mainPlayerRef.current) {
      savedPositionRef.current = mainPlayerRef.current.getPosition();
      mainPlayerRef.current.pause();
    }

    // Load and play preview at 5 minute mark
    setPreviewTrack(track);
    if (previewPlayerRef.current) {
      previewPlayerRef.current.loadTrack(track.permalink_url, PREVIEW_START_MS);
    }
  }, []);

  const handleHoverEnd = useCallback(() => {
    // Stop preview
    if (previewPlayerRef.current) {
      previewPlayerRef.current.pause();
    }
    setPreviewTrack(null);

    // Resume main player
    if (activeTrackRef.current && mainPlayerRef.current) {
      mainPlayerRef.current.play();
    }
  }, []);

  const handleClick = useCallback((track: Track) => {
    console.log('[App] handleClick called for track:', track.id, track.title);

    // Stop preview if any
    if (previewPlayerRef.current) {
      previewPlayerRef.current.pause();
    }
    setPreviewTrack(null);

    // Play from beginning
    setActiveTrack(track);
    if (mainPlayerRef.current) {
      mainPlayerRef.current.loadTrack(track.permalink_url, 0);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (!mainPlayerRef.current) return;

    if (isPaused) {
      mainPlayerRef.current.play();
    } else {
      mainPlayerRef.current.pause();
    }
  }, [isPaused]);

  const handleSeek = useCallback((positionMs: number) => {
    if (mainPlayerRef.current) {
      mainPlayerRef.current.seekTo(positionMs);
    }
  }, []);

  const handleYearChange = useCallback((year: number) => {
    // Stop audio playback
    if (mainPlayerRef.current) {
      mainPlayerRef.current.pause();
    }
    if (previewPlayerRef.current) {
      previewPlayerRef.current.pause();
    }

    // Clear active/preview track
    setActiveTrack(null);
    setPreviewTrack(null);

    // Update selected year (triggers re-fetch)
    setSelectedYear(year);
  }, []);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#666'
      }}>
        Error: {error}
      </div>
    );
  }

  return (
    <>
      <LoadingScreen
        loading={loading}
        progress={progress}
        trackCount={tracks.length}
        onEnter={handleEnter}
      />

      {hasEntered && (
        <>
          {isMobile ? (
            <>
              <MobileTopBar
                activeTrack={activeTrack}
                previewTrack={previewTrack}
                years={years}
                selectedYear={selectedYear}
                onYearChange={handleYearChange}
                isLoading={loading || yearsLoading}
              />
              <MobileGenreScroll
                tracks={tracks}
                onHover={handleHover}
                onHoverEnd={handleHoverEnd}
                onClick={handleClick}
              />
            </>
          ) : (
            <GenreLines
              tracks={tracks}
              activeTrack={activeTrack}
              previewTrack={previewTrack}
              onHover={handleHover}
              onHoverEnd={handleHoverEnd}
              onClick={handleClick}
            />
          )}

          <SoundCloudPlayer
            ref={mainPlayerRef}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
          />

          <SoundCloudPlayer
            ref={previewPlayerRef}
            onProgress={handleProgress}
            onPlay={handlePlay}
            onPause={handlePause}
          />

          <BottomBar
            activeTrack={activeTrack}
            previewTrack={previewTrack}
            years={years}
            selectedYear={selectedYear}
            onYearChange={handleYearChange}
            isLoading={loading || yearsLoading}
            position={position}
            duration={duration}
            isPaused={isPaused}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
          />
        </>
      )}
    </>
  );
}

export default App;

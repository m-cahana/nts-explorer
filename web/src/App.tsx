import { useState, useRef, useCallback, useEffect } from "react";
import { useTracks } from "./hooks/useTracks";
import { useAvailableYears } from "./hooks/useAvailableYears";
import { useIsMobile } from "./hooks/useIsMobile";
import { LoadingScreen } from "./components/LoadingScreen";
import { GenreLines } from "./components/GenreLines";
import type { GenreLinesHandle } from "./components/GenreLines";
import { MobileTopBar } from "./components/MobileTopBar";
import { MobileGenreScroll } from "./components/MobileGenreScroll";
import { SoundCloudPlayer } from "./components/SoundCloudPlayer";
import { BottomBar } from "./components/BottomBar";
import type { Track, SoundCloudPlayerHandle } from "./types";
import { Analytics } from "@vercel/analytics/react";

const PREVIEW_START_MS = 300000; // 5 minutes
const DEFAULT_YEAR = 2026;

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
  const genreLinesRef = useRef<GenreLinesHandle>(null);

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
    console.log("[App] handleClick called for track:", track.id, track.title);

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
    if (previewTrack) {
      if (!previewPlayerRef.current) return;
      if (isPaused) {
        previewPlayerRef.current.play();
      } else {
        previewPlayerRef.current.pause();
      }
      return;
    }
    if (!mainPlayerRef.current) return;
    if (isPaused) {
      mainPlayerRef.current.play();
    } else {
      mainPlayerRef.current.pause();
    }
  }, [isPaused, previewTrack]);

  const handlePlayPauseRef = useRef(handlePlayPause);
  useEffect(() => { handlePlayPauseRef.current = handlePlayPause; }, [handlePlayPause]);

  const handleSeek = useCallback((positionMs: number) => {
    if (mainPlayerRef.current) {
      mainPlayerRef.current.seekTo(positionMs);
    }
  }, []);

  const handleArtworkClick = useCallback((track: Track) => {
    if (genreLinesRef.current) {
      genreLinesRef.current.expandGenreForTrack(track);
    }
  }, []);

  // Media Session API — metadata
  useEffect(() => {
    if (!('mediaSession' in navigator) || !activeTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: activeTrack.title,
      artist: 'NTS Radio',
      album: activeTrack.nts_show_alias ?? undefined,
      artwork: activeTrack.artwork_url
        ? [
            { src: activeTrack.artwork_url.replace(/-large\./, '-t300x300.').replace(/-t\d+x\d+\./, '-t300x300.'), sizes: '300x300', type: 'image/jpeg' },
            { src: activeTrack.artwork_url.replace(/-large\./, '-t500x500.').replace(/-t\d+x\d+\./, '-t500x500.'), sizes: '500x500', type: 'image/jpeg' },
          ]
        : [],
    });
  }, [activeTrack]);

  // Media Session API — playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPaused ? 'paused' : 'playing';
  }, [isPaused]);

  // Media Session API — position state
  useEffect(() => {
    if (!('mediaSession' in navigator) || duration <= 0) return;
    navigator.mediaSession.setPositionState({
      duration: duration / 1000,
      playbackRate: 1,
      position: position / 1000,
    });
  }, [position, duration]);

  // Media Session API — action handlers (register once)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => handlePlayPauseRef.current());
    navigator.mediaSession.setActionHandler('pause', () => handlePlayPauseRef.current());
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skip = (details.seekOffset ?? 15) * 1000;
      mainPlayerRef.current?.seekTo(Math.max(0, mainPlayerRef.current.getPosition() + skip));
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skip = (details.seekOffset ?? 15) * 1000;
      mainPlayerRef.current?.seekTo(Math.max(0, mainPlayerRef.current.getPosition() - skip));
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        mainPlayerRef.current?.seekTo(details.seekTime * 1000);
      }
    });
    return () => {
      (['play', 'pause', 'seekforward', 'seekbackward', 'seekto'] as MediaSessionAction[]).forEach(
        (action) => navigator.mediaSession.setActionHandler(action, null),
      );
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          color: "#666",
        }}
      >
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
                onClick={handleClick}
              />
            </>
          ) : (
            <GenreLines
              ref={genreLinesRef}
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
            onArtworkClick={handleArtworkClick}
          />
        </>
      )}
      <Analytics />
    </>
  );
}

export default App;

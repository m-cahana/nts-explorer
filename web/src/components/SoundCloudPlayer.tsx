import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';

// Declare SC global from SoundCloud Widget API
declare global {
  interface Window {
    SC: {
      Widget: (element: HTMLIFrameElement) => SCWidget;
    };
  }
}

interface SCWidget {
  load(url: string, options?: { auto_play?: boolean; show_artwork?: boolean }): void;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  bind(event: string, callback: () => void): void;
  unbind(event: string): void;
  getPosition(callback: (position: number) => void): void;
  getDuration(callback: (duration: number) => void): void;
}

export interface SoundCloudPlayerHandle {
  loadTrack: (url: string, seekToMs?: number) => void;
  pause: () => void;
  play: () => void;
  seekTo: (ms: number) => void;
  getPosition: (callback: (ms: number) => void) => void;
  getDuration: (callback: (ms: number) => void) => void;
}

interface Props {
  id?: string;
  onTrackEnd?: () => void;
  onReady?: () => void;
  onLoad?: (duration: number) => void;  // Called when track loads with duration
}

// Global script loading state (shared across all instances)
let scScriptLoaded = false;
let scScriptLoading = false;
const scReadyCallbacks: (() => void)[] = [];

function loadScriptOnce(callback: () => void) {
  if (scScriptLoaded) {
    callback();
    return;
  }

  scReadyCallbacks.push(callback);

  if (scScriptLoading) {
    return;
  }

  scScriptLoading = true;
  const script = document.createElement('script');
  script.src = 'https://w.soundcloud.com/player/api.js';
  script.async = true;
  script.onload = () => {
    scScriptLoaded = true;
    scScriptLoading = false;
    scReadyCallbacks.forEach(cb => cb());
    scReadyCallbacks.length = 0;
  };
  document.body.appendChild(script);
}

export const SoundCloudPlayer = forwardRef<SoundCloudPlayerHandle, Props>(
  ({ id = 'sc-widget', onTrackEnd, onReady, onLoad }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const widgetRef = useRef<SCWidget | null>(null);
    const isReadyRef = useRef(false);

    // Initialize widget when script is loaded
    useEffect(() => {
      const initWidget = () => {
        if (iframeRef.current && window.SC) {
          widgetRef.current = window.SC.Widget(iframeRef.current);
          widgetRef.current.bind('ready', () => {
            isReadyRef.current = true;
            onReady?.();
          });
          if (onTrackEnd) {
            widgetRef.current.bind('finish', onTrackEnd);
          }
        }
      };

      loadScriptOnce(initWidget);
    }, [onTrackEnd, onReady]);

    const loadTrack = useCallback((url: string, seekToMs?: number) => {
      if (widgetRef.current) {
        // Handle play event - seek if needed and fetch duration
        const onPlay = () => {
          if (seekToMs && seekToMs > 0) {
            widgetRef.current?.seekTo(seekToMs);
          }
          // Fetch duration immediately when track starts playing
          widgetRef.current?.getDuration((duration) => {
            onLoad?.(duration);
          });
          widgetRef.current?.unbind('play');
        };
        widgetRef.current.bind('play', onPlay);
        widgetRef.current.load(url, { auto_play: true, show_artwork: false });
      }
    }, [onLoad]);

    const pause = useCallback(() => {
      if (widgetRef.current) {
        widgetRef.current.pause();
      }
    }, []);

    const play = useCallback(() => {
      if (widgetRef.current) {
        widgetRef.current.play();
      }
    }, []);

    const seekTo = useCallback((ms: number) => {
      if (widgetRef.current) {
        widgetRef.current.seekTo(ms);
      }
    }, []);

    const getPosition = useCallback((callback: (ms: number) => void) => {
      if (widgetRef.current) {
        widgetRef.current.getPosition(callback);
      }
    }, []);

    const getDuration = useCallback((callback: (ms: number) => void) => {
      if (widgetRef.current) {
        widgetRef.current.getDuration(callback);
      }
    }, []);

    useImperativeHandle(ref, () => ({
      loadTrack,
      pause,
      play,
      seekTo,
      getPosition,
      getDuration,
    }), [loadTrack, pause, play, seekTo, getPosition, getDuration]);

    return (
      <iframe
        ref={iframeRef}
        id={id}
        src="https://w.soundcloud.com/player/?url=https://soundcloud.com/placeholder"
        width="0"
        height="0"
        allow="autoplay"
        style={{ position: 'absolute', visibility: 'hidden' }}
      />
    );
  }
);

SoundCloudPlayer.displayName = 'SoundCloudPlayer';

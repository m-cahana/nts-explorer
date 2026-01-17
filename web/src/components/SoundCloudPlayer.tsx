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
}

export interface SoundCloudPlayerHandle {
  loadTrack: (url: string, seekToMs?: number) => void;
  pause: () => void;
}

interface Props {
  onTrackEnd?: () => void;
}

export const SoundCloudPlayer = forwardRef<SoundCloudPlayerHandle, Props>(
  ({ onTrackEnd }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const widgetRef = useRef<SCWidget | null>(null);
    const isReadyRef = useRef(false);

    // Load the SC Widget API script
    useEffect(() => {
      const script = document.createElement('script');
      script.src = 'https://w.soundcloud.com/player/api.js';
      script.async = true;
      script.onload = () => {
        if (iframeRef.current && window.SC) {
          widgetRef.current = window.SC.Widget(iframeRef.current);
          widgetRef.current.bind('ready', () => {
            isReadyRef.current = true;
          });
          if (onTrackEnd) {
            widgetRef.current.bind('finish', onTrackEnd);
          }
        }
      };
      document.body.appendChild(script);

      return () => {
        document.body.removeChild(script);
      };
    }, [onTrackEnd]);

    const loadTrack = useCallback((url: string, seekToMs?: number) => {
      if (widgetRef.current) {
        // If we need to seek, set up a one-time listener for when the track is ready
        if (seekToMs && seekToMs > 0) {
          const onPlay = () => {
            widgetRef.current?.seekTo(seekToMs);
            widgetRef.current?.unbind('play');
          };
          widgetRef.current.bind('play', onPlay);
        }
        widgetRef.current.load(url, { auto_play: true, show_artwork: false });
      }
    }, []);

    const pause = useCallback(() => {
      if (widgetRef.current) {
        widgetRef.current.pause();
      }
    }, []);

    useImperativeHandle(ref, () => ({
      loadTrack,
      pause,
    }), [loadTrack, pause]);

    return (
      <iframe
        ref={iframeRef}
        id="sc-widget"
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

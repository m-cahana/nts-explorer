import { forwardRef, useImperativeHandle, useRef, useCallback, useEffect } from 'react';
import type { SoundCloudPlayerHandle } from '../types';

declare global {
  interface Window {
    SC: {
      Widget: {
        (iframe: HTMLIFrameElement): SCWidget;
        Events: {
          READY: string;
          PLAY: string;
          PAUSE: string;
          FINISH: string;
          PLAY_PROGRESS: string;
        };
      };
    };
  }
}

interface SCWidget {
  load(url: string, options?: { auto_play?: boolean; callback?: () => void }): void;
  play(): void;
  pause(): void;
  seekTo(milliseconds: number): void;
  getPosition(callback: (position: number) => void): void;
  getDuration(callback: (duration: number) => void): void;
  bind(event: string, callback: (data?: unknown) => void): void;
  unbind(event: string): void;
}

interface SoundCloudPlayerProps {
  onProgress?: (position: number, duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
}

export const SoundCloudPlayer = forwardRef<SoundCloudPlayerHandle, SoundCloudPlayerProps>(
  ({ onProgress, onPlay, onPause, onFinish }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const widgetRef = useRef<SCWidget | null>(null);
    const positionRef = useRef(0);
    const pendingSeekRef = useRef<number | null>(null);
    const pendingLoadRef = useRef<{ url: string; startPosition?: number } | null>(null);

    useEffect(() => {
      // Load SoundCloud Widget API if not already loaded
      if (!window.SC) {
        const script = document.createElement('script');
        script.src = 'https://w.soundcloud.com/player/api.js';
        script.async = true;
        document.body.appendChild(script);
      }
    }, []);

    const initWidget = useCallback(() => {
      if (!iframeRef.current || !window.SC) return;

      widgetRef.current = window.SC.Widget(iframeRef.current);

      widgetRef.current.bind(window.SC.Widget.Events.READY, () => {
        // If a loadTrack call arrived before the widget was ready, apply it now
        if (pendingLoadRef.current && widgetRef.current) {
          const { url, startPosition } = pendingLoadRef.current;
          pendingLoadRef.current = null;
          if (startPosition !== undefined) pendingSeekRef.current = startPosition;
          widgetRef.current.load(url, {
            auto_play: true,
            callback: () => {
              if (pendingSeekRef.current !== null && widgetRef.current) {
                setTimeout(() => {
                  widgetRef.current?.seekTo(pendingSeekRef.current!);
                  pendingSeekRef.current = null;
                }, 100);
              }
            },
          });
          return;
        }
        if (pendingSeekRef.current !== null && widgetRef.current) {
          widgetRef.current.seekTo(pendingSeekRef.current);
          pendingSeekRef.current = null;
        }
      });

      widgetRef.current.bind(window.SC.Widget.Events.PLAY, () => {
        onPlay?.();
      });

      widgetRef.current.bind(window.SC.Widget.Events.PAUSE, () => {
        onPause?.();
      });

      widgetRef.current.bind(window.SC.Widget.Events.FINISH, () => {
        onFinish?.();
      });

      widgetRef.current.bind(window.SC.Widget.Events.PLAY_PROGRESS, (data) => {
        const progressData = data as { currentPosition: number; relativePosition: number };
        positionRef.current = progressData.currentPosition;
        if (onProgress && widgetRef.current) {
          widgetRef.current.getDuration((duration) => {
            onProgress(progressData.currentPosition, duration);
          });
        }
      });
    }, [onProgress, onPlay, onPause, onFinish]);

    useEffect(() => {
      const checkReady = setInterval(() => {
        if (window.SC && iframeRef.current) {
          initWidget();
          clearInterval(checkReady);
        }
      }, 100);

      return () => clearInterval(checkReady);
    }, [initWidget]);

    useImperativeHandle(ref, () => ({
      loadTrack: (url: string, startPosition?: number) => {
        if (!widgetRef.current) {
          // Widget not initialised yet — defer until READY fires
          pendingLoadRef.current = { url, startPosition };
          return;
        }
        if (startPosition !== undefined) {
          pendingSeekRef.current = startPosition;
        }
        widgetRef.current.load(url, {
          auto_play: true,
          callback: () => {
            if (pendingSeekRef.current !== null && widgetRef.current) {
              setTimeout(() => {
                widgetRef.current?.seekTo(pendingSeekRef.current!);
                pendingSeekRef.current = null;
              }, 100);
            }
          },
        });
      },
      play: () => {
        widgetRef.current?.play();
      },
      pause: () => {
        widgetRef.current?.pause();
      },
      seekTo: (positionMs: number) => {
        widgetRef.current?.seekTo(positionMs);
      },
      getPosition: () => positionRef.current,
    }));

    return (
      <iframe
        ref={iframeRef}
        src="https://w.soundcloud.com/player/?url=https://soundcloud.com"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          border: 'none',
        }}
        allow="autoplay"
      />
    );
  }
);

SoundCloudPlayer.displayName = 'SoundCloudPlayer';

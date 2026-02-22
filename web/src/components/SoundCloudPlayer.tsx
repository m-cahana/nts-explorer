import { forwardRef, useImperativeHandle, useRef, useCallback, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
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

function buildWidgetUrl(trackUrl: string, autoPlay: boolean): string {
  return (
    `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}` +
    `&auto_play=${autoPlay}&buying=false&liking=false&download=false` +
    `&sharing=false&show_artwork=false&show_comments=false` +
    `&show_playcount=false&show_user=false&hide_related=true`
  );
}

export const SoundCloudPlayer = forwardRef<SoundCloudPlayerHandle, SoundCloudPlayerProps>(
  ({ onProgress, onPlay, onPause, onFinish }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const widgetRef = useRef<SCWidget | null>(null);
    const positionRef = useRef(0);
    const pendingSeekRef = useRef<number | null>(null);
    const currentTrackUrlRef = useRef<string | null>(null);
    const playRequestedRef = useRef(false);
    const [iframeKey, setIframeKey] = useState(0);
    const [iframeSrc, setIframeSrc] = useState(
      'https://w.soundcloud.com/player/?url=https://soundcloud.com'
    );

    useEffect(() => {
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
        const seek = pendingSeekRef.current;
        pendingSeekRef.current = null;
        if (seek !== null && seek > 0 && widgetRef.current) {
          setTimeout(() => {
            widgetRef.current?.seekTo(seek);
          }, 100);
        }
        if (playRequestedRef.current && widgetRef.current) {
          // iOS: explicitly issue play after READY in case auto_play is ignored.
          setTimeout(() => {
            widgetRef.current?.play();
          }, 0);
        }
      });

      widgetRef.current.bind(window.SC.Widget.Events.PLAY, () => {
        playRequestedRef.current = false;
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

    // Initial setup: poll until window.SC is available, then init widget
    useEffect(() => {
      const checkReady = setInterval(() => {
        if (window.SC && iframeRef.current) {
          initWidget();
          clearInterval(checkReady);
        }
      }, 100);
      return () => clearInterval(checkReady);
    }, [initWidget]);

    // Re-init widget after each iframe src change (new track load)
    const handleIframeLoad = useCallback(() => {
      if (window.SC && iframeRef.current) {
        initWidget();
      }
    }, [initWidget]);

    useImperativeHandle(ref, () => ({
      loadTrack: (url: string, startPosition?: number) => {
        pendingSeekRef.current =
          startPosition !== undefined && startPosition > 0 ? startPosition : null;
        currentTrackUrlRef.current = url;
        playRequestedRef.current = true;

        // flushSync forces React to apply the state updates and update the DOM
        // synchronously, within the current user gesture — required for iOS autoplay.
        // The new iframe element guarantees a SC.Widget cache miss, so events work.
        flushSync(() => {
          setIframeSrc(buildWidgetUrl(url, true));
          setIframeKey((k) => k + 1);
        });
        widgetRef.current = null;
      },
      play: () => {
        const isIOS =
          /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));

        playRequestedRef.current = true;

        // First try direct widget.play() inside the tap gesture.
        widgetRef.current?.play();

        // iOS fallback: if playback still did not start, hard-reload iframe with auto_play.
        if (isIOS && currentTrackUrlRef.current) {
          const startPos = positionRef.current;
          window.setTimeout(() => {
            if (!playRequestedRef.current || !widgetRef.current) return;
            widgetRef.current.getPosition((pos) => {
              if (!playRequestedRef.current || pos > 0) return;
              pendingSeekRef.current = startPos > 0 ? startPos : null;
              flushSync(() => {
                setIframeSrc(buildWidgetUrl(currentTrackUrlRef.current!, true));
                setIframeKey((k) => k + 1);
              });
              widgetRef.current = null;
            });
          }, 350);
        }
      },
      pause: () => {
        playRequestedRef.current = false;
        widgetRef.current?.pause();
      },
      seekTo: (positionMs: number) => {
        widgetRef.current?.seekTo(positionMs);
      },
      getPosition: () => positionRef.current,
    }));

    return (
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={iframeSrc}
        onLoad={handleIframeLoad}
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

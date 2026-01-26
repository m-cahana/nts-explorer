import type { Track } from '../types';
import './NowPlayingPill.css';

interface NowPlayingPillProps {
  activeTrack: Track | null;
  previewTrack: Track | null;
}

export function NowPlayingPill({ activeTrack, previewTrack }: NowPlayingPillProps) {
  const track = previewTrack || activeTrack;

  if (!track) return null;

  const label = previewTrack ? 'Previewing' : 'Playing';

  return (
    <div className="now-playing-pill">
      <div className="now-playing-pill__label">
        {label}
      </div>
      <div className="now-playing-pill__title">
        {track.title}
      </div>
    </div>
  );
}

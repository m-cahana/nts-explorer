import type { Track } from '../types';

interface NowPlayingPillProps {
  activeTrack: Track | null;
  previewTrack: Track | null;
}

export function NowPlayingPill({ activeTrack, previewTrack }: NowPlayingPillProps) {
  const track = previewTrack || activeTrack;

  if (!track) return null;

  const label = previewTrack ? 'Previewing' : 'Playing';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        background: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '20px',
        padding: '10px 16px',
        maxWidth: '300px',
        zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: '14px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {track.title}
      </div>
    </div>
  );
}

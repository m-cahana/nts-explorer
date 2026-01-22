import { useMemo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Track } from '../types';

interface Props {
  tracks: Track[];
  activeTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
}

const TILE_SIZE = 80;
const SPACE_SIZE = 3000;

function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t50x50.').replace(/-t\d+x\d+\./, '-t50x50.');
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function ReactTileCloud({
  tracks,
  activeTrackId,
  onHoverStart,
  onHoverEnd,
  onClick,
}: Props) {
  // Generate positions once based on tracks
  const positions = useMemo(() => {
    return tracks.map(track => ({
      id: track.id,
      x: (seededRandom(track.id) - 0.5) * 2 * SPACE_SIZE + SPACE_SIZE,
      y: (seededRandom(track.id * 2) - 0.5) * 2 * SPACE_SIZE + SPACE_SIZE,
    }));
  }, [tracks]);

  const positionMap = useMemo(() => {
    return new Map(positions.map(p => [p.id, p]));
  }, [positions]);

  return (
    <TransformWrapper
      initialScale={0.2}
      minScale={0.1}
      maxScale={2}
      centerOnInit
      limitToBounds={false}
    >
      <TransformComponent
        wrapperStyle={{
          width: '100%',
          height: '100%',
        }}
        contentStyle={{
          width: SPACE_SIZE * 2,
          height: SPACE_SIZE * 2,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: SPACE_SIZE * 2,
            height: SPACE_SIZE * 2,
            backgroundColor: 'white',
          }}
        >
          {tracks.map(track => {
            const pos = positionMap.get(track.id);
            if (!pos) return null;
            const artworkUrl = getSmallArtworkUrl(track.artwork_url);
            const isActive = track.id === activeTrackId;

            return (
              <div
                key={track.id}
                onMouseEnter={() => onHoverStart(track.id)}
                onMouseLeave={onHoverEnd}
                onClick={() => onClick(track.id)}
                style={{
                  position: 'absolute',
                  left: pos.x - TILE_SIZE / 2,
                  top: pos.y - TILE_SIZE / 2,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  backgroundColor: '#eee',
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease',
                  outline: isActive ? '2px solid #000' : 'none',
                  outlineOffset: '2px',
                }}
                className="tile"
              >
                {artworkUrl && (
                  <img
                    src={artworkUrl}
                    alt=""
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={(e) => {
                      // Hide broken images, show placeholder color
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </TransformComponent>
      <style>{`
        .tile:hover {
          transform: scale(1.5);
          z-index: 1000;
        }
      `}</style>
    </TransformWrapper>
  );
}

import { memo, useState } from 'react';

interface Props {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  artworkUrl: string | null;
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

const DEFAULT_BG_COLOR = '#333333';

function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t50x50.').replace(/-t\d+x\d+\./, '-t50x50.');
}

export const Tile = memo(function Tile({
  x,
  y,
  artworkUrl,
  isActive,
  onMouseEnter,
  onMouseLeave,
  onClick
}: Props) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onMouseEnter();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onMouseLeave();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: '10px',
        height: '10px',
        backgroundColor: DEFAULT_BG_COLOR,
        backgroundImage: artworkUrl ? `url(${getSmallArtworkUrl(artworkUrl)})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        cursor: 'pointer',
        transform: `translate(-50%, -50%) scale(${isHovered || isActive ? 5 : 1})`,
        transition: 'transform 0.1s ease',
        zIndex: isHovered || isActive ? 10 : 1,
        border: isActive ? '1px solid #ff0000' : 'none',
        boxSizing: 'border-box',
      }}
    />
  );
});

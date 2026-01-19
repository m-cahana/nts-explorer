import { useRef, useEffect, useCallback } from 'react';
import type { Track, DotPosition } from '../types';

interface Props {
  tracks: Track[];
  positions: Map<number, DotPosition>;
  activeTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
}

const TILE_SIZE = 10;
const HOVER_SCALE = 5;
const DEFAULT_BG_COLOR = '#333333';
const ACTIVE_BORDER_COLOR = '#ff0000';

function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t50x50.').replace(/-t\d+x\d+\./, '-t50x50.');
}

export function TileCanvas({
  tracks,
  positions,
  activeTrackId,
  onHoverStart,
  onHoverEnd,
  onClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const hoveredIdRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Convert percentage position to pixel position
  const getPixelPosition = useCallback((pos: DotPosition, width: number, height: number) => {
    return {
      x: (pos.x / 100) * width,
      y: (pos.y / 100) * height,
    };
  }, []);

  // Find which tile is at the given pixel coordinates
  const findTileAtPosition = useCallback((
    mouseX: number,
    mouseY: number,
    width: number,
    height: number
  ): number | null => {
    const halfSize = TILE_SIZE / 2;

    for (const track of tracks) {
      const pos = positions.get(track.id);
      if (!pos) continue;

      const { x, y } = getPixelPosition(pos, width, height);

      if (
        mouseX >= x - halfSize &&
        mouseX <= x + halfSize &&
        mouseY >= y - halfSize &&
        mouseY <= y + halfSize
      ) {
        return track.id;
      }
    }
    return null;
  }, [tracks, positions, getPixelPosition]);

  // Load an image and cache it
  const loadImage = useCallback((url: string): Promise<HTMLImageElement> => {
    const cached = imageCacheRef.current.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageCacheRef.current.set(url, img);
        resolve(img);
      };
      img.onerror = () => {
        // On error, don't cache - will show placeholder
        resolve(img);
      };
      img.src = url;
    });
  }, []);

  // Draw all tiles to the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const hoveredId = hoveredIdRef.current;

    // Clear canvas
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, width, height);

    // Draw non-hovered, non-active tiles first
    for (const track of tracks) {
      if (track.id === hoveredId || track.id === activeTrackId) continue;

      const pos = positions.get(track.id);
      if (!pos) continue;

      const { x, y } = getPixelPosition(pos, width, height);
      const halfSize = TILE_SIZE / 2;

      const artworkUrl = getSmallArtworkUrl(track.artwork_url);
      const cachedImage = artworkUrl ? imageCacheRef.current.get(artworkUrl) : null;

      if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
        ctx.drawImage(cachedImage, x - halfSize, y - halfSize, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = DEFAULT_BG_COLOR;
        ctx.fillRect(x - halfSize, y - halfSize, TILE_SIZE, TILE_SIZE);

        // Start loading the image if not cached
        if (artworkUrl && !imageCacheRef.current.has(artworkUrl)) {
          loadImage(artworkUrl).then(() => {
            // Trigger a redraw once loaded
            if (animationFrameRef.current === null) {
              animationFrameRef.current = requestAnimationFrame(() => {
                animationFrameRef.current = null;
                draw();
              });
            }
          });
        }
      }
    }

    // Draw active tile (scaled)
    if (activeTrackId && activeTrackId !== hoveredId) {
      const pos = positions.get(activeTrackId);
      const track = tracks.find(t => t.id === activeTrackId);
      if (pos && track) {
        const { x, y } = getPixelPosition(pos, width, height);
        const scaledSize = TILE_SIZE * HOVER_SCALE;
        const halfScaled = scaledSize / 2;

        const artworkUrl = getSmallArtworkUrl(track.artwork_url);
        const cachedImage = artworkUrl ? imageCacheRef.current.get(artworkUrl) : null;

        if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
          ctx.drawImage(cachedImage, x - halfScaled, y - halfScaled, scaledSize, scaledSize);
        } else {
          ctx.fillStyle = DEFAULT_BG_COLOR;
          ctx.fillRect(x - halfScaled, y - halfScaled, scaledSize, scaledSize);
        }

        // Draw red border for active
        ctx.strokeStyle = ACTIVE_BORDER_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - halfScaled, y - halfScaled, scaledSize, scaledSize);
      }
    }

    // Draw hovered tile last (on top, scaled)
    if (hoveredId) {
      const pos = positions.get(hoveredId);
      const track = tracks.find(t => t.id === hoveredId);
      if (pos && track) {
        const { x, y } = getPixelPosition(pos, width, height);
        const scaledSize = TILE_SIZE * HOVER_SCALE;
        const halfScaled = scaledSize / 2;

        const artworkUrl = getSmallArtworkUrl(track.artwork_url);
        const cachedImage = artworkUrl ? imageCacheRef.current.get(artworkUrl) : null;

        if (cachedImage && cachedImage.complete && cachedImage.naturalWidth > 0) {
          ctx.drawImage(cachedImage, x - halfScaled, y - halfScaled, scaledSize, scaledSize);
        } else {
          ctx.fillStyle = DEFAULT_BG_COLOR;
          ctx.fillRect(x - halfScaled, y - halfScaled, scaledSize, scaledSize);
        }

        // Draw border if it's also the active track
        if (hoveredId === activeTrackId) {
          ctx.strokeStyle = ACTIVE_BORDER_COLOR;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - halfScaled, y - halfScaled, scaledSize, scaledSize);
        }
      }
    }
  }, [tracks, positions, activeTrackId, getPixelPosition, loadImage]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Redraw when tracks, positions, or activeTrackId change
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const tileId = findTileAtPosition(mouseX, mouseY, canvas.width, canvas.height);

    if (tileId !== hoveredIdRef.current) {
      const prevHovered = hoveredIdRef.current;
      hoveredIdRef.current = tileId;

      if (tileId) {
        onHoverStart(tileId);
      } else if (prevHovered) {
        onHoverEnd();
      }

      draw();
    }
  }, [findTileAtPosition, onHoverStart, onHoverEnd, draw]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (hoveredIdRef.current !== null) {
      hoveredIdRef.current = null;
      onHoverEnd();
      draw();
    }
  }, [onHoverEnd, draw]);

  // Handle click
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const tileId = findTileAtPosition(mouseX, mouseY, canvas.width, canvas.height);
    if (tileId) {
      onClick(tileId);
    }
  }, [findTileAtPosition, onClick]);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        cursor: 'pointer',
      }}
    />
  );
}

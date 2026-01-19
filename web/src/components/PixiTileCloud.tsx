import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Container, Sprite, Texture, Assets, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Track } from '../types';

interface Position2D {
  id: number;
  x: number;
  y: number;
}

interface Props {
  tracks: Track[];
  activeTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
}

const TILE_SIZE = 40;
const HOVER_SCALE = 1.5;
const SPACE_SIZE = 3000;
const DEFAULT_COLOR = 0x333333;

function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t50x50.').replace(/-t\d+x\d+\./, '-t50x50.');
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generate2DPositions(tracks: Track[]): Position2D[] {
  return tracks.map(track => ({
    id: track.id,
    x: (seededRandom(track.id) - 0.5) * 2 * SPACE_SIZE,
    y: (seededRandom(track.id * 2) - 0.5) * 2 * SPACE_SIZE,
  }));
}

export function PixiTileCloud({
  tracks,
  activeTrackId,
  onHoverStart,
  onHoverEnd,
  onClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const spritesRef = useRef<Map<number, Sprite>>(new Map());
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Initialize Pixi application
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new Application();

    const init = async () => {
      await app.init({
        resizeTo: window,
        backgroundColor: 0xf5f5f5,
        antialias: true,
      });

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      // Create viewport
      const viewport = new Viewport({
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        worldWidth: SPACE_SIZE * 2,
        worldHeight: SPACE_SIZE * 2,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewportRef.current = viewport;

      // Enable drag and pinch zoom
      viewport
        .drag()
        .pinch()
        .wheel()
        .decelerate();

      // Center viewport
      viewport.moveCenter(0, 0);
      viewport.setZoom(0.2);

      // Create tiles
      const positions = generate2DPositions(tracks);
      const positionMap = new Map(positions.map(p => [p.id, p]));

      for (const track of tracks) {
        const pos = positionMap.get(track.id);
        if (!pos) continue;

        // Create placeholder sprite
        const graphics = new Graphics();
        graphics.rect(0, 0, TILE_SIZE, TILE_SIZE);
        graphics.fill(DEFAULT_COLOR);
        const placeholderTexture = app.renderer.generateTexture(graphics);

        const sprite = new Sprite(placeholderTexture);
        sprite.x = pos.x;
        sprite.y = pos.y;
        sprite.width = TILE_SIZE;
        sprite.height = TILE_SIZE;
        sprite.anchor.set(0.5);
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';

        // Store track data on sprite
        (sprite as any).trackId = track.id;
        (sprite as any).trackData = track;

        // Event handlers
        sprite.on('pointerover', () => {
          setHoveredId(track.id);
          onHoverStart(track.id);
          sprite.scale.set(HOVER_SCALE);
          sprite.zIndex = 1000;
        });

        sprite.on('pointerout', () => {
          setHoveredId(null);
          onHoverEnd();
          sprite.scale.set(1);
          sprite.zIndex = 0;
        });

        sprite.on('pointertap', () => {
          onClick(track.id);
        });

        viewport.addChild(sprite);
        spritesRef.current.set(track.id, sprite);

        // Load texture async
        const artworkUrl = getSmallArtworkUrl(track.artwork_url);
        if (artworkUrl) {
          Assets.load(artworkUrl).then((texture: Texture) => {
            if (sprite && !sprite.destroyed) {
              sprite.texture = texture;
            }
          }).catch(() => {
            // Keep placeholder on error
          });
        }
      }

      // Enable sorting for z-index
      viewport.sortableChildren = true;
    };

    init();

    // Cleanup
    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      spritesRef.current.clear();
    };
  }, [tracks, onHoverStart, onHoverEnd, onClick]);

  // Update active tile appearance
  useEffect(() => {
    spritesRef.current.forEach((sprite, id) => {
      if (id === activeTrackId) {
        sprite.tint = 0xff0000;
      } else {
        sprite.tint = 0xffffff;
      }
    });
  }, [activeTrackId]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (viewportRef.current) {
        viewportRef.current.resize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    />
  );
}

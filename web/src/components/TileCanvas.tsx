import { useEffect, useRef } from 'react';
import { Application, Container, Sprite, Graphics, Texture, Assets } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Track } from '../types';

const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 2000;
const TILE_SIZE = 60;

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function getArtworkUrl(url: string | null, size: 'small' | 'large'): string {
  if (!url) return '';
  const sizeStr = size === 'small' ? 't200x200' : 't500x500';
  return url.replace(/-large\./, `-${sizeStr}.`).replace(/-t\d+x\d+\./, `-${sizeStr}.`);
}

interface TileCanvasProps {
  tracks: Track[];
  activeTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
}

export function TileCanvas({
  tracks,
  activeTrack,
  onHover,
  onHoverEnd,
  onClick,
}: TileCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const tilesRef = useRef<Map<number, { sprite: Sprite; outline: Graphics; isHovered: boolean }>>(new Map());
  const activeTrackRef = useRef<Track | null>(null);

  // Keep ref in sync with prop
  activeTrackRef.current = activeTrack;

  // Update active track (selected) - 3x scale with border
  useEffect(() => {
    // Reset previous active
    tilesRef.current.forEach((tile) => {
      if (!tile.isHovered) {
        tile.sprite.scale.set(1);
        tile.outline.visible = false;
      }
    });

    // Set new active
    if (activeTrack) {
      const tile = tilesRef.current.get(activeTrack.id);
      if (tile) {
        tile.sprite.scale.set(2);
        tile.outline.scale.set(2);
        tile.outline.visible = true;
      }
    }
  }, [activeTrack]);

  useEffect(() => {
    console.log('[TileCanvas] Effect triggered, tracks:', tracks.length);
    if (!containerRef.current || tracks.length === 0) {
      console.log('[TileCanvas] Skipping init - container:', !!containerRef.current, 'tracks:', tracks.length);
      return;
    }

    const container = containerRef.current;
    console.log('[TileCanvas] Container size:', container.clientWidth, 'x', container.clientHeight);

    async function init() {
      console.log('[TileCanvas] Initializing PixiJS...');
      const app = new Application();
      await app.init({
        background: '#ffffff',
        resizeTo: container,
        antialias: true,
      });

      console.log('[TileCanvas] PixiJS initialized, canvas size:', app.canvas.width, 'x', app.canvas.height);
      container.appendChild(app.canvas);
      appRef.current = app;

      const viewport = new Viewport({
        screenWidth: container.clientWidth,
        screenHeight: container.clientHeight,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewportRef.current = viewport;

      viewport
        .drag()
        .pinch()
        .wheel()
        .clampZoom({ minScale: 0.2, maxScale: 4 })
        .clamp({ direction: 'all' });

      // Center viewport
      viewport.moveCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

      // Create tiles container
      const tilesContainer = new Container();
      viewport.addChild(tilesContainer);

      // Create tiles for each track
      for (const track of tracks) {
        const x = seededRandom(track.soundcloud_id) * (WORLD_WIDTH - TILE_SIZE);
        const y = seededRandom(track.soundcloud_id * 2) * (WORLD_HEIGHT - TILE_SIZE);

        // Create outline (initially hidden)
        const outline = new Graphics();
        outline.rect(-3, -3, TILE_SIZE + 6, TILE_SIZE + 6);
        outline.stroke({ width: 3, color: 0x000000 });
        outline.position.set(x, y);
        outline.visible = false;
        tilesContainer.addChild(outline);

        // Create sprite
        const sprite = new Sprite(Texture.WHITE);
        sprite.width = TILE_SIZE;
        sprite.height = TILE_SIZE;
        sprite.position.set(x, y);
        sprite.tint = 0xcccccc;
        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';

        // Load artwork
        const artworkUrl = getArtworkUrl(track.artwork_url, 'small');
        if (artworkUrl) {
          Assets.load<Texture>(artworkUrl).then((texture) => {
            sprite.texture = texture;
            sprite.tint = 0xffffff;
          }).catch(() => {
            // Keep placeholder on error
          });
        }

        // Store tile data
        const tileData = { sprite, outline, isHovered: false };
        tilesRef.current.set(track.id, tileData);

        // Event handlers
        sprite.on('pointerenter', () => {
          tileData.isHovered = true;
          sprite.scale.set(2);
          onHover(track);
        });

        sprite.on('pointerleave', () => {
          tileData.isHovered = false;
          // Only reset scale if not active
          if (activeTrackRef.current?.id !== track.id) {
            sprite.scale.set(1);
          }
          onHoverEnd();
        });

        sprite.on('pointertap', () => {
          onClick(track);
        });

        tilesContainer.addChild(sprite);
      }

      console.log('[TileCanvas] Created', tilesRef.current.size, 'tiles');
    }

    init();

    // Handle resize
    const handleResize = () => {
      if (viewportRef.current && containerRef.current) {
        viewportRef.current.resize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      tilesRef.current.clear();
    };
  }, [tracks, onHover, onHoverEnd, onClick]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}

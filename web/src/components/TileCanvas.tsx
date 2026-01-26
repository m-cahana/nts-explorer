import { useEffect, useRef } from 'react';
import { Application, Container, Sprite, Graphics, Texture, Assets } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Track } from '../types';

const TILE_SIZE_PERCENT = 0.04; // 4% of smaller viewport dimension
const MIN_ZOOM = 0.9;
const MAX_ZOOM = 3.0;

function calculateTileSize(width: number, height: number): number {
  return Math.min(width, height) * TILE_SIZE_PERCENT;
}

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
  const tilesRef = useRef<Map<number, {
    sprite: Sprite;
    outline: Graphics;
    normalizedX: number;
    normalizedY: number;
  }>>(new Map());
  const activeTrackRef = useRef<Track | null>(null);

  // Keep ref in sync with prop
  activeTrackRef.current = activeTrack;

  // Update active track (selected) - show border only
  useEffect(() => {
    // Reset previous active
    tilesRef.current.forEach((tile) => {
      tile.outline.visible = false;
    });

    // Set new active
    if (activeTrack) {
      const tile = tilesRef.current.get(activeTrack.id);
      if (tile) {
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

    // Track if cleanup has run (for StrictMode double-mount)
    let isCleanedUp = false;

    async function init() {
      console.log('[TileCanvas] Initializing PixiJS...');
      const app = new Application();
      await app.init({
        background: '#ffffff',
        width: container.clientWidth,
        height: container.clientHeight,
        antialias: true,
      });

      // Check if component unmounted during async init
      if (isCleanedUp) {
        console.log('[TileCanvas] Cleanup ran during init, destroying app');
        app.destroy(true, { children: true });
        return;
      }

      console.log('[TileCanvas] PixiJS initialized, canvas size:', app.canvas.width, 'x', app.canvas.height);
      container.appendChild(app.canvas);
      appRef.current = app;

      const screenWidth = container.clientWidth;
      const screenHeight = container.clientHeight;

      const viewport = new Viewport({
        screenWidth: screenWidth,
        screenHeight: screenHeight,
        worldWidth: screenWidth,   // World matches viewport
        worldHeight: screenHeight,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewportRef.current = viewport;

      viewport
        .drag()
        .pinch()
        .wheel()
        .clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM })
        .clamp({ direction: 'all' });

      // Start slightly zoomed out with world centered
      viewport.setZoom(MIN_ZOOM, true);

      // Create tiles container
      const tilesContainer = new Container();
      viewport.addChild(tilesContainer);

      // Calculate initial tile size based on viewport
      const tileSize = calculateTileSize(screenWidth, screenHeight);

      // Create tiles for each track
      for (const track of tracks) {
        // Store normalized positions (0-1) for responsive repositioning
        const normalizedX = seededRandom(track.soundcloud_id);
        const normalizedY = seededRandom(track.soundcloud_id * 2);
        const x = normalizedX * (screenWidth - tileSize);
        const y = normalizedY * (screenHeight - tileSize);

        // Create outline (initially hidden)
        const outline = new Graphics();
        outline.rect(-3, -3, tileSize + 6, tileSize + 6);
        outline.stroke({ width: 3, color: 0x000000 });
        outline.position.set(x, y);
        outline.visible = false;
        tilesContainer.addChild(outline);

        // Create sprite
        const sprite = new Sprite(Texture.WHITE);
        sprite.width = tileSize;
        sprite.height = tileSize;
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

        // Store tile data with normalized positions
        const tileData = { sprite, outline, normalizedX, normalizedY };
        tilesRef.current.set(track.id, tileData);

        // Event handlers
        sprite.on('pointerenter', () => {
          onHover(track);
        });

        sprite.on('pointerleave', () => {
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

    // Handle resize - update viewport, world dimensions, and all tile positions/sizes
    const handleResize = () => {
      if (viewportRef.current && containerRef.current && appRef.current) {
        const newWidth = containerRef.current.clientWidth;
        const newHeight = containerRef.current.clientHeight;
        const newTileSize = calculateTileSize(newWidth, newHeight);
        console.log('[TileCanvas] New tile size:', newTileSize);
        console.log('[TileCanvas] New width:', newWidth);
        console.log('[TileCanvas] New height:', newHeight);

        // Resize the renderer/canvas to match container
        appRef.current.renderer.resize(newWidth, newHeight);

        // Update viewport and world dimensions (world = viewport)
        viewportRef.current.resize(newWidth, newHeight, newWidth, newHeight);

        // Re-apply clamp with new world dimensions
        console.log('[TileCanvas] Viewport corner BEFORE clamp:', viewportRef.current.corner);
        viewportRef.current.clamp({ direction: 'all' });
        console.log('[TileCanvas] Viewport corner AFTER clamp:', viewportRef.current.corner);

        // Reset viewport to origin (top-left corner)
        viewportRef.current.moveCorner(0, 0); 

        // Clamp zoom if current scale is below minScale
        if (viewportRef.current.scale.x < MIN_ZOOM) {
          viewportRef.current.scale.set(MIN_ZOOM);
        }

        // Reposition and resize all tiles
        tilesRef.current.forEach((tileData) => {
          const x = tileData.normalizedX * (newWidth - newTileSize);
          const y = tileData.normalizedY * (newHeight - newTileSize);

          tileData.sprite.position.set(x, y);
          tileData.sprite.width = newTileSize;
          tileData.sprite.height = newTileSize;

          // Redraw outline with new size
          tileData.outline.clear();
          tileData.outline.rect(-3, -3, newTileSize + 6, newTileSize + 6);
          tileData.outline.stroke({ width: 3, color: 0x000000 });
          tileData.outline.position.set(x, y);
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isCleanedUp = true;
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

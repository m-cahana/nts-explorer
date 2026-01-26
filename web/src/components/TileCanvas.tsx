import { useEffect, useRef, useState } from 'react';
import { Application, Container, Sprite, Graphics, Texture, Assets } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Track } from '../types';

const TILE_SIZE_PERCENT = 0.03; // x% of smaller viewport dimension
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 5.0;

// Cursor SVG data URLs
const CURSOR_DEFAULT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_IN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='10' x2='16' y2='22' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_OUT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
// Arrow cursors for drag directions - classic line + chevron style
const CURSOR_ARROW_LEFT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M9 16 L14 11 M9 16 L14 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_RIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M23 16 L18 11 M23 16 L18 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_UP = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 9 L11 14 M16 9 L21 14' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_DOWN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 23 L11 18 M16 23 L21 18' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;

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
  previewTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
}

export function TileCanvas({
  tracks,
  activeTrack,
  previewTrack,
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
  const previewTrackRef = useRef<Track | null>(null);
  const baseTileSizeRef = useRef<number>(0);
  const [cursor, setCursor] = useState(CURSOR_DEFAULT);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // Keep refs in sync with props
  activeTrackRef.current = activeTrack;
  previewTrackRef.current = previewTrack;

  // Handle wheel events for zoom cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Don't change cursor if dragging
      if (isDraggingRef.current) return;

      // Clear any pending reset
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }

      // deltaY > 0 means scrolling down = zoom out, deltaY < 0 means scrolling up = zoom in
      if (e.deltaY < 0) {
        setCursor(CURSOR_ZOOM_IN);
      } else if (e.deltaY > 0) {
        setCursor(CURSOR_ZOOM_OUT);
      }

      // Reset cursor after 150ms of no wheel events
      cursorTimeoutRef.current = setTimeout(() => {
        setCursor(CURSOR_DEFAULT);
      }, 150);
    };

    container.addEventListener('wheel', handleWheel);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }
    };
  }, []);

  // Handle drag events for directional arrow cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !lastMousePosRef.current) return;

      const deltaX = e.clientX - lastMousePosRef.current.x;
      const deltaY = e.clientY - lastMousePosRef.current.y;

      // Only update if there's significant movement
      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        // Determine dominant direction
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          // Horizontal movement - arrow points opposite to drag (pan direction)
          setCursor(deltaX > 0 ? CURSOR_ARROW_LEFT : CURSOR_ARROW_RIGHT);
        } else {
          // Vertical movement - arrow points opposite to drag (pan direction)
          setCursor(deltaY > 0 ? CURSOR_ARROW_UP : CURSOR_ARROW_DOWN);
        }
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      lastMousePosRef.current = null;
      setCursor(CURSOR_DEFAULT);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Helper function to update tile appearance
  const updateTileAppearance = (
    tile: { sprite: Sprite; outline: Graphics; normalizedX: number; normalizedY: number },
    scale: number,
    showOutline: boolean,
    outlineColor: number
  ) => {
    const baseSize = baseTileSizeRef.current;
    if (baseSize === 0) return;

    const newSize = baseSize * scale;
    tile.sprite.width = newSize;
    tile.sprite.height = newSize;
    tile.outline.visible = showOutline;

    if (showOutline) {
      // Redraw outline with correct size and color
      tile.outline.clear();
      tile.outline.rect(-3, -3, newSize + 6, newSize + 6);
      tile.outline.stroke({ width: 1, color: outlineColor });
    }
  };

  // Update active/preview track highlighting
  useEffect(() => {
    const baseSize = baseTileSizeRef.current;
    if (baseSize === 0) return;

    // Reset ALL tiles to normal size and hide outlines
    tilesRef.current.forEach((tile) => {
      updateTileAppearance(tile, 1, false, 0x000000);
    });

    // If activeTrack exists AND it's not the preview: scale it 2x, show black border
    if (activeTrack && (!previewTrack || previewTrack.id !== activeTrack.id)) {
      const tile = tilesRef.current.get(activeTrack.id);
      if (tile) {
        updateTileAppearance(tile, 2, true, 0x000000);
      }
    }

    // If previewTrack exists: scale it 2x, show red border (takes precedence)
    if (previewTrack) {
      const tile = tilesRef.current.get(previewTrack.id);
      if (tile) {
        updateTileAppearance(tile, 2, true, 0xff0000);
      }
    }
  }, [activeTrack, previewTrack]);

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
      baseTileSizeRef.current = tileSize;

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
        baseTileSizeRef.current = newTileSize;
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

        // Reposition and resize all tiles to base size first
        tilesRef.current.forEach((tileData) => {
          const x = tileData.normalizedX * (newWidth - newTileSize);
          const y = tileData.normalizedY * (newHeight - newTileSize);

          tileData.sprite.position.set(x, y);
          tileData.sprite.width = newTileSize;
          tileData.sprite.height = newTileSize;

          // Reset outline
          tileData.outline.clear();
          tileData.outline.rect(-3, -3, newTileSize + 6, newTileSize + 6);
          tileData.outline.stroke({ width: 3, color: 0x000000 });
          tileData.outline.position.set(x, y);
          tileData.outline.visible = false;
        });

        // Reapply active/preview highlighting after resize
        const currentActiveTrack = activeTrackRef.current;
        const currentPreviewTrack = previewTrackRef.current;

        // Apply active track highlighting (if not being previewed)
        if (currentActiveTrack && (!currentPreviewTrack || currentPreviewTrack.id !== currentActiveTrack.id)) {
          const tile = tilesRef.current.get(currentActiveTrack.id);
          if (tile) {
            const size = newTileSize * 2;
            tile.sprite.width = size;
            tile.sprite.height = size;
            tile.outline.clear();
            tile.outline.rect(-3, -3, size + 6, size + 6);
            tile.outline.stroke({ width: 3, color: 0x000000 });
            tile.outline.visible = true;
          }
        }

        // Apply preview track highlighting (takes precedence with red border)
        if (currentPreviewTrack) {
          const tile = tilesRef.current.get(currentPreviewTrack.id);
          if (tile) {
            const size = newTileSize * 2;
            tile.sprite.width = size;
            tile.sprite.height = size;
            tile.outline.clear();
            tile.outline.rect(-3, -3, size + 6, size + 6);
            tile.outline.stroke({ width: 3, color: 0xff0000 });
            tile.outline.visible = true;
          }
        }
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
        cursor: cursor,
      }}
    />
  );
}

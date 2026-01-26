import { useEffect, useRef, useMemo } from 'react';
import { Application, Container, Sprite, Graphics, Texture, Assets } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Track } from '../types';

interface Props {
  tracks: Track[];
  activeTrackId: number | null;
  onHoverStart: (trackId: number) => void;
  onHoverEnd: () => void;
  onClick: (trackId: number) => void;
  isReady?: boolean;
}

const TILE_SIZE = 80;
const SPACE_SIZE = 3000;
const WORLD_WIDTH = SPACE_SIZE * 2;
const WORLD_HEIGHT = SPACE_SIZE * 2;

function getSmallArtworkUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/-large\./, '-t200x200.').replace(/-t\d+x\d+\./, '-t200x200.');
}

// Helper to get artwork URL for zoom level (higher res when zoomed in)
function getArtworkUrlForZoom(url: string | null, zoom: number): string | null {
  if (!url) return null;
  const size = zoom > 2 ? '-t500x500' : '-t200x200';
  return url.replace(/-large\./, size + '.').replace(/-t\d+x\d+\./, size + '.');
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
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
  const activeOutlineRef = useRef<Graphics | null>(null);
  const callbacksRef = useRef({ onHoverStart, onHoverEnd, onClick });

  // Keep callbacks ref updated
  useEffect(() => {
    callbacksRef.current = { onHoverStart, onHoverEnd, onClick };
  }, [onHoverStart, onHoverEnd, onClick]);

  // Pre-compute positions based on intensity (x) and random (y)
  const positions = useMemo(() => {
    // Find min/max intensity for normalization
    const intensities = tracks
      .map(t => t.nts_intensity)
      .filter((i): i is number => i !== null);
    const minIntensity = intensities.length > 0 ? Math.min(...intensities) : 0;
    const maxIntensity = intensities.length > 0 ? Math.max(...intensities) : 1;
    const intensityRange = maxIntensity - minIntensity || 1;

    return tracks.map(track => {
      // X position based on intensity (normalized to 0-1, then mapped to world space)
      // Add small random jitter to avoid perfect vertical lines
      const normalizedIntensity = track.nts_intensity !== null
        ? (track.nts_intensity - minIntensity) / intensityRange
        : seededRandom(track.id); // Fallback to random if no intensity
      const jitter = (seededRandom(track.id * 3) - 0.5) * 0.05; // ±2.5% jitter
      const x = Math.max(0, Math.min(1, normalizedIntensity + jitter)) * WORLD_WIDTH;

      // Y position remains random
      const y = seededRandom(track.id * 2) * WORLD_HEIGHT;

      return { id: track.id, x, y };
    });
  }, [tracks]);

  const positionMap = useMemo(() => {
    return new Map(positions.map(p => [p.id, p]));
  }, [positions]);

  // Initialize PixiJS app and viewport
  useEffect(() => {
    if (!containerRef.current || tracks.length === 0) return;

    const container = containerRef.current;
    let destroyed = false;

    console.log('PixiTileCloud: Initializing with', tracks.length, 'tracks');
    console.log('Container size:', container.clientWidth, 'x', container.clientHeight);

    const init = async () => {
      try {
        const app = new Application();
        await app.init({
          background: 0xffffff,
          width: container.clientWidth || 800,
          height: container.clientHeight || 600,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        // Check if component unmounted during async init
        if (destroyed) {
          app.destroy(true);
          return;
        }

        console.log('PixiJS app initialized, canvas:', app.canvas.width, 'x', app.canvas.height);

        container.appendChild(app.canvas);
        appRef.current = app;

        // Create viewport for zoom/pan
        const viewport = new Viewport({
          screenWidth: container.clientWidth || 800,
          screenHeight: container.clientHeight || 600,
          worldWidth: WORLD_WIDTH,
          worldHeight: WORLD_HEIGHT,
          events: app.renderer.events,
        });

        app.stage.addChild(viewport);
        viewportRef.current = viewport;

        // Enable zoom/pan plugins
        viewport
          .drag()
          .pinch()
          .wheel()
          .clampZoom({
            minScale: 0.1,
            maxScale: 5,
          });

        // Initial zoom and center
        viewport.setZoom(0.2);
        viewport.moveCenter(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

        // Create container for tiles
        const tilesContainer = new Container();
        viewport.addChild(tilesContainer);

        // Create active outline graphics
        const activeOutline = new Graphics();
        viewport.addChild(activeOutline);
        activeOutlineRef.current = activeOutline;

        // Create placeholder texture for tiles without artwork
        const placeholderTexture = createPlaceholderTexture();

        console.log('Creating', tracks.length, 'sprites');

        // Create sprites for each track
        let createdCount = 0;
        for (const track of tracks) {
          const pos = positionMap.get(track.id);
          if (!pos) continue;

          // Check if artwork is already cached from preloading
          const artworkUrl = getSmallArtworkUrl(track.artwork_url);
          let initialTexture = placeholderTexture;
          if (artworkUrl && Assets.cache.has(artworkUrl)) {
            initialTexture = Assets.get(artworkUrl);
          }

          const sprite = new Sprite(initialTexture);
          // Center anchor for proper scaling from center
          sprite.anchor.set(0.5, 0.5);
          sprite.x = pos.x;
          sprite.y = pos.y;
          sprite.width = TILE_SIZE;
          sprite.height = TILE_SIZE;
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';

          // Store track ID on sprite for event handling
          (sprite as Sprite & { trackId: number }).trackId = track.id;

          // Add event listeners - use width/height for hover effect (simpler than tracking scale)
          sprite.on('pointerover', () => {
            sprite.width = TILE_SIZE * 1.5;
            sprite.height = TILE_SIZE * 1.5;
            sprite.zIndex = 1000;
            callbacksRef.current.onHoverStart(track.id);
          });

          sprite.on('pointerout', () => {
            sprite.width = TILE_SIZE;
            sprite.height = TILE_SIZE;
            sprite.zIndex = 0;
            callbacksRef.current.onHoverEnd();
          });

          sprite.on('pointertap', () => {
            callbacksRef.current.onClick(track.id);
          });

          tilesContainer.addChild(sprite);
          spritesRef.current.set(track.id, sprite);
          createdCount++;

          // Only load async if not already cached (edge case for late-arriving tracks)
          if (artworkUrl && !Assets.cache.has(artworkUrl)) {
            loadTexture(artworkUrl).then(texture => {
              // Check app still exists and sprite hasn't been destroyed
              if (texture && appRef.current && spritesRef.current.has(track.id) && !sprite.destroyed) {
                sprite.texture = texture;
              }
            });
          }
        }

        console.log('Created', createdCount, 'sprites');

        // Enable sorting by zIndex for hover effect
        tilesContainer.sortableChildren = true;

        // Create track map for LOD texture loading
        const trackMap = new Map(tracks.map(t => [t.id, t]));

        // Viewport culling - hide sprites outside visible bounds for performance
        const updateCulling = () => {
          const bounds = viewport.getVisibleBounds();
          spritesRef.current.forEach(sprite => {
            sprite.visible =
              sprite.x + TILE_SIZE / 2 > bounds.left &&
              sprite.x - TILE_SIZE / 2 < bounds.right &&
              sprite.y + TILE_SIZE / 2 > bounds.top &&
              sprite.y - TILE_SIZE / 2 < bounds.bottom;
          });
        };

        viewport.on('moved', updateCulling);
        // Initial culling
        updateCulling();

        // LOD - swap to higher resolution textures when zoomed in
        let lodDebounceTimer: ReturnType<typeof setTimeout> | null = null;
        let lastLodZoom = 0;

        const updateLOD = () => {
          const zoom = viewport.scale.x;
          // Only update if we crossed the threshold (2x zoom)
          const wasHighRes = lastLodZoom > 2;
          const needsHighRes = zoom > 2;

          if (wasHighRes === needsHighRes && lastLodZoom !== 0) return;
          lastLodZoom = zoom;

          const bounds = viewport.getVisibleBounds();

          spritesRef.current.forEach((sprite, trackId) => {
            // Only update visible sprites
            if (!sprite.visible) return;

            // Check if sprite is in bounds
            const inBounds =
              sprite.x + TILE_SIZE / 2 > bounds.left &&
              sprite.x - TILE_SIZE / 2 < bounds.right &&
              sprite.y + TILE_SIZE / 2 > bounds.top &&
              sprite.y - TILE_SIZE / 2 < bounds.bottom;

            if (!inBounds) return;

            const track = trackMap.get(trackId);
            if (!track?.artwork_url) return;

            const newUrl = getArtworkUrlForZoom(track.artwork_url, zoom);
            if (!newUrl) return;

            // Load and swap texture if not already cached with this URL
            if (!Assets.cache.has(newUrl)) {
              loadTexture(newUrl).then(texture => {
                if (texture && appRef.current && !sprite.destroyed) {
                  sprite.texture = texture;
                }
              });
            } else {
              sprite.texture = Assets.get(newUrl);
            }
          });
        };

        viewport.on('zoomed-end', () => {
          // Debounce LOD updates to avoid thrashing during rapid zoom
          if (lodDebounceTimer) clearTimeout(lodDebounceTimer);
          lodDebounceTimer = setTimeout(updateLOD, 150);
        });

        // Also update LOD when panning while zoomed in
        viewport.on('moved-end', () => {
          if (viewport.scale.x > 2) {
            if (lodDebounceTimer) clearTimeout(lodDebounceTimer);
            lodDebounceTimer = setTimeout(updateLOD, 150);
          }
        });
      } catch (error) {
        console.error('PixiJS initialization error:', error);
      }
    };

    init();

    // Handle resize
    const handleResize = () => {
      if (viewportRef.current && appRef.current && container) {
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;
        appRef.current.renderer.resize(width, height);
        viewportRef.current.resize(width, height);
      }
    };
    window.addEventListener('resize', handleResize);

    // Capture ref for cleanup
    const sprites = spritesRef.current;

    return () => {
      destroyed = true;
      window.removeEventListener('resize', handleResize);
      // Use appRef since init() is async and app variable may not be set yet
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
      }
      appRef.current = null;
      viewportRef.current = null;
      sprites.clear();
      activeOutlineRef.current = null;
    };
  }, [tracks, positionMap]);

  // Update active outline when activeTrackId changes
  useEffect(() => {
    const outline = activeOutlineRef.current;
    if (!outline) return;

    outline.clear();

    if (activeTrackId !== null) {
      const pos = positionMap.get(activeTrackId);
      if (pos) {
        outline.rect(
          pos.x - TILE_SIZE / 2 - 4,
          pos.y - TILE_SIZE / 2 - 4,
          TILE_SIZE + 8,
          TILE_SIZE + 8
        );
        outline.stroke({ width: 2, color: 0x000000 });
      }
    }
  }, [activeTrackId, positionMap]);

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

// Helper to create placeholder texture
function createPlaceholderTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(0, 0, 200, 200);
  }
  return Texture.from(canvas);
}

// Helper to load texture with error handling
async function loadTexture(url: string): Promise<Texture | null> {
  try {
    // Check if already loaded
    if (Assets.cache.has(url)) {
      return Assets.get(url);
    }
    const texture = await Assets.load(url);
    return texture;
  } catch {
    return null;
  }
}

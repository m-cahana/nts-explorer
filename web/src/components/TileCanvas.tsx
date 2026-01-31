import { useEffect, useRef, useState, useCallback } from 'react';
import { Application, Container, Sprite, Graphics, Texture, Assets, Text, TextStyle } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { Track, GenreSection, TilePosition, GenreGroup, ContinuousGridLayout } from '../types';

const TILE_SIZE = 40;
const TILE_GAP = 12;
const SECTION_PADDING = 20;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 5.0;
const MODAL_ANIMATION_DURATION = 300;
const MODAL_PADDING = 40;
const BORDER_WIDTH = 2;

// Cursor SVG data URLs
const CURSOR_DEFAULT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_IN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='10' x2='16' y2='22' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ZOOM_OUT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='10' y1='16' x2='22' y2='16' stroke='black' stroke-width='2'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_LEFT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M9 16 L14 11 M9 16 L14 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_RIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='9' y1='16' x2='23' y2='16' stroke='black' stroke-width='2'/%3E%3Cpath d='M23 16 L18 11 M23 16 L18 21' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_UP = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 9 L11 14 M16 9 L21 14' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;
const CURSOR_ARROW_DOWN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Ccircle cx='16' cy='16' r='14' fill='none' stroke='black' stroke-width='2'/%3E%3Cline x1='16' y1='9' x2='16' y2='23' stroke='black' stroke-width='2'/%3E%3Cpath d='M16 23 L11 18 M16 23 L21 18' stroke='black' stroke-width='2' fill='none'/%3E%3C/svg%3E") 16 16, auto`;

function getArtworkUrl(url: string | null, size: 'small' | 'large'): string {
  if (!url) return '';
  const sizeStr = size === 'small' ? 't200x200' : 't500x500';
  return url.replace(/-large\./, `-${sizeStr}.`).replace(/-t\d+x\d+\./, `-${sizeStr}.`);
}

function getPrimaryGenre(genres: string[] | null): string {
  if (!genres || genres.length === 0) return 'uncategorized';
  return genres[0].toLowerCase();
}

function groupTracksByGenre(tracks: Track[]): Map<string, Track[]> {
  const groups = new Map<string, Track[]>();

  for (const track of tracks) {
    const genre = getPrimaryGenre(track.nts_genres);
    if (!groups.has(genre)) {
      groups.set(genre, []);
    }
    groups.get(genre)!.push(track);
  }

  return groups;
}

function calculateContinuousGridLayout(
  tracks: Track[],
  canvasWidth: number
): ContinuousGridLayout {
  const groups = groupTracksByGenre(tracks);

  // Sort groups by size (largest first)
  const sortedGroups = Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  const tileSize = TILE_SIZE;
  const gap = TILE_GAP;
  const cellSize = tileSize + gap;

  // Calculate total columns that fit in canvas width
  const totalCols = Math.floor((canvasWidth + gap) / cellSize);

  // Place tiles sequentially (genre-by-genre) in global grid positions
  const genreGroups: GenreGroup[] = [];
  let globalIndex = 0;

  for (const [genre, groupTracks] of sortedGroups) {
    const tilePositions: TilePosition[] = [];

    for (const track of groupTracks) {
      const col = globalIndex % totalCols;
      const row = Math.floor(globalIndex / totalCols);
      const x = col * cellSize;
      const y = row * cellSize;

      tilePositions.push({
        trackId: track.id,
        genreKey: genre,
        globalIndex,
        col,
        row,
        x,
        y,
      });

      globalIndex++;
    }

    // Label position is at the first tile of this genre
    const firstTile = tilePositions[0];
    const labelPosition = firstTile
      ? { x: firstTile.x + 4, y: firstTile.y + 4 }
      : { x: 0, y: 0 };

    genreGroups.push({
      key: genre,
      displayLabel: genre,
      tracks: groupTracks,
      tilePositions,
      labelPosition,
    });
  }

  const totalTiles = tracks.length;
  const totalRows = Math.ceil(totalTiles / totalCols);
  const totalWidth = totalCols * cellSize - gap;
  const totalHeight = totalRows * cellSize - gap;

  return {
    groups: genreGroups,
    totalCols,
    totalRows,
    totalWidth,
    totalHeight,
    tileSize,
    gap,
  };
}

interface TileCanvasProps {
  tracks: Track[];
  activeTrack: Track | null;
  previewTrack: Track | null;
  onHover: (track: Track) => void;
  onHoverEnd: () => void;
  onClick: (track: Track) => void;
  onSectionChange?: (section: GenreSection | null) => void;
}

export function TileCanvas({
  tracks,
  activeTrack,
  previewTrack,
  onHover,
  onHoverEnd,
  onClick,
  onSectionChange,
}: TileCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const tilesRef = useRef<Map<number, {
    sprite: Sprite;
    outline: Graphics;
    genreGroup: GenreGroup;
  }>>(new Map());
  const sectionsRef = useRef<GenreSection[]>([]);
  const continuousLayoutRef = useRef<ContinuousGridLayout | null>(null);
  const activeTrackRef = useRef<Track | null>(null);
  const previewTrackRef = useRef<Track | null>(null);
  const modalContainerRef = useRef<Container | null>(null);
  const modalHitAreaRef = useRef<Graphics | null>(null);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [cursor, setCursor] = useState(CURSOR_DEFAULT);
  const [expandedSection, setExpandedSection] = useState<GenreSection | null>(null);
  const expandedSectionRef = useRef<GenreSection | null>(null);
  const isAnimatingRef = useRef(false);
  const cursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const onSectionChangeRef = useRef(onSectionChange);
  const onHoverRef = useRef(onHover);
  const onHoverEndRef = useRef(onHoverEnd);
  const onClickRef = useRef(onClick);
  const openSectionModalRef = useRef<((section: GenreSection) => void) | null>(null);
  const closeSectionModalRef = useRef<(() => void) | null>(null);
  const modalTilesRef = useRef<Map<number, { sprite: Sprite; outline: Graphics }>>(new Map());

  // Keep refs in sync
  activeTrackRef.current = activeTrack;
  previewTrackRef.current = previewTrack;
  expandedSectionRef.current = expandedSection;
  onSectionChangeRef.current = onSectionChange;
  onHoverRef.current = onHover;
  onHoverEndRef.current = onHoverEnd;
  onClickRef.current = onClick;

  // Open a section as a modal popup
  const openSectionModal = useCallback((section: GenreSection) => {
    const app = appRef.current;
    const container = containerRef.current;
    const layout = continuousLayoutRef.current;
    if (!app || !container || !layout || isAnimatingRef.current) return;

    isAnimatingRef.current = true;

    const screenWidth = container.clientWidth;
    const screenHeight = container.clientHeight;

    // Create modal layer if it doesn't exist
    if (!modalContainerRef.current) {
      const modalLayer = new Container();
      modalLayer.zIndex = 1000;
      app.stage.addChild(modalLayer);
      modalContainerRef.current = modalLayer;
    }

    const modalLayer = modalContainerRef.current;
    modalLayer.removeChildren();
    modalTilesRef.current.clear();

    // Create invisible hit area to detect clicks outside the section
    const hitArea = new Graphics();
    hitArea.rect(0, 0, screenWidth, screenHeight);
    hitArea.fill({ color: 0x000000, alpha: 0.001 }); // Nearly invisible
    hitArea.eventMode = 'static';
    hitArea.cursor = 'default';
    hitArea.on('pointertap', () => {
      closeSectionModalRef.current?.();
    });
    modalLayer.addChild(hitArea);
    modalHitAreaRef.current = hitArea;

    // Calculate target size to fit ~80% of screen with padding
    const maxWidth = screenWidth - MODAL_PADDING * 2;
    const maxHeight = screenHeight - MODAL_PADDING * 2;

    // Calculate optimal cols/rows for expanded view
    const expandedTileSize = TILE_SIZE * 2; // Larger tiles in modal
    const expandedGap = TILE_GAP * 2;

    // Calculate how many tiles fit in the available space
    const availableWidth = maxWidth - SECTION_PADDING * 2;
    const expandedCols = Math.max(2, Math.floor((availableWidth + expandedGap) / (expandedTileSize + expandedGap)));
    const expandedRows = Math.ceil(section.tracks.length / expandedCols);

    // Calculate actual section dimensions
    const sectionWidth = expandedCols * (expandedTileSize + expandedGap) - expandedGap + SECTION_PADDING * 2;
    const sectionHeight = expandedRows * (expandedTileSize + expandedGap) - expandedGap + SECTION_PADDING * 2 + 40;

    // Scale to fit if needed
    const scaleX = maxWidth / sectionWidth;
    const scaleY = maxHeight / sectionHeight;
    const targetScale = Math.min(scaleX, scaleY, 1);

    const finalWidth = sectionWidth * targetScale;
    const finalHeight = sectionHeight * targetScale;

    // Create expanded section container
    const expandedContainer = new Container();
    expandedContainer.eventMode = 'static'; // Stop propagation to hit area
    expandedContainer.on('pointertap', (e) => {
      e.stopPropagation(); // Prevent closing when clicking inside section
    });

    // Position at center of screen
    const targetX = (screenWidth - finalWidth) / 2;
    const targetY = (screenHeight - finalHeight) / 2;

    // Start from original section position (in screen coords)
    const viewport = viewportRef.current;
    if (!viewport) {
      isAnimatingRef.current = false;
      return;
    }

    // Section background
    const bg = new Graphics();
    bg.rect(0, 0, sectionWidth, sectionHeight);
    bg.fill({ color: 0xffffff });
    bg.stroke({ width: 2, color: 0x000000 });
    expandedContainer.addChild(bg);

    // Genre label
    const labelStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 40,
      fill: 0x666666,
      fontWeight: 'bold',
    });
    const label = new Text({ text: section.displayLabel, style: labelStyle });
    label.position.set(SECTION_PADDING, 10);
    expandedContainer.addChild(label);

    // Create tiles
    for (let i = 0; i < section.tracks.length; i++) {
      const track = section.tracks[i];
      const col = i % expandedCols;
      const row = Math.floor(i / expandedCols);

      const tileX = SECTION_PADDING + col * (expandedTileSize + expandedGap);
      const tileY = SECTION_PADDING + 50 + row * (expandedTileSize + expandedGap); // 50 for label

      // Outline
      const outline = new Graphics();
      outline.rect(-3, -3, expandedTileSize + 6, expandedTileSize + 6);
      outline.stroke({ width: 3, color: 0x000000 });
      outline.position.set(tileX, tileY);
      outline.visible = false;
      expandedContainer.addChild(outline);

      // Sprite
      const sprite = new Sprite(Texture.WHITE);
      sprite.width = expandedTileSize;
      sprite.height = expandedTileSize;
      sprite.position.set(tileX, tileY);
      sprite.tint = 0xcccccc;
      sprite.eventMode = 'static';
      sprite.cursor = 'pointer';

      // Load artwork
      const artworkUrl = getArtworkUrl(track.artwork_url, 'small');
      if (artworkUrl) {
        Assets.load<Texture>(artworkUrl).then((texture) => {
          sprite.texture = texture;
          sprite.tint = 0xffffff;
        }).catch(() => {});
      }

      // Store modal tile data
      modalTilesRef.current.set(track.id, { sprite, outline });

      // Tile events
      sprite.on('pointerenter', () => {
        onHoverRef.current(track);
      });

      sprite.on('pointerleave', () => {
        onHoverEndRef.current();
      });

      sprite.on('pointertap', (e) => {
        e.stopPropagation();
        onClickRef.current(track);
      });

      expandedContainer.addChild(sprite);
    }

    // Animate scale and position
    expandedContainer.scale.set(0.3);
    expandedContainer.position.set(screenWidth / 2, screenHeight / 2);
    expandedContainer.pivot.set(sectionWidth / 2, sectionHeight / 2);

    modalLayer.addChild(expandedContainer);

    const startTime = performance.now();
    const startScale = 0.3;
    const endScale = targetScale;
    const startX = screenWidth / 2;
    const startY = screenHeight / 2;
    const endX = targetX + finalWidth / 2;
    const endY = targetY + finalHeight / 2;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / MODAL_ANIMATION_DURATION, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentScale = startScale + (endScale - startScale) * eased;
      const currentX = startX + (endX - startX) * eased;
      const currentY = startY + (endY - startY) * eased;

      expandedContainer.scale.set(currentScale);
      expandedContainer.position.set(currentX, currentY);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        setExpandedSection(section);
        onSectionChangeRef.current?.(section);

        // Update tile appearances for active/preview
        updateModalTileAppearances();
      }
    };

    requestAnimationFrame(animate);
  }, []);

  // Store openSectionModal in ref
  openSectionModalRef.current = openSectionModal;

  // Close the modal popup
  const closeSectionModal = useCallback(() => {
    const modalLayer = modalContainerRef.current;
    if (!modalLayer || isAnimatingRef.current) return;

    isAnimatingRef.current = true;

    // Get the expanded container (last child after hit area)
    const expandedContainer = modalLayer.children[modalLayer.children.length - 1] as Container;
    if (!expandedContainer) {
      isAnimatingRef.current = false;
      return;
    }

    const startTime = performance.now();
    const startScale = expandedContainer.scale.x;
    const startAlpha = 1;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / (MODAL_ANIMATION_DURATION * 0.7), 1);

      // Ease in cubic
      const eased = progress * progress * progress;

      const currentScale = startScale * (1 - eased * 0.3);
      const currentAlpha = startAlpha * (1 - eased);

      expandedContainer.scale.set(currentScale);
      expandedContainer.alpha = currentAlpha;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        modalLayer.removeChildren();
        modalTilesRef.current.clear();
        isAnimatingRef.current = false;
        setExpandedSection(null);
        onSectionChangeRef.current?.(null);
        onHoverEndRef.current();
      }
    };

    requestAnimationFrame(animate);
  }, []);

  // Store closeSectionModal in ref
  closeSectionModalRef.current = closeSectionModal;

  // Update modal tile appearances
  const updateModalTileAppearances = useCallback(() => {
    const active = activeTrackRef.current;
    const preview = previewTrackRef.current;

    modalTilesRef.current.forEach((tile, trackId) => {
      tile.outline.visible = false;

      // Active track
      if (active && trackId === active.id && (!preview || preview.id !== active.id)) {
        tile.outline.visible = true;
        tile.outline.clear();
        tile.outline.rect(-3, -3, tile.sprite.width + 6, tile.sprite.height + 6);
        tile.outline.stroke({ width: 3, color: 0x000000 });
      }

      // Preview track
      if (preview && trackId === preview.id) {
        tile.outline.visible = true;
        tile.outline.clear();
        tile.outline.rect(-3, -3, tile.sprite.width + 6, tile.sprite.height + 6);
        tile.outline.stroke({ width: 3, color: 0xff0000 });
      }
    });
  }, []);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedSectionRef.current) {
        closeSectionModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeSectionModal]);

  // Wheel event for zoom cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (isDraggingRef.current) return;

      if (cursorTimeoutRef.current) {
        clearTimeout(cursorTimeoutRef.current);
      }

      if (e.deltaY < 0) {
        setCursor(CURSOR_ZOOM_IN);
      } else if (e.deltaY > 0) {
        setCursor(CURSOR_ZOOM_OUT);
      }

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

  // Drag events for directional cursor
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

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          setCursor(deltaX > 0 ? CURSOR_ARROW_LEFT : CURSOR_ARROW_RIGHT);
        } else {
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

  // Update tile appearance helper
  const updateTileAppearance = useCallback((
    tile: { sprite: Sprite; outline: Graphics; genreGroup: GenreGroup },
    scale: number,
    showOutline: boolean,
    outlineColor: number
  ) => {
    const layout = continuousLayoutRef.current;
    if (!layout) return;

    const baseSize = layout.tileSize;
    const newSize = baseSize * scale;
    tile.sprite.width = newSize;
    tile.sprite.height = newSize;
    tile.outline.visible = showOutline;

    if (showOutline) {
      tile.outline.clear();
      tile.outline.rect(-3, -3, newSize + 6, newSize + 6);
      tile.outline.stroke({ width: 1, color: outlineColor });
    }
  }, []);

  // Update active/preview track highlighting
  useEffect(() => {
    const layout = continuousLayoutRef.current;
    if (!layout) return;

    // Reset all tiles
    tilesRef.current.forEach((tile) => {
      updateTileAppearance(tile, 1, false, 0x000000);
    });

    // Active track (if not preview)
    if (activeTrack && (!previewTrack || previewTrack.id !== activeTrack.id)) {
      const tile = tilesRef.current.get(activeTrack.id);
      if (tile) {
        updateTileAppearance(tile, 2, true, 0x000000);
      }
    }

    // Preview track (takes precedence)
    if (previewTrack) {
      const tile = tilesRef.current.get(previewTrack.id);
      if (tile) {
        updateTileAppearance(tile, 2, true, 0xff0000);
      }
    }

    // Also update modal tiles if modal is open
    if (expandedSection) {
      updateModalTileAppearances();
    }
  }, [activeTrack, previewTrack, updateTileAppearance, expandedSection, updateModalTileAppearances]);

  // ResizeObserver to track container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize((prev) => {
          // Only update if size actually changed significantly (avoid unnecessary re-renders)
          if (!prev || Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
            return { width, height };
          }
          return prev;
        });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Main initialization effect
  useEffect(() => {
    console.log('[TileCanvas] Effect triggered, tracks:', tracks.length, 'containerSize:', containerSize);
    if (!containerRef.current || tracks.length === 0 || !containerSize) {
      console.log('[TileCanvas] Skipping init - container:', !!containerRef.current, 'tracks:', tracks.length, 'containerSize:', containerSize);
      return;
    }

    const container = containerRef.current;
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

      if (isCleanedUp) {
        app.destroy(true, { children: true });
        return;
      }

      container.appendChild(app.canvas);
      appRef.current = app;

      const screenWidth = container.clientWidth;
      const screenHeight = container.clientHeight;

      // Calculate continuous grid layout
      const layout = calculateContinuousGridLayout(tracks, screenWidth * 2);
      continuousLayoutRef.current = layout;

      // Also create a GenreSection for each group for modal compatibility
      const sections: GenreSection[] = layout.groups.map(group => ({
        key: group.key,
        displayLabel: group.displayLabel,
        tracks: group.tracks,
        x: group.labelPosition.x,
        y: group.labelPosition.y,
        width: 0,
        height: 0,
        cols: 0,
        rows: 0,
      }));
      sectionsRef.current = sections;

      console.log('[TileCanvas] Layout calculated:', layout.groups.length, 'genre groups');

      const viewport = new Viewport({
        screenWidth,
        screenHeight,
        worldWidth: layout.totalWidth,
        worldHeight: layout.totalHeight,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewportRef.current = viewport;

      viewport
        .drag()
        .pinch()
        .wheel()
        .clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });

      // Create main container for tiles
      const tilesContainer = new Container();
      viewport.addChild(tilesContainer);

      // Create a map for quick lookup of track -> genre group
      const trackToGroup = new Map<number, GenreGroup>();
      for (const group of layout.groups) {
        for (const track of group.tracks) {
          trackToGroup.set(track.id, group);
        }
      }

      // Draw all tiles in a continuous grid
      for (const group of layout.groups) {
        for (const pos of group.tilePositions) {
          const track = group.tracks.find(t => t.id === pos.trackId);
          if (!track) continue;

          // Outline
          const outline = new Graphics();
          outline.rect(-3, -3, layout.tileSize + 6, layout.tileSize + 6);
          outline.stroke({ width: 3, color: 0x000000 });
          outline.position.set(pos.x, pos.y);
          outline.visible = false;
          tilesContainer.addChild(outline);

          // Sprite
          const sprite = new Sprite(Texture.WHITE);
          sprite.width = layout.tileSize;
          sprite.height = layout.tileSize;
          sprite.position.set(pos.x, pos.y);
          sprite.tint = 0xcccccc;
          sprite.eventMode = 'static';

          // Load artwork
          const artworkUrl = getArtworkUrl(track.artwork_url, 'small');
          if (artworkUrl) {
            Assets.load<Texture>(artworkUrl).then((texture) => {
              sprite.texture = texture;
              sprite.tint = 0xffffff;
            }).catch(() => {});
          }

          // Store tile data with reference to genre group
          tilesRef.current.set(track.id, { sprite, outline, genreGroup: group });

          // Create section for modal compatibility
          const section: GenreSection = {
            key: group.key,
            displayLabel: group.displayLabel,
            tracks: group.tracks,
            x: group.labelPosition.x,
            y: group.labelPosition.y,
            width: 0,
            height: 0,
            cols: 0,
            rows: 0,
          };

          // Tile events - clicking a tile opens the modal for its genre
          sprite.on('pointertap', () => {
            if (!expandedSectionRef.current && !isAnimatingRef.current) {
              openSectionModalRef.current?.(section);
            }
          });

          tilesContainer.addChild(sprite);
        }
      }

      // Draw genre borders in the center of the gap between tiles
      const borders = new Graphics();
      const cellSize = layout.tileSize + layout.gap;
      const halfGap = layout.gap / 2;

      for (const group of layout.groups) {
        const occupied = new Set(group.tilePositions.map(p => `${p.col},${p.row}`));

        for (const pos of group.tilePositions) {
          const left = pos.col * cellSize;
          const top = pos.row * cellSize;
          const right = left + layout.tileSize;
          const bottom = top + layout.tileSize;

          // Draw edge in the gap (offset by halfGap away from tile)
          if (!occupied.has(`${pos.col},${pos.row - 1}`)) {
            borders.moveTo(left - halfGap, top - halfGap);
            borders.lineTo(right + halfGap, top - halfGap);
          }
          if (!occupied.has(`${pos.col + 1},${pos.row}`)) {
            borders.moveTo(right + halfGap, top - halfGap);
            borders.lineTo(right + halfGap, bottom + halfGap);
          }
          if (!occupied.has(`${pos.col},${pos.row + 1}`)) {
            borders.moveTo(left - halfGap, bottom + halfGap);
            borders.lineTo(right + halfGap, bottom + halfGap);
          }
          if (!occupied.has(`${pos.col - 1},${pos.row}`)) {
            borders.moveTo(left - halfGap, top - halfGap);
            borders.lineTo(left - halfGap, bottom + halfGap);
          }
        }
      }
      const borderColorVar = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#ff0000';
      const borderColor = parseInt(borderColorVar.replace('#', ''), 16);
      borders.stroke({ width: BORDER_WIDTH, color: borderColor });

      tilesContainer.addChild(borders);

      // Draw genre labels at the first tile of each group
      for (const group of layout.groups) {
        const labelStyle = new TextStyle({
          fontFamily: 'Arial, sans-serif',
          fontSize: 10,
          fill: 0x000000,
          fontWeight: 'bold',
        });
        const label = new Text({ text: group.displayLabel, style: labelStyle });
        label.position.set(group.labelPosition.x, group.labelPosition.y);
        tilesContainer.addChild(label);
      }

      // Initial viewport position - show overview
      const zoomX = screenWidth / layout.totalWidth;
      const zoomY = screenHeight / layout.totalHeight;
      const initialZoom = Math.max(Math.min(zoomX, zoomY) * 0.9, MIN_ZOOM);

      viewport.scale.set(initialZoom);
      viewport.moveCenter(layout.totalWidth / 2, layout.totalHeight / 2);

      console.log('[TileCanvas] Created', tilesRef.current.size, 'tiles in', layout.groups.length, 'groups');
    }

    init();

    return () => {
      isCleanedUp = true;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
      tilesRef.current.clear();
      modalTilesRef.current.clear();
      modalContainerRef.current = null;
      continuousLayoutRef.current = null;
      setExpandedSection(null);
    };
  }, [tracks, containerSize]);

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
